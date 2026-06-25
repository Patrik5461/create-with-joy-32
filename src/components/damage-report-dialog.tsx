import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Loader2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

const PHOTO_BUCKET = "furniture-photos";

export interface DamageReportTarget {
  id: string;
  name: string;
  total_qty: number;
  damaged_qty: number;
  retired_qty: number;
}

export function DamageReportDialog({
  open,
  onOpenChange,
  item,
  reservedNow = 0,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: DamageReportTarget | null;
  reservedNow?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {item && (
        <Inner
          key={item.id}
          item={item}
          reservedNow={reservedNow}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function Inner({ item, reservedNow, onClose }: { item: DamageReportTarget; reservedNow: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const available = Math.max(0, item.total_qty - item.damaged_qty - item.retired_qty - reservedNow);

  const [form, setForm] = useState({
    qty: 1,
    severity: "medium" as "light" | "medium" | "severe",
    description: "",
    reservation_id: "none" as string,
    photos: [] as string[],
  });

  const lastReservations = useQuery({
    queryKey: ["damage-recent-res", item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_items")
        .select("reservation_id, reservations!inner(id, event_name, return_at, clients(company_name))")
        .eq("furniture_item_id", item.id)
        .order("return_at", { foreignTable: "reservations", ascending: false })
        .limit(10);
      if (error) throw error;
      const seen = new Set<string>();
      const out: any[] = [];
      for (const row of (data ?? []) as any[]) {
        if (!seen.has(row.reservation_id)) {
          seen.add(row.reservation_id);
          out.push(row.reservations);
        }
      }
      return out;
    },
  });

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name}: max 5 MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `damage/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type,
        });
        if (error) { toast.error(error.message); continue; }
        uploaded.push(path);
      }
      if (uploaded.length) {
        setForm((f) => ({ ...f, photos: [...f.photos, ...uploaded] }));
        toast.success(`Nahraných ${uploaded.length} fotiek`);
      }
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (path: string) => {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== path) }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (form.qty < 1) throw new Error("Počet kusov musí byť aspoň 1");
      if (form.severity === "severe" && form.qty > available) {
        throw new Error(`Pri vážnom poškodení musí byť počet ≤ voľné (${available}).`);
      }
      const { error } = await supabase.from("damaged_items").insert({
        furniture_item_id: item.id,
        qty: form.qty,
        severity: form.severity,
        description: form.description || null,
        reason: form.description || null,
        photo_paths: form.photos,
        reservation_id: form.reservation_id === "none" ? null : form.reservation_id,
        reported_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      qc.invalidateQueries({ queryKey: ["damage_reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Poškodenie nahlásené");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-rose-600" />
          Nahlásiť poškodenie — {item.name}
        </DialogTitle>
        <DialogDescription>
          Voľných {available} ks · Poškodených {item.damaged_qty} · Vyradených {item.retired_qty}
        </DialogDescription>
      </DialogHeader>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Počet poškodených ks</Label>
          <Input
            type="number" min={1}
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Závažnosť</Label>
          <Select value={form.severity} onValueChange={(v: any) => setForm({ ...form, severity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Ľahké (iba evidovať)</SelectItem>
              <SelectItem value="medium">Stredné (iba evidovať)</SelectItem>
              <SelectItem value="severe">Vážne (presunúť do poškodených)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Popis poškodenia</Label>
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Čo sa stalo, na ktorom kuse, ako…"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Súvisí s rezerváciou (voliteľné)</Label>
          <Select value={form.reservation_id} onValueChange={(v) => setForm({ ...form, reservation_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Žiadna —</SelectItem>
              {(lastReservations.data ?? []).map((r: any) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.event_name} {r.clients?.company_name ? `· ${r.clients.company_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Fotky poškodenia</Label>
          <input
            ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="flex flex-wrap gap-2">
            {form.photos.map((p) => (
              <div key={p} className="relative group">
                <PhotoThumb path={p} />
                <button
                  type="button"
                  onClick={() => removePhoto(p)}
                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Upload className="size-3.5 mr-1" />}
              Pridať fotky
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">JPG/PNG/WebP, max 5 MB / fotka.</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || uploading}>
          {submit.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
          Nahlásiť
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function PhotoThumb({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["damage-photo", path],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!data) return <div className="size-20 rounded-md bg-muted animate-pulse" />;
  return <img src={data} alt="" className="size-20 rounded-md object-cover border" />;
}