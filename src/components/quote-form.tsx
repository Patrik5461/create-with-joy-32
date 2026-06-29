import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  type AdjustType, type PriceMode, type QuoteLine,
  computeTotals, formatEur, lineTotal,
} from "@/lib/quote-utils";

interface QuoteRecord {
  id?: string;
  client_id: string | null;
  contact_id: string | null;
  reservation_id: string | null;
  status: "draft" | "sent" | "approved" | "rejected";
  issue_date: string;
  valid_until: string | null;
  vat_rate: number;
  discount_type: AdjustType;
  discount_value: number;
  surcharge_type: AdjustType;
  surcharge_value: number;
  surcharge_label: string | null;
  notes: string | null;
}

interface Props {
  initial?: QuoteRecord & { items?: QuoteLine[] };
  quoteId?: string;
}

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function QuoteForm({ initial, quoteId }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<QuoteRecord>(initial ?? {
    client_id: null,
    contact_id: null,
    reservation_id: null,
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    valid_until: null,
    vat_rate: 23,
    discount_type: "none",
    discount_value: 0,
    surcharge_type: "none",
    surcharge_value: 0,
    surcharge_label: null,
    notes: null,
  });
  const [lines, setLines] = useState<QuoteLine[]>(initial?.items ?? []);

  const clients = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, company_name, ico, address").order("company_name");
      if (error) throw error;
      return data;
    },
  });

  const contacts = useQuery({
    queryKey: ["client-contacts", form.client_id],
    enabled: !!form.client_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, full_name, role, phone, email, is_primary")
        .eq("client_id", form.client_id!)
        .order("is_primary", { ascending: false })
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Po načítaní kontaktov nastav default na primárny, ak ešte nie je nič vybrané.
  useEffect(() => {
    if (!contacts.data || form.contact_id) return;
    const primary = contacts.data.find((c: any) => c.is_primary) ?? contacts.data[0];
    if (primary) setForm((f) => ({ ...f, contact_id: primary.id }));
  }, [contacts.data, form.contact_id]);

  const reservations = useQuery({
    queryKey: ["reservations-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("id, event_name, load_at, available_from_at, client_id").neq("status", "cancelled").order("load_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const furniture = useQuery({
    queryKey: ["furniture-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("furniture_items").select("id, name, internal_code, price_per_day, price_fixed").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => computeTotals({
    lines,
    discountType: form.discount_type,
    discountValue: Number(form.discount_value) || 0,
    surchargeType: form.surcharge_type,
    surchargeValue: Number(form.surcharge_value) || 0,
    vatRate: Number(form.vat_rate) || 0,
  }), [lines, form.discount_type, form.discount_value, form.surcharge_type, form.surcharge_value, form.vat_rate]);

  const prefillFromReservation = async (reservationId: string) => {
    const { data: r } = await supabase.from("reservations").select("client_id").eq("id", reservationId).maybeSingle();
    if (r?.client_id) setForm((f) => ({ ...f, client_id: r.client_id }));
    const { data: ri } = await supabase
      .from("reservation_items")
      .select("qty, furniture_item_id, furniture_items(name, price_per_day, price_fixed)")
      .eq("reservation_id", reservationId);
    const newLines: QuoteLine[] = (ri ?? []).map((row: any) => {
      const f = row.furniture_items;
      const useDay = f?.price_per_day != null;
      return {
        id: uid(),
        kind: "furniture",
        furniture_item_id: row.furniture_item_id,
        name: f?.name ?? "",
        qty: row.qty,
        price_mode: useDay ? "per_day" : "fixed",
        unit_price: Number(useDay ? f?.price_per_day : f?.price_fixed) || 0,
        days: 1,
      };
    });
    setLines(newLines);
    toast.success("Položky a klient predvyplnené z rezervácie.");
  };

  const addFurnitureRow = () => {
    const f = furniture.data?.[0];
    setLines((ls) => [...ls, {
      id: uid(),
      kind: "furniture",
      furniture_item_id: f?.id ?? null,
      name: f?.name ?? "",
      qty: 1,
      price_mode: f?.price_per_day != null ? "per_day" : "fixed",
      unit_price: Number(f?.price_per_day ?? f?.price_fixed) || 0,
      days: 1,
    }]);
  };
  const addServiceRow = () => {
    setLines((ls) => [...ls, {
      id: uid(),
      kind: "service",
      furniture_item_id: null,
      name: "",
      qty: 1,
      price_mode: "service",
      unit_price: 0,
      days: 1,
    }]);
  };

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    setLines((ls) => ls.map((l) => l.id === id ? { ...l, ...patch } : l));
  };
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));

  const onPickFurniture = (lineId: string, furnitureId: string) => {
    const f = furniture.data?.find((x: any) => x.id === furnitureId);
    if (!f) return;
    const useDay = (f as any).price_per_day != null;
    updateLine(lineId, {
      furniture_item_id: furnitureId,
      name: f.name,
      price_mode: useDay ? "per_day" : "fixed",
      unit_price: Number(useDay ? (f as any).price_per_day : (f as any).price_fixed) || 0,
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.client_id) throw new Error("Vyberte klienta.");
      if (lines.length === 0) throw new Error("Pridajte aspoň jednu položku.");
      const payload = {
        client_id: form.client_id,
        contact_id: form.contact_id,
        reservation_id: form.reservation_id,
        status: form.status,
        issue_date: form.issue_date,
        valid_until: form.valid_until,
        vat_rate: form.vat_rate,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        surcharge_type: form.surcharge_type,
        surcharge_value: form.surcharge_value,
        surcharge_label: form.surcharge_label,
        notes: form.notes,
        subtotal: totals.subtotal,
        total_without_vat: totals.totalWithoutVat,
        vat_amount: totals.vatAmount,
        total_with_vat: totals.totalWithVat,
      };
      let id = quoteId;
      if (id) {
        const { error } = await supabase.from("quotes").update(payload).eq("id", id);
        if (error) throw error;
        await supabase.from("quote_items").delete().eq("quote_id", id);
      } else {
        const { data, error } = await supabase.from("quotes").insert({ ...payload, quote_number: "" }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const rows = lines.map((l, idx) => ({
        quote_id: id!,
        kind: l.kind,
        furniture_item_id: l.kind === "furniture" ? l.furniture_item_id : null,
        name: l.name,
        qty: l.qty,
        price_mode: l.price_mode,
        unit_price: l.unit_price,
        days: l.price_mode === "per_day" ? Math.max(1, l.days) : 1,
        line_total: lineTotal(l),
        sort_order: idx,
      }));
      if (rows.length) {
        const { error } = await supabase.from("quote_items").insert(rows);
        if (error) throw error;
      }
      return id!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", id] });
      toast.success("Kalkulácia uložená");
      navigate({ to: "/quotes/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Uloženie zlyhalo"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Klient a rezervácia</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Klient *</Label>
            <Select value={form.client_id ?? ""} onValueChange={(v) => setForm({ ...form, client_id: v, contact_id: null })}>
              <SelectTrigger><SelectValue placeholder="Vyberte klienta" /></SelectTrigger>
              <SelectContent>
                {clients.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kontaktná osoba</Label>
            <Select
              value={form.contact_id ?? "__none"}
              onValueChange={(v) => setForm({ ...form, contact_id: v === "__none" ? null : v })}
              disabled={!form.client_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={form.client_id ? "—" : "Najprv vyberte klienta"} />
              </SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>Prepojená rezervácia (voliteľné)</Label>
            <Select
              value={form.reservation_id ?? "__none"}
              onValueChange={(v) => {
                const val = v === "__none" ? null : v;
                setForm((f) => ({ ...f, reservation_id: val }));
                if (val) prefillFromReservation(val);
              }}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— bez rezervácie —</SelectItem>
                {reservations.data?.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.event_name} ({new Date(r.load_at).toLocaleDateString("sk-SK")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dátum vystavenia</Label>
            <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Platnosť do</Label>
            <Input type="date" value={form.valid_until ?? ""} onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label>Stav</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Návrh</SelectItem>
                <SelectItem value="sent">Odoslaná</SelectItem>
                <SelectItem value="approved">Schválená</SelectItem>
                <SelectItem value="rejected">Zamietnutá</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sadzba DPH (%)</Label>
            <Input type="number" step="0.01" min={0} value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Položky</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addFurnitureRow}><Plus className="size-3.5 mr-1" />Nábytok</Button>
            <Button size="sm" variant="outline" onClick={addServiceRow}><Plus className="size-3.5 mr-1" />Služba</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {lines.length === 0 && <p className="text-sm text-muted-foreground">Pridajte položky nábytku alebo služby.</p>}
          {lines.map((l) => (
            <div key={l.id} className="rounded-md border p-3 grid gap-2 md:grid-cols-12 items-end">
              {l.kind === "furniture" ? (
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-xs">Nábytok</Label>
                  <Select value={l.furniture_item_id ?? ""} onValueChange={(v) => onPickFurniture(l.id, v)}>
                    <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                    <SelectContent>
                      {furniture.data?.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name} ({f.internal_code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-xs">Názov služby</Label>
                  <Input value={l.name} onChange={(e) => updateLine(l.id, { name: e.target.value })} placeholder="napr. Doprava" />
                </div>
              )}
              <div className="md:col-span-1 space-y-1">
                <Label className="text-xs">Ks</Label>
                <Input type="number" min={0} step="1" value={l.qty} onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })} />
              </div>
              {l.kind === "furniture" && (
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Typ ceny</Label>
                  <Select value={l.price_mode} onValueChange={(v) => updateLine(l.id, { price_mode: v as PriceMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_day">Denná</SelectItem>
                      <SelectItem value="fixed">Fixná</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {l.price_mode === "per_day" ? (
                <div className="md:col-span-1 space-y-1">
                  <Label className="text-xs">Dní</Label>
                  <Input type="number" min={1} value={l.days} onChange={(e) => updateLine(l.id, { days: Number(e.target.value) })} />
                </div>
              ) : <div className="md:col-span-1 hidden md:block" />}
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Cena/ks (€)</Label>
                <Input type="number" step="0.01" min={0} value={l.unit_price} onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value) })} />
              </div>
              <div className="md:col-span-1 text-right text-sm font-medium pb-2">
                {formatEur(lineTotal(l))}
              </div>
              <div className="md:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" aria-label="Odstrániť položku" onClick={() => removeLine(l.id)}>
                  <Trash2 className="size-4 text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Zľava a príplatok</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Zľava (len na nábytok)</Label>
              {form.discount_type !== "none" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-rose-600 hover:text-rose-700"
                  onClick={() => setForm({ ...form, discount_type: "none", discount_value: 0 })}
                >
                  <Trash2 className="size-3.5 mr-1" />Odstrániť zľavu
                </Button>
              )}
            </div>
            {form.discount_type === "none" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, discount_type: "percent", discount_value: 0 })}
              >
                <Plus className="size-3.5 mr-1" />Pridať zľavu
              </Button>
            ) : (
              <div className="flex gap-2">
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as AdjustType })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentuálne (%)</SelectItem>
                    <SelectItem value="fixed">Fixná suma (€)</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" min={0} value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Zľava sa uplatní iba na položky typu nábytok, nie na služby ani dopravu.</p>
          </div>
          <div className="space-y-2">
            <Label>Príplatok</Label>
            <div className="flex gap-2">
              <Select value={form.surcharge_type} onValueChange={(v) => setForm({ ...form, surcharge_type: v as AdjustType })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez príplatku</SelectItem>
                  <SelectItem value="percent">Percentuálne (%)</SelectItem>
                  <SelectItem value="fixed">Fixná suma (€)</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" step="0.01" min={0} value={form.surcharge_value} disabled={form.surcharge_type === "none"} onChange={(e) => setForm({ ...form, surcharge_value: Number(e.target.value) })} />
            </div>
            <Input placeholder="Popis príplatku (napr. víkendový)" value={form.surcharge_label ?? ""} onChange={(e) => setForm({ ...form, surcharge_label: e.target.value || null })} disabled={form.surcharge_type === "none"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Súčty</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="Medzisúčet – nábytok" value={formatEur(totals.furnitureSubtotal)} />
          {totals.discount > 0 && <Row label="Zľava (len nábytok)" value={`− ${formatEur(totals.discount)}`} tone="emerald" />}
          {totals.servicesSubtotal > 0 && <Row label="Medzisúčet – služby / doprava" value={formatEur(totals.servicesSubtotal)} />}
          {totals.surcharge > 0 && <Row label={form.surcharge_label || "Príplatok"} value={`+ ${formatEur(totals.surcharge)}`} />}
          <Row label="Spolu bez DPH" value={formatEur(totals.totalWithoutVat)} bold />
          <Row label={`DPH ${form.vat_rate}%`} value={formatEur(totals.vatAmount)} />
          <div className="border-t pt-2 mt-2">
            <Row label="Spolu s DPH" value={formatEur(totals.totalWithVat)} bold big />
          </div>
          <p className="text-xs text-muted-foreground pt-1">Zľava sa vzťahuje výhradne na položky typu nábytok; služby a doprava sa nezľavňujú.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Poznámka</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} placeholder="Interná alebo verejná poznámka ku kalkulácii" />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/quotes" })}>Späť</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
          {quoteId ? "Uložiť zmeny" : "Vytvoriť kalkuláciu"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, tone, bold, big }: { label: string; value: string; tone?: "emerald"; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "text-lg" : ""}`}>
      <span className={`${tone === "emerald" ? "text-emerald-700" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${tone === "emerald" ? "text-emerald-700" : ""}`}>{value}</span>
    </div>
  );
}