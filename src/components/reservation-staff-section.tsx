import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Plus, Trash2, Pencil, Clock, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { format } from "date-fns";
import { sk } from "date-fns/locale";

type StaffRow = {
  id: string;
  reservation_id: string;
  user_id: string | null;
  external_name: string | null;
  role: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  arrived: boolean;
  departed: boolean;
  note: string | null;
};

type StaffWithProfile = StaffRow & {
  profile: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
};

type FormState = {
  source: "crm" | "external";
  user_id: string;
  external_name: string;
  role: string;
  planned_start: string;
  planned_end: string;
  note: string;
};

const emptyForm: FormState = {
  source: "crm",
  user_id: "",
  external_name: "",
  role: "",
  planned_start: "",
  planned_end: "",
  note: "",
};

function toLocalInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function displayName(row: StaffWithProfile): string {
  if (row.user_id) return row.profile?.full_name || row.profile?.email || "—";
  return row.external_name || "—";
}

function StatusBadge({ row }: { row: StaffWithProfile }) {
  if (row.departed) {
    return <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">Odišiel</Badge>;
  }
  if (row.arrived) {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Prítomný</Badge>;
  }
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Čaká sa</Badge>;
}

export function ReservationStaffSection({ reservationId }: { reservationId: string }) {
  const qc = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const canManage = hasRole(currentUser, "admin", "manager");

  const staff = useQuery({
    queryKey: ["reservation-staff", reservationId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("reservation_staff")
        .select("*")
        .eq("reservation_id", reservationId)
        .order("planned_start", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as StaffRow[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      const profileMap = new Map<string, { id: string; full_name: string | null; email: string | null; phone: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email, phone").in("id", ids);
        for (const p of (profs ?? []) as any[]) profileMap.set(p.id, p);
      }
      return rows.map((r) => ({ ...r, profile: r.user_id ? profileMap.get(r.user_id) ?? null : null })) as StaffWithProfile[];
    },
  });

  const profiles = useQuery({
    queryKey: ["profiles-min"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: StaffWithProfile) => {
    setEditingId(row.id);
    setForm({
      source: row.user_id ? "crm" : "external",
      user_id: row.user_id ?? "",
      external_name: row.external_name ?? "",
      role: row.role ?? "",
      planned_start: toLocalInput(row.planned_start),
      planned_end: toLocalInput(row.planned_end),
      note: row.note ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        reservation_id: reservationId,
        user_id: form.source === "crm" ? (form.user_id || null) : null,
        external_name: form.source === "external" ? form.external_name.trim() : null,
        role: form.role.trim() || null,
        planned_start: toIso(form.planned_start),
        planned_end: toIso(form.planned_end),
        note: form.note.trim() || null,
      };
      if (form.source === "crm" && !payload.user_id) throw new Error("Vyberte používateľa z CRM.");
      if (form.source === "external" && !payload.external_name) throw new Error("Zadajte meno externého pracovníka.");
      if (editingId) {
        const { error } = await (supabase.from as any)("reservation_staff").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        payload.created_by = currentUser?.id ?? null;
        const { error } = await (supabase.from as any)("reservation_staff").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservation-staff", reservationId] });
      qc.invalidateQueries({ queryKey: ["logistics-staff-day"] });
      toast.success(editingId ? "Personál upravený" : "Personál pridaný");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Nepodarilo sa uložiť"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("reservation_staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservation-staff", reservationId] });
      qc.invalidateQueries({ queryKey: ["logistics-staff-day"] });
      toast.success("Odstránené");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleArrival = useMutation({
    mutationFn: async ({ row, arrived }: { row: StaffWithProfile; arrived: boolean }) => {
      const patch: any = { arrived };
      if (arrived && !row.actual_arrival) patch.actual_arrival = new Date().toISOString();
      if (!arrived) patch.actual_arrival = null;
      const { error } = await (supabase.from as any)("reservation_staff").update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservation-staff", reservationId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const toggleDeparture = useMutation({
    mutationFn: async ({ row, departed }: { row: StaffWithProfile; departed: boolean }) => {
      const patch: any = { departed };
      if (departed && !row.actual_departure) patch.actual_departure = new Date().toISOString();
      if (!departed) patch.actual_departure = null;
      if (departed && !row.arrived) { patch.arrived = true; if (!row.actual_arrival) patch.actual_arrival = new Date().toISOString(); }
      const { error } = await (supabase.from as any)("reservation_staff").update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservation-staff", reservationId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateTime = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "actual_arrival" | "actual_departure"; value: string }) => {
      const iso = toIso(value);
      const { error } = await (supabase.from as any)("reservation_staff").update({ [field]: iso }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservation-staff", reservationId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const summary = useMemo(() => {
    const list = staff.data ?? [];
    const present = list.filter((r) => r.arrived && !r.departed).length;
    const done = list.filter((r) => r.departed).length;
    const waiting = list.filter((r) => !r.arrived).length;
    return { total: list.length, present, done, waiting };
  }, [staff.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="size-4" />
          Personál / Ľudia na akcii
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-3">
            <span>Naplánovaných: <b className="text-foreground">{summary.total}</b></span>
            <span className="text-emerald-700">Prítomných: <b>{summary.present}</b></span>
            <span>Čaká: <b className="text-foreground">{summary.waiting}</b></span>
            {summary.done > 0 && <span className="text-slate-600">Odišli: <b>{summary.done}</b></span>}
          </div>
          {canManage && (
            <Button size="sm" onClick={openCreate}><Plus className="size-4 mr-1" />Pridať</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {staff.isLoading && <p className="text-sm text-muted-foreground">Načítavam…</p>}
        {!staff.isLoading && (staff.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            Zatiaľ žiadny personál.{canManage ? " Pridajte prvého človeka tlačidlom vyššie." : ""}
          </p>
        )}
        {(staff.data ?? []).map((row) => {
          const rowClass = row.departed
            ? "border-slate-200 bg-slate-50"
            : row.arrived
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-amber-200 bg-amber-50/40";
          return (
            <div key={row.id} className={`rounded-md border p-3 ${rowClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{displayName(row)}</span>
                    {row.user_id ? <Badge variant="secondary" className="text-[10px]">CRM</Badge> : <Badge variant="outline" className="text-[10px]">Externý</Badge>}
                    {row.role && <Badge variant="outline">{row.role}</Badge>}
                    <StatusBadge row={row} />
                  </div>
                  {row.profile && (row.profile.phone || row.profile.email) && (
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                      {row.profile.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{row.profile.phone}</span>}
                      {row.profile.email && <span className="inline-flex items-center gap-1"><Mail className="size-3" />{row.profile.email}</span>}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)} aria-label="Upraviť"><Pencil className="size-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Odstrániť"><Trash2 className="size-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Odstrániť {displayName(row)}?</AlertDialogTitle>
                          <AlertDialogDescription>Záznam personálu bude natrvalo odstránený.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Zrušiť</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(row.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Odstrániť</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="text-xs">
                  <div className="text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="size-3" />Plánovaný čas</div>
                  <div className="font-mono">
                    {row.planned_start ? format(new Date(row.planned_start), "d.M. HH:mm", { locale: sk }) : "—"}
                    {" – "}
                    {row.planned_end ? format(new Date(row.planned_end), "d.M. HH:mm", { locale: sk }) : "—"}
                  </div>
                </div>
                <div className="text-xs">
                  <div className="text-muted-foreground uppercase tracking-wider mb-1">Reálna dochádzka</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5">
                      <Checkbox
                        checked={row.arrived}
                        disabled={!canManage || toggleArrival.isPending}
                        onCheckedChange={(v) => toggleArrival.mutate({ row, arrived: !!v })}
                      />
                      <span>Prišiel</span>
                    </label>
                    <Input
                      type="datetime-local"
                      className="h-7 w-[180px] text-xs"
                      disabled={!canManage || !row.arrived}
                      value={toLocalInput(row.actual_arrival)}
                      onChange={(e) => updateTime.mutate({ id: row.id, field: "actual_arrival", value: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <label className="inline-flex items-center gap-1.5">
                      <Checkbox
                        checked={row.departed}
                        disabled={!canManage || toggleDeparture.isPending}
                        onCheckedChange={(v) => toggleDeparture.mutate({ row, departed: !!v })}
                      />
                      <span>Odišiel</span>
                    </label>
                    <Input
                      type="datetime-local"
                      className="h-7 w-[180px] text-xs"
                      disabled={!canManage || !row.departed}
                      value={toLocalInput(row.actual_departure)}
                      onChange={(e) => updateTime.mutate({ id: row.id, field: "actual_departure", value: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              {row.note && <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{row.note}</div>}
            </div>
          );
        })}
      </CardContent>

      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Upraviť personál" : "Pridať personál"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Zdroj</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crm">Z CRM (existujúci užívateľ)</SelectItem>
                    <SelectItem value="external">Externý (brigádnik / voľné meno)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.source === "crm" ? (
                <div>
                  <Label className="text-xs">Užívateľ</Label>
                  <Select value={form.user_id} onValueChange={(v) => setForm((f) => ({ ...f, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Vyberte užívateľa…" /></SelectTrigger>
                    <SelectContent>
                      {(profiles.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Meno</Label>
                  <Input value={form.external_name} onChange={(e) => setForm((f) => ({ ...f, external_name: e.target.value }))} placeholder="Meno a priezvisko" />
                </div>
              )}
              <div>
                <Label className="text-xs">Rola / pozícia</Label>
                <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="napr. vodič, montáž, obsluha" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Plánovaný začiatok</Label>
                  <Input type="datetime-local" value={form.planned_start} onChange={(e) => setForm((f) => ({ ...f, planned_start: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Plánovaný koniec</Label>
                  <Input type="datetime-local" value={form.planned_end} onChange={(e) => setForm((f) => ({ ...f, planned_end: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Poznámka</Label>
                <Textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Zrušiť</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{editingId ? "Uložiť" : "Pridať"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}