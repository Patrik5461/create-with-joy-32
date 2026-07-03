import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Truck, Package, Plus, Pencil, Trash2, Car } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { sk } from "date-fns/locale";
import { toast } from "sonner";
import { RESERVATION_STATUSES, STATUS_LABEL as RES_STATUS_LABEL, STATUS_DOT, type ReservationStatus } from "@/lib/reservation-status";

export const Route = createFileRoute("/_authenticated/logistics")({
  head: () => ({ meta: [{ title: "Logistika · Mima Production CRM" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? (s.status as ReservationStatus | "all") : "all",
  }),
  component: Logistics,
});

type View = "day" | "week" | "month";

function Logistics() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const statusFilter = (search.status ?? "all") as ReservationStatus | "all";
  const [view, setView] = useState<View>("day");
  const [cursor, setCursor] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (view === "day") {
      const f = new Date(cursor); f.setHours(0,0,0,0);
      const t = new Date(cursor); t.setHours(23,59,59,999);
      return { from: f, to: t };
    }
    if (view === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  }, [view, cursor]);

  const from = range.from;
  const to = range.to;

  const data = useQuery({
    queryKey: ["logistics-range", from.toISOString(), to.toISOString(), statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("reservations")
        .select("id,event_name,venue,address,load_at,depart_at,return_at,event_start_at,event_end_at,available_from_at,note,clients(company_name),logistics(id,internal_note,load_time,unload_time,return_time),logistics_surveys(status,floor,has_elevator,elevator_info,access_type,access_note,parking_note,distance_info,onsite_contact_name,onsite_contact_phone,time_restrictions)")
        .or(`and(load_at.gte.${from.toISOString()},load_at.lte.${to.toISOString()}),and(return_at.gte.${from.toISOString()},return_at.lte.${to.toISOString()})`)
        .neq("status", "cancelled");
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const loadingsToday = useMemo(() => (data.data ?? []).filter((r) => isSameDay(new Date(r.load_at), cursor)).sort((a,b) => new Date(a.load_at).getTime() - new Date(b.load_at).getTime()), [data.data, cursor]);
  const returnsToday = useMemo(() => (data.data ?? []).filter((r) => isSameDay(new Date(r.return_at), cursor)).sort((a,b) => new Date(a.return_at).getTime() - new Date(b.return_at).getTime()), [data.data, cursor]);

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["logistics-range"] }); toast.success("Uložené"); },
    onError: (e: any) => toast.error(e.message),
  });

  const move = (dir: 1 | -1) => {
    if (view === "day") setCursor((d) => addDays(d, dir));
    else if (view === "week") setCursor((d) => addWeeks(d, dir));
    else setCursor((d) => addMonths(d, dir));
  };

  const headerLabel = view === "day"
    ? format(cursor, "EEEE d. MMMM yyyy", { locale: sk })
    : view === "week"
      ? `${format(range.from, "d.")} – ${format(range.to, "d. MMMM yyyy", { locale: sk })}`
      : format(cursor, "LLLL yyyy", { locale: sk });

  const byDay = useMemo(() => {
    const map = new Map<string, { loads: any[]; returns: any[] }>();
    const items = data.data ?? [];
    for (const r of items) {
      for (const [key, dt] of [["loads", r.load_at], ["returns", r.return_at]] as const) {
        const d = new Date(dt);
        const k = format(d, "yyyy-MM-dd");
        if (d < range.from || d > range.to) continue;
        if (!map.has(k)) map.set(k, { loads: [], returns: [] });
        map.get(k)![key].push(r);
      }
    }
    return map;
  }, [data.data, range.from, range.to]);

  return (
    <>
      <AppHeader title="Logistika" />
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Plán logistiky</h2>
          <p className="text-sm text-muted-foreground">Prehľad nakládok a návratov nábytku.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Predchádzajúce" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Dnes</Button>
            <Button variant="outline" size="icon" aria-label="Nasledujúce" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
            <span className="font-medium text-sm ml-2 capitalize">{headerLabel}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={statusFilter}
              onValueChange={(v) => navigate({ search: { status: v === "all" ? undefined : v } as any })}
            >
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="Všetky stavy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všetky stavy</SelectItem>
                {RESERVATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
                      {RES_STATUS_LABEL[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList>
                <TabsTrigger value="day">Deň</TabsTrigger>
                <TabsTrigger value="week">Týždeň</TabsTrigger>
                <TabsTrigger value="month">Mesiac</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {view === "day" ? (
          <div className="grid lg:grid-cols-2 gap-4">
            <LogColumn title="Nakládky" icon={Truck} list={loadingsToday} type="load" onSave={(p: any) => saveNote.mutate(p)} />
            <LogColumn title="Návraty" icon={Package} list={returnsToday} type="return" onSave={(p: any) => saveNote.mutate(p)} />
          </div>
        ) : (
          <RangeList range={range} byDay={byDay} onSave={(p: any) => saveNote.mutate(p)} onPickDay={(d) => { setCursor(d); setView("day"); }} />
        )}

        <VehicleFleet />
      </div>
    </>
  );
}

function RangeList({ range, byDay, onSave, onPickDay }: { range: { from: Date; to: Date }; byDay: Map<string, { loads: any[]; returns: any[] }>; onSave: (p: any) => void; onPickDay: (d: Date) => void }) {
  const days: Date[] = [];
  for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) days.push(new Date(d));
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const bucket = byDay.get(key);
        const empty = !bucket || (bucket.loads.length === 0 && bucket.returns.length === 0);
        return (
          <Card key={key}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm capitalize flex items-center justify-between">
                <button className="hover:underline" onClick={() => onPickDay(d)}>{format(d, "EEEE d. MMMM", { locale: sk })}</button>
                {!empty && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {bucket!.loads.length > 0 && <>Nakládky: {bucket!.loads.length}</>}
                    {bucket!.loads.length > 0 && bucket!.returns.length > 0 && " · "}
                    {bucket!.returns.length > 0 && <>Návraty: {bucket!.returns.length}</>}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            {!empty && (
              <CardContent className="grid md:grid-cols-2 gap-3 pt-0">
                <MiniList title="Nakládky" icon={Truck} list={bucket!.loads} type="load" onSave={onSave} />
                <MiniList title="Návraty" icon={Package} list={bucket!.returns} type="return" onSave={onSave} />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function MiniList({ title, icon: Icon, list, type, onSave }: any) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Icon className="size-3.5" />{title}</div>
      {list.map((r: any) => {
        const time = type === "load" ? r.load_at : r.return_at;
        const log = r.logistics?.[0];
        return (
          <div key={`${type}-${r.id}`} className="rounded-md border p-2 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to="/reservations/$id" params={{ id: r.id }} className="text-sm font-medium hover:underline block truncate">{r.event_name}</Link>
                <div className="text-xs text-muted-foreground truncate">{r.clients?.company_name} · {r.venue}</div>
              </div>
              <div className="text-sm font-mono font-semibold">{format(new Date(time), "HH:mm")}</div>
            </div>
            <NoteEditor reservationId={r.id} logisticsId={log?.id} initial={log?.internal_note ?? ""} onSave={onSave} />
          </div>
        );
      })}
    </div>
  );
}

type Vehicle = {
  id: string;
  name: string;
  license_plate: string | null;
  vehicle_type: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  capacity_kg: number | null;
  volume_m3: number | null;
  note: string | null;
  status: string;
};

const STATUS_LABEL: Record<string, string> = { active: "Aktívne", service: "V servise", retired: "Vyradené" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { active: "default", service: "secondary", retired: "outline" };

function VehicleFleet() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("name");
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); toast.success("Vozidlo odstránené"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Car className="size-4" />Vozový park</CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Pridať vozidlo</Button>
      </CardHeader>
      <CardContent>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatiaľ žiadne vozidlá. Pridajte prvé vozidlo do vozového parku.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{[v.brand, v.model, v.year].filter(Boolean).join(" · ")}</div>
                  </div>
                  <Badge variant={STATUS_VARIANT[v.status] ?? "outline"}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                </div>
                <div className="text-xs space-y-0.5 text-muted-foreground">
                  {v.license_plate && <div>ŠPZ: <span className="font-mono text-foreground">{v.license_plate}</span></div>}
                  {v.vehicle_type && <div>Typ: {v.vehicle_type}</div>}
                  {(v.capacity_kg || v.volume_m3) && (
                    <div>
                      {v.capacity_kg ? `${v.capacity_kg} kg` : ""}{v.capacity_kg && v.volume_m3 ? " · " : ""}{v.volume_m3 ? `${v.volume_m3} m³` : ""}
                    </div>
                  )}
                  {v.note && <div className="italic">{v.note}</div>}
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="Upraviť" onClick={() => { setEditing(v); setOpen(true); }}><Pencil className="size-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Odstrániť"><Trash2 className="size-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Odstrániť vozidlo?</AlertDialogTitle>
                        <AlertDialogDescription>Vozidlo „{v.name}" bude trvalo odstránené.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Zrušiť</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(v.id)}>Odstrániť</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <VehicleDialog open={open} onOpenChange={setOpen} vehicle={editing} />
    </Card>
  );
}

function VehicleDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: Vehicle | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Vehicle>>({});

  useEffect(() => {
    setForm(vehicle ?? { status: "active" });
  }, [vehicle, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name?.trim() ?? "",
        license_plate: form.license_plate || null,
        vehicle_type: form.vehicle_type || null,
        brand: form.brand || null,
        model: form.model || null,
        year: form.year ? Number(form.year) : null,
        capacity_kg: form.capacity_kg ? Number(form.capacity_kg) : null,
        volume_m3: form.volume_m3 ? Number(form.volume_m3) : null,
        note: form.note || null,
        status: form.status || "active",
      };
      if (!payload.name) throw new Error("Názov vozidla je povinný");
      if (vehicle) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(vehicle ? "Vozidlo upravené" : "Vozidlo pridané");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Upraviť vozidlo" : "Nové vozidlo"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Názov *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="napr. Dodávka 1" />
          </div>
          <div className="space-y-1">
            <Label>ŠPZ</Label>
            <Input value={form.license_plate ?? ""} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Typ</Label>
            <Input value={form.vehicle_type ?? ""} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} placeholder="dodávka, ťahač…" />
          </div>
          <div className="space-y-1">
            <Label>Značka</Label>
            <Input value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Model</Label>
            <Input value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Rok</Label>
            <Input type="number" value={form.year ?? ""} onChange={(e) => setForm({ ...form, year: e.target.value as any })} />
          </div>
          <div className="space-y-1">
            <Label>Stav</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktívne</SelectItem>
                <SelectItem value="service">V servise</SelectItem>
                <SelectItem value="retired">Vyradené</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Nosnosť (kg)</Label>
            <Input type="number" value={form.capacity_kg ?? ""} onChange={(e) => setForm({ ...form, capacity_kg: e.target.value as any })} />
          </div>
          <div className="space-y-1">
            <Label>Objem (m³)</Label>
            <Input type="number" step="0.1" value={form.volume_m3 ?? ""} onChange={(e) => setForm({ ...form, volume_m3: e.target.value as any })} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Poznámka</Label>
            <Textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušiť</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Uložiť</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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