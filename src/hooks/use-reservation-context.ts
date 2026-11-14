import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getReservationContext,
  type ReservationContext,
} from "@/lib/reservation-context.functions";

/**
 * Klient (a voliteľne kalkulácia bez cien) k rezerváciám pre toho, komu ich
 * RLS nevráti, lebo nemá `clients.view` / `quotes.view`. Kto práva má, dostane
 * prázdnu mapu a nič navyše sa nenačítava — stránky si dáta berú ako doteraz.
 */
export function useReservationContext(ids: string[], opts: { withQuote?: boolean } = {}) {
  const { can, isLoading } = usePermissions();
  const fn = useServerFn(getReservationContext);
  const withQuote = opts.withQuote === true;
  const needed =
    !isLoading && can("reservations.view") && (!can("clients.view") || (withQuote && !can("quotes.view")));
  const sorted = [...new Set(ids)].sort();

  return useQuery({
    queryKey: ["reservation-context", withQuote, sorted],
    enabled: needed && sorted.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ReservationContext>> =>
      fn({ data: { ids: sorted, withQuote } }),
  });
}
