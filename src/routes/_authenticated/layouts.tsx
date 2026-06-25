import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutPanelTop } from "lucide-react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { STATUS_LABEL, STATUS_COLOR, type ReservationStatus } from "@/lib/reservation-status";

export const Route = createFileRoute("/_authenticated/layouts")({
  head: () => ({ meta: [{ title: "Plán eventu · MimaProduction CRM" }] }),
  component: LayoutsPage,
});

function LayoutsPage() {
  const reservations = useQuery({
    queryKey: ["reservations-for-layouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, event_name, venue, status, event_start_at, load_at, layout, clients(company_name)")
        .order("event_start_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title="Plán eventu" />
      <main className="flex-1 p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Vyberte rezerváciu pre otvorenie vizuálneho editora pôdorysu.
        </p>
        {reservations.isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : !reservations.data?.length ? (
          <p className="text-sm text-muted-foreground">Žiadne rezervácie.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {reservations.data.map((r) => {
              const hasLayout = !!r.layout;
              const when = r.event_start_at ?? r.load_at;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{r.event_name ?? "Bez názvu"}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.clients?.company_name ?? "—"} {r.venue ? `· ${r.venue}` : ""}
                        </p>
                        {when && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(when), "d. MMM yyyy HH:mm", { locale: sk })}
                          </p>
                        )}
                      </div>
                      <Badge className={STATUS_COLOR[r.status as ReservationStatus]}>
                        {STATUS_LABEL[r.status as ReservationStatus]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {hasLayout ? "Plán uložený" : "Bez plánu"}
                      </span>
                      <Button asChild size="sm">
                        <Link to="/reservations/$id/layout" params={{ id: r.id }}>
                          <LayoutPanelTop className="size-4 mr-1" />
                          {hasLayout ? "Upraviť plán" : "Vytvoriť plán"}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}