import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { Inbox, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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
                  <div className="text-xs text-muted-foreground">Položiek: {Array.isArray(r.items) ? r.items.length : 0}</div>
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