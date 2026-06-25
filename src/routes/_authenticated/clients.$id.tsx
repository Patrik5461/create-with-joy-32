import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { STATUS_LABEL, STATUS_BADGE_VARIANT, type ReservationStatus } from "@/lib/reservation-status";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Klient · MimaProduction CRM" }] }),
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();

  const client = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const reservations = useQuery({
    queryKey: ["client-reservations", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("*").eq("client_id", id).order("event_start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <AppHeader title={client.data?.company_name ?? "Klient"} />
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/clients"><ArrowLeft className="size-4 mr-1" />Späť na klientov</Link></Button>
        {client.data && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle>{client.data.company_name}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Field label="IČO" value={client.data.ico} />
                <Field label="Kontaktná osoba" value={client.data.contact_person} />
                <Field label="Telefón" value={client.data.phone} />
                <Field label="Email" value={client.data.email} />
                <Field label="Adresa" value={client.data.address} />
                {client.data.notes && (
                  <div className="pt-2 border-t"><div className="text-xs text-muted-foreground mb-1">Poznámky</div><p className="whitespace-pre-wrap">{client.data.notes}</p></div>
                )}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">História rezervácií</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {reservations.data?.length === 0 && <p className="text-sm text-muted-foreground">Žiadne rezervácie.</p>}
                {reservations.data?.map((r) => (
                  <Link key={r.id} to="/reservations/$id" params={{ id: r.id }} className="block rounded-md border p-3 hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.event_name}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(r.event_start_at ?? r.load_at), "d.M.yyyy HH:mm")} · {r.venue ?? "—"}</div>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]}>{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="text-right">{value ?? "—"}</span></div>
  );
}