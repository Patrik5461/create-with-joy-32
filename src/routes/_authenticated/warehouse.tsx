import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, ImageIcon, Power, Eye, Upload, Loader2, X, AlertTriangle, Trash2, Database, Download, RefreshCw, QrCode, ScanLine, Printer } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { DamageReportDialog } from "@/components/damage-report-dialog";
import { QRCode, buildFurnitureScanUrl } from "@/components/qr-code";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";

export const Route = createFileRoute("/_authenticated/warehouse")({
  head: () => ({ meta: [{ title: "Sklad · Mima Production CRM" }] }),
  component: WarehouseRouteShell,
});

function WarehouseRouteShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/warehouse" && pathname !== "/warehouse/") return <Outlet />;
  return <Warehouse />;
}

const PHOTO_BUCKET = "furniture-photos";
const BACKUP_BUCKET = "warehouse-backups";

function BackupsButton() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["warehouse-backups"],
    enabled: open,
    queryFn: async () => {
      const all: { name: string; path: string; created_at?: string; size?: number }[] = [];
      // List by year folders
      const { data: years } = await supabase.storage.from(BACKUP_BUCKET).list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
      for (const y of years ?? []) {
        if (!/^\d{4}$/.test(y.name)) continue;
        const { data: months } = await supabase.storage.from(BACKUP_BUCKET).list(y.name, { limit: 100, sortBy: { column: "name", order: "desc" } });
        for (const m of months ?? []) {
          if (!/^\d{2}$/.test(m.name)) continue;
          const { data: files } = await supabase.storage.from(BACKUP_BUCKET).list(`${y.name}/${m.name}`, { limit: 1000, sortBy: { column: "name", order: "desc" } });
          for (const f of files ?? []) {
            if (!f.name.endsWith(".csv")) continue;
            all.push({ name: f.name, path: `${y.name}/${m.name}/${f.name}`, created_at: (f as any).created_at, size: (f as any).metadata?.size });
          }
        }
      }
      return all;
    },
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from(BACKUP_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error("Stiahnutie zlyhalo"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/public/hooks/warehouse-backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Záloha zlyhala");
      toast.success(`Záloha vytvorená (${json.items} položiek)`);
      await qc.invalidateQueries({ queryKey: ["warehouse-backups"] });
    } catch (e: any) {
      toast.error(e.message ?? "Záloha zlyhala");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Database className="size-4 mr-1" />Zálohy</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zálohy skladu</DialogTitle>
          <DialogDescription>Automatická denná záloha o 02:00 (UTC) — CSV snapshot všetkých položiek skladu.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{list.data ? `${list.data.length} záloh` : "Načítavam…"}</p>
          <Button size="sm" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
            Spustiť zálohu teraz
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto border rounded-md divide-y">
          {(list.data ?? []).map((b) => (
            <div key={b.path} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.created_at ? new Date(b.created_at).toLocaleString("sk-SK") : b.path}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(b.path)}>
                <Download className="size-4 mr-1" />Stiahnuť
              </Button>
            </div>
          ))}
          {list.data && list.data.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Zatiaľ žiadne zálohy. Kliknite „Spustiť zálohu teraz".</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const qc = useQueryClient();
  const { data: signed } = useQuery({
    queryKey: ["furniture-photo", value],
    enabled: !!value && !isHttp,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(value!, 60 * 60);
      if (error) {
        const msg = (error as any)?.message ?? "";
        const status = (error as any)?.statusCode ?? (error as any)?.status;
        if (status === "404" || status === 404 || /not.?found/i.test(msg)) {
          // Self-heal: file no longer exists in storage — clear the orphaned reference
          await supabase
            .from("furniture_items")
            .update({ photo_url: null })
            .eq("photo_url", value!)
            .then(() => qc.invalidateQueries({ queryKey: ["furniture_items"] }));
        }
        throw error;
      }
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
  return <img src={src} alt={alt} className={`object-contain bg-muted ${className ?? ""}`} />;
}

function Warehouse() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "warehouse");
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<FurnitureRow | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FurnitureRow | null>(null);
  const [damageFor, setDamageFor] = useState<FurnitureRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<FurnitureRow | null>(null);

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
      const { data, error } = await supabase.from("furniture_items").select("*, furniture_categories(name, code)").order("internal_code");
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

  const deleteItem = useMutation({
    mutationFn: async (row: FurnitureRow) => {
      if (row.photo_url && !row.photo_url.startsWith("http")) {
        await supabase.storage.from(PHOTO_BUCKET).remove([row.photo_url]).catch(() => {});
      }
      const { error } = await supabase.from("furniture_items").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      toast.success("Položka odstránená");
      setDeleteFor(null);
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("foreign key") || msg.includes("violates")) {
        toast.error("Položku nie je možné odstrániť — je použitá v rezerváciách alebo iných záznamoch. Skús ju radšej deaktivovať.");
      } else {
        toast.error(msg || "Odstránenie zlyhalo");
      }
    },
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
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              <ScanLine className="size-4 mr-1" />Skenovať
            </Button>
            <Button variant="outline" asChild>
              <Link to="/warehouse/qr-print"><Printer className="size-4 mr-1" />Tlač QR</Link>
            </Button>
            {canManage && <BackupsButton />}
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

        {(() => {
          const cats = categories.data ?? [];
          const groups = cats
            .map((c) => ({ cat: c, list: filtered.filter((i) => i.category_id === c.id) }))
            .filter((g) => g.list.length > 0);
          if (!items.isLoading && groups.length === 0) return null;
          return (
            <div className="space-y-8">
              {groups.map(({ cat, list }) => (
                <section key={cat.id} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge className={`border ${categoryClass(cat.code)}`}>{cat.name}</Badge>
                    <div className="h-px bg-border flex-1" />
                    <span className="text-xs text-muted-foreground">{list.length} ks</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {list.map((i) => {
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
                        <Button size="sm" variant="ghost" aria-label="Odstrániť položku" onClick={() => setDeleteFor(i)} title="Odstrániť">
                          <Trash2 className="size-3.5 text-rose-600" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
                    })}
                  </div>
                </section>
              ))}
            </div>
          );
        })()}
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

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(id) => {
          setScannerOpen(false);
          navigate({ to: "/warehouse/scan/$id", params: { id } });
        }}
      />

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odstrániť položku?</AlertDialogTitle>
            <AlertDialogDescription>
              Naozaj chceš trvalo odstrániť „{deleteFor?.name}" zo skladu? Túto akciu nie je možné vrátiť späť. Ak je položka použitá v rezerváciách, radšej ju deaktivuj.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => { e.preventDefault(); if (deleteFor) deleteItem.mutate(deleteFor); }}
              disabled={deleteItem.isPending}
            >
              {deleteItem.isPending ? "Odstraňujem…" : "Odstrániť"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DetailDialog({ item, onReportDamage, canManage }: { item: FurnitureRow; onReportDamage: () => void; canManage: boolean }) {
  const available = item.total_qty - item.damaged_qty - item.retired_qty;
  const qrUrl = buildFurnitureScanUrl(item.id);
  const downloadQr = async () => {
    try {
      const QR = await import("qrcode");
      const dataUrl = await QR.toDataURL(qrUrl, { width: 512, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${item.internal_code || item.id}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Stiahnutie QR zlyhalo");
    }
  };
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
      <div className="border-t pt-4 mt-2">
        <div className="flex items-start gap-4">
          <div className="bg-white p-2 rounded border shrink-0">
            <QRCode value={qrUrl} size={140} />
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <div className="text-xs text-muted-foreground">QR kód položky</div>
              <p className="text-xs font-mono break-all">{qrUrl}</p>
            </div>
            <Button size="sm" variant="outline" onClick={downloadQr}>
              <Download className="size-3.5 mr-1" /> Stiahnuť QR (PNG)
            </Button>
          </div>
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
    public_visible: (item as any)?.public_visible ?? false,
    public_description: (item as any)?.public_description ?? "",
    public_price: (item as any)?.public_price ?? ("" as number | ""),
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
      const payload: any = {
        ...form,
        photo_url: form.photo_url || null,
        price_per_day: form.price_per_day === "" || form.price_per_day == null ? null : Number(form.price_per_day),
        price_fixed: form.price_fixed === "" || form.price_fixed == null ? null : Number(form.price_fixed),
        public_visible: !!form.public_visible,
        public_description: form.public_description || null,
        public_price: form.public_price === "" || form.public_price == null ? null : Number(form.public_price),
      };
      if (item) {
        const { error } = await supabase.from("furniture_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        // Nechaj DB trigger vygenerovať interný kód automaticky podľa kategórie
        delete payload.internal_code;
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
          {item ? (
            <Input value={form.internal_code} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} />
          ) : (
            <>
              <Input value="" disabled placeholder="Vygeneruje sa automaticky" />
              <p className="text-[11px] text-muted-foreground">Pridelí sa podľa kategórie (napr. TABLES-0001).</p>
            </>
          )}
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
        <div className="space-y-1.5">
          <Label>Cena za deň (€/ks)</Label>
          <Input type="number" step="0.01" min={0} value={form.price_per_day} onChange={(e) => setForm({ ...form, price_per_day: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="napr. 2.50" />
        </div>
        <div className="space-y-1.5">
          <Label>Fixná cena za event (€/ks)</Label>
          <Input type="number" step="0.01" min={0} value={form.price_fixed} onChange={(e) => setForm({ ...form, price_fixed: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="napr. 10.00" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Poznámka</Label>
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
        </div>
        <div className="space-y-2 sm:col-span-2 rounded-md border p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Verejný katalóg</div>
              <p className="text-xs text-muted-foreground">Zobrazí položku na verejnej stránke /katalog (bez interných údajov).</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={!!form.public_visible} onChange={(e) => setForm({ ...form, public_visible: e.target.checked })} />
              Zobraziť v katalógu
            </label>
          </div>
          {form.public_visible && (
            <div className="grid sm:grid-cols-3 gap-3 pt-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Verejný popis</Label>
                <Textarea rows={2} value={form.public_description} onChange={(e) => setForm({ ...form, public_description: e.target.value })} placeholder="Marketingový popis pre klienta" />
              </div>
              <div className="space-y-1.5">
                <Label>Orientačná cena (€/ks)</Label>
                <Input type="number" step="0.01" min={0} value={form.public_price} onChange={(e) => setForm({ ...form, public_price: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="voliteľné" />
              </div>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading || !form.name || !form.category_id || (!!item && !form.internal_code)}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}
