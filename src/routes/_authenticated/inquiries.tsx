import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { Inbox, ExternalLink, CheckCircle2, Package } from "lucide-react";
import { toast } from "sonner";

/**
 * Položky dopytu sú uložené ako JSON a prišli dvoma cestami: z klientskej zóny
 * na webe (`{id, name, qty}`) a z katalógu cez CRM (`{furniture_item_id, qty}`,
 * bez názvu). Preto sa čítajú tolerantne a chýbajúce názvy sa dohľadajú v
 * sklade — v karte dopytu musí byť vidieť, čo klient chce, nie len koľko toho
 * je.
 */
type InquiryItem = { id: string | null; name: string | null; qty: number };

function readItems(raw: unknown): InquiryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InquiryItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.furniture_item_id === "string" ? o.furniture_item_id
      : typeof o.id === "string" ? o.id : null;
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
    const qty = Number(o.qty ?? o.quantity ?? 0);
    out.push({ id, name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
  }
  return out;
}

export const Route = createFileRoute("/_authenticated/inquiries")({
  head: () => ({ meta: [{ title: "Verejné dopyty · Mima Production CRM" }] }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*, reservations(id,event_name,status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const mark = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inquiries").update({ status: "processed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dopyt označený ako spracovaný"); qc.invalidateQueries({ queryKey: ["inquiries"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  // Názvy položiek, ktoré v dopyte chýbajú (dopyt z katalógu ukladá len id).
  const missingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      for (const it of readItems((r as any).items)) {
        if (it.id && !it.name) ids.add(it.id);
      }
    }
    return [...ids].sort();
  }, [rows]);

  const names = useQuery({
    queryKey: ["inquiry-item-names", missingIds],
    enabled: missingIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("furniture_items")
        .select("id,name")
        .in("id", missingIds);
      if (error) throw error;
      return new Map((data ?? []).map((i) => [i.id, i.name]));
    },
  });

  return (
    <>
      <AppHeader title="Verejné dopyty" />
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dopyty z katalógu</h2>
          <p className="text-sm text-muted-foreground">Verejné dopyty automaticky vytvárajú rezerváciu v stave „Dopyt".</p>
        </div>
        {rows.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Inbox className="size-8 mx-auto mb-2" />Zatiaľ žiadne dopyty.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {rows.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-semibold">{r.name} {r.company && <span className="text-muted-foreground font-normal">· {r.company}</span>}</div>
                      <div className="text-sm text-muted-foreground">{r.email} {r.phone && `· ${r.phone}`}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === "new" ? "default" : "secondary"}>{r.status === "new" ? "Nový" : "Spracovaný"}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d.M.yyyy HH:mm", { locale: sk })}</span>
                    </div>
                  </div>
                  {(r.event_start_at || r.venue) && (
                    <div className="text-sm">
                      {r.event_start_at && <span>Termín: {format(new Date(r.event_start_at), "d.M.yyyy HH:mm", { locale: sk })}{r.event_end_at && ` – ${format(new Date(r.event_end_at), "d.M.yyyy HH:mm", { locale: sk })}`}</span>}
                      {r.venue && <span className="ml-3">Miesto: {r.venue}</span>}
                    </div>
                  )}
                  {r.message && <div className="text-sm bg-muted/50 rounded p-2">{r.message}</div>}
                  <InquiryItems items={readItems(r.items)} names={names.data} />
                  <div className="flex items-center gap-2 pt-2">
                    {r.reservation_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/reservations/$id" params={{ id: r.reservation_id }}>
                          <ExternalLink className="size-3.5 mr-1" />Otvoriť rezerváciu
                        </Link>
                      </Button>
                    )}
                    {r.status === "new" && (
                      <Button size="sm" variant="ghost" onClick={() => mark.mutate(r.id)}>
                        <CheckCircle2 className="size-3.5 mr-1" />Označiť ako spracované
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
/** Čo si klient naklikal — názov a počet kusov, nie len počet riadkov. */
function InquiryItems({ items, names }: { items: InquiryItem[]; names?: Map<string, string> }) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Bez položiek — dopyt prišiel z kontaktného formulára, nie z katalógu.
      </div>
    );
  }
  const spolu = items.reduce((s, i) => s + i.qty, 0);
  const rows = items
    .map((i) => ({ ...i, label: i.name ?? names?.get(i.id ?? "") ?? null }))
    .sort((a, b) => b.qty - a.qty);
  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-b">
        <Package className="size-3.5" />
        Položky dopytu
        <span className="text-muted-foreground font-normal">
          · {items.length} {items.length === 1 ? "druh" : items.length < 5 ? "druhy" : "druhov"} · {spolu} ks
        </span>
      </div>
      <div className="px-2.5 py-1.5 space-y-1">
        {rows.map((i, idx) => (
          <div key={`${i.id ?? "x"}-${idx}`} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0">
              {i.label ?? <span className="text-muted-foreground italic">neznáma položka (už nie je v sklade)</span>}
            </span>
            <span className="font-semibold tabular-nums shrink-0">{i.qty} ks</span>
          </div>
        ))}
      </div>
    </div>
  );
}
