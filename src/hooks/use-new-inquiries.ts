import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const NEW_INQUIRIES_KEY = ["inquiries", "new-count"] as const;

/**
 * Koľko verejných dopytov čaká na spracovanie.
 *
 * Dopyt príde z webu kedykoľvek a v CRM ho dovtedy nebolo vidieť — človek
 * musel otvoriť stránku Verejné dopyty a pozrieť sa. Číslo v bočnom menu to
 * ukáže samo.
 *
 * Sťahuje sa len počet (`head: true`), nie samotné dopyty, a obnovuje sa raz
 * za minútu a pri návrate do okna — na dopyt to stačí a databázu to nezaťaží.
 */
export function useNewInquiriesCount(enabled: boolean) {
  const query = useQuery({
    queryKey: NEW_INQUIRIES_KEY,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("inquiries")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return { count: query.data ?? 0, query };
}
