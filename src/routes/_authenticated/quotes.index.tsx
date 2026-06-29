import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatEur } from "@/lib/quote-utils";

export const Route = createFileRoute("/_authenticated/quotes/")({
  head: () => ({ meta: [{ title: "Kalkulácie · Mima Production CRM" }] }),
  component: QuotesList,
});

function QuotesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");

  const clients = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, company_name").order("company_name");
      if (error) throw error;
      return data;
    },
  });

  const quotes = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, status, issue_date, total_with_vat, client_id, clients(company_name), reservations(event_name)")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return (quotes.data ?? []).filter((q: any) => {
      if (status !== "all" && q.status !== status) return false;
      if (clientId !== "all" && q.client_id !== clientId) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!q.quote_number.toLowerCase().includes(s) &&
            !(q.clients?.company_name ?? "").toLowerCase().includes(s) &&
            !(q.reservations?.event_name ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [quotes.data, status, clientId, search]);

  return (
    <>
      <AppHeader title="Kalkulácie" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Cenové ponuky</h2>
            <p className="text-sm text-muted-foreground">Vytváranie a správa kalkulácií pre klientov.</p>
          </div>
          <Button asChild>
            <Link to="/quotes/new"><Plus className="size-4 mr-1" />Nová kalkulácia</Link>
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Hľadať podľa čísla, klienta, eventu…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Stav" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetky stavy</SelectItem>
              <SelectItem value="draft">Návrh</SelectItem>
              <SelectItem value="sent">Odoslaná</SelectItem>
              <SelectItem value="approved">Schválená</SelectItem>
              <SelectItem value="rejected">Zamietnutá</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Klient" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetci klienti</SelectItem>
              {clients.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Dátum</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Suma s DPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Načítavam…</TableCell></TableRow>}
                {!quotes.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Žiadne kalkulácie.</TableCell></TableRow>}
                {filtered.map((q: any) => (
                  <TableRow key={q.id} className="cursor-pointer" onClick={() => navigate({ to: "/quotes/$id", params: { id: q.id } })}>
                    <TableCell className="font-mono font-medium">{q.quote_number}</TableCell>
                    <TableCell>{q.clients?.company_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{q.reservations?.event_name ?? "—"}</TableCell>
                    <TableCell>{new Date(q.issue_date).toLocaleDateString("sk-SK")}</TableCell>
                    <TableCell><Badge variant={QUOTE_STATUS_VARIANT[q.status as keyof typeof QUOTE_STATUS_VARIANT]}>{QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{formatEur(Number(q.total_with_vat))}</TableCell>
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