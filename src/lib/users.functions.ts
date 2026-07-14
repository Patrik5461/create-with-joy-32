import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS as PERMISSION_VALUES } from "@/lib/permissions";

const RoleEnum = z.enum(["admin", "manager", "warehouse"]);
const PermissionEnum = z.enum(PERMISSION_VALUES as unknown as [string, ...string[]]);
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const SYNTHETIC_EMAIL_DOMAIN = "users.mimaproduction.local";

async function ensureAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden");
}

/**
 * Public — resolves a username or email to the auth email used by Supabase.
 * Returns { email } if a profile exists, otherwise throws.
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: { identifier: string }) => {
    const id = (d?.identifier ?? "").trim();
    if (!id || id.length > 200) throw new Error("Zadajte prihlasovacie meno alebo email");
    return { identifier: id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier;
    // Email — return as is
    if (id.includes("@")) return { email: id.toLowerCase() };
    // Username lookup (case-insensitive)
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.email) throw new Error("Používateľ nenájdený");
    return { email: row.email };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, email, username, full_name, active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const { data: perms } = await context.supabase
      .from("user_permissions")
      .select("user_id, permission, granted");
    const permsByUser = new Map<string, { permission: string; granted: boolean }[]>();
    (perms ?? []).forEach((p: any) => {
      const arr = permsByUser.get(p.user_id) ?? [];
      arr.push({ permission: p.permission, granted: p.granted });
      permsByUser.set(p.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
      permission_overrides: permsByUser.get(p.id) ?? [],
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; email?: string; password: string; full_name: string; role: "admin" | "manager" | "warehouse" }) =>
    z.object({
      username: z.string().regex(USERNAME_RE, "Meno: 3–32 znakov, bez medzier (a–z, 0–9, . _ -)"),
      email: z.string().email().optional().or(z.literal("")),
      password: z.string().min(8),
      full_name: z.string().min(1),
      role: RoleEnum,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.toLowerCase();
    // Ensure username unique
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) throw new Error("Toto používateľské meno už existuje");
    const email = (data.email && data.email.trim())
      ? data.email.trim().toLowerCase()
      : `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username },
    });
    if (error) throw new Error(error.message);
    const userId = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ id: userId, email, username, full_name: data.full_name });
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });
    return { id: userId };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "manager" | "warehouse" }) =>
    z.object({ user_id: z.string().uuid(), role: RoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; active: boolean }) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ active: data.active }).eq("id", data.user_id);
    if (!data.active) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    }
    return { ok: true };
  });

/**
 * Admin — set a new password for any user. Useful when the user has
 * no real email (synthetic login) and forgot-password by email is impossible.
 */
export const adminSetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; password: string }) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Admin — permanently deletes a user (auth + profile + roles).
 */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) =>
    z.object({ user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    if (data.user_id === context.userId) throw new Error("Nemôžete vymazať vlastný účet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });