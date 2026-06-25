import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { sk } from "date-fns/locale";
import { STATUS_LABEL, STATUS_COLOR, type ReservationStatus } from "@/lib/reservation-status";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/reservations/")({
  head: () => ({ meta: [{ title: "Rezervácie · MimaProduction CRM" }] }),
  component: Reservations,
});

type View = "day" | "week" | "month";

function Reservations() {
  const { data: user } = useCurrentUser();
  const canCreate = hasRole(user, "admin", "manager");
  const navigate = useNavigate();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (view === "day") return { from: new Date(cursor.setHours(0,0,0,0)), to: new Date(new Date(cursor).setHours(23,59,59,999)) };
    if (view === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  }, [view, cursor]);

  const reservations = useQuery({
    queryKey: ["reservations", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, event_name, venue, status, color, load_at, event_start_at, event_end_at, return_at, clients(company_name)")
        .gte("event_start_at", range.from.toISOString())
        .lte("event_start_at", range.to.toISOString())
        .order("event_start_at");
      if (error) throw error;
      return data as any[];
    },
  });

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
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="day">Deň</TabsTrigger>
              <TabsTrigger value="week">Týždeň</TabsTrigger>
              <TabsTrigger value="month">Mesiac</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === "month" ? (
          <MonthGrid cursor={cursor} reservations={reservations.data ?? []} onSlot={openNewAt} canCreate={canCreate} />
        ) : view === "week" ? (
          <WeekList from={range.from} reservations={reservations.data ?? []} onSlot={openNewAt} canCreate={canCreate} />
        ) : (
          <DayList day={cursor} reservations={reservations.data ?? []} onSlot={openNewAt} canCreate={canCreate} />
        )}
      </div>
    </>
  );
}

function ReservationCard({ r }: { r: any }) {
  const cls = STATUS_COLOR[r.status as ReservationStatus] ?? "";
  const color = r.color as string | null;
  return (
    <Link to="/reservations/$id" params={{ id: r.id }} className="block">
      <Card
        className={`transition-colors border-l-4 ${color ? "" : cls}`}
        style={color ? { borderLeftColor: color } : undefined}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate text-sm">{r.event_name}</div>
              <div className="text-xs opacity-80 truncate">{r.clients?.company_name ?? "—"} · {r.venue ?? "—"}</div>
              <div className="text-[11px] opacity-70 mt-1">
                {format(new Date(r.event_start_at), "d.M. HH:mm")} → {format(new Date(r.event_end_at), "HH:mm")}
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0 bg-background/60">{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DayList({ day, reservations, onSlot, canCreate }: { day: Date; reservations: any[]; onSlot: (d: Date, h?: number) => void; canCreate: boolean }) {
  const list = reservations.filter((r) => isSameDay(new Date(r.event_start_at), day));
  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20
  return (
    <div className="rounded-lg border bg-card divide-y">
      {hours.map((h) => {
        const slotItems = list.filter((r) => new Date(r.event_start_at).getHours() === h);
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
              ) : slotItems.map((r) => <ReservationCard key={r.id} r={r} />)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function WeekList({ from, reservations, onSlot, canCreate }: { from: Date; reservations: any[]; onSlot: (d: Date) => void; canCreate: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const list = reservations.filter((r) => isSameDay(new Date(r.event_start_at), d));
        return (
          <div key={d.toISOString()} className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">{format(d, "EEE d.M.", { locale: sk })}</div>
            {list.length === 0 ? (
              <button type="button" onClick={() => canCreate && onSlot(d)} className={`w-full text-xs text-muted-foreground/60 border border-dashed rounded-md p-3 text-center ${canCreate ? "hover:bg-muted/40 hover:text-foreground" : ""}`}>
                {canCreate ? "+ Pridať" : "—"}
              </button>
            ) : list.map((r) => <ReservationCard key={r.id} r={r} />)}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ cursor, reservations, onSlot, canCreate }: { cursor: Date; reservations: any[]; onSlot: (d: Date) => void; canCreate: boolean }) {
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
          const list = reservations.filter((r) => isSameDay(new Date(r.event_start_at), day));
          const isOtherMonth = !isSameMonth(day, cursor);
          return (
            <div
              key={day.toISOString()}
              onClick={(e) => {
                if (!canCreate) return;
                if ((e.target as HTMLElement).closest("a")) return;
                onSlot(day);
              }}
              className={`min-h-24 p-1.5 border-b border-r text-[11px] ${isOtherMonth ? "bg-muted/30 text-muted-foreground" : ""} ${canCreate ? "cursor-pointer hover:bg-muted/40" : ""}`}
            >
              <div className="font-semibold mb-1">{format(day, "d")}</div>
              {list.slice(0, 3).map((r) => (
              <Link
                key={r.id}
                to="/reservations/$id"
                params={{ id: r.id }}
                className={`block truncate rounded px-1 py-0.5 mb-0.5 border ${r.color ? "text-white border-transparent" : STATUS_COLOR[r.status as ReservationStatus] ?? ""}`}
                style={r.color ? { backgroundColor: r.color } : undefined}
              >
                {format(new Date(r.event_start_at), "HH:mm")} {r.event_name}
              </Link>
              ))}
              {list.length > 3 && <div className="text-muted-foreground">+{list.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}