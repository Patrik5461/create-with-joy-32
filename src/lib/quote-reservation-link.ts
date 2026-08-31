import { supabase } from "@/integrations/supabase/client";

export type FurnitureQuoteItem = {
  furniture_item_id: string | null;
  name: string;
  qty: number;
  kind: "furniture" | "service" | "other";
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

export type SkippedItem = { name: string; qty: number; reason: string };

const OFF_STOCK_MARKER = "── Položky mimo skladu ──";

function stripOffStockBlock(note: string | null | undefined): string {
  const n = note ?? "";
  const idx = n.indexOf(OFF_STOCK_MARKER);
  return (idx >= 0 ? n.slice(0, idx) : n).trimEnd();
}

/** Rebuild reservation_items from a quote's items. Returns items that could not
 *  be reserved (not in warehouse / insufficient stock) — those are written into
 *  the reservation note so they are visible in the calendar & detail. */
export async function syncReservationFromQuote(
  reservationId: string,
  quoteId: string,
): Promise<{ skipped: SkippedItem[] }> {
  // 1) Rebuild reservation_items from quote_items
  const { data: items, error: e1 } = await supabase
    .from("quote_items")
    .select("kind, name, furniture_item_id, qty")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (e1) throw e1;
  const skipped: SkippedItem[] = [];
  const furniture = (items ?? []).filter((it: any) => it.kind === "furniture" && Number(it.qty) > 0);
  const rows: { furniture_item_id: string; qty: number }[] = [];

  for (const it of furniture as any[]) {
    const qty = Math.max(1, Math.round(Number(it.qty)));
    // Voľne napísaná položka (nie je v sklade) → nedá sa rezervovať, ide do poznámky.
    if (!it.furniture_item_id) {
      skipped.push({ name: it.name || "Položka", qty, reason: "nie je v sklade" });
      continue;
    }
    rows.push({ furniture_item_id: it.furniture_item_id, qty });
  }

  // Prepis položiek beží v databáze ako jedna transakcia — keď zlyhá, rezervácii
  // ostanú pôvodné položky. Predtým sa najprv zmazali a mohla ostať prázdna.
  const { error: eItems } = await supabase.rpc("replace_reservation_items", {
    _reservation_id: reservationId,
    _items: rows as any,
  });
  if (eItems) throw eItems;

  // 1b) Zapíš neuložiteľné položky do poznámky rezervácie (aby boli vidieť).
  {
    const { data: resRow } = await supabase
      .from("reservations")
      .select("note")
      .eq("id", reservationId)
      .maybeSingle();
    const base = stripOffStockBlock(resRow?.note);
    const block = skipped.length
      ? `${base ? base + "\n\n" : ""}${OFF_STOCK_MARKER}\n` +
        skipped.map((s) => `• ${s.name} — ${s.qty} ks (${s.reason})`).join("\n")
      : base;
    if ((resRow?.note ?? "") !== block) {
      await supabase.from("reservations").update({ note: block }).eq("id", reservationId);
    }
  }

  // 2) Propagate date/time fields from the quote to the reservation so that
  //    the CRM calendar and the ICS feed reflect edits made on the quote.
  const { data: q, error: eQ } = await supabase
    .from("quotes")
    .select("event_start_at, event_end_at, event_date, installation_date, dismantling_date, venue, address")
    .eq("id", quoteId)
    .maybeSingle();
  if (eQ) throw eQ;
  if (q) {
    const patch = buildReservationPatch(q as QuoteSyncSource);
    if (Object.keys(patch).length > 0) {
      const { error: eUpd } = await supabase
        .from("reservations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", reservationId);
      if (eUpd) throw eUpd;
    }
  }

  return { skipped };
}

function dateAt(date: string, hh: number, mm = 0): string {
  // Interpret YYYY-MM-DD as local time, then serialize to ISO (UTC).
  const [y, m, d] = date.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0).toISOString();
}

export type QuoteSyncSource = {
  event_start_at: string | null;
  event_end_at: string | null;
  event_date: string | null;
  installation_date: string | null;
  dismantling_date: string | null;
  venue?: string | null;
  address?: string | null;
};

/** Compute reservation fields from a quote row. Only fields the quote
 *  actually specifies are returned so we never blank out manual overrides.
 *
 *  Toto je jediný zdroj pravdy pre mapovanie kalkulácia → rezervácia. Číta z
 *  neho `syncReservationFromQuote` (čo zapíše) aj `computeFieldsDiff` (čo
 *  indikátor ohlási) — inak sa tie dve vetvy rozídu, ako sa už raz stalo. */
export function buildReservationPatch(q: QuoteSyncSource): Record<string, string> {
  const patch: Record<string, string> = {};

  // event window
  const eventStart = q.event_start_at ?? (q.event_date ? dateAt(q.event_date, 10) : null);
  const eventEnd = q.event_end_at ?? (q.event_date ? dateAt(q.event_date, 23) : null);
  if (eventStart) patch.event_start_at = new Date(eventStart).toISOString();
  if (eventEnd) patch.event_end_at = new Date(eventEnd).toISOString();

  // load_at ← installation_date (presný čas) alebo začiatok eventu
  const loadAt = q.installation_date ? new Date(q.installation_date).toISOString() : eventStart;
  if (loadAt) patch.load_at = new Date(loadAt).toISOString();

  // return_at ← dismantling_date (presný čas) alebo koniec eventu;
  // available_from_at ← nasledujúci deň 08:00 alebo return_at
  const returnAt = q.dismantling_date ? new Date(q.dismantling_date).toISOString() : eventEnd;
  if (returnAt) {
    patch.return_at = new Date(returnAt).toISOString();
    const nextDay = new Date(new Date(returnAt).getTime() + 10 * 3600 * 1000);
    patch.available_from_at = nextDay.toISOString();
  }

  // Miesto konania — doteraz sa neprenášalo vôbec, takže rezervácie vznikali
  // bez lokality a ICS feed mal prázdne LOCATION.
  const venue = q.venue?.trim();
  if (venue) patch.venue = venue;
  const address = q.address?.trim();
  if (address) patch.address = address;

  return patch;
}

export type FieldDiff = { field: string; label: string; from: string | null; to: string };

const FIELD_LABELS: Record<string, string> = {
  load_at: "Nakládka",
  event_start_at: "Začiatok eventu",
  event_end_at: "Koniec eventu",
  return_at: "Návrat",
  available_from_at: "Dostupné od",
  venue: "Miesto",
  address: "Adresa",
};

const INSTANT_FIELDS = new Set([
  "load_at",
  "event_start_at",
  "event_end_at",
  "return_at",
  "available_from_at",
]);

function isUnchanged(field: string, current: unknown, next: string): boolean {
  if (current == null) return false;
  if (INSTANT_FIELDS.has(field)) {
    const a = new Date(current as string).getTime();
    const b = new Date(next).getTime();
    return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
  }
  return String(current).trim() === next.trim();
}

/** Fields the reservation would change by if it were synced right now.
 *  Derived from `buildReservationPatch`, so the "zosúladené" badge can never
 *  again claim agreement on a field that sync would actually rewrite. */
export function computeFieldsDiff(
  quote: QuoteSyncSource,
  reservation: Record<string, unknown>,
): FieldDiff[] {
  const patch = buildReservationPatch(quote);
  const diffs: FieldDiff[] = [];
  for (const [field, next] of Object.entries(patch)) {
    if (isUnchanged(field, reservation[field], next)) continue;
    diffs.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      from: (reservation[field] as string | null) ?? null,
      to: next,
    });
  }
  return diffs;
}

/** Create a reservation from a quote (and link both sides). Returns new reservation id. */
export async function createReservationFromQuote(
  quoteId: string,
): Promise<{ id: string; skipped: SkippedItem[] }> {
  const { data: q, error } = await supabase
    .from("quotes")
    .select("id, quote_number, quote_group_id, client_id, contact_id, issue_date, event_start_at, event_end_at, event_date, installation_date, dismantling_date, venue, address, notes, valid_until, client_contacts(full_name, phone, email), clients(company_name)")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!q) throw new Error("Kalkulácia sa nenašla.");

  // Zjednotená mapa kalkulácia → rezervácia (rovnaká ako pri sync).
  const datesPatch = buildReservationPatch(q as QuoteSyncSource);
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
    // Rezervácia sa pomenúva podľa klienta — číslo kalkulácie (Q2026-0042) je
    // len referencia dokladu a v kalendári nikomu nič nepovie.
    event_name: ((q as any).clients?.company_name ?? "").trim() || q.quote_number,
    venue: datesPatch.venue ?? null,
    address: datesPatch.address ?? null,
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

  const { skipped } = await syncReservationFromQuote(ins.id, quoteId);

  // Back-link: point all quotes in the group to this reservation (legacy field).
  if (q.quote_group_id) {
    await supabase.from("quotes").update({ reservation_id: ins.id }).eq("quote_group_id", q.quote_group_id);
  } else {
    await supabase.from("quotes").update({ reservation_id: ins.id }).eq("id", quoteId);
  }
  return { id: ins.id, skipped };
}