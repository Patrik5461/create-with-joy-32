import { supabase } from "@/integrations/supabase/client";

export type AvailabilityRow = {
  total: number;
  damaged: number;
  retired: number;
  reserved: number;
  /** Množstvo blokované nepotvrdenými kalkuláciami (soft hold). */
  quoteHold: number;
  available: number;
};

type QuoteHoldQuote = {
  quote_group_id: string | null;
  installation_date: string | null;
  dismantling_date: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_date: string | null;
  quote_items: { furniture_item_id: string | null; qty: number; kind: string }[] | null;
};

function ts(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Množstvá blokované nepotvrdenými kalkuláciami (draft/sent, bez rezervácie),
 *  ktoré sa časovo prekrývajú s daným oknom. */
export async function getQuoteHolds(
  itemIds: string[],
  fromIso: string,
  toIso: string,
  excludeQuoteGroupId?: string | null,
): Promise<Record<string, number>> {
  const holds: Record<string, number> = {};
  if (itemIds.length === 0) return holds;

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "quote_group_id, installation_date, dismantling_date, event_start_at, event_end_at, event_date, quote_items(furniture_item_id, qty, kind)",
    )
    .is("reservation_id", null)
    .is("deleted_at", null)
    .eq("is_current", true)
    .in("status", ["draft", "sent"]);
  if (error || !data) return holds;

  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const wanted = new Set(itemIds);

  for (const q of data as unknown as QuoteHoldQuote[]) {
    if (excludeQuoteGroupId && q.quote_group_id === excludeQuoteGroupId) continue;
    const start =
      ts(q.installation_date) ?? ts(q.event_start_at) ?? (q.event_date ? ts(q.event_date + "T00:00:00") : null);
    const end =
      ts(q.dismantling_date) ??
      ts(q.event_end_at) ??
      (q.event_date ? (ts(q.event_date + "T00:00:00") ?? 0) + 24 * 3600 * 1000 : null);
    if (start == null || end == null) continue;
    if (!(start < to && end > from)) continue;
    for (const it of q.quote_items ?? []) {
      if (it.kind !== "furniture" || !it.furniture_item_id) continue;
      if (!wanted.has(it.furniture_item_id)) continue;
      holds[it.furniture_item_id] = (holds[it.furniture_item_id] ?? 0) + Math.max(0, Math.round(Number(it.qty) || 0));
    }
  }
  return holds;
}

/** Dostupnosť položiek v okne vrátane soft-holdu z nepotvrdených kalkulácií. */
export async function checkAvailability(
  itemIds: string[],
  fromIso: string,
  toIso: string,
  opts?: { excludeReservationId?: string | null; excludeQuoteGroupId?: string | null },
): Promise<Record<string, AvailabilityRow>> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  const out: Record<string, AvailabilityRow> = {};
  if (unique.length === 0) return out;

  const holds = await getQuoteHolds(unique, fromIso, toIso, opts?.excludeQuoteGroupId ?? null);

  await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await supabase.rpc("check_item_availability", {
        _item_id: id,
        _from: fromIso,
        _to: toIso,
        ...(opts?.excludeReservationId ? { _exclude_reservation: opts.excludeReservationId } : {}),
      });
      const row = !error ? data?.[0] : null;
      if (!row) return;
      const hold = holds[id] ?? 0;
      out[id] = {
        total: row.total,
        damaged: row.damaged,
        retired: row.retired,
        reserved: row.reserved + hold,
        quoteHold: hold,
        available: row.available - hold,
      };
    }),
  );
  return out;
}
