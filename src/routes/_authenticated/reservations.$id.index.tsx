import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit3, Trash2, LayoutGrid, AlertTriangle, FileText, UserPlus } from "lucide-react";
import { ReservationForm } from "@/components/reservation-form";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { STATUS_LABEL, STATUS_BADGE_VARIANT, type ReservationStatus } from "@/lib/reservation-status";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { SurveyCard } from "@/components/survey-card";
import { ReservationStatusWorkflow } from "@/components/reservation-status-workflow";
import { DocumentsSection } from "@/components/documents-section";
import { ReservationStaffSection } from "@/components/reservation-staff-section";

export const Route = createFileRoute("/_authenticated/reservations/$id/")({
  head: () => ({ meta: [{ title: "Rezervácia · Mima Production CRM" }] }),
  component: ReservationDetail,
});

function ReservationDetail() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin", "manager");
  const canDelete = hasRole(user, "admin");
  const [editing, setEditing] = useState(false);

  const reservation = useQuery({
    queryKey: ["reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*, clients(id,company_name,ico,address,contact_person,email,phone), reservation_items(id,qty,furniture_item_id,furniture_items(name,internal_code))")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const sourceQuote = useQuery({
    queryKey: ["reservation-source-quote", (reservation.data as any)?.quote_group_id],
    enabled: !!(reservation.data as any)?.quote_group_id,
    queryFn: async () => {
      const gid = (reservation.data as any).quote_group_id as string;
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, version_number, is_current")
        .eq("quote_group_id", gid)
        .is("deleted_at", null)
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const overbookedItems = useQuery({
    queryKey: ["reservation-overbooked-items", id],
    enabled: !!reservation.data,
    queryFn: async () => {
      const r = reservation.data;
      const results: Record<string, { qty: number; available: number }> = {};
      await Promise.all(
        (r.reservation_items ?? []).map(async (ri: any) => {
          const { data } = await supabase.rpc("check_item_availability", {
            _item_id: ri.furniture_item_id,
            _from: r.load_at,
            _to: r.available_from_at,
            _exclude_reservation: r.id,
          });
          const row = data?.[0];
          if (row && ri.qty > row.available) {
            results[ri.id] = { qty: ri.qty, available: row.available };
          }
        }),
      );
      return results;
    },
  });

  const overbookedMap = overbookedItems.data ?? {};
  const hasOverbook = Object.keys(overbookedMap).length > 0;

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
            {sourceQuote.data && (
              <div className="lg:col-span-3">
                <div className="rounded-md border border-sky-300 bg-sky-50 text-sky-900 p-3 text-sm flex items-center gap-2">
                  <FileText className="size-4" />
                  Vytvorené z kalkulácie:&nbsp;
                  <Link to="/quotes/$id" params={{ id: sourceQuote.data.id }} className="font-semibold underline">
                    {sourceQuote.data.quote_number} · v{sourceQuote.data.version_number}
                  </Link>
                </div>
              </div>
            )}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{r.event_name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{r.venue} · {r.address}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]}>{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                    {hasOverbook && (
                      <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-800">
                        <AlertTriangle className="size-3 mr-1" />Prekročený sklad
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Info label="Klient" value={r.clients?.company_name ?? (r.contact_person ? `${r.contact_person} (bez klienta)` : "—")} />
                  <Info label="Kontaktná osoba" value={r.contact_person ?? "—"} />
                  <Info label="Telefón" value={r.phone ?? "—"} />
                  <Info label="Email" value={r.email ?? "—"} />
                </div>
                {!r.client_id && (r.contact_person || r.email || r.phone) && (
                  <div className="rounded-md border bg-muted/30 p-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground flex-1 min-w-[10rem]">Rezervácia bez klienta. Chcete z týchto údajov vytvoriť klienta?</span>
                    <CreateClientFromContact reservation={r} disabled={!canEdit} onCreated={() => reservation.refetch()} />
                  </div>
                )}
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
              <CardHeader><CardTitle className="text-base">Workflow stavov</CardTitle></CardHeader>
              <CardContent>
                <ReservationStatusWorkflow reservationId={r.id} status={r.status as ReservationStatus} canEdit={canEdit} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Položky rezervácie</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {r.reservation_items.length === 0 && <p className="text-sm text-muted-foreground">Žiadne položky.</p>}
                {r.reservation_items.map((ri: any) => {
                  const ob = overbookedMap[ri.id];
                  return (
                    <div key={ri.id} className={`flex items-center justify-between p-2 rounded border ${ob ? "border-amber-300 bg-amber-50" : ""}`}>
                      <div>
                        <div className="text-sm font-medium">{ri.furniture_items?.name}</div>
                        <div className="text-xs text-muted-foreground">{ri.furniture_items?.internal_code}</div>
                        {ob && (
                          <div className="text-[11px] text-amber-800 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            Chýba {ob.qty - ob.available} ks (dostupných {ob.available} z {ob.qty} požadovaných)
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">{ri.qty} ks</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="lg:col-span-3">
              <SurveyCard reservationId={r.id} email={r.email} canGenerate={canEdit} />
            </div>

            <div className="lg:col-span-3">
              <ReservationStaffSection reservationId={r.id} />
            </div>

            <div className="lg:col-span-3">
              <DocumentsSection reservation={r} />
            </div>
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

function CreateClientFromContact({ reservation, disabled, onCreated }: { reservation: any; disabled?: boolean; onCreated: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const name = (reservation.contact_person ?? "").trim() || (reservation.email ?? "").trim() || "Nový klient";
      const { data: c, error } = await supabase
        .from("clients")
        .insert({
          company_name: name,
          contact_person: reservation.contact_person ?? null,
          email: reservation.email ?? null,
          phone: reservation.phone ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: eUpd } = await supabase
        .from("reservations")
        .update({ client_id: c.id })
        .eq("id", reservation.id);
      if (eUpd) throw eUpd;
    },
    onSuccess: () => { toast.success("Klient vytvorený a prepojený."); onCreated(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" disabled={disabled || mut.isPending} onClick={() => mut.mutate()}>
      <UserPlus className="size-4 mr-1" />Vytvoriť klienta
    </Button>
  );
}