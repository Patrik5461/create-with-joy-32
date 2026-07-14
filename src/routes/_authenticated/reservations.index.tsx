import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, Users, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReservationStaffSection } from "@/components/reservation-staff-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { sk } from "date-fns/locale";
import { RESERVATION_STATUSES, STATUS_LABEL, STATUS_COLOR, STATUS_DOT, type ReservationStatus } from "@/lib/reservation-status";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/reservations/")({
  head: () => ({ meta: [{ title: "Rezervácie · Mima Production CRM" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? (s.status as ReservationStatus | "all") : "all",
  }),
  component: Reservations,
});

type View = "day" | "week" | "month";

function Reservations() {
  const { data: user } = useCurrentUser();
  const canCreate = hasRole(user, "admin", "manager");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const statusFilter = (search.status ?? "all") as ReservationStatus | "all";
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (view === "day") return { from: new Date(cursor.setHours(0,0,0,0)), to: new Date(new Date(cursor).setHours(23,59,59,999)) };
    if (view === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  }, [view, cursor]);

  const reservations = useQuery({
    queryKey: ["reservations", range.from.toISOString(), range.to.toISOString(), statusFilter],
    queryFn: async () => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();
      let q = supabase
        .from("reservations")
        .select("id, event_name, venue, status, color, load_at, event_start_at, event_end_at, return_at, clients(company_name)")
        .or(
          [
            `and(event_start_at.gte.${fromIso},event_start_at.lte.${toIso})`,
            `and(load_at.gte.${fromIso},load_at.lte.${toIso})`,
            `and(return_at.gte.${fromIso},return_at.lte.${toIso})`,
          ].join(",")
        )
        .order("event_start_at");
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const ids = (reservations.data ?? []).map((r) => r.id);
  const overbooked = useQuery({
    queryKey: ["reservations-overbooked", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("overbooked_reservation_ids", { _ids: ids });
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.reservation_id));
    },
  });
  const overbookedSet: Set<string> = overbooked.data ?? new Set();

  const occurrences = useMemo(() => expandOccurrences(reservations.data ?? []), [reservations.data]);

  // Load staff for all visible reservations
  const staffQ = useQuery({
    queryKey: ["calendar-staff", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("reservation_staff")
        .select("id, reservation_id, user_id, external_name, role, planned_start, planned_end")
        .in("reservation_id", ids);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; reservation_id: string; user_id: string | null; external_name: string | null; role: string | null; planned_start: string | null; planned_end: string | null }>;
      const uids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", uids);
        for (const p of (profs ?? []) as any[]) profileMap.set(p.id, p);
      }
      return rows.map((r) => ({
        ...r,
        name: r.user_id ? (profileMap.get(r.user_id)?.full_name || profileMap.get(r.user_id)?.email || "—") : (r.external_name || "—"),
      }));
    },
  });

  const staffByRes = useMemo(() => {
    const m = new Map<string, Array<{ id: string; name: string; role: string | null; user_id: string | null; planned_start: string | null; planned_end: string | null }>>();
    for (const s of staffQ.data ?? []) {
      const arr = m.get(s.reservation_id) ?? [];
      arr.push(s);
      m.set(s.reservation_id, arr);
    }
    return m;
  }, [staffQ.data]);

  // Detect conflicts: same CRM user assigned to two different reservations that overlap by day
  const conflictResIds = useMemo(() => {
    const byUserDay = new Map<string, Set<string>>();
    for (const s of staffQ.data ?? []) {
      if (!s.user_id || !s.planned_start) continue;
      const d = new Date(s.planned_start);
      const key = `${s.user_id}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const set = byUserDay.get(key) ?? new Set();
      set.add(s.reservation_id);
      byUserDay.set(key, set);
    }
    const bad = new Set<string>();
    for (const [, set] of byUserDay) {
      if (set.size > 1) for (const id of set) bad.add(id);
    }
    return bad;
  }, [staffQ.data]);

  const [staffDialogResId, setStaffDialogResId] = useState<string | null>(null);
  const dialogRes = useMemo(
    () => (reservations.data ?? []).find((r) => r.id === staffDialogResId) ?? null,
    [reservations.data, staffDialogResId],
  );

  const openNewAt = (day: Date, hour = 9) => {
    if (!canCreate) return;
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    navigate({ to: "/reservations/new", search: { start: start.toISOString() } as any });
  };

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

  return (
    <>
      <AppHeader title="Rezervácie" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Kalendár rezervácií</h2>
            <p className="text-sm text-muted-foreground">Prehľad eventov a rezervácií nábytku.</p>
          </div>
          {canCreate && (
            <Button asChild><Link to="/reservations/new"><Plus className="size-4 mr-1" />Nová rezervácia</Link></Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Dnes</Button>
            <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
            <span className="font-medium text-sm ml-2 capitalize">{headerLabel}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={statusFilter}
              onValueChange={(v) => navigate({ to: "/reservations", search: { status: v === "all" ? undefined : v } as any })}
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
                      {STATUS_LABEL[s]}
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

        {view === "month" ? (
          <MonthGrid cursor={cursor} occurrences={occurrences} onSlot={openNewAt} canCreate={canCreate} overbookedSet={overbookedSet} staffByRes={staffByRes} conflictResIds={conflictResIds} onOpenStaff={setStaffDialogResId} />
        ) : view === "week" ? (
          <WeekList from={range.from} occurrences={occurrences} onSlot={openNewAt} canCreate={canCreate} overbookedSet={overbookedSet} staffByRes={staffByRes} conflictResIds={conflictResIds} onOpenStaff={setStaffDialogResId} />
        ) : (
          <DayList day={cursor} occurrences={occurrences} onSlot={openNewAt} canCreate={canCreate} overbookedSet={overbookedSet} staffByRes={staffByRes} conflictResIds={conflictResIds} onOpenStaff={setStaffDialogResId} />
        )}
      </div>

      <Dialog open={!!staffDialogResId} onOpenChange={(o) => !o && setStaffDialogResId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Personál
              {dialogRes && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  · {(dialogRes as any).clients?.company_name || (dialogRes as any).event_name || "—"}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {staffDialogResId && <ReservationStaffSection reservationId={staffDialogResId} />}
          {staffDialogResId && (
            <div className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/reservations/$id" params={{ id: staffDialogResId }} onClick={() => setStaffDialogResId(null)}>
                  Otvoriť detail rezervácie
                </Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type OccurrenceKind = "setup" | "event" | "teardown";
type Occurrence = { key: string; date: Date; kind: OccurrenceKind; kinds: OccurrenceKind[]; r: any };

const KIND_LABEL: Record<OccurrenceKind, string> = {
  setup: "Montáž",
  event: "Event",
  teardown: "Demontáž",
};

function expandOccurrences(reservations: any[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const r of reservations) {
    const entries: { kind: OccurrenceKind; date: Date }[] = [];
    if (r.load_at) entries.push({ kind: "setup", date: new Date(r.load_at) });
    if (r.event_start_at) entries.push({ kind: "event", date: new Date(r.event_start_at) });
    if (r.return_at) entries.push({ kind: "teardown", date: new Date(r.return_at) });
    // Merge same-day entries
    const byDay = new Map<string, { date: Date; kinds: OccurrenceKind[] }>();
    for (const e of entries) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const existing = byDay.get(k);
      if (existing) {
        if (!existing.kinds.includes(e.kind)) existing.kinds.push(e.kind);
        // keep earliest time
        if (e.date < existing.date) existing.date = e.date;
      } else {
        byDay.set(k, { date: e.date, kinds: [e.kind] });
      }
    }
    const order: OccurrenceKind[] = ["setup", "event", "teardown"];
    for (const [k, v] of byDay) {
      v.kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      out.push({ key: `${r.id}:${k}`, date: v.date, kind: v.kinds[0], kinds: v.kinds, r });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function occurrenceLabel(o: Occurrence): string {
  return o.kinds.map((k) => KIND_LABEL[k]).join(" + ");
}

type StaffLite = { id: string; name: string; role: string | null; user_id: string | null; planned_start: string | null; planned_end: string | null };

function StaffPill({ list, conflict, onOpen }: { list: StaffLite[]; conflict: boolean; onOpen: () => void }) {
  const count = list.length;
  const tooltipContent = count === 0
    ? "Nikto nie je priradený"
    : list.slice(0, 12).map((s) => `${s.name}${s.role ? ` · ${s.role}` : ""}${s.planned_start ? ` · ${format(new Date(s.planned_start), "HH:mm")}${s.planned_end ? `–${format(new Date(s.planned_end), "HH:mm")}` : ""}` : ""}`).join("\n") + (list.length > 12 ? `\n… +${list.length - 12}` : "");
  const cls = count === 0
    ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
    : conflict
      ? "border-red-400 bg-red-50 text-red-800 hover:bg-red-100"
      : "border-slate-300 bg-background hover:bg-muted";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none ${cls}`}
            title={count === 0 ? "Priradiť personál" : "Upraviť personál"}
          >
            {count === 0 ? <UserX className="size-3" /> : <Users className="size-3" />}
            <span>{count === 0 ? "Bez ľudí" : `${count} ${count === 1 ? "človek" : count < 5 ? "ľudia" : "ľudí"}`}</span>
            {conflict && <AlertTriangle className="size-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
          {tooltipContent}
          {conflict && "\n⚠ Konflikt: osoba na inej akcii v ten deň"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ReservationCard({ o, overbooked, staff, conflict, onOpenStaff }: { o: Occurrence; overbooked?: boolean; staff: StaffLite[]; conflict: boolean; onOpenStaff: (id: string) => void }) {
  const r = o.r;
  const cls = STATUS_COLOR[r.status as ReservationStatus] ?? "";
  const color = r.color as string | null;
  const clientName = r.clients?.company_name as string | undefined;
  const eventName = r.event_name as string | undefined;
  const base = clientName || eventName || "—";
  const primary = `${occurrenceLabel(o)} — ${base}`;
  const secondary = clientName && eventName && eventName !== clientName ? eventName : null;
  return (
    <Link to="/reservations/$id" params={{ id: r.id }} className="block">
      <Card
        className={`transition-colors border-l-4 ${color ? "" : cls}`}
        style={color ? { borderLeftColor: color } : undefined}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate text-sm">{primary}</div>
              {secondary && <div className="text-xs opacity-90 truncate">{secondary}</div>}
              <div className="text-[11px] opacity-70 truncate">{r.venue ?? "—"}</div>
              <div className="text-[11px] opacity-70 mt-1">
                {format(o.date, "d.M. HH:mm")}
              </div>
              <div className="mt-1.5">
                <StaffPill list={staff} conflict={conflict} onOpen={() => onOpenStaff(r.id)} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant="outline" className="text-[10px] bg-background/60">{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
              {overbooked && (
                <Badge variant="outline" className="text-[10px] border-amber-500 bg-amber-50 text-amber-800" title="Prekročená skladová dostupnosť">
                  <AlertTriangle className="size-2.5 mr-0.5" />Sklad
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DayList({ day, occurrences, onSlot, canCreate, overbookedSet, staffByRes, conflictResIds, onOpenStaff }: { day: Date; occurrences: Occurrence[]; onSlot: (d: Date, h?: number) => void; canCreate: boolean; overbookedSet: Set<string>; staffByRes: Map<string, StaffLite[]>; conflictResIds: Set<string>; onOpenStaff: (id: string) => void }) {
  const list = occurrences.filter((o) => isSameDay(o.date, day));
  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20
  return (
    <div className="rounded-lg border bg-card divide-y">
      {hours.map((h) => {
        const slotItems = list.filter((o) => o.date.getHours() === h);
        return (
          <div key={h} className="grid grid-cols-[60px_1fr] min-h-14">
            <div className="text-xs text-muted-foreground p-2 border-r">{String(h).padStart(2, "0")}:00</div>
            <button
              type="button"
              onClick={() => canCreate && slotItems.length === 0 && onSlot(day, h)}
              className={`text-left p-1.5 space-y-1 ${canCreate && slotItems.length === 0 ? "hover:bg-muted/40 cursor-pointer" : ""}`}
            >
              {slotItems.length === 0 ? (
                canCreate && <span className="text-[11px] text-muted-foreground/50">+ Nová rezervácia</span>
              ) : slotItems.map((o) => <ReservationCard key={o.key} o={o} overbooked={overbookedSet.has(o.r.id)} staff={staffByRes.get(o.r.id) ?? []} conflict={conflictResIds.has(o.r.id)} onOpenStaff={onOpenStaff} />)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function WeekList({ from, occurrences, onSlot, canCreate, overbookedSet, staffByRes, conflictResIds, onOpenStaff }: { from: Date; occurrences: Occurrence[]; onSlot: (d: Date) => void; canCreate: boolean; overbookedSet: Set<string>; staffByRes: Map<string, StaffLite[]>; conflictResIds: Set<string>; onOpenStaff: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const list = occurrences.filter((o) => isSameDay(o.date, d));
        return (
          <div key={d.toISOString()} className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">{format(d, "EEE d.M.", { locale: sk })}</div>
            {list.length === 0 ? (
              <button type="button" onClick={() => canCreate && onSlot(d)} className={`w-full text-xs text-muted-foreground/60 border border-dashed rounded-md p-3 text-center ${canCreate ? "hover:bg-muted/40 hover:text-foreground" : ""}`}>
                {canCreate ? "+ Pridať" : "—"}
              </button>
            ) : list.map((o) => <ReservationCard key={o.key} o={o} overbooked={overbookedSet.has(o.r.id)} staff={staffByRes.get(o.r.id) ?? []} conflict={conflictResIds.has(o.r.id)} onOpenStaff={onOpenStaff} />)}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ cursor, occurrences, onSlot, canCreate, overbookedSet, staffByRes, conflictResIds, onOpenStaff }: { cursor: Date; occurrences: Occurrence[]; onSlot: (d: Date) => void; canCreate: boolean; overbookedSet: Set<string>; staffByRes: Map<string, StaffLite[]>; conflictResIds: Set<string>; onOpenStaff: (id: string) => void }) {
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="grid grid-cols-7 bg-muted text-xs font-medium">
        {["Po","Ut","St","Št","Pi","So","Ne"].map((dn) => <div key={dn} className="p-2 text-center">{dn}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const list = occurrences.filter((o) => isSameDay(o.date, day));
          const isOtherMonth = !isSameMonth(day, cursor);
          return (
            <div
              key={day.toISOString()}
              onClick={(e) => {
                if (!canCreate) return;
                if ((e.target as HTMLElement).closest("a,button")) return;
                onSlot(day);
              }}
              className={`min-h-24 p-1.5 border-b border-r text-[11px] ${isOtherMonth ? "bg-muted/30 text-muted-foreground" : ""} ${canCreate ? "cursor-pointer hover:bg-muted/40" : ""}`}
            >
              <div className="font-semibold mb-1">{format(day, "d")}</div>
              {list.slice(0, 3).map((o) => {
                const staff = staffByRes.get(o.r.id) ?? [];
                const hasConflict = conflictResIds.has(o.r.id);
                return (
                  <div key={o.key} className="flex items-center gap-1 mb-0.5">
                    <Link
                      to="/reservations/$id"
                      params={{ id: o.r.id }}
                      className={`flex-1 min-w-0 truncate rounded px-1 py-0.5 border ${o.r.color ? "text-white border-transparent" : STATUS_COLOR[o.r.status as ReservationStatus] ?? ""}`}
                      style={o.r.color ? { backgroundColor: o.r.color } : undefined}
                    >
                      {overbookedSet.has(o.r.id) && "⚠ "}
                      {occurrenceLabel(o)}{": "}
                      {format(o.date, "HH:mm")}{" "}
                      {(o.r.clients?.company_name as string | undefined) || (o.r.event_name as string | undefined) || "—"}
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenStaff(o.r.id); }}
                      title={staff.length === 0 ? "Priradiť personál" : `${staff.length} priradených`}
                      className={`shrink-0 inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] leading-none ${staff.length === 0 ? "border-amber-400 bg-amber-50 text-amber-800" : hasConflict ? "border-red-400 bg-red-50 text-red-800" : "border-slate-300 bg-background text-slate-700"}`}
                    >
                      {staff.length === 0 ? <UserX className="size-2.5" /> : <Users className="size-2.5" />}
                      {staff.length > 0 && <span>{staff.length}</span>}
                      {hasConflict && <AlertTriangle className="size-2.5" />}
                    </button>
                  </div>
                );
              })}
              {list.length > 3 && <div className="text-muted-foreground">+{list.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}