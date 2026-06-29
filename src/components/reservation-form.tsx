import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { RESERVATION_STATUSES, STATUS_LABEL, type ReservationStatus } from "@/lib/reservation-status";

const EVENT_COLORS: { value: string; label: string }[] = [
  { value: "#3b82f6", label: "Modrá" },
  { value: "#10b981", label: "Zelená" },
  { value: "#f59e0b", label: "Oranžová" },
  { value: "#ef4444", label: "Červená" },
  { value: "#8b5cf6", label: "Fialová" },
  { value: "#ec4899", label: "Ružová" },
  { value: "#14b8a6", label: "Tyrkysová" },
  { value: "#64748b", label: "Sivá" },
];

interface ItemRow {
  furniture_item_id: string;
  qty: number;
  availability?: { total: number; available: number; reserved: number } | null;
  loading?: boolean;
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

function defaultStart(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function plusHours(localInput: string, hours: number) {
  if (!localInput) return "";
  const d = new Date(localInput);
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReservationForm({ existingId, initial, initialStart }: { existingId?: string; initial?: any; initialStart?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const seedLoad = toLocalInput(initial?.load_at ?? null) || defaultStart(initialStart);
  const seedEventStart = toLocalInput(initial?.event_start_at ?? null) || (seedLoad ? plusHours(seedLoad, 3) : "");
  const seedEventEnd = toLocalInput(initial?.event_end_at ?? null) || (seedEventStart ? plusHours(seedEventStart, 5) : "");
  const seedReturn = toLocalInput(initial?.return_at ?? null) || (seedEventEnd ? plusHours(seedEventEnd, 2) : "");
  const seedAvailable = toLocalInput(initial?.available_from_at ?? null) || (seedReturn ? plusHours(seedReturn, 1) : "");

  const [form, setForm] = useState({
    client_id: initial?.client_id ?? "",
    contact_id: initial?.contact_id ?? "",
    contact_person: initial?.contact_person ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    event_name: initial?.event_name ?? "",
    venue: initial?.venue ?? "",
    address: initial?.address ?? "",
    note: initial?.note ?? "",
    status: (initial?.status ?? "inquiry") as ReservationStatus,
    color: (initial?.color ?? "#3b82f6") as string,
    vehicle_id: initial?.vehicle_id ?? "",
    trip_count: initial?.trip_count ?? 1,
    load_at: seedLoad,
    depart_at: toLocalInput(initial?.depart_at ?? null),
    event_start_at: seedEventStart,
    event_end_at: seedEventEnd,
    return_at: seedReturn,
    available_from_at: seedAvailable,
  });
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({ company_name: "", contact_person: "", phone: "", email: "" });
  const [items, setItems] = useState<ItemRow[]>(
    initial?.reservation_items?.map((ri: any) => ({ furniture_item_id: ri.furniture_item_id, qty: ri.qty })) ?? [],
  );

  const clients = useQuery({ queryKey: ["clients-min"], queryFn: async () => (await supabase.from("clients").select("id,company_name,phone,email,contact_person").order("company_name")).data ?? [] });
  const contacts = useQuery({
    queryKey: ["client-contacts", form.client_id],
    enabled: !!form.client_id,
    queryFn: async () => (await supabase
      .from("client_contacts")
      .select("id, full_name, role, phone, email, is_primary")
      .eq("client_id", form.client_id)
      .order("is_primary", { ascending: false })
      .order("full_name")).data ?? [],
  });

  useEffect(() => {
    if (!contacts.data || form.contact_id) return;
    const primary = contacts.data.find((c: any) => c.is_primary) ?? contacts.data[0];
    if (primary) {
      setForm((f) => ({
        ...f,
        contact_id: primary.id,
        contact_person: f.contact_person || primary.full_name || "",
        phone: f.phone || primary.phone || "",
        email: f.email || primary.email || "",
      }));
    }
  }, [contacts.data, form.contact_id]);

  const furniture = useQuery({ queryKey: ["furniture-min"], queryFn: async () => (await supabase.from("furniture_items").select("id,name,internal_code,total_qty").eq("active", true).order("name")).data ?? [] });

  const vehicles = useQuery({
    queryKey: ["vehicles-min"],
    queryFn: async () => (await supabase.from("vehicles").select("id,name,license_plate,capacity_kg,status").order("name")).data ?? [],
  });

  // Refresh availability for all items when time window or items change
  useEffect(() => {
    if (!form.load_at || !form.available_from_at) return;
    const fromIso = fromLocalInput(form.load_at);
    const toIso = fromLocalInput(form.available_from_at);
    items.forEach(async (row, idx) => {
      if (!row.furniture_item_id) return;
      setItems((prev) => prev.map((p, i) => i === idx ? { ...p, loading: true } : p));
      const { data, error } = await supabase.rpc("check_item_availability", {
        _item_id: row.furniture_item_id,
        _from: fromIso!,
        _to: toIso!,
        _exclude_reservation: existingId ?? undefined,
      });
      if (!error && data && data[0]) {
        setItems((prev) => prev.map((p, i) => i === idx ? { ...p, loading: false, availability: { total: data[0].total, available: data[0].available, reserved: data[0].reserved } } : p));
      } else {
        setItems((prev) => prev.map((p, i) => i === idx ? { ...p, loading: false } : p));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.load_at, form.available_from_at, items.map((i) => i.furniture_item_id).join(",")]);

  const hasConflict = useMemo(() => items.some((i) => i.availability && (i.availability.available < i.qty)), [items]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: form.client_id || null,
        contact_id: form.contact_id || null,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        event_name: form.event_name,
        venue: form.venue || null,
        address: form.address || null,
        note: form.note || null,
        status: form.status,
        color: form.color || null,
        vehicle_id: form.vehicle_id || null,
        trip_count: Math.max(1, Number(form.trip_count) || 1),
        load_at: fromLocalInput(form.load_at),
        depart_at: fromLocalInput(form.depart_at),
        event_start_at: fromLocalInput(form.event_start_at),
        event_end_at: fromLocalInput(form.event_end_at),
        return_at: fromLocalInput(form.return_at),
        available_from_at: fromLocalInput(form.available_from_at),
      };

      let reservationId = existingId;
      if (existingId) {
        const { error } = await supabase.from("reservations").update(payload as any).eq("id", existingId);
        if (error) throw error;
        await supabase.from("reservation_items").delete().eq("reservation_id", existingId);
      } else {
        const { data, error } = await supabase.from("reservations").insert(payload as any).select("id").single();
        if (error) throw error;
        reservationId = data.id;
      }

      if (items.length > 0) {
        const { error: riError } = await supabase.from("reservation_items").insert(
          items.filter((i) => i.furniture_item_id && i.qty > 0).map((i) => ({
            reservation_id: reservationId!,
            furniture_item_id: i.furniture_item_id,
            qty: i.qty,
          })),
        );
        if (riError) throw riError;
      }
      return reservationId!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(existingId ? "Rezervácia uložená" : "Rezervácia vytvorená");
      navigate({ to: "/reservations/$id", params: { id } });
    },
    onError: (e: any) => {
      if (typeof e?.message === "string" && e.message.includes("INSUFFICIENT_STOCK")) {
        toast.error("Nie je dostupný dostatočný počet kusov v zvolenom čase.");
      } else {
        toast.error(e?.message ?? "Chyba pri ukladaní");
      }
    },
  });

  const setClient = (id: string) => {
    const c = clients.data?.find((x: any) => x.id === id);
    setForm((f) => ({
      ...f,
      client_id: id,
      contact_id: "",
      contact_person: f.contact_person || c?.contact_person || "",
      phone: f.phone || c?.phone || "",
      email: f.email || c?.email || "",
    }));
  };

  const pickContact = (cid: string) => {
    const c = contacts.data?.find((x: any) => x.id === cid);
    setForm((f) => ({
      ...f,
      contact_id: cid,
      contact_person: c?.full_name ?? f.contact_person,
      phone: c?.phone ?? f.phone,
      email: c?.email ?? f.email,
    }));
  };

  const createClient = useMutation({
    mutationFn: async () => {
      if (!newClient.company_name) throw new Error("Zadajte názov firmy");
      const { data, error } = await supabase.from("clients").insert(newClient).select("id,company_name,contact_person,phone,email").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c: any) => {
      qc.invalidateQueries({ queryKey: ["clients-min"] });
      setForm((f) => ({ ...f, client_id: c.id, contact_person: c.contact_person ?? f.contact_person, phone: c.phone ?? f.phone, email: c.email ?? f.email }));
      setNewClientOpen(false);
      setNewClient({ company_name: "", contact_person: "", phone: "", email: "" });
      toast.success("Klient vytvorený");
    },
    onError: (e: any) => toast.error(e?.message ?? "Chyba"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Klient a event</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2"><Label>Klient</Label>
            <div className="flex gap-2">
              <Select value={form.client_id} onValueChange={setClient}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Vyberte klienta" /></SelectTrigger>
                <SelectContent>
                  {clients.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => setNewClientOpen((v) => !v)}>
                <Plus className="size-3.5 mr-1" />Nový
              </Button>
            </div>
            {newClientOpen && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2 p-3 rounded-md border bg-muted/30">
                <Input placeholder="Názov firmy *" value={newClient.company_name} onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })} />
                <Input placeholder="Kontaktná osoba" value={newClient.contact_person} onChange={(e) => setNewClient({ ...newClient, contact_person: e.target.value })} />
                <Input placeholder="Telefón" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                <Input placeholder="Email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setNewClientOpen(false)}>Zrušiť</Button>
                  <Button type="button" size="sm" onClick={() => createClient.mutate()} disabled={createClient.isPending}>Vytvoriť klienta</Button>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5"><Label>Kontaktná osoba</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Kontakt klienta</Label>
            <Select
              value={form.contact_id || "__none"}
              onValueChange={(v) => v === "__none" ? setForm({ ...form, contact_id: "" }) : pickContact(v)}
              disabled={!form.client_id}
            >
              <SelectTrigger><SelectValue placeholder={form.client_id ? "—" : "Najprv vyberte klienta"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— bez kontaktu —</SelectItem>
                {(contacts.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}{c.role ? ` · ${c.role}` : ""}{c.is_primary ? " (primárny)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Telefón</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Stav</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ReservationStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESERVATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Farba eventu</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {EVENT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setForm({ ...form, color: c.value })}
                  title={c.label}
                  aria-label={c.label}
                  className={`size-7 rounded-full border-2 transition-all ${form.color === c.value ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>Názov eventu</Label><Input value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Miesto konania</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Adresa</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Poznámka</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Časový plán</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <TimeField label="Nakládka" value={form.load_at} onChange={(v) => setForm({ ...form, load_at: v })} />
          <TimeField label="Odchod na event" value={form.depart_at} onChange={(v) => setForm({ ...form, depart_at: v })} />
          <TimeField label="Začiatok eventu" value={form.event_start_at} onChange={(v) => setForm({ ...form, event_start_at: v })} />
          <TimeField label="Koniec eventu" value={form.event_end_at} onChange={(v) => setForm({ ...form, event_end_at: v })} />
          <TimeField label="Návrat nábytku" value={form.return_at} onChange={(v) => setForm({ ...form, return_at: v })} />
          <TimeField label="Opätovne dostupné od" value={form.available_from_at} onChange={(v) => setForm({ ...form, available_from_at: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Preprava</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Vozidlo</Label>
            <Select
              value={form.vehicle_id || "__none"}
              onValueChange={(v) => setForm({ ...form, vehicle_id: v === "__none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Vyberte vozidlo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— bez vozidla —</SelectItem>
                {(vehicles.data ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}{v.license_plate ? ` · ${v.license_plate}` : ""}{v.capacity_kg ? ` · ${v.capacity_kg} kg` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Spravujte vozový park v module Logistika.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Počet otočiek</Label>
            <Input
              type="number"
              min={1}
              value={form.trip_count}
              onChange={(e) => setForm({ ...form, trip_count: Math.max(1, Number(e.target.value) || 1) })}
            />
            <p className="text-xs text-muted-foreground">Koľkokrát sa vozidlo musí otočiť, aby previezlo všetok nábytok.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Položky nábytku</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, { furniture_item_id: "", qty: 1 }])}><Plus className="size-3.5 mr-1" />Pridať položku</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Žiadne položky.</p>}
          {items.map((row, idx) => {
            const conflict = row.availability && row.availability.available < row.qty;
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md border">
                <div className="col-span-12 md:col-span-5">
                  <Label className="text-xs">Nábytok</Label>
                  <Select value={row.furniture_item_id} onValueChange={(v) => setItems((p) => p.map((r, i) => i === idx ? { ...r, furniture_item_id: v, availability: null } : r))}>
                    <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                    <SelectContent>
                      {furniture.data?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name} ({f.internal_code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Label className="text-xs">Počet ks</Label>
                  <Input type="number" min={1} value={row.qty} onChange={(e) => setItems((p) => p.map((r, i) => i === idx ? { ...r, qty: Math.max(1, Number(e.target.value)) } : r))} />
                </div>
                <div className="col-span-7 md:col-span-4 text-xs">
                  {row.loading && <span className="text-muted-foreground">Kontrola…</span>}
                  {row.availability && (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">Celkom: {row.availability.total}</Badge>
                      <Badge variant="secondary">Rezervované: {row.availability.reserved}</Badge>
                      <Badge variant={conflict ? "destructive" : "default"}>Voľné: {row.availability.available}</Badge>
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <Button size="icon" variant="ghost" aria-label="Odstrániť položku" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            );
          })}
          {hasConflict && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 text-destructive p-3 text-sm">
              <AlertCircle className="size-4" />
              <span>Niektoré položky nemajú dostatočný počet kusov v zvolenom čase. Uloženie nebude možné.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/reservations" })}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.event_name || !form.load_at || !form.available_from_at || hasConflict}>
          {existingId ? "Uložiť zmeny" : "Vytvoriť rezerváciu"}
        </Button>
      </div>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}