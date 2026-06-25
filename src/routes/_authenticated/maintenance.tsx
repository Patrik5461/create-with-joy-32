import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, Search, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { PhotoThumb } from "@/components/damage-report-dialog";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({ meta: [{ title: "Údržba · MimaProduction CRM" }] }),
  component: MaintenancePage,
});

const SEVERITY = {
  light: { label: "Ľahké", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  medium: { label: "Stredné", cls: "bg-orange-100 text-orange-900 border-orange-200" },
  severe: { label: "Vážne", cls: "bg-rose-100 text-rose-900 border-rose-200" },
} as const;

const STATUS = {
  new: { label: "Nové", cls: "bg-blue-100 text-blue-900 border-blue-200" },
  in_progress: { label: "V riešení", cls: "bg-violet-100 text-violet-900 border-violet-200" },
  resolved: { label: "Vyriešené", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  retired: { label: "Vyradené", cls: "bg-slate-200 text-slate-900 border-slate-300" },
} as const;

type Severity = keyof typeof SEVERITY;
type Status = keyof typeof STATUS;

interface Report {
  id: string;
  furniture_item_id: string;
  qty: number;
  severity: Severity;
  status: Status;
  description: string | null;
  reason: string | null;
  photo_paths: string[];
  reported_at: string;
  reported_by: string | null;
  reservation_id: string | null;
  resolved_at: string | null;
  furniture_items: { name: string; internal_code: string } | null;
  reservations: { event_name: string; clients: { company_name: string } | null } | null;
  reporter: { full_name: string | null; email: string } | null;
}

function MaintenancePage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "warehouse");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [sevF, setSevF] = useState<string>("all");
  const [detail, setDetail] = useState<Report | null>(null);

  const reports = useQuery({
    queryKey: ["damage_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damaged_items")
        .select(`
          id, furniture_item_id, qty, severity, status, description, reason,
          photo_paths, reported_at, reported_by, reservation_id, resolved_at,
          furniture_items(name, internal_code),
          reservations(event_name, clients(company_name)),
          reporter:profiles!damaged_items_reported_by_fkey(full_name, email)
        `)
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Report[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase
        .from("damaged_items")
        .update({ status, resolved_by: status === "resolved" || status === "retired" ? user?.id : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["damage_reports"] });
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Stav aktualizovaný");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return (reports.data ?? []).filter((r) => {
      if (statusF !== "all" && r.status !== statusF) return false;
      if (sevF !== "all" && r.severity !== sevF) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.furniture_items?.name.toLowerCase().includes(q) ||
          r.furniture_items?.internal_code.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports.data, search, statusF, sevF]);

  return (
    <>
      <AppHeader title="Údržba" />
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wrench className="size-6" /> Údržba a servis nábytku
          </h2>
          <p className="text-sm text-muted-foreground">Evidencia poškodení a stav opráv.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Hľadať…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Stav" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetky stavy</SelectItem>
              {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sevF} onValueChange={setSevF}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Závažnosť" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetky závažnosti</SelectItem>
              {Object.entries(SEVERITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {reports.isLoading && <p className="text-sm text-muted-foreground">Načítavam…</p>}
        {!reports.isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Žiadne záznamy.</p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <Card key={r.id} className="flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.furniture_items?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.furniture_items?.internal_code} · {r.qty} ks
                    </div>
                  </div>
                  <Badge className={`border ${SEVERITY[r.severity].cls}`}>{SEVERITY[r.severity].label}</Badge>
                </div>
                <Badge variant="outline" className={`w-fit border ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</Badge>
                {r.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                )}
                <div className="text-xs text-muted-foreground">
                  {format(new Date(r.reported_at), "d. M. yyyy HH:mm", { locale: sk })}
                  {r.reporter && <> · {r.reporter.full_name || r.reporter.email}</>}
                </div>
                {r.reservations && (
                  <div className="text-xs text-muted-foreground truncate">
                    Event: {r.reservations.event_name}
                  </div>
                )}
                {r.photo_paths.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {r.photo_paths.slice(0, 3).map((p) => <PhotoThumb key={p} path={p} />)}
                  </div>
                )}
                <div className="flex gap-2 mt-auto pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetail(r)}>Detail</Button>
                  {canManage && r.status !== "resolved" && r.status !== "retired" && (
                    <Select value="" onValueChange={(v: Status) => updateStatus.mutate({ id: r.id, status: v })}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Zmeniť stav" /></SelectTrigger>
                      <SelectContent>
                        {r.status === "new" && <SelectItem value="in_progress">→ V riešení</SelectItem>}
                        <SelectItem value="resolved">→ Vyriešené (vrátiť do voľných)</SelectItem>
                        <SelectItem value="retired">→ Vyradiť trvalo</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{detail.furniture_items?.name}</DialogTitle>
              <DialogDescription>
                {detail.furniture_items?.internal_code} · {detail.qty} ks
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={`border ${SEVERITY[detail.severity].cls}`}>{SEVERITY[detail.severity].label}</Badge>
                <Badge variant="outline" className={`border ${STATUS[detail.status].cls}`}>{STATUS[detail.status].label}</Badge>
              </div>
              {detail.description && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Popis</div>
                  <p className="whitespace-pre-wrap">{detail.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Nahlásil</div>
                  <div>{detail.reporter?.full_name || detail.reporter?.email || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Dátum</div>
                  <div>{format(new Date(detail.reported_at), "d. M. yyyy HH:mm", { locale: sk })}</div>
                </div>
                {detail.resolved_at && (
                  <div>
                    <div className="text-xs text-muted-foreground">Vyriešené</div>
                    <div>{format(new Date(detail.resolved_at), "d. M. yyyy HH:mm", { locale: sk })}</div>
                  </div>
                )}
                {detail.reservation_id && detail.reservations && (
                  <div>
                    <div className="text-xs text-muted-foreground">Rezervácia</div>
                    <Link to="/reservations/$id" params={{ id: detail.reservation_id }} className="text-primary hover:underline inline-flex items-center gap-1">
                      {detail.reservations.event_name} <ArrowRight className="size-3" />
                    </Link>
                  </div>
                )}
              </div>
              {detail.photo_paths.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Fotky</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.photo_paths.map((p) => <PhotoThumb key={p} path={p} />)}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}