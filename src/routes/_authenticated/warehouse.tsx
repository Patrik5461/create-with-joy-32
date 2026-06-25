import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Plus, Search, Pencil, ImageIcon, Power } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/warehouse")({
  head: () => ({ meta: [{ title: "Sklad · MimaProduction CRM" }] }),
  component: Warehouse,
});

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
  furniture_categories: { name: string; code: string } | null;
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((i) => {
            const available = i.total_qty - i.damaged_qty - i.retired_qty;
            return (
              <Card key={i.id} className={!i.active ? "opacity-60" : ""}>
                <div className="aspect-video bg-muted rounded-t-xl overflow-hidden grid place-items-center">
                  {i.photo_url ? (
                    <img src={i.photo_url} alt={i.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="size-10 text-muted-foreground/50" />
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground">{i.internal_code}</div>
                    </div>
                    <Badge variant="outline">{i.furniture_categories?.name}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {i.dimensions && <span>{i.dimensions}</span>}
                    {i.color && <span>· {i.color}</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center pt-1">
                    <div className="rounded bg-muted/50 p-1.5"><div className="text-[10px] text-muted-foreground">Celkom</div><div className="font-semibold text-sm">{i.total_qty}</div></div>
                    <div className="rounded bg-success/10 p-1.5"><div className="text-[10px] text-muted-foreground">Voľné</div><div className="font-semibold text-sm text-success">{available}</div></div>
                    <div className="rounded bg-warning/10 p-1.5"><div className="text-[10px] text-muted-foreground">Poškod.</div><div className="font-semibold text-sm">{i.damaged_qty}</div></div>
                    <div className="rounded bg-destructive/10 p-1.5"><div className="text-[10px] text-muted-foreground">Vyrad.</div><div className="font-semibold text-sm">{i.retired_qty}</div></div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(i); setOpen(true); }}>
                        <Pencil className="size-3.5 mr-1" />Upraviť
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(i)}>
                        <Power className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!items.isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Žiadne položky nenájdené.</p>
        )}
      </div>
    </>
  );
}

function FurnitureDialog({ item, categories, onClose }: { item: FurnitureRow | null; categories: any[]; onClose: () => void }) {
  const qc = useQueryClient();
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
  });

  const save = useMutation({
    mutationFn: async () => {
      if (item) {
        const { error } = await supabase.from("furniture_items").update(form).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("furniture_items").insert(form);
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
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{item ? "Upraviť položku" : "Nová položka"}</DialogTitle>
        <DialogDescription>Vyplňte údaje o nábytku.</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>URL fotografie</Label>
          <Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" />
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
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.internal_code}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}