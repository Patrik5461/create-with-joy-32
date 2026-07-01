import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ImageIcon, ScanLine } from "lucide-react";
import { useState } from "react";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";
import { useNavigate } from "@tanstack/react-router";
import { QRCode, buildFurnitureScanUrl } from "@/components/qr-code";

const PHOTO_BUCKET = "furniture-photos";
const BACKUP_BUCKET = "warehouse-backups";

export const Route = createFileRoute("/_authenticated/warehouse/scan/$id")({
  head: () => ({ meta: [{ title: "Skenovaná položka · Mima Production CRM" }] }),
  component: ScanView,
});

function ScanView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);

  const item = useQuery({
    queryKey: ["furniture_scan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("furniture_items")
        .select("*, furniture_categories(name, code)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const photoUrl = useQuery({
    queryKey: ["furniture_scan_photo", item.data?.photo_url],
    enabled: !!item.data?.photo_url && !item.data.photo_url.startsWith("http"),
    staleTime: 1000 * 60 * 60 * 24 * 6,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(item.data!.photo_url, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) return data.signedUrl;

      const { data: backup, error: backupError } = await supabase.storage
        .from(BACKUP_BUCKET)
        .createSignedUrl(`photos/${item.data!.photo_url}`, 60 * 60 * 24 * 7);
      if (!backupError && backup?.signedUrl) return backup.signedUrl;

      throw error ?? backupError;
    },
  });

  if (item.isLoading) {
    return (
      <>
        <AppHeader title="Skenovaná položka" />
        <div className="p-6 text-muted-foreground">Načítavam…</div>
      </>
    );
  }

  if (!item.data) {
    return (
      <>
        <AppHeader title="Skenovaná položka" />
        <div className="p-6 space-y-3">
          <p className="text-muted-foreground">Položka s týmto QR kódom sa nenašla.</p>
          <Button variant="outline" asChild>
            <Link to="/warehouse"><ArrowLeft className="size-4 mr-1" />Späť na sklad</Link>
          </Button>
        </div>
      </>
    );
  }

  const i = item.data;
  const available = i.total_qty - i.damaged_qty - i.retired_qty;
  const src = i.photo_url?.startsWith("http") ? i.photo_url : photoUrl.data;

  return (
    <>
      <AppHeader title={i.name} />
      <div className="p-4 md:p-6 max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/warehouse"><ArrowLeft className="size-4 mr-1" />Sklad</Link>
          </Button>
          <Button size="sm" onClick={() => setScannerOpen(true)}>
            <ScanLine className="size-4 mr-1" /> Ďalší sken
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="aspect-video bg-muted overflow-hidden">
              {src ? (
                <img src={src} alt={i.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center">
                  <ImageIcon className="size-12 text-muted-foreground/50" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{i.furniture_categories?.name ?? "—"}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{i.internal_code}</span>
                {!i.active && <Badge variant="secondary">Neaktívne</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {[i.dimensions, i.color].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Celkom" value={i.total_qty} />
                <Stat label="Voľné" value={available} tone="emerald" />
                <Stat label="Poškod." value={i.damaged_qty} tone="rose" />
                <Stat label="Vyrad." value={i.retired_qty} tone="slate" />
              </div>
              {i.note && (
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">Poznámka</div>
                  <p className="whitespace-pre-wrap">{i.note}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">QR kód položky</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <QRCode value={buildFurnitureScanUrl(i.id)} size={180} />
            <p className="text-xs text-muted-foreground font-mono break-all text-center">
              {buildFurnitureScanUrl(i.id)}
            </p>
          </CardContent>
        </Card>
      </div>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(fid) => {
          setScannerOpen(false);
          if (fid !== id) navigate({ to: "/warehouse/scan/$id", params: { id: fid } });
        }}
      />
    </>
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