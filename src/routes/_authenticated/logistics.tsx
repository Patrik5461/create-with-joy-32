import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Truck, Package } from "lucide-react";
import { addDays, format, isSameDay } from "date-fns";
import { sk } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/logistics")({
  head: () => ({ meta: [{ title: "Logistika · Mima Production CRM" }] }),
  component: Logistics,
});

function Logistics() {
  const [day, setDay] = useState<Date>(new Date());
  const qc = useQueryClient();

  const from = new Date(day); from.setHours(0,0,0,0);
  const to = new Date(day); to.setHours(23,59,59,999);

  const data = useQuery({
    queryKey: ["logistics-day", day.toDateString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id,event_name,venue,address,load_at,depart_at,return_at,event_start_at,event_end_at,available_from_at,note,clients(company_name),logistics(id,internal_note,load_time,unload_time,return_time),logistics_surveys(status,floor,has_elevator,elevator_info,access_type,access_note,parking_note,distance_info,onsite_contact_name,onsite_contact_phone,time_restrictions)")
        .or(`and(load_at.gte.${from.toISOString()},load_at.lte.${to.toISOString()}),and(return_at.gte.${from.toISOString()},return_at.lte.${to.toISOString()})`)
        .neq("status", "cancelled");
      if (error) throw error;
      return data as any[];
    },
  });

  const loadingsToday = useMemo(() => (data.data ?? []).filter((r) => isSameDay(new Date(r.load_at), day)).sort((a,b) => new Date(a.load_at).getTime() - new Date(b.load_at).getTime()), [data.data, day]);
  const returnsToday = useMemo(() => (data.data ?? []).filter((r) => isSameDay(new Date(r.return_at), day)).sort((a,b) => new Date(a.return_at).getTime() - new Date(b.return_at).getTime()), [data.data, day]);

  const saveNote = useMutation({
    mutationFn: async ({ reservationId, note, logisticsId }: { reservationId: string; note: string; logisticsId?: string }) => {
      if (logisticsId) {
        const { error } = await supabase.from("logistics").update({ internal_note: note }).eq("id", logisticsId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("logistics").insert({ reservation_id: reservationId, internal_note: note });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["logistics-day"] }); toast.success("Uložené"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader title="Logistika" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Denný plán</h2>
            <p className="text-sm text-muted-foreground">Odvozy a návraty nábytku.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Predchádzajúci deň" onClick={() => setDay((d) => addDays(d, -1))}><ChevronLeft className="size-4" /></Button>
            <Input type="date" className="w-44" value={format(day, "yyyy-MM-dd")} onChange={(e) => setDay(new Date(e.target.value))} />
            <Button variant="outline" size="icon" aria-label="Nasledujúci deň" onClick={() => setDay((d) => addDays(d, 1))}><ChevronRight className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setDay(new Date())}>Dnes</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground capitalize">{format(day, "EEEE d. MMMM yyyy", { locale: sk })}</p>

        <div className="grid lg:grid-cols-2 gap-4">
          <LogColumn title="Nakládky" icon={Truck} list={loadingsToday} type="load" onSave={(p: any) => saveNote.mutate(p)} />
          <LogColumn title="Návraty" icon={Package} list={returnsToday} type="return" onSave={(p: any) => saveNote.mutate(p)} />
        </div>
      </div>
    </>
  );
}

function LogColumn({ title, icon: Icon, list, type, onSave }: any) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="size-4" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Žiadne {title.toLowerCase()}.</p>}
        {list.map((r: any) => {
          const time = type === "load" ? r.load_at : r.return_at;
          const log = r.logistics?.[0];
          return (
            <div key={r.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to="/reservations/$id" params={{ id: r.id }} className="font-medium hover:underline">{r.event_name}</Link>
                  <div className="text-xs text-muted-foreground">{r.clients?.company_name} · {r.venue}</div>
                  {r.address && <div className="text-xs text-muted-foreground">{r.address}</div>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono font-semibold">{format(new Date(time), "HH:mm")}</div>
                </div>
              </div>
              <NoteEditor reservationId={r.id} logisticsId={log?.id} initial={log?.internal_note ?? ""} onSave={onSave} />
              <SurveySummary survey={r.logistics_surveys?.[0]} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NoteEditor({ reservationId, logisticsId, initial, onSave }: any) {
  const [val, setVal] = useState<string>(initial);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="space-y-1">
      <Textarea rows={2} placeholder="Interná poznámka pre tím…" value={val} onChange={(e) => { setVal(e.target.value); setDirty(true); }} />
      {dirty && <Button size="sm" variant="outline" onClick={() => { onSave({ reservationId, note: val, logisticsId }); setDirty(false); }}>Uložiť poznámku</Button>}
    </div>
  );
}

const ACCESS_LABEL: Record<string, string> = { direct: "Priamy vjazd", ramp: "Rampa", stairs: "Schody", other: "Iné" };

function SurveySummary({ survey }: { survey?: any }) {
  if (!survey || survey.status !== "filled") {
    return <div className="text-xs text-muted-foreground italic">Dotazník: {survey ? "odoslaný klientovi, čaká na vyplnenie" : "nevyplnený"}</div>;
  }
  const lines: string[] = [];
  if (survey.floor) lines.push(`Poschodie: ${survey.floor}`);
  if (survey.has_elevator !== null) lines.push(`Výťah: ${survey.has_elevator ? (survey.elevator_info ? `áno (${survey.elevator_info})` : "áno") : "nie"}`);
  if (survey.access_type) lines.push(`Prístup: ${ACCESS_LABEL[survey.access_type] ?? survey.access_type}`);
  if (survey.parking_note) lines.push(`Parkovanie: ${survey.parking_note}`);
  if (survey.distance_info) lines.push(`Vzdialenosť: ${survey.distance_info}`);
  if (survey.time_restrictions) lines.push(`Čas: ${survey.time_restrictions}`);
  if (survey.access_note) lines.push(survey.access_note);
  const contact = [survey.onsite_contact_name, survey.onsite_contact_phone].filter(Boolean).join(" · ");
  return (
    <div className="rounded bg-muted/50 p-2 text-xs space-y-0.5 border">
      <div className="font-medium text-foreground">Dotazník od klienta:</div>
      {contact && <div>Kontakt na mieste: <strong>{contact}</strong></div>}
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}