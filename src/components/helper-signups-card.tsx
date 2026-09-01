import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink, HandHeart, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

/**
 * Žiadosti brigádnikov o nasadenie, zoradené podľa akcie a rozhodnuteľné rovno
 * odtiaľto. Zmysel je ušetriť preklikávanie rezervácií po jednej — na jednom
 * mieste vidno, kto sa kam hlási.
 */

type Row = {
  id: string;
  reservation_id: string;
  helper_id: string;
  note: string | null;
  created_at: string;
};

/** Koľko akcií ukázať, kým sa zoznam nerozbalí celý. */
const PREVIEW = 3;

export function HelperSignupsCard() {
  const qc = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = hasRole(currentUser, "admin", "manager");
  const [expanded, setExpanded] = useState(false);

  const signups = useQuery({
    queryKey: ["helper-signups-pending"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("reservation_signups")
        .select("id, reservation_id, helper_id, note, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (rows.length === 0) return [];

      const resIds = Array.from(new Set(rows.map((r) => r.reservation_id)));
      const helperIds = Array.from(new Set(rows.map((r) => r.helper_id)));
      const [res, helpers] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, event_name, venue, load_at, event_start_at")
          .in("id", resIds),
        supabase.from("helpers").select("id, name, note").in("id", helperIds),
      ]);
      const resMap = new Map((res.data ?? []).map((r: any) => [r.id, r]));
      const helperMap = new Map((helpers.data ?? []).map((h: any) => [h.id, h]));
      return rows.map((r) => ({
        ...r,
        reservation: resMap.get(r.reservation_id) ?? null,
        helper: helperMap.get(r.helper_id) ?? null,
      }));
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (accept) {
        const { error } = await supabase.rpc("accept_reservation_signup", { _signup_id: id });
        if (error) throw error;
        return;
      }
      const { error } = await (supabase.from as any)("reservation_signups")
        .update({ status: "declined", decided_by: currentUser?.id ?? null, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["helper-signups-pending"] });
      qc.invalidateQueries({ queryKey: ["reservation-signups"] });
      qc.invalidateQueries({ queryKey: ["reservation-staff"] });
      toast.success(v.accept ? "Brigádnik nasadený na akciu" : "Žiadosť odmietnutá");
    },
    onError: (e: any) => toast.error(e.message ?? "Nepodarilo sa"),
  });

  /** Zoskupené podľa akcie a zoradené od najbližšieho termínu. */
  const groups = useMemo(() => {
    const map = new Map<string, { reservation: any; items: typeof rows }>();
    const rows = signups.data ?? [];
    for (const r of rows) {
      if (!map.has(r.reservation_id)) map.set(r.reservation_id, { reservation: r.reservation, items: [] });
      map.get(r.reservation_id)!.items.push(r);
    }
    return [...map.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => {
        const at = a.reservation?.load_at ? new Date(a.reservation.load_at).getTime() : Infinity;
        const bt = b.reservation?.load_at ? new Date(b.reservation.load_at).getTime() : Infinity;
        return at - bt;
      });
  }, [signups.data]);

  const total = (signups.data ?? []).length;
  const shown = expanded ? groups : groups.slice(0, PREVIEW);

  return (
    <Card className={total > 0 ? "border-sky-300" : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HandHeart className="size-4" />
          Žiadosti brigádnikov
          {total > 0 && <Badge className="bg-sky-600 text-white">{total}</Badge>}
        </CardTitle>
        <CardDescription>
          {total > 0
            ? `Kto sa hlási na akcie — ${groups.length} ${groups.length === 1 ? "akcia" : groups.length < 5 ? "akcie" : "akcií"}`
            : "Kto sa hlási na akcie cez aplikáciu pre brigádnikov"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {signups.isLoading && <p className="text-sm text-muted-foreground">Načítavam…</p>}
        {!signups.isLoading && total === 0 && (
          <p className="text-sm text-muted-foreground">Žiadne čakajúce žiadosti.</p>
        )}

        {shown.map((g) => (
          <div key={g.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {g.reservation?.event_name ?? "Akcia"}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                  {g.reservation?.load_at && (
                    <span>{format(new Date(g.reservation.load_at), "EEEE d. MMM · HH:mm", { locale: sk })}</span>
                  )}
                  {g.reservation?.venue && (
                    <span className="flex items-center gap-1"><MapPin className="size-3" />{g.reservation.venue}</span>
                  )}
                </div>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 shrink-0">
                <Link to="/reservations/$id" params={{ id: g.id }}>
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            </div>

            {g.items.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="text-sm truncate">{r.helper?.name ?? "Brigádnik"}</div>
                  {r.note && <div className="text-[11px] text-muted-foreground truncate">{r.note}</div>}
                </div>
                {canManage ? (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm" className="h-7 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: r.id, accept: true })}
                    >
                      {decide.isPending && decide.variables?.id === r.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <><Check className="size-3.5 mr-1" />Prijať</>}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 border-rose-300 text-rose-700 hover:bg-rose-50"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: r.id, accept: false })}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary" className="shrink-0">Čaká</Badge>
                )}
              </div>
            ))}
          </div>
        ))}

        {groups.length > PREVIEW && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Zbaliť" : `Zobraziť všetky (${groups.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
