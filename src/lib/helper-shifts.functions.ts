import { createServerFn } from "@tanstack/react-start";
import {
  canWithdraw,
  visibleSignupStatus,
  type HelperSignupStatus,
} from "@/lib/helper-signup-status";

export type { HelperSignupStatus } from "@/lib/helper-signup-status";

/**
 * Kalendár akcií pre brigádnikov na `/helper`.
 *
 * Brigádnik nie je používateľom databázy — má PIN a podpísaný token, takže
 * všetko ide cez tieto funkcie a server siaha do databázy za neho. Preto je
 * dôležité, čo sa odtiaľto vracia: len dátum, čas, názov a miesto. Klient,
 * ceny, položky, kontakty ani poznámky sa neposielajú vôbec — nedajú sa teda
 * vyčítať ani z vývojárskych nástrojov.
 *
 * Zapísať sa dá jediná vec: vlastná prihláška na akciu. Rezervácia samotná je
 * odtiaľto nedotknuteľná, žiadna cesta na jej úpravu neexistuje.
 */

/** Ako ďaleko dopredu brigádnik vidí. */
const HORIZON_DAYS = 120;

export interface HelperEvent {
  id: string;
  /** Názov akcie — meno klienta, tak ako sa rezervácia volá v kalendári. */
  name: string;
  venue: string | null;
  /** Nakládka: odkedy sa na akcii robí. */
  startAt: string | null;
  /** Kedy sa nábytok vracia. */
  endAt: string | null;
  eventStartAt: string | null;
  signup: HelperSignupStatus;
  /** Už je na akcii nasadený v personáli. */
  assigned: boolean;
}

function requireToken(raw: unknown): { token: string } {
  const d = raw as { token?: unknown };
  if (!d || typeof d.token !== "string") throw new Error("Chýba token.");
  return { token: d.token };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function helperFromToken(token: string): Promise<string> {
  const { verifyHelperToken } = await import("./helper.server");
  const payload = await verifyHelperToken(token);
  if (!payload) throw new Error("Session vypršala. Prihlás sa znova.");
  return payload.h;
}

// -------- Zoznam nadchádzajúcich akcií --------
export const helperUpcomingEvents = createServerFn({ method: "POST" })
  .inputValidator(requireToken)
  .handler(async ({ data }): Promise<HelperEvent[]> => {
    const helperId = await helperFromToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const to = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000).toISOString();

    // Akcia sa ukáže, kým sa z nej nábytok nevrátil — prebiehajúca akcia teda
    // z rozpisu nezmizne uprostred dňa.
    const { data: rows, error } = await supabaseAdmin
      .from("reservations")
      .select("id, event_name, venue, load_at, event_start_at, return_at, available_from_at")
      .neq("status", "cancelled")
      .gt("available_from_at", now.toISOString())
      .lte("load_at", to)
      .order("load_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    if (list.length === 0) return [];
    const ids = list.map((r) => r.id);

    const [signups, staff] = await Promise.all([
      supabaseAdmin
        .from("reservation_signups")
        .select("reservation_id, status")
        .eq("helper_id", helperId)
        .in("reservation_id", ids),
      supabaseAdmin
        .from("reservation_staff")
        .select("reservation_id")
        .eq("helper_id", helperId)
        .in("reservation_id", ids),
    ]);

    const signupBy = new Map<string, HelperSignupStatus>();
    for (const s of (signups.data ?? []) as { reservation_id: string; status: string }[]) {
      signupBy.set(s.reservation_id, s.status as HelperSignupStatus);
    }
    const assigned = new Set((staff.data ?? []).map((s: { reservation_id: string }) => s.reservation_id));

    return list.map((r) => {
      const isAssigned = assigned.has(r.id);
      return {
        id: r.id,
        name: (r.event_name ?? "").trim() || "Akcia",
        venue: r.venue,
        startAt: r.load_at,
        endAt: r.return_at,
        eventStartAt: r.event_start_at,
        // Potvrdené je len to, čo naozaj stojí v personáli na akcii.
        signup: visibleSignupStatus(signupBy.get(r.id) ?? "none", isAssigned),
        assigned: isAssigned,
      };
    });
  });

// -------- Prihlásenie sa na akciu --------
export const helperSignUp = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { token?: unknown; reservationId?: unknown; note?: unknown };
    if (!d || typeof d.token !== "string") throw new Error("Chýba token.");
    if (typeof d.reservationId !== "string" || !UUID_RE.test(d.reservationId)) {
      throw new Error("Neplatná akcia.");
    }
    const note = typeof d.note === "string" ? d.note.trim().slice(0, 300) : "";
    return { token: d.token, reservationId: d.reservationId, note };
  })
  .handler(async ({ data }) => {
    const helperId = await helperFromToken(data.token);
    const { checkRateLimit } = await import("./helper.server");
    if (!checkRateLimit(`signup:${helperId}`)) {
      throw new Error("Priveľa pokusov. Skús o chvíľu znova.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: r } = await supabaseAdmin
      .from("reservations")
      .select("id, status, available_from_at")
      .eq("id", data.reservationId)
      .maybeSingle();
    if (!r) throw new Error("Akcia sa nenašla.");
    if (r.status === "cancelled") throw new Error("Akcia je zrušená.");
    if (r.available_from_at && new Date(r.available_from_at) < new Date()) {
      throw new Error("Táto akcia už prebehla.");
    }

    const [{ data: existing }, { data: staffRow }] = await Promise.all([
      supabaseAdmin
        .from("reservation_signups")
        .select("id, status")
        .eq("reservation_id", data.reservationId)
        .eq("helper_id", helperId)
        .maybeSingle(),
      supabaseAdmin
        .from("reservation_staff")
        .select("id")
        .eq("reservation_id", data.reservationId)
        .eq("helper_id", helperId)
        .maybeSingle(),
    ]);

    // Už nasadený nemá čo prihlasovať. Prihláška, ktorá hlási „prijaté" bez
    // nasadenia, je zvyšok po vymazaní z akcie — tá sa smie poslať znova.
    if (staffRow) return { status: "accepted" as const };

    if (existing) {
      // Aj odmietnutú prihlášku sa dá poslať znova — rozhodnutie sa vynuluje.
      const { error } = await supabaseAdmin
        .from("reservation_signups")
        .update({ status: "pending", note: data.note || null, decided_by: null, decided_at: null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("reservation_signups").insert({
        reservation_id: data.reservationId,
        // Kto sa hlási, berieme z tokenu — nikdy z prehliadača, aby sa nedalo
        // prihlásiť za kolegu.
        helper_id: helperId,
        note: data.note || null,
      });
      if (error) throw new Error(error.message);
    }
    return { status: "pending" as const };
  });

// -------- Stiahnutie prihlášky --------
export const helperWithdrawSignup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = raw as { token?: unknown; reservationId?: unknown };
    if (!d || typeof d.token !== "string") throw new Error("Chýba token.");
    if (typeof d.reservationId !== "string" || !UUID_RE.test(d.reservationId)) {
      throw new Error("Neplatná akcia.");
    }
    return { token: d.token, reservationId: d.reservationId };
  })
  .handler(async ({ data }) => {
    const helperId = await helperFromToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Prijaté nasadenie brigádnik zrušiť nemôže — to je už dohoda, rieši sa
    // s vedením. Stiahnuť sa dá len prihláška, ktorá ešte čaká.
    const [{ data: row }, { data: staffRow }] = await Promise.all([
      supabaseAdmin
        .from("reservation_signups")
        .select("id, status")
        .eq("reservation_id", data.reservationId)
        .eq("helper_id", helperId)
        .maybeSingle(),
      supabaseAdmin
        .from("reservation_staff")
        .select("id")
        .eq("reservation_id", data.reservationId)
        .eq("helper_id", helperId)
        .maybeSingle(),
    ]);
    if (!row) return { status: "none" as const };
    if (!canWithdraw(row.status as HelperSignupStatus, !!staffRow)) {
      throw new Error("Si už nasadený na akciu — zmenu dohodni s vedením.");
    }
    const { error } = await supabaseAdmin.from("reservation_signups").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    return { status: "none" as const };
  });
