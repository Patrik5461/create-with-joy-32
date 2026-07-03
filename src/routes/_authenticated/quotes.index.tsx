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
import { Plus, Search, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatEur } from "@/lib/quote-utils";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { sk } from "date-fns/locale";

type RangeView = "day" | "week" | "month";

function getRange(view: RangeView, anchor: Date): { start: Date; end: Date; label: string } {
  if (view === "day") {
    const start = new Date(anchor); start.setHours(0, 0, 0, 0);
    const end = new Date(anchor); end.setHours(23, 59, 59, 999);
    return { start, end, label: format(start, "d. MMMM yyyy", { locale: sk }) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    return { start, end, label: `${format(start, "d.", { locale: sk })} – ${format(end, "d. MMMM yyyy", { locale: sk })}` };
  }
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return { start, end, label: format(anchor, "LLLL yyyy", { locale: sk }) };
}

export const Route = createFileRoute("/_authenticated/quotes/")({
  head: () => ({ meta: [{ title: "Kalkulácie · Mima Production CRM" }] }),
  component: QuotesList,
});

function QuotesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");
  const [view, setView] = useState<RangeView>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [dateFilterOn, setDateFilterOn] = useState(false);

  const range = useMemo(() => getRange(view, anchor), [view, anchor]);
  const shift = (dir: 1 | -1) => {
    setAnchor((a) => (view === "day" ? addDays(a, dir) : view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
    setDateFilterOn(true);
  };

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
        .select("id, quote_number, status, issue_date, total_with_vat, client_id, version_number, is_current, clients(company_name), reservations(event_name)")
      .eq("is_current", true)
      .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return (quotes.data ?? []).filter((q: any) => {
      if (status !== "all" && q.status !== status) return false;
      if (clientId !== "all" && q.client_id !== clientId) return false;
      if (dateFilterOn) {
        const d = new Date(q.issue_date);
        if (d < range.start || d > range.end) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!q.quote_number.toLowerCase().includes(s) &&
            !(q.clients?.company_name ?? "").toLowerCase().includes(s) &&
            !(q.reservations?.event_name ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [quotes.data, status, clientId, search, dateFilterOn, range]);

  return (
    <>
      <AppHeader title="Kalkulácie" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Cenové ponuky</h2>
            <p className="text-sm text-muted-foreground">Vytváranie a správa kalkulácií pre klientov.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/quotes/trash"><Trash2 className="size-4 mr-1" />Kôš</Link>
            </Button>
            <Button asChild>
              <Link to="/quotes/new"><Plus className="size-4 mr-1" />Nová kalkulácia</Link>
            </Button>
          </div>
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

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Predchádzajúce obdobie" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="icon" aria-label="Nasledujúce obdobie" onClick={() => shift(1)}><ChevronRight className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { setAnchor(new Date()); setDateFilterOn(true); }}>Dnes</Button>
            <div className="ml-2 text-sm font-medium capitalize">{range.label}</div>
            {dateFilterOn && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setDateFilterOn(false)}>Zrušiť filter dátumu</Button>
            )}
          </div>
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40 self-start">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setDateFilterOn(true); }}
                className={`px-3 py-1 text-sm rounded ${view === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {v === "day" ? "Deň" : v === "week" ? "Týždeň" : "Mesiac"}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo</TableHead>
                  <TableHead className="w-16">Verzia</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Dátum</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Suma s DPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Načítavam…</TableCell></TableRow>}
                {!quotes.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Žiadne kalkulácie.</TableCell></TableRow>}
                {filtered.map((q: any) => (
                  <TableRow key={q.id} className="cursor-pointer" onClick={() => navigate({ to: "/quotes/$id", params: { id: q.id } })}>
                    <TableCell className="font-mono font-medium">{q.quote_number}</TableCell>
                    <TableCell><Badge variant={q.version_number > 1 ? "secondary" : "outline"} className="font-mono">v{q.version_number}</Badge></TableCell>
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