import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowRight, ArrowLeft, Ban, Check, History, Wrench } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { toast } from "sonner";
import {
  RESERVATION_FLOW, STATUS_LABEL, STATUS_DESCRIPTION, STATUS_DOT, STATUS_BADGE_VARIANT,
  nextStatus, prevStatus, type ReservationStatus,
} from "@/lib/reservation-status";

type Props = {
  reservationId: string;
  status: ReservationStatus;
  canEdit: boolean;
};

export function ReservationStatusWorkflow({ reservationId, status, canEdit }: Props) {
  const qc = useQueryClient();

  const history = useQuery({
    queryKey: ["reservation-status-history", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_status_history")
        .select("id, from_status, to_status, created_at, changed_by, profiles:changed_by(full_name, email)")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (target: ReservationStatus) => {
      const { error } = await supabase.from("reservations").update({ status: target }).eq("id", reservationId);
      if (error) throw error;
      return target;
    },
    onSuccess: (target) => {
      qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
      qc.invalidateQueries({ queryKey: ["reservation-status-history", reservationId] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Stav: ${STATUS_LABEL[target]}`);
      if (target === "returned") {
        toast("Skontrolujte vrátený nábytok", {
          description: "Otvorte modul Údržba nábytku a nahláste prípadné poškodenia.",
          action: { label: "Údržba", onClick: () => { window.location.href = "/maintenance"; } },
        });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const next = nextStatus(status);
  const prev = prevStatus(status);
  const isCancelled = status === "cancelled";

  return (
    <div className="space-y-4">
      <Stepper status={status} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_BADGE_VARIANT[status]} className="text-xs">{STATUS_LABEL[status]}</Badge>
        <span className="text-xs text-muted-foreground">{STATUS_DESCRIPTION[status]}</span>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {prev && (
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate(prev)} disabled={setStatus.isPending}>
              <ArrowLeft className="size-4 mr-1" />{STATUS_LABEL[prev]}
            </Button>
          )}
          {next && (
            <Button size="sm" onClick={() => setStatus.mutate(next)} disabled={setStatus.isPending}>
              {STATUS_LABEL[next]}<ArrowRight className="size-4 ml-1" />
            </Button>
          )}
          {status === "returned" && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/maintenance"><Wrench className="size-4 mr-1" />Skontrolovať stav</Link>
            </Button>
          )}
          {!isCancelled && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700">
                  <Ban className="size-4 mr-1" />Zrušiť
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Zrušiť rezerváciu?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stav sa nastaví na „Zrušené“. Nábytok sa uvoľní zo skladu a kapacita bude opäť dostupná.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Späť</AlertDialogCancel>
                  <AlertDialogAction onClick={() => setStatus.mutate("cancelled")}>Zrušiť rezerváciu</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isCancelled && (
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("inquiry")} disabled={setStatus.isPending}>
              Obnoviť ako Dopyt
            </Button>
          )}
        </div>
      )}

      <div className="border-t pt-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <History className="size-3.5" /> História zmien
        </div>
        {history.isLoading ? (
          <p className="text-xs text-muted-foreground">Načítavam…</p>
        ) : !history.data?.length ? (
          <p className="text-xs text-muted-foreground">Žiadne zmeny.</p>
        ) : (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {history.data.map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-xs">
                <Check className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div>
                    {h.from_status ? (
                      <>
                        <span className="text-muted-foreground">{STATUS_LABEL[h.from_status as ReservationStatus]}</span>
                        <ArrowRight className="size-3 inline mx-1 text-muted-foreground" />
                      </>
                    ) : <span className="text-muted-foreground">Vytvorené · </span>}
                    <span className="font-medium">{STATUS_LABEL[h.to_status as ReservationStatus]}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {format(new Date(h.created_at), "d.M.yyyy HH:mm", { locale: sk })}
                    {h.profiles?.full_name || h.profiles?.email ? ` · ${h.profiles?.full_name ?? h.profiles?.email}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stepper({ status }: { status: ReservationStatus }) {
  const currentIndex = useMemo(() => {
    if (status === "cancelled") return -1;
    return RESERVATION_FLOW.indexOf(status as (typeof RESERVATION_FLOW)[number]);
  }, [status]);

  if (status === "cancelled") {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-900 px-3 py-2 text-sm flex items-center gap-2">
        <Ban className="size-4" /> Rezervácia je zrušená
      </div>
    );
  }

  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {RESERVATION_FLOW.map((s, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <li key={s} className="flex items-center gap-1 min-w-fit">
            <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 border text-xs whitespace-nowrap ${
              isActive ? "bg-primary text-primary-foreground border-primary font-medium" :
              isDone ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
              "bg-muted text-muted-foreground border-transparent"
            }`}>
              <span className={`size-1.5 rounded-full ${isActive ? "bg-primary-foreground" : isDone ? "bg-emerald-500" : STATUS_DOT[s]}`} />
              {STATUS_LABEL[s]}
            </div>
            {i < RESERVATION_FLOW.length - 1 && (
              <div className={`w-4 h-px ${isDone ? "bg-emerald-300" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}