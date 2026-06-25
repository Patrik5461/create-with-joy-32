import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit3, Trash2, LayoutGrid } from "lucide-react";
import { ReservationForm } from "@/components/reservation-form";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { RESERVATION_STATUSES, STATUS_LABEL, STATUS_BADGE_VARIANT, type ReservationStatus } from "@/lib/reservation-status";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/reservations/$id/")({
  head: () => ({ meta: [{ title: "Rezervácia · Mima Production CRM" }] }),
  component: ReservationDetail,
});

function ReservationDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin", "manager");
  const canDelete = hasRole(user, "admin");
  const [editing, setEditing] = useState(false);

  const reservation = useQuery({
    queryKey: ["reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*, clients(id,company_name), reservation_items(id,qty,furniture_item_id,furniture_items(name,internal_code))")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: ReservationStatus) => {
      const { error } = await supabase.from("reservations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reservation", id] }); toast.success("Stav aktualizovaný"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rezervácia zmazaná"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  const r = reservation.data;

  return (
    <>
      <AppHeader title={r?.event_name ?? "Rezervácia"} />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild><Link to="/reservations"><ArrowLeft className="size-4 mr-1" />Späť</Link></Button>
          <div className="flex gap-2">
            {!editing && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/reservations/$id/layout" params={{ id }}><LayoutGrid className="size-4 mr-1" />Otvoriť plán rozloženia</Link>
              </Button>
            )}
            {canEdit && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit3 className="size-4 mr-1" />Upraviť</Button>}
            {canDelete && !editing && <Button variant="ghost" size="sm" aria-label="Zmazať rezerváciu" onClick={() => { if (confirm("Naozaj zmazať rezerváciu?")) remove.mutate(); }}><Trash2 className="size-4" /></Button>}
          </div>
        </div>

        {editing && r && (
          <ReservationForm existingId={r.id} initial={r} />
        )}

        {!editing && r && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{r.event_name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{r.venue} · {r.address}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]}>{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                    {canEdit && (
                      <Select value={r.status} onValueChange={(v) => setStatus.mutate(v as ReservationStatus)}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESERVATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Info label="Klient" value={r.clients?.company_name ?? "—"} />
                  <Info label="Kontaktná osoba" value={r.contact_person ?? "—"} />
                  <Info label="Telefón" value={r.phone ?? "—"} />
                  <Info label="Email" value={r.email ?? "—"} />
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border-t pt-4">
                  <Info label="Nakládka" value={fmt(r.load_at)} />
                  <Info label="Odchod" value={fmt(r.depart_at)} />
                  <Info label="Začiatok eventu" value={fmt(r.event_start_at)} />
                  <Info label="Koniec eventu" value={fmt(r.event_end_at)} />
                  <Info label="Návrat nábytku" value={fmt(r.return_at)} />
                  <Info label="Opätovne dostupné od" value={fmt(r.available_from_at)} />
                </div>
                {r.note && (
                  <div className="border-t pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Poznámka</div>
                    <p className="text-sm whitespace-pre-wrap">{r.note}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Položky rezervácie</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {r.reservation_items.length === 0 && <p className="text-sm text-muted-foreground">Žiadne položky.</p>}
                {r.reservation_items.map((ri: any) => (
                  <div key={ri.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <div className="text-sm font-medium">{ri.furniture_items?.name}</div>
                      <div className="text-xs text-muted-foreground">{ri.furniture_items?.internal_code}</div>
                    </div>
                    <Badge variant="secondary">{ri.qty} ks</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="text-muted-foreground text-xs uppercase tracking-wider block">{label}</span><span>{value}</span></div>;
}

function fmt(v: string | null) { return v ? format(new Date(v), "d.M.yyyy HH:mm", { locale: sk }) : "—"; }