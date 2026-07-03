import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogIn, LogOut, Coffee, Play, Download } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { format, startOfWeek, startOfMonth, endOfMonth, endOfWeek, startOfDay, endOfDay, addDays, differenceInMinutes } from "date-fns";
import { sk } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

type Break = { id: string; attendance_id: string; break_start: string; break_end: string | null };
type Attendance = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  source: "manual" | "event" | "helper_pin";
  reservation_id: string | null;
  note: string | null;
  helper_id?: string | null;
  is_helper?: boolean | null;
};
type StaffRow = {
  id: string;
  user_id: string | null;
  reservation_id: string;
  actual_arrival: string | null;
  actual_departure: string | null;
};

type Interval = { start: number; end: number };

function unionMinutes(intervals: Interval[]): number {
  if (!intervals.length) return 0;
  const s = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let cur = { ...s[0] };
  for (let i = 1; i < s.length; i++) {
    if (s[i].start <= cur.end) cur.end = Math.max(cur.end, s[i].end);
    else { total += cur.end - cur.start; cur = { ...s[i] }; }
  }
  total += cur.end - cur.start;
  return Math.round(total / 60000);
}

function subtractIntervals(base: Interval, holes: Interval[]): Interval[] {
  let out: Interval[] = [base];
  for (const h of holes) {
    const next: Interval[] = [];
    for (const iv of out) {
      if (h.end <= iv.start || h.start >= iv.end) { next.push(iv); continue; }
      if (h.start > iv.start) next.push({ start: iv.start, end: Math.min(h.start, iv.end) });
      if (h.end < iv.end) next.push({ start: Math.max(h.end, iv.start), end: iv.end });
    }
    out = next;
  }
  return out;
}

function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "HH:mm");
}

function ClockPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const open = useQuery({
    queryKey: ["attendance-open", userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("attendance")
        .select("*")
        .eq("user_id", userId).is("clock_out", null)
        .order("clock_in", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Attendance | null;
    },
    refetchInterval: 60_000,
  });

  const activeBreak = useQuery({
    queryKey: ["attendance-open-break", open.data?.id],
    enabled: !!open.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("attendance_breaks")
        .select("*").eq("attendance_id", open.data!.id).is("break_end", null)
        .order("break_start", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Break | null;
    },
  });

  const todayBreaks = useQuery({
    queryKey: ["attendance-today-breaks", open.data?.id],
    enabled: !!open.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("attendance_breaks")
        .select("*").eq("attendance_id", open.data!.id).order("break_start");
      if (error) throw error;
      return (data ?? []) as Break[];
    },
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("attendance").insert({
        user_id: userId, source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-open", userId] }); qc.invalidateQueries({ queryKey: ["attendance-list"] }); toast.success("Príchod zaznamenaný"); },
    onError: (e: any) => toast.error(e.message),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!open.data) return;
      // close open break first
      if (activeBreak.data) {
        await (supabase.from as any)("attendance_breaks").update({ break_end: new Date().toISOString() }).eq("id", activeBreak.data.id);
      }
      const { error } = await (supabase.from as any)("attendance").update({ clock_out: new Date().toISOString() }).eq("id", open.data.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-open", userId] }); qc.invalidateQueries({ queryKey: ["attendance-list"] }); toast.success("Odchod zaznamenaný"); },
    onError: (e: any) => toast.error(e.message),
  });

  const startBreak = useMutation({
    mutationFn: async () => {
      if (!open.data) throw new Error("Najprv sa musíš pichnúť na príchode.");
      const { error } = await (supabase.from as any)("attendance_breaks").insert({ attendance_id: open.data.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-open-break"] }); qc.invalidateQueries({ queryKey: ["attendance-today-breaks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const endBreak = useMutation({
    mutationFn: async () => {
      if (!activeBreak.data) return;
      const { error } = await (supabase.from as any)("attendance_breaks").update({ break_end: new Date().toISOString() }).eq("id", activeBreak.data.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-open-break"] }); qc.invalidateQueries({ queryKey: ["attendance-today-breaks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const status = !open.data
    ? { label: "Neprihlásený", cls: "bg-slate-100 text-slate-700 border-slate-300" }
    : activeBreak.data
      ? { label: `Na prestávke od ${fmtTime(activeBreak.data.break_start)}`, cls: "bg-amber-50 text-amber-800 border-amber-300" }
      : { label: `Prítomný od ${fmtTime(open.data.clock_in)}`, cls: "bg-emerald-50 text-emerald-800 border-emerald-300" };

  const onEvent = !!open.data && open.data.source === "event";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dochádzkový systém&nbsp;</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-lg border px-4 py-3 text-center text-base font-semibold ${status.cls}`}>
          {status.label}
          {onEvent && <Badge variant="outline" className="ml-2">akcia</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg" className="h-20 text-base"
            onClick={() => clockIn.mutate()}
            disabled={!!open.data || clockIn.isPending}
          >
            <LogIn className="size-6 mr-2" /> Príchod
          </Button>
          <Button
            size="lg" variant="destructive" className="h-20 text-base"
            onClick={() => clockOut.mutate()}
            disabled={!open.data || clockOut.isPending}
          >
            <LogOut className="size-6 mr-2" /> Odchod
          </Button>
          {activeBreak.data ? (
            <Button
              size="lg" variant="secondary" className="col-span-2 h-16 text-base"
              onClick={() => endBreak.mutate()}
              disabled={endBreak.isPending}
            >
              <Play className="size-5 mr-2" /> Ukončiť prestávku
            </Button>
          ) : (
            <Button
              size="lg" variant="outline" className="col-span-2 h-16 text-base"
              onClick={() => startBreak.mutate()}
              disabled={!open.data || startBreak.isPending}
            >
              <Coffee className="size-5 mr-2" /> Začať prestávku
            </Button>
          )}
        </div>

        {open.data && (
          <div className="text-sm border rounded-md p-3 bg-muted/30">
            <div className="font-medium mb-1">Dnešný priebeh</div>
            <div>Príchod: <b>{fmtTime(open.data.clock_in)}</b></div>
            {(todayBreaks.data ?? []).length > 0 && (
              <div className="mt-1">
                Prestávky:
                <ul className="list-disc pl-5">
                  {(todayBreaks.data ?? []).map((b) => (
                    <li key={b.id}>{fmtTime(b.break_start)} – {b.break_end ? fmtTime(b.break_end) : "…"}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Range = "week" | "month" | "custom";

function useRange(range: Range, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  if (range === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
  return { from: from ? startOfDay(new Date(from)) : startOfDay(now), to: to ? endOfDay(new Date(to)) : endOfDay(now) };
}

type ComputedRow = {
  userId: string;
  name: string;
  manualMin: number;
  eventMin: number;
  totalMin: number;
  days: number;
};

function computeSummary(
  users: { id: string; name: string; isHelper?: boolean }[],
  attendance: Attendance[],
  breaks: Break[],
  staff: StaffRow[],
  from: Date,
  to: Date,
): ComputedRow[] {
  const clip = (a: number, b: number) => ({ start: Math.max(a, from.getTime()), end: Math.min(b, to.getTime()) });
  const breaksBy = new Map<string, Break[]>();
  for (const b of breaks) {
    const arr = breaksBy.get(b.attendance_id) ?? [];
    arr.push(b); breaksBy.set(b.attendance_id, arr);
  }

  return users.map((u) => {
    const attRows = attendance.filter((a) =>
      u.isHelper ? a.helper_id === u.id : a.user_id === u.id,
    );
    const manualIntervals: Interval[] = [];
    const daySet = new Set<string>();
    for (const a of attRows) {
      const cin = new Date(a.clock_in).getTime();
      const cout = a.clock_out ? new Date(a.clock_out).getTime() : Date.now();
      const iv = clip(cin, cout);
      if (iv.end <= iv.start) continue;
      const holes = (breaksBy.get(a.id) ?? [])
        .filter((b) => b.break_end)
        .map((b) => clip(new Date(b.break_start).getTime(), new Date(b.break_end!).getTime()))
        .filter((x) => x.end > x.start);
      const pieces = subtractIntervals(iv, holes);
      manualIntervals.push(...pieces);
      daySet.add(a.work_date);
    }
    const eventIntervals: Interval[] = [];
    for (const s of (u.isHelper ? [] : staff)) {
      if (s.user_id !== u.id) continue;
      if (!s.actual_arrival || !s.actual_departure) continue;
      const iv = clip(new Date(s.actual_arrival).getTime(), new Date(s.actual_departure).getTime());
      if (iv.end > iv.start) {
        eventIntervals.push(iv);
        daySet.add(format(new Date(s.actual_arrival), "yyyy-MM-dd"));
      }
    }
    const manualMin = unionMinutes(manualIntervals);
    const eventMin = unionMinutes(eventIntervals);
    const totalMin = unionMinutes([...manualIntervals, ...eventIntervals]); // union avoids double counting
    return { userId: u.id, name: u.name, manualMin, eventMin, totalMin, days: daySet.size };
  });
}

function SummarySection({ isAdmin, currentUserId }: { isAdmin: boolean; currentUserId: string }) {
  const [range, setRange] = useState<Range>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const { from, to } = useRange(range, customFrom, customTo);

  const profiles = useQuery({
    queryKey: ["profiles-attendance", isAdmin],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const helpersQ = useQuery({
    queryKey: ["helpers-attendance", isAdmin],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("helpers").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const list = useQuery({
    queryKey: ["attendance-list", from.toISOString(), to.toISOString(), isAdmin, selectedUser, currentUserId],
    queryFn: async () => {
      let q: any = (supabase.from as any)("attendance").select("*")
        .gte("clock_in", from.toISOString()).lte("clock_in", to.toISOString());
      if (!isAdmin) q = q.eq("user_id", currentUserId);
      else if (selectedUser.startsWith("helper:")) q = q.eq("helper_id", selectedUser.slice(7));
      else if (selectedUser !== "all") q = q.eq("user_id", selectedUser);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Attendance[];
      const ids = rows.map((r) => r.id);
      let breaks: Break[] = [];
      if (ids.length) {
        const { data: bd } = await (supabase.from as any)("attendance_breaks").select("*").in("attendance_id", ids);
        breaks = (bd ?? []) as Break[];
      }
      let staffQ: any = (supabase.from as any)("reservation_staff").select("id, user_id, reservation_id, actual_arrival, actual_departure")
        .not("user_id", "is", null)
        .not("actual_arrival", "is", null).not("actual_departure", "is", null)
        .gte("actual_arrival", from.toISOString()).lte("actual_arrival", to.toISOString());
      if (!isAdmin) staffQ = staffQ.eq("user_id", currentUserId);
      else if (selectedUser.startsWith("helper:")) staffQ = staffQ.eq("user_id", "00000000-0000-0000-0000-000000000000");
      else if (selectedUser !== "all") staffQ = staffQ.eq("user_id", selectedUser);
      const { data: staffData } = await staffQ;
      const staff = (staffData ?? []) as StaffRow[];
      return { rows, breaks, staff };
    },
  });

  const users = useMemo(() => {
    const src = profiles.data ?? [];
    const helpers = helpersQ.data ?? [];
    if (!isAdmin) {
      return src.filter((p) => p.id === currentUserId)
        .map((p) => ({ id: p.id, name: p.full_name || p.email || "—", isHelper: false }));
    }
    if (selectedUser === "all") {
      const helperIdsWithHours = new Set(
        (list.data?.rows ?? []).filter((r) => r.helper_id).map((r) => r.helper_id as string),
      );
      return [
        ...src.map((p) => ({ id: p.id, name: p.full_name || p.email || "—", isHelper: false })),
        ...helpers
          .filter((h) => helperIdsWithHours.has(h.id))
          .map((h) => ({ id: h.id, name: `${h.name} (helper)`, isHelper: true })),
      ];
    }
    if (selectedUser.startsWith("helper:")) {
      const hid = selectedUser.slice(7);
      return helpers.filter((h) => h.id === hid).map((h) => ({ id: h.id, name: `${h.name} (helper)`, isHelper: true }));
    }
    return src.filter((p) => p.id === selectedUser)
      .map((p) => ({ id: p.id, name: p.full_name || p.email || "—", isHelper: false }));
  }, [profiles.data, helpersQ.data, list.data, isAdmin, selectedUser, currentUserId]);

  const summary = useMemo(() => {
    if (!list.data) return [];
    return computeSummary(users, list.data.rows, list.data.breaks, list.data.staff, from, to)
      .sort((a, b) => b.totalMin - a.totalMin);
  }, [list.data, users, from, to]);

  const totals = useMemo(() => {
    return summary.reduce((acc, r) => ({ manual: acc.manual + r.manualMin, event: acc.event + r.eventMin, total: acc.total + r.totalMin }), { manual: 0, event: 0, total: 0 });
  }, [summary]);

  const exportCsv = () => {
    const lines = ["Zamestnanec;Dni;Bezna dochadzka;Na akciach;Spolu"];
    for (const r of summary) lines.push(`${r.name};${r.days};${fmtHM(r.manualMin)};${fmtHM(r.eventMin)};${fmtHM(r.totalMin)}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dochadzka_${format(from, "yyyy-MM-dd")}_${format(to, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Súhrn odpracovaných hodín</CardTitle>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-4 mr-1" />Export CSV</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Obdobie</Label>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Tento týždeň</SelectItem>
                <SelectItem value="month">Tento mesiac</SelectItem>
                <SelectItem value="custom">Vlastný rozsah</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <>
              <div>
                <Label className="text-xs">Od</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Do</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          {isAdmin && (
            <div>
              <Label className="text-xs">Zamestnanec</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Všetci</SelectItem>
                  {(profiles.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                  {(helpersQ.data ?? []).map((h) => (
                    <SelectItem key={`helper-${h.id}`} value={`helper:${h.id}`}>{h.name} (helper)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="text-xs text-muted-foreground ml-auto">
            {format(from, "d.M.yyyy", { locale: sk })} – {format(to, "d.M.yyyy", { locale: sk })}
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zamestnanec</TableHead>
                <TableHead className="text-right">Dni</TableHead>
                <TableHead className="text-right">Bežná dochádzka</TableHead>
                <TableHead className="text-right">Na akciách</TableHead>
                <TableHead className="text-right">Spolu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.days}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHM(r.manualMin)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHM(r.eventMin)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmtHM(r.totalMin)}</TableCell>
                </TableRow>
              ))}
              {summary.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Žiadne záznamy v tomto období.</TableCell></TableRow>
              )}
              {summary.length > 1 && (
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Súčet</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">{fmtHM(totals.manual)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtHM(totals.event)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmtHM(totals.total)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Hodiny „na akciách“ pochádzajú z reálnej dochádzky pri rezerváciách (Personál). Ak sa čas prekrýva s bežnou dochádzkou, do stĺpca „Spolu“ sa započíta iba raz (zjednotenie intervalov).
        </p>
      </CardContent>
    </Card>
  );
}

function DailyLog({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  void isAdmin;
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const from = startOfDay(new Date(date));
  const to = endOfDay(new Date(date));

  const rows = useQuery({
    queryKey: ["attendance-day", userId, date],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("attendance").select("*")
        .eq("user_id", userId)
        .gte("clock_in", from.toISOString()).lte("clock_in", to.toISOString())
        .order("clock_in");
      return (data ?? []) as Attendance[];
    },
  });

  const saveTime = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "clock_in" | "clock_out"; value: string }) => {
      const iso = value ? new Date(value).toISOString() : null;
      const { error } = await (supabase.from as any)("attendance").update({ [field]: iso }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-day"] }); qc.invalidateQueries({ queryKey: ["attendance-list"] }); qc.invalidateQueries({ queryKey: ["attendance-open"] }); toast.success("Uložené"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Denný záznam</CardTitle>
        <Input type="date" className="w-[180px]" value={date} onChange={(e) => setDate(e.target.value)} />
      </CardHeader>
      <CardContent className="space-y-2">
        {(rows.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Žiadne záznamy v tento deň.</p>}
        {(rows.data ?? []).map((r) => {
          const worked = r.clock_out ? differenceInMinutes(new Date(r.clock_out), new Date(r.clock_in)) : null;
          return (
            <div key={r.id} className="rounded-md border p-3 grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Príchod</Label>
                <Input type="datetime-local" defaultValue={toLocal(r.clock_in)}
                  onBlur={(e) => e.target.value && saveTime.mutate({ id: r.id, field: "clock_in", value: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Odchod</Label>
                <Input type="datetime-local" defaultValue={toLocal(r.clock_out)}
                  onBlur={(e) => saveTime.mutate({ id: r.id, field: "clock_out", value: e.target.value })} />
              </div>
              <div className="text-xs flex flex-col justify-center">
                <div className="text-muted-foreground uppercase tracking-wider">Odpracované (hrubé)</div>
                <div className="font-mono">{worked != null ? fmtHM(worked) : "otvorené"}</div>
                {r.source === "event" && <Badge variant="outline" className="mt-1 w-fit">akcia</Badge>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AttendancePage() {
  const { data: user } = useCurrentUser();
  const isAdmin = hasRole(user, "admin", "manager");

  if (!user) return <div className="p-6">Načítavam…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dochádzka</h1>
        <p className="text-sm text-muted-foreground">Pichnite si príchod, prestávky a odchod. Hodiny na akciách sa započítajú automaticky.</p>
      </div>

      <Tabs defaultValue="clock">
        <TabsList>
          <TabsTrigger value="clock">Dochádzka</TabsTrigger>
          <TabsTrigger value="summary">Súhrn</TabsTrigger>
          <TabsTrigger value="daily">Denný záznam</TabsTrigger>
        </TabsList>
        <TabsContent value="clock" className="mt-4">
          <div className="max-w-md mx-auto"><ClockPanel userId={user.id} /></div>
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <SummarySection isAdmin={isAdmin} currentUserId={user.id} />
        </TabsContent>
        <TabsContent value="daily" className="mt-4">
          <DailyLog userId={user.id} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// silence unused imports (dead-code) — addDays reserved for future
void addDays;