import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatEur, quoteClientName } from "@/lib/quote-utils";

export const Route = createFileRoute("/_authenticated/quotes/trash")({
  head: () => ({ meta: [{ title: "Kôš kalkulácií · Mima Production CRM" }] }),
  component: QuotesTrash,
});

function QuotesTrash() {
  const qc = useQueryClient();

  const trash = useQuery({
    queryKey: ["quotes-trash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, status, issue_date, total_with_vat, version_number, is_current, quote_group_id, deleted_at, deleted_by, clients(company_name), reservations(event_name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const restore = useMutation({
    mutationFn: async (q: any) => {
      const gid = (q.quote_group_id ?? null) as string | null;
      if (!gid) {
        const { error } = await supabase.from("quotes")
          .update({ deleted_at: null, deleted_by: null, is_current: true })
          .eq("id", q.id);
        if (error) throw error;
        return;
      }

      // Obnovíme vždy ako neaktuálnu verziu — príznak „aktuálna" smie mať len
      // jedna verzia v skupine a prepnutie rieši databáza jedným volaním.
      const { error } = await supabase.from("quotes")
        .update({ deleted_at: null, deleted_by: null, is_current: false })
        .eq("id", q.id);
      if (error) throw error;

      const { data: existing, error: eCur } = await supabase
        .from("quotes")
        .select("id")
        .eq("quote_group_id", gid)
        .is("deleted_at", null)
        .eq("is_current", true)
        .maybeSingle();
      if (eCur) throw eCur;
      if (existing) return;

      // V skupine nezostala aktuálna verzia — povýš najnovšiu, inak by sa
      // obnovená kalkulácia v zozname vôbec neukázala.
      const { data: newest } = await supabase
        .from("quotes")
        .select("id")
        .eq("quote_group_id", gid)
        .is("deleted_at", null)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newest) {
        const { error: ePromote } = await supabase.rpc("set_current_quote_version", { _quote_id: newest.id });
        if (ePromote) throw ePromote;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes-trash"] });
      toast.success("Kalkulácia obnovená");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (q: any) => {
      const { error } = await supabase.from("quotes").delete().eq("id", q.id);
      if (error) throw error;

      // Ak sa natrvalo zmazala aktuálna verzia, skupina by ostala bez nej a
      // zvyšné verzie by sa v zozname nezobrazili.
      const gid = (q.quote_group_id ?? null) as string | null;
      if (!gid) return;
      const { data: existing } = await supabase
        .from("quotes").select("id")
        .eq("quote_group_id", gid).is("deleted_at", null).eq("is_current", true).maybeSingle();
      if (existing) return;
      const { data: newest } = await supabase
        .from("quotes").select("id")
        .eq("quote_group_id", gid).is("deleted_at", null)
        .order("version_number", { ascending: false }).limit(1).maybeSingle();
      if (newest) await supabase.rpc("set_current_quote_version", { _quote_id: newest.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes-trash"] });
      toast.success("Natrvalo vymazané");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <AppHeader title="Kôš kalkulácií" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Kôš kalkulácií</h2>
            <p className="text-sm text-muted-foreground">Zmazané kalkulácie sa uchovávajú a dajú sa obnoviť.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/quotes"><ArrowLeft className="size-4 mr-1" />Späť</Link>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Klient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Suma s DPH</TableHead>
                  <TableHead>Zmazané</TableHead>
                  <TableHead className="text-right">Akcie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trash.isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Načítavam…</TableCell></TableRow>
                )}
                {!trash.isLoading && (trash.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Kôš je prázdny.</TableCell></TableRow>
                )}
                {(trash.data ?? []).map((q: any) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                      {quoteClientName(q)} <span className="text-xs text-muted-foreground font-normal">v{q.version_number}</span>
                    </TableCell>
                    <TableCell>{q.reservations?.event_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={QUOTE_STATUS_VARIANT[q.status as keyof typeof QUOTE_STATUS_VARIANT]}>
                        {QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{q.total_with_vat != null ? formatEur(Number(q.total_with_vat)) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {q.deleted_at ? new Date(q.deleted_at).toLocaleString("sk-SK") : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(q)} disabled={restore.isPending}>
                        <RotateCcw className="size-4 mr-1" />Obnoviť
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => { if (confirm("Vymazať natrvalo? Túto akciu nie je možné vrátiť späť.")) purge.mutate(q); }}
                        disabled={purge.isPending}
                      >
                        <Trash2 className="size-4 mr-1" />Vymazať natrvalo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}