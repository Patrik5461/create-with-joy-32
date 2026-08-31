import { supabase } from "@/integrations/supabase/client";
import {
  HOLDING_QUOTE_STATUSES,
  collectQuoteBlockers,
  collectReservationBlockers,
  mergeBlockers,
  quoteHoldQty,
  type Blocker,
  type HoldQuoteRow,
  type HoldReservationRow,
} from "@/lib/quote-holds";

export type { Blocker } from "@/lib/quote-holds";

export type AvailabilityRow = {
  total: number;
  damaged: number;
  retired: number;
  reserved: number;
  /** Množstvo blokované kalkuláciami bez rezervácie (soft hold). */
  quoteHold: number;
  available: number;
  /** Kde presne tie kusy visia — kalkulácie aj rezervácie, na zobrazenie. */
  blockers: Blocker[];
};

/**
 * Kto v danom okne drží dané položky. Kalkulácie držia tovar od rozpracovanej
 * až po schválenú — kým z nej nevznikne rezervácia, je to jediné, čo tovar
 * blokuje. Kalkulácia v koši (`deleted_at`) ani zamietnutá nedržia nič, takže
 * zmazaním kalkulácie sa tovar automaticky uvoľní.
 */
export async function getBlockers(
  itemIds: string[],
  fromIso: string,
  toIso: string,
  opts?: { excludeReservationId?: string | null; excludeQuoteGroupId?: string | null },
): Promise<Record<string, Blocker[]>> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return {};

  const [resRows, quoteRows] = await Promise.all([
    supabase
      .from("reservation_items")
      .select(
        "furniture_item_id, qty, reservations!inner(id, event_name, status, load_at, available_from_at, quote_group_id)",
      )
      .in("furniture_item_id", unique)
      .neq("reservations.status", "cancelled")
      .lt("reservations.load_at", toIso)
      .gt("reservations.available_from_at", fromIso),
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, quote_group_id, reservation_id, installation_date, dismantling_date, event_start_at, event_end_at, event_date, clients(company_name), quote_items(furniture_item_id, qty, kind)",
      )
      .is("reservation_id", null)
      .is("deleted_at", null)
      .eq("is_current", true)
      .in("status", [...HOLDING_QUOTE_STATUSES]),
  ]);

  const reservations = collectReservationBlockers(
    (resRows.error ? [] : ((resRows.data ?? []) as unknown as HoldReservationRow[])),
    { itemIds: unique, from, to, excludeReservationId: opts?.excludeReservationId ?? null },
  );
  const quotes = collectQuoteBlockers(
    (quoteRows.error ? [] : ((quoteRows.data ?? []) as unknown as HoldQuoteRow[])),
    {
      itemIds: unique,
      from,
      to,
      excludeQuoteGroupId: opts?.excludeQuoteGroupId ?? null,
      reservedGroups: reservations.reservedGroups,
    },
  );

  return mergeBlockers(reservations.byItem, quotes);
}

/** Dostupnosť položiek v okne vrátane soft-holdu z kalkulácií. */
export async function checkAvailability(
  itemIds: string[],
  fromIso: string,
  toIso: string,
  opts?: { excludeReservationId?: string | null; excludeQuoteGroupId?: string | null },
): Promise<Record<string, AvailabilityRow>> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  const out: Record<string, AvailabilityRow> = {};
  if (unique.length === 0) return out;

  const blockers = await getBlockers(unique, fromIso, toIso, opts);

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
      // RPC už ráta rezervácie; z blokácií pripočítame len kalkulácie.
      const hold = quoteHoldQty(blockers[id]);
      out[id] = {
        total: row.total,
        damaged: row.damaged,
        retired: row.retired,
        reserved: row.reserved + hold,
        quoteHold: hold,
        available: row.available - hold,
        blockers: blockers[id] ?? [],
      };
    }),
  );
  return out;
}
