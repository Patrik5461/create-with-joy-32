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
}

/** Create a reservation from a quote (and link both sides). Returns new reservation id. */
export async function createReservationFromQuote(quoteId: string): Promise<string> {
  const { data: q, error } = await supabase
    .from("quotes")
    .select("id, quote_number, quote_group_id, client_id, contact_id, issue_date, event_start_at, event_end_at, notes, valid_until, client_contacts(full_name, phone, email)")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!q) throw new Error("Kalkulácia sa nenašla.");

  // Prefer explicit event window from the quote; fall back to a sane default around issue_date.
  const anyQ = q as any;
  let loadAt: string;
  let availableFrom: string;
  if (anyQ.event_start_at && anyQ.event_end_at) {
    loadAt = new Date(anyQ.event_start_at).toISOString();
    availableFrom = new Date(anyQ.event_end_at).toISOString();
  } else {
    const base = q.issue_date ? new Date(q.issue_date + "T08:00:00") : new Date();
    loadAt = base.toISOString();
    availableFrom = new Date(base.getTime() + 2 * 24 * 3600 * 1000).toISOString();
  }

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