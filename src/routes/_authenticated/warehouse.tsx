import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Pencil, ImageIcon, Power, Eye, Upload, Loader2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { DamageReportDialog } from "@/components/damage-report-dialog";

export const Route = createFileRoute("/_authenticated/warehouse")({
  head: () => ({ meta: [{ title: "Sklad · Mima Production CRM" }] }),
  component: Warehouse,
});

const PHOTO_BUCKET = "furniture-photos";

interface FurnitureRow {
  id: string;
  name: string;
  category_id: string;
  internal_code: string;
  dimensions: string | null;
  color: string | null;
  note: string | null;
  photo_url: string | null;
  total_qty: number;
  damaged_qty: number;
  retired_qty: number;
  active: boolean;
  price_per_day: number | null;
  price_fixed: number | null;
  furniture_categories: { name: string; code: string } | null;
}

const CATEGORY_STYLES: Record<string, string> = {
  tables: "bg-amber-100 text-amber-900 border-amber-200",
  chairs: "bg-sky-100 text-sky-900 border-sky-200",
  lounge: "bg-violet-100 text-violet-900 border-violet-200",
  bars: "bg-rose-100 text-rose-900 border-rose-200",
  decor: "bg-pink-100 text-pink-900 border-pink-200",
  lighting: "bg-yellow-100 text-yellow-900 border-yellow-200",
  accessories: "bg-emerald-100 text-emerald-900 border-emerald-200",
  other: "bg-slate-100 text-slate-900 border-slate-200",
};

function categoryClass(code?: string | null) {
  return CATEGORY_STYLES[code ?? "other"] ?? CATEGORY_STYLES.other;
}

function FurniturePhoto({ value, alt, className }: { value: string | null; alt: string; className?: string }) {
  const isHttp = value?.startsWith("http");
  const { data: signed } = useQuery({
    queryKey: ["furniture-photo", value],
    enabled: !!value && !isHttp,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(value!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const src = isHttp ? value : signed;
  if (!src) {
    return (
      <div className={`grid place-items-center bg-muted ${className ?? ""}`}>
        <ImageIcon className="size-10 text-muted-foreground/50" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={`object-cover ${className ?? ""}`} />;
}

function Warehouse() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "warehouse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<FurnitureRow | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FurnitureRow | null>(null);
  const [damageFor, setDamageFor] = useState<FurnitureRow | null>(null);

  const categories = useQuery({
    queryKey: ["furniture_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("furniture_categories").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["furniture_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("furniture_items").select("*, furniture_categories(name, code)").order("name");
      if (error) throw error;
      return data as unknown as FurnitureRow[];
    },
  });

  const reservedNow = useQuery({
    queryKey: ["furniture_reserved_now"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("reservation_items")
        .select("furniture_item_id, qty, reservations!inner(status, load_at, available_from_at)")
        .lte("reservations.load_at", now)
        .gt("reservations.available_from_at", now)
        .neq("reservations.status", "cancelled");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        map[r.furniture_item_id] = (map[r.furniture_item_id] ?? 0) + (r.qty ?? 0);
      }
      return map;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (row: FurnitureRow) => {
      const { error } = await supabase.from("furniture_items").update({ active: !row.active }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      toast.success("Stav aktualizovaný");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return (items.data ?? []).filter((i) => {
      if (!showInactive && !i.active) return false;
      if (category !== "all" && i.category_id !== category) return false;
      if (search) {
        const q = search.toLowerCase();
        return i.name.toLowerCase().includes(q) || i.internal_code.toLowerCase().includes(q) || (i.color ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [items.data, search, category, showInactive]);

  return (
    <>
      <AppHeader title="Sklad" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sklad nábytku</h2>
            <p className="text-sm text-muted-foreground">Evidencia všetkého eventového nábytku.</p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="size-4 mr-1" />Pridať položku</Button>
              </DialogTrigger>
              <FurnitureDialog
                key={editing?.id ?? "new"}
                item={editing}
                categories={categories.data ?? []}
                onClose={() => { setOpen(false); setEditing(null); }}
              />
            </Dialog>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Hľadať podľa názvu, kódu, farby…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Kategória" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetky kategórie</SelectItem>
              {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={showInactive ? "default" : "outline"} onClick={() => setShowInactive((s) => !s)}>
            {showInactive ? "Skryť neaktívne" : "Zobraziť neaktívne"}
          </Button>
        </div>

        {items.isLoading && <p className="text-sm text-muted-foreground">Načítavam…</p>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((i) => {
            const reserved = reservedNow.data?.[i.id] ?? 0;
            const available = i.total_qty - i.damaged_qty - i.retired_qty - reserved;
            return (
              <Card key={i.id} className={`overflow-hidden flex flex-col py-0 gap-0 ${!i.active ? "opacity-60" : ""}`}>
                <div className="relative h-48 bg-muted overflow-hidden shrink-0">
                  <FurniturePhoto value={i.photo_url} alt={i.name} className="w-full h-full" />
                  <Badge className={`absolute top-2 left-2 border ${categoryClass(i.furniture_categories?.code)}`}>
                    {i.furniture_categories?.name ?? "—"}
                  </Badge>
                  {!i.active && (
                    <Badge variant="secondary" className="absolute top-2 right-2">Neaktívne</Badge>
                  )}
                </div>
                <CardContent className="p-4 flex-1 flex flex-col gap-3">
                  <div>
                    <div className="font-semibold leading-tight truncate">{i.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {i.internal_code}
                      {i.dimensions && <span> · {i.dimensions}</span>}
                      {i.color && <span> · {i.color}</span>}
                    </div>
                  </div>
                  {i.note && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{i.note}</p>
                  )}
                  {(i.price_per_day != null || i.price_fixed != null) && (
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {i.price_per_day != null && <span>Cena/deň: <strong className="text-foreground">{Number(i.price_per_day).toFixed(2)} €</strong></span>}
                      {i.price_fixed != null && <span>Fixná: <strong className="text-foreground">{Number(i.price_fixed).toFixed(2)} €</strong></span>}
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-1 text-center mt-auto">
                    <div className="rounded-md bg-muted/60 px-1 py-1.5">
                      <div className="text-[10px] text-muted-foreground">Celkom</div>
                      <div className="font-semibold text-sm">{i.total_qty}</div>
                    </div>
                    <div className="rounded-md bg-emerald-100 px-1 py-1.5">
                      <div className="text-[10px] text-emerald-900/70">Voľné</div>
                      <div className="font-semibold text-sm text-emerald-900">{available}</div>
                    </div>
                    <div className="rounded-md bg-rose-100 px-1 py-1.5">
                      <div className="text-[10px] text-rose-900/70">Poškod.</div>
                      <div className="font-semibold text-sm text-rose-900">{i.damaged_qty}</div>
                    </div>
                    <div className="rounded-md bg-slate-200 px-1 py-1.5">
                      <div className="text-[10px] text-slate-700">Vyrad.</div>
                      <div className="font-semibold text-sm text-slate-900">{i.retired_qty}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetail(i)}>
                      <Eye className="size-3.5 mr-1" />Detail
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" className="flex-1" onClick={() => { setEditing(i); setOpen(true); }}>
                          <Pencil className="size-3.5 mr-1" />Upraviť
                        </Button>
                        <Button size="sm" variant="ghost" aria-label="Nahlásiť poškodenie" onClick={() => setDamageFor(i)} title="Nahlásiť poškodenie">
                          <AlertTriangle className="size-3.5 text-rose-600" />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={i.active ? "Deaktivovať položku" : "Aktivovať položku"} onClick={() => toggleActive.mutate(i)} title={i.active ? "Deaktivovať" : "Aktivovať"}>
                          <Power className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!items.isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Žiadne položky nenájdené.</p>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && <DetailDialog item={detail} onReportDamage={() => { setDamageFor(detail); setDetail(null); }} canManage={canManage} />}
      </Dialog>

      <DamageReportDialog
        open={!!damageFor}
        onOpenChange={(o) => !o && setDamageFor(null)}
        item={damageFor ? { id: damageFor.id, name: damageFor.name, total_qty: damageFor.total_qty, damaged_qty: damageFor.damaged_qty, retired_qty: damageFor.retired_qty } : null}
        reservedNow={damageFor ? reservedNow.data?.[damageFor.id] ?? 0 : 0}
      />
    </>
  );
}

function DetailDialog({ item, onReportDamage, canManage }: { item: FurnitureRow; onReportDamage: () => void; canManage: boolean }) {
  const available = item.total_qty - item.damaged_qty - item.retired_qty;
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{item.name}</DialogTitle>
        <DialogDescription>{item.internal_code}</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
          <FurniturePhoto value={item.photo_url} alt={item.name} className="w-full h-full" />
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge className={`border ${categoryClass(item.furniture_categories?.code)}`}>
              {item.furniture_categories?.name}
            </Badge>
            {!item.active && <Badge variant="secondary">Neaktívne</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Info label="Rozmery" value={item.dimensions} />
            <Info label="Farba" value={item.color} />
          </div>
          <div className="grid grid-cols-4 gap-1 text-center">
            <Stat label="Celkom" value={item.total_qty} />
            <Stat label="Voľné" value={available} tone="emerald" />
            <Stat label="Poškod." value={item.damaged_qty} tone="rose" />
            <Stat label="Vyrad." value={item.retired_qty} tone="slate" />
          </div>
          {item.note && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Poznámka</div>
              <p className="text-sm whitespace-pre-wrap">{item.note}</p>
            </div>
          )}
          {canManage && (
            <Button variant="outline" className="w-full" onClick={onReportDamage}>
              <AlertTriangle className="size-4 mr-1 text-rose-600" />
              Nahlásiť poškodenie
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "rose" | "slate" }) {
  const cls =
    tone === "emerald" ? "bg-emerald-100 text-emerald-900" :
    tone === "rose" ? "bg-rose-100 text-rose-900" :
    tone === "slate" ? "bg-slate-200 text-slate-900" :
    "bg-muted/60";
  return (
    <div className={`rounded-md px-1 py-2 ${cls}`}>
      <div className="text-[10px] opacity-70">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function FurnitureDialog({ item, categories, onClose }: { item: FurnitureRow | null; categories: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category_id: item?.category_id ?? categories[0]?.id ?? "",
    internal_code: item?.internal_code ?? "",
    dimensions: item?.dimensions ?? "",
    color: item?.color ?? "",
    note: item?.note ?? "",
    photo_url: item?.photo_url ?? "",
    total_qty: item?.total_qty ?? 0,
    damaged_qty: item?.damaged_qty ?? 0,
    retired_qty: item?.retired_qty ?? 0,
    price_per_day: item?.price_per_day ?? ("" as number | ""),
    price_fixed: item?.price_fixed ?? ("" as number | ""),
  });

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Maximálna veľkosť fotky je 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      // Remove previous file if it was in storage
      if (form.photo_url && !form.photo_url.startsWith("http")) {
        await supabase.storage.from(PHOTO_BUCKET).remove([form.photo_url]).catch(() => {});
      }
      setForm((f) => ({ ...f, photo_url: path }));
      toast.success("Fotka nahraná");
    } catch (e: any) {
      toast.error(e.message ?? "Nahrávanie zlyhalo");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (form.photo_url && !form.photo_url.startsWith("http")) {
      await supabase.storage.from(PHOTO_BUCKET).remove([form.photo_url]).catch(() => {});
    }
    setForm((f) => ({ ...f, photo_url: "" }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, photo_url: form.photo_url || null };
      if (item) {
        const { error } = await supabase.from("furniture_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("furniture_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      toast.success(item ? "Položka upravená" : "Položka pridaná");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{item ? "Upraviť položku" : "Nová položka"}</DialogTitle>
        <DialogDescription>Vyplňte údaje o nábytku.</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Fotografia</Label>
          <div className="flex gap-3 items-start">
            <div className="size-28 rounded-md overflow-hidden bg-muted shrink-0 border">
              <FurniturePhoto value={form.photo_url || null} alt="Náhľad" className="w-full h-full" />
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Upload className="size-3.5 mr-1" />}
                  {form.photo_url ? "Nahrať inú" : "Nahrať fotku"}
                </Button>
                {form.photo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                    <X className="size-3.5 mr-1" />Odstrániť
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">JPG/PNG/WebP, max 5 MB.</p>
            </div>
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Názov</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Interný kód</Label>
          <Input value={form.internal_code} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Kategória</Label>
          <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rozmery</Label>
          <Input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="napr. 120×80×75 cm" />
        </div>
        <div className="space-y-1.5">
          <Label>Farba</Label>
          <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Celkový počet</Label>
          <Input type="number" min={0} value={form.total_qty} onChange={(e) => setForm({ ...form, total_qty: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Poškodené</Label>
          <Input type="number" min={0} value={form.damaged_qty} onChange={(e) => setForm({ ...form, damaged_qty: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Vyradené</Label>
          <Input type="number" min={0} value={form.retired_qty} onChange={(e) => setForm({ ...form, retired_qty: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Poznámka</Label>
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading || !form.name || !form.internal_code}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}
