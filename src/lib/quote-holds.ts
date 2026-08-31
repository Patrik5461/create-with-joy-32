/**
 * Kto v danom termíne drží kusy zo skladu — kalkulácie (mäkká blokácia) aj
 * rezervácie (tvrdá). Čistá logika bez Supabase a Reactu, aby sa dala testovať
 * (`bun test`); sieťové dopyty sedia v `availability.ts`.
 */
import { STATUS_LABEL, type ReservationStatus } from "@/lib/reservation-status";

/**
 * Stavy kalkulácie, ktoré blokujú tovar. Schválená blokuje tiež — dovtedy, kým
 * z nej nevznikne rezervácia, je to jediné, čo tovar drží. Zamietnutá ani
 * kalkulácia v koši neblokujú nič.
 */
export const HOLDING_QUOTE_STATUSES = ["draft", "sent", "approved"] as const;
export type HoldingQuoteStatus = (typeof HOLDING_QUOTE_STATUSES)[number];

/** Text stavu pri blokácii — má byť vidieť, či sa na kalkuláciu ešte čaká. */
export const HOLD_STATUS_LABEL: Record<HoldingQuoteStatus, string> = {
  draft: "Rozpracovaná",
  sent: "Čaká na schválenie",
  approved: "Schválená",
};

export interface Blocker {
  kind: "quote" | "reservation";
  /** Id kalkulácie alebo rezervácie — na preklik do detailu. */
  id: string;
  /** Klient, prípadne názov eventu. Kalkulácie identifikujeme podľa klienta. */
  label: string;
  status: string;
  statusLabel: string;
  qty: number;
}

export interface HoldQuoteRow {
  id: string;
  quote_number: string | null;
  status: string;
  quote_group_id: string | null;
  reservation_id: string | null;
  installation_date: string | null;
  dismantling_date: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_date: string | null;
  clients?: { company_name: string | null } | null;
  quote_items: { furniture_item_id: string | null; qty: number; kind: string }[] | null;
}

export interface HoldReservationRow {
  furniture_item_id: string | null;
  qty: number;
  reservations: {
    id: string;
    event_name: string | null;
    status: string;
    load_at: string | null;
    available_from_at: string | null;
    quote_group_id: string | null;
  } | null;
}

export function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Prekrývajú sa dve časové okná? Dotyk hranou (koniec = začiatok) sa neráta. */
export function overlaps(
  start: number | null,
  end: number | null,
  from: number,
  to: number,
): boolean {
  if (start == null || end == null) return false;
  return start < to && end > from;
}

/**
 * Termín, počas ktorého kalkulácia drží tovar: montáž → demontáž, inak event,
 * inak celý deň eventu. Bez dátumov kalkulácia neblokuje nič — nevieme kedy.
 */
export function quoteWindow(q: {
  installation_date: string | null;
  dismantling_date: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_date: string | null;
}): { start: number | null; end: number | null } {
  const dayStart = q.event_date ? ts(q.event_date + "T00:00:00") : null;
  const start = ts(q.installation_date) ?? ts(q.event_start_at) ?? dayStart;
  const end =
    ts(q.dismantling_date) ??
    ts(q.event_end_at) ??
    (dayStart != null ? dayStart + 24 * 3600 * 1000 : null);
  return { start, end };
}

function quoteLabel(q: HoldQuoteRow): string {
  const name = (q.clients?.company_name ?? "").trim();
  return name || q.quote_number || "Kalkulácia bez klienta";
}

function addQty(map: Map<string, Blocker>, key: string, blocker: Blocker) {
  const prev = map.get(key);
  if (prev) prev.qty += blocker.qty;
  else map.set(key, { ...blocker });
}

function qtyOf(v: unknown): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

/**
 * Rezervácie, ktoré v okne držia dané položky. Vracia aj skupiny kalkulácií,
 * z ktorých tie rezervácie vznikli — ich kalkulácie sa už nesmú počítať znova,
 * inak by ten istý tovar blokovali dvakrát.
 */
export function collectReservationBlockers(
  rows: HoldReservationRow[],
  opts: { itemIds: string[]; from: number; to: number; excludeReservationId?: string | null },
): { byItem: Record<string, Blocker[]>; reservedGroups: Set<string> } {
  const wanted = new Set(opts.itemIds);
  const perItem = new Map<string, Map<string, Blocker>>();
  const reservedGroups = new Set<string>();

  for (const row of rows) {
    const r = row.reservations;
    if (!r || !row.furniture_item_id || !wanted.has(row.furniture_item_id)) continue;
    if (r.status === "cancelled") continue;
    if (opts.excludeReservationId && r.id === opts.excludeReservationId) continue;
    if (!overlaps(ts(r.load_at), ts(r.available_from_at), opts.from, opts.to)) continue;

    if (r.quote_group_id) reservedGroups.add(r.quote_group_id);
    const map = perItem.get(row.furniture_item_id) ?? new Map<string, Blocker>();
    addQty(map, r.id, {
      kind: "reservation",
      id: r.id,
      label: r.event_name?.trim() || "Rezervácia",
      status: r.status,
      statusLabel: STATUS_LABEL[r.status as ReservationStatus] ?? "Rezervované",
      qty: qtyOf(row.qty),
    });
    perItem.set(row.furniture_item_id, map);
  }

  const byItem: Record<string, Blocker[]> = {};
  for (const [itemId, map] of perItem) byItem[itemId] = [...map.values()];
  return { byItem, reservedGroups };
}

/**
 * Kalkulácie, ktoré v okne držia dané položky. Vynechá vlastnú skupinu (aby
 * kalkulácia neblokovala samu seba) a tie, z ktorých už existuje rezervácia.
 */
export function collectQuoteBlockers(
  quotes: HoldQuoteRow[],
  opts: {
    itemIds: string[];
    from: number;
    to: number;
    excludeQuoteGroupId?: string | null;
    reservedGroups?: Set<string>;
  },
): Record<string, Blocker[]> {
  const wanted = new Set(opts.itemIds);
  const holding = new Set<string>(HOLDING_QUOTE_STATUSES);
  const perItem = new Map<string, Map<string, Blocker>>();

  for (const q of quotes) {
    if (!holding.has(q.status)) continue;
    // Kalkulácia s rezerváciou už tovar drží cez ňu — druhýkrát ho neblokuje.
    if (q.reservation_id) continue;
    if (q.quote_group_id && opts.reservedGroups?.has(q.quote_group_id)) continue;
    if (opts.excludeQuoteGroupId && q.quote_group_id === opts.excludeQuoteGroupId) continue;

    const { start, end } = quoteWindow(q);
    if (!overlaps(start, end, opts.from, opts.to)) continue;

    for (const it of q.quote_items ?? []) {
      if (it.kind !== "furniture" || !it.furniture_item_id) continue;
      if (!wanted.has(it.furniture_item_id)) continue;
      const qty = qtyOf(it.qty);
      if (qty === 0) continue;
      const map = perItem.get(it.furniture_item_id) ?? new Map<string, Blocker>();
      addQty(map, q.id, {
        kind: "quote",
        id: q.id,
        label: quoteLabel(q),
        status: q.status,
        statusLabel: HOLD_STATUS_LABEL[q.status as HoldingQuoteStatus] ?? q.status,
        qty,
      });
      perItem.set(it.furniture_item_id, map);
    }
  }

  const byItem: Record<string, Blocker[]> = {};
  for (const [itemId, map] of perItem) byItem[itemId] = [...map.values()];
  return byItem;
}

/** Poradie v UI: najprv čo je isté (rezervácia), potom podľa stavu, potom počet. */
const BLOCKER_WEIGHT: Record<string, number> = {
  reservation: 0,
  approved: 1,
  sent: 2,
  draft: 3,
};

export function sortBlockers(list: Blocker[]): Blocker[] {
  return [...list].sort((a, b) => {
    const wa = a.kind === "reservation" ? 0 : (BLOCKER_WEIGHT[a.status] ?? 9);
    const wb = b.kind === "reservation" ? 0 : (BLOCKER_WEIGHT[b.status] ?? 9);
    if (wa !== wb) return wa - wb;
    if (b.qty !== a.qty) return b.qty - a.qty;
    return a.label.localeCompare(b.label, "sk");
  });
}

/** Spojí blokácie z oboch zdrojov do jedného zoznamu na položku. */
export function mergeBlockers(
  reservations: Record<string, Blocker[]>,
  quotes: Record<string, Blocker[]>,
): Record<string, Blocker[]> {
  const out: Record<string, Blocker[]> = {};
  for (const id of new Set([...Object.keys(reservations), ...Object.keys(quotes)])) {
    out[id] = sortBlockers([...(reservations[id] ?? []), ...(quotes[id] ?? [])]);
  }
  return out;
}

/** Kusy držané kalkuláciami (bez rezervácií — tie už ráta RPC dostupnosti). */
export function quoteHoldQty(list: Blocker[] | undefined): number {
  return (list ?? []).reduce((s, b) => (b.kind === "quote" ? s + b.qty : s), 0);
}

/**
 * Farba blokácie podľa toho, aká je istá: rezervácia je záväzná, schválená
 * kalkulácia takmer, odoslaná ešte čaká na klienta, rozpracovaná je len návrh.
 */
export function blockerClass(b: Blocker): string {
  if (b.kind === "reservation") return "border-rose-300 bg-rose-50 text-rose-900";
  if (b.status === "approved") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (b.status === "sent") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-slate-300 bg-slate-50 text-slate-700";
}
