import { supabase } from "@/integrations/supabase/client";

export type FurnitureQuoteItem = {
  furniture_item_id: string | null;
  name: string;
  qty: number;
  kind: "furniture" | "service";
};

export type ReservationItem = {
  id?: string;
  furniture_item_id: string;
  qty: number;
  furniture_items?: { name: string | null } | null;
};

export type DiffRow =
  | { type: "added"; name: string; qty: number }
  | { type: "removed"; name: string; qty: number }
  | { type: "changed"; name: string; from: number; to: number };

/** Compare current quote furniture items vs reservation items. */
export function computeItemsDiff(
  quoteItems: FurnitureQuoteItem[],
  reservationItems: ReservationItem[],
): DiffRow[] {
  const qMap = new Map<string, { name: string; qty: number }>();
  for (const it of quoteItems) {
    if (it.kind !== "furniture" || !it.furniture_item_id) continue;
    const prev = qMap.get(it.furniture_item_id);
    qMap.set(it.furniture_item_id, {
      name: it.name || prev?.name || "",
      qty: (prev?.qty ?? 0) + Number(it.qty || 0),
    });
  }
  const rMap = new Map<string, { name: string; qty: number }>();
  for (const it of reservationItems) {
    const prev = rMap.get(it.furniture_item_id);
    rMap.set(it.furniture_item_id, {
      name: it.furniture_items?.name ?? prev?.name ?? "",
      qty: (prev?.qty ?? 0) + Number(it.qty || 0),
    });
  }
  const diffs: DiffRow[] = [];
  for (const [id, q] of qMap) {
    const r = rMap.get(id);
    if (!r) diffs.push({ type: "added", name: q.name, qty: q.qty });
    else if (r.qty !== q.qty) diffs.push({ type: "changed", name: q.name, from: r.qty, to: q.qty });
  }
  for (const [id, r] of rMap) {
    if (!qMap.has(id)) diffs.push({ type: "removed", name: r.name, qty: r.qty });
  }
  return diffs;
}

/** Rebuild reservation_items from a quote's items. */
export async function syncReservationFromQuote(reservationId: string, quoteId: string) {
  // 1) Rebuild reservation_items from quote_items
  const { data: items, error: e1 } = await supabase
    .from("quote_items")
    .select("kind, furniture_item_id, qty")
    .eq("quote_id", quoteId);
  if (e1) throw e1;
  const { error: eDel } = await supabase
    .from("reservation_items")
    .delete()
    .eq("reservation_id", reservationId);
  if (eDel) throw eDel;
  const rows = (items ?? [])
    .filter((it: any) => it.kind === "furniture" && it.furniture_item_id && Number(it.qty) > 0)
    .map((it: any) => ({
      reservation_id: reservationId,
      furniture_item_id: it.furniture_item_id,
      qty: Number(it.qty),
    }));
  if (rows.length) {
    const { error: eIns } = await supabase.from("reservation_items").insert(rows);
    if (eIns) throw eIns;
  }

  // 2) Propagate date/time fields from the quote to the reservation so that
  //    the CRM calendar and the ICS feed reflect edits made on the quote.
  const { data: q, error: eQ } = await supabase
    .from("quotes")
    .select("event_start_at, event_end_at, event_date, installation_date, dismantling_date")
    .eq("id", quoteId)
    .maybeSingle();
  if (eQ) throw eQ;
  if (q) {
    const patch = buildReservationDatesPatch(q as any);
    if (Object.keys(patch).length > 0) {
      const { error: eUpd } = await supabase
        .from("reservations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", reservationId);
      if (eUpd) throw eUpd;
    }
  }
}

function dateAt(date: string, hh: number, mm = 0): string {
  // Interpret YYYY-MM-DD as local time, then serialize to ISO (UTC).
  const [y, m, d] = date.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0).toISOString();
}

/** Compute reservation date fields from a quote row. Only fields the quote
 *  actually specifies are returned so we never blank out manual overrides. */
export function buildReservationDatesPatch(q: {
  event_start_at: string | null;
  event_end_at: string | null;
  event_date: string | null;
  installation_date: string | null;
  dismantling_date: string | null;
}): Record<string, string> {
  const patch: Record<string, string> = {};

  // event window
  const eventStart = q.event_start_at ?? (q.event_date ? dateAt(q.event_date, 10) : null);
  const eventEnd = q.event_end_at ?? (q.event_date ? dateAt(q.event_date, 23) : null);
  if (eventStart) patch.event_start_at = new Date(eventStart).toISOString();
  if (eventEnd) patch.event_end_at = new Date(eventEnd).toISOString();

  // load_at ← installation_date (08:00) alebo začiatok eventu
  const loadAt = q.installation_date ? dateAt(q.installation_date, 8) : eventStart;
  if (loadAt) patch.load_at = new Date(loadAt).toISOString();

  // return_at ← dismantling_date (22:00) alebo koniec eventu;
  // available_from_at ← nasledujúci deň 08:00 alebo return_at
  const returnAt = q.dismantling_date ? dateAt(q.dismantling_date, 22) : eventEnd;
  if (returnAt) {
    patch.return_at = new Date(returnAt).toISOString();
    const nextDay = new Date(new Date(returnAt).getTime() + 10 * 3600 * 1000);
    patch.available_from_at = nextDay.toISOString();
  }

  return patch;
}

/** Create a reservation from a quote (and link both sides). Returns new reservation id. */
export async function createReservationFromQuote(quoteId: string): Promise<string> {
  const { data: q, error } = await supabase
    .from("quotes")
    .select("id, quote_number, quote_group_id, client_id, contact_id, issue_date, event_start_at, event_end_at, event_date, installation_date, dismantling_date, notes, valid_until, client_contacts(full_name, phone, email)")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!q) throw new Error("Kalkulácia sa nenašla.");

  // Zjednotená mapa dátumov kalkulácia → rezervácia (rovnaká ako pri sync).
  const datesPatch = buildReservationDatesPatch(q as any);
  const now = new Date();
  const fallbackBase = q.issue_date ? new Date(q.issue_date + "T08:00:00") : now;
  const loadAt = datesPatch.load_at ?? fallbackBase.toISOString();
  const availableFrom =
    datesPatch.available_from_at ?? new Date(fallbackBase.getTime() + 2 * 24 * 3600 * 1000).toISOString();
  const eventStartAt = datesPatch.event_start_at ?? loadAt;
  const eventEndAt = datesPatch.event_end_at ?? availableFrom;
  const returnAt = datesPatch.return_at ?? eventEndAt;

  const contact = (q as any).client_contacts;
  const insertPayload: any = {
    client_id: q.client_id,
    contact_id: q.contact_id,
    contact_person: contact?.full_name ?? null,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    event_name: q.quote_number,
    note: q.notes,
    status: "confirmed",
    load_at: loadAt,
    available_from_at: availableFrom,
    event_start_at: eventStartAt,
    event_end_at: eventEndAt,
    return_at: returnAt,
    quote_group_id: q.quote_group_id,
  };
  const { data: ins, error: eIns } = await supabase
    .from("reservations")
    .insert(insertPayload)
    .select("id")
    .single();
  if (eIns) throw eIns;

  await syncReservationFromQuote(ins.id, quoteId);

  // Back-link: point all quotes in the group to this reservation (legacy field).
  if (q.quote_group_id) {
    await supabase.from("quotes").update({ reservation_id: ins.id }).eq("quote_group_id", q.quote_group_id);
  } else {
    await supabase.from("quotes").update({ reservation_id: ins.id }).eq("id", quoteId);
  }
  return ins.id;
}