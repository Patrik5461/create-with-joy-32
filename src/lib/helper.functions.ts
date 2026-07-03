import { createServerFn } from "@tanstack/react-start";

/**
 * Helper (PIN) server functions.
 *
 * Helper NIE JE Supabase Auth user — všetka jeho interakcia ide cez
 * podpísaný HMAC token vydaný `verifyHelperPin`. Server fns overia
 * token a použijú service-role klienta na volanie úzko obmedzených RPC
 * (`verify_helper_pin`, `helper_punch`, `helper_status`).
 */

// -------- Public: list helper names (id + name, iba aktívnych) --------
export const listHelperNames = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("helpers")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string }>;
});

// -------- Public: verify PIN, return short-lived HMAC token --------
export const verifyHelperPin = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { helperId?: unknown; pin?: unknown };
    if (!d || typeof d.helperId !== "string" || typeof d.pin !== "string") {
      throw new Error("Neplatný vstup.");
    }
    if (!/^\d{3,8}$/.test(d.pin)) throw new Error("PIN musí byť 3–8 číslic.");
    return { helperId: d.helperId, pin: d.pin };
  })
  .handler(async ({ data }) => {
    const { checkRateLimit, signHelperToken } = await import("./helper.server");
    if (!checkRateLimit(`pin:${data.helperId}`)) {
      throw new Error("Priveľa pokusov. Skús o chvíľu znova.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verified, error } = await supabaseAdmin.rpc("verify_helper_pin", {
      _helper_id: data.helperId,
      _pin: data.pin,
    });
    if (error) throw new Error(error.message);
    if (!verified) throw new Error("Nesprávny PIN.");
    const { data: h } = await supabaseAdmin
      .from("helpers")
      .select("name")
      .eq("id", data.helperId)
      .maybeSingle();
    const token = await signHelperToken(data.helperId, h?.name ?? null);
    return { token, name: h?.name ?? null };
  });

// -------- Authenticated by token: status --------
export const helperStatus = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { token?: unknown };
    if (!d || typeof d.token !== "string") throw new Error("Chýba token.");
    return { token: d.token };
  })
  .handler(async ({ data }) => {
    const { verifyHelperToken } = await import("./helper.server");
    const payload = await verifyHelperToken(data.token);
    if (!payload) throw new Error("Session vypršala. Prihlás sa znova.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: status, error } = await supabaseAdmin.rpc("helper_status", {
      _helper_id: payload.h,
    });
    if (error) throw new Error(error.message);
    return status as { name: string | null; open: { id: string; clock_in: string } | null };
  });

// -------- Authenticated by token: start / end --------
export const helperPunch = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { token?: unknown; action?: unknown };
    if (!d || typeof d.token !== "string" || typeof d.action !== "string") {
      throw new Error("Neplatný vstup.");
    }
    if (d.action !== "start" && d.action !== "end") throw new Error("Neznáma akcia.");
    return { token: d.token, action: d.action as "start" | "end" };
  })
  .handler(async ({ data }) => {
    const { verifyHelperToken } = await import("./helper.server");
    const payload = await verifyHelperToken(data.token);
    if (!payload) throw new Error("Session vypršala. Prihlás sa znova.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("helper_punch", {
      _helper_id: payload.h,
      _action: data.action,
    });
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as {
      id: string;
      clock_in: string;
      clock_out: string | null;
    } | null;
  });

// -------- Admin (authenticated + admin role): manage helpers --------
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Prístup zamietnutý.");
}

export const adminListHelpers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("helpers")
      .select("id, name, is_active, note, created_at, updated_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminCreateHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { name?: unknown; pin?: unknown; note?: unknown };
    if (!d || typeof d.name !== "string" || d.name.trim().length < 2) {
      throw new Error("Zadaj meno helpera.");
    }
    const pin = typeof d.pin === "string" && d.pin.trim() ? d.pin.trim() : null;
    if (pin && !/^\d{4}$/.test(pin)) throw new Error("PIN musí mať 4 číslice.");
    return {
      name: d.name.trim(),
      pin,
      note: typeof d.note === "string" ? d.note.trim() || null : null,
    };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { generateNumericPin } = await import("./helper.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pin = data.pin ?? generateNumericPin(4);
    // Vytvor záznam s placeholder hashom, získaj id, potom nahraj skutočný hash.
    const { data: inserted, error } = await supabaseAdmin
      .from("helpers")
      .insert({ name: data.name, note: data.note, pin_hash: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { data: hash, error: hErr } = await supabaseAdmin.rpc("hash_helper_pin", {
      _helper_id: inserted.id,
      _pin: pin,
    });
    if (hErr) throw new Error(hErr.message);
    const { error: uErr } = await supabaseAdmin
      .from("helpers")
      .update({ pin_hash: hash as unknown as string })
      .eq("id", inserted.id);
    if (uErr) throw new Error(uErr.message);
    return { id: inserted.id as string, pin };
  });

export const adminResetHelperPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { helperId?: unknown; pin?: unknown };
    if (!d || typeof d.helperId !== "string") throw new Error("Chýba helperId.");
    const pin = typeof d.pin === "string" && d.pin.trim() ? d.pin.trim() : null;
    if (pin && !/^\d{4}$/.test(pin)) throw new Error("PIN musí mať 4 číslice.");
    return { helperId: d.helperId, pin };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { generateNumericPin } = await import("./helper.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pin = data.pin ?? generateNumericPin(4);
    const { data: hash, error: hErr } = await supabaseAdmin.rpc("hash_helper_pin", {
      _helper_id: data.helperId,
      _pin: pin,
    });
    if (hErr) throw new Error(hErr.message);
    const { error } = await supabaseAdmin
      .from("helpers")
      .update({ pin_hash: hash as unknown as string })
      .eq("id", data.helperId);
    if (error) throw new Error(error.message);
    return { pin };
  });

export const adminUpdateHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { helperId?: unknown; name?: unknown; is_active?: unknown; note?: unknown };
    if (!d || typeof d.helperId !== "string") throw new Error("Chýba helperId.");
    return {
      helperId: d.helperId,
      name: typeof d.name === "string" ? d.name.trim() : undefined,
      is_active: typeof d.is_active === "boolean" ? d.is_active : undefined,
      note: typeof d.note === "string" ? (d.note.trim() || null) : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const patch: { name?: string; is_active?: boolean; note?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.note !== undefined) patch.note = data.note;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("helpers").update(patch).eq("id", data.helperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { helperId?: unknown };
    if (!d || typeof d.helperId !== "string") throw new Error("Chýba helperId.");
    return { helperId: d.helperId };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("helpers").delete().eq("id", data.helperId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });