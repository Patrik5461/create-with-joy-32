import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LayoutPanelTop, Search, Users, Package } from "lucide-react";
import { format, isAfter } from "date-fns";
import { sk } from "date-fns/locale";
import { STATUS_LABEL, STATUS_COLOR, type ReservationStatus } from "@/lib/reservation-status";
import { computeCapacity, parseLayout } from "@/lib/layout-plan";

type Filter = "upcoming" | "with" | "without" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "upcoming", label: "Nadchádzajúce" },
  { key: "with", label: "S plánom" },
  { key: "without", label: "Bez plánu" },
  { key: "all", label: "Všetky" },
];

export const Route = createFileRoute("/_authenticated/layouts")({
  head: () => ({ meta: [{ title: "Plán rozloženia · Mima Production CRM" }] }),
  component: LayoutsPage,
});

function LayoutsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("upcoming");

  const reservations = useQuery({
    queryKey: ["reservations-for-layouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, event_name, venue, status, event_start_at, load_at, layout, clients(company_name)")
        .order("event_start_at", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  /** Zhrnutie plánu čítame rovnakou logikou ako editor — čísla tak vždy sedia. */
  const rows = useMemo(() => {
    const now = new Date();
    return (reservations.data ?? [])
      .map((r) => {
        const { layout } = parseLayout(r.layout);
        const cap = layout ? computeCapacity(layout) : null;
        const when = r.event_start_at ?? r.load_at;
        return {
          ...r,
          when: when ? new Date(when) : null,
          hasLayout: !!layout && layout.elements.length > 0,
          seats: cap?.seats ?? 0,
          elements: layout?.elements.length ?? 0,
        };
      })
      .filter((r) => {
        if (filter === "with" && !r.hasLayout) return false;
        if (filter === "without" && r.hasLayout) return false;
        if (filter === "upcoming" && !(r.when && isAfter(r.when, now))) return false;
        if (search) {
          const s = search.toLowerCase();
          const hay = `${r.event_name ?? ""} ${r.clients?.company_name ?? ""} ${r.venue ?? ""}`.toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Nadchádzajúce od najbližšieho, ostatné od najnovšieho.
        if (filter === "upcoming") return (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0);
        return (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0);
      });
  }, [reservations.data, filter, search]);

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title="Plán rozloženia" />
      <main className="flex-1 p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Plány rozloženia</h2>
          <p className="text-sm text-muted-foreground">
            Vyberte rezerváciu a otvorte vizuálny editor pôdorysu.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Hľadať podľa eventu, klienta alebo miesta…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40 self-start">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1 text-sm rounded ${filter === f.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {reservations.isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "upcoming" ? "Žiadne nadchádzajúce rezervácie." : "Nič nezodpovedá výberu."}
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.id} className={r.hasLayout ? "border-emerald-200" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{r.event_name ?? "Bez názvu"}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.clients?.company_name ?? "—"}{r.venue ? ` · ${r.venue}` : ""}
                      </p>
                      {r.when && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(r.when, "d. MMM yyyy HH:mm", { locale: sk })}
                        </p>
                      )}
                    </div>
                    <Badge className={STATUS_COLOR[r.status as ReservationStatus]}>
                      {STATUS_LABEL[r.status as ReservationStatus]}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {r.hasLayout ? (
                      <span className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                        <span className="flex items-center gap-1"><Users className="size-3.5" />{r.seats} miest</span>
                        <span className="flex items-center gap-1"><Package className="size-3.5" />{r.elements} prvkov</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Bez plánu</span>
                    )}
                    <Button asChild size="sm" variant={r.hasLayout ? "outline" : "default"}>
                      <Link to="/reservations/$id/layout" params={{ id: r.id }}>
                        <LayoutPanelTop className="size-4 mr-1" />
                        {r.hasLayout ? "Upraviť" : "Vytvoriť plán"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
