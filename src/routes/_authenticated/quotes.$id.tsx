import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, Copy, Trash2, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { QuoteForm } from "@/components/quote-form";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatEur, lineTotal, type QuoteLine } from "@/lib/quote-utils";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  head: () => ({ meta: [{ title: "Kalkulácia · Mima Production CRM" }] }),
  component: QuoteDetail,
});

function QuoteDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const quote = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, clients(*), reservations(event_name, venue), quote_items(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Kalkulácia zmazaná");
      navigate({ to: "/quotes" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!quote.data) throw new Error("Nedostupné");
      const q = quote.data as any;
      const { data: ins, error } = await supabase.from("quotes").insert({
        quote_number: "",
        client_id: q.client_id,
        reservation_id: null,
        status: "draft",
        issue_date: new Date().toISOString().slice(0, 10),
        valid_until: q.valid_until,
        vat_rate: q.vat_rate,
        discount_type: q.discount_type,
        discount_value: q.discount_value,
        surcharge_type: q.surcharge_type,
        surcharge_value: q.surcharge_value,
        surcharge_label: q.surcharge_label,
        notes: q.notes,
        subtotal: q.subtotal,
        total_without_vat: q.total_without_vat,
        vat_amount: q.vat_amount,
        total_with_vat: q.total_with_vat,
      }).select("id").single();
      if (error) throw error;
      const rows = (q.quote_items ?? []).map((it: any, idx: number) => ({
        quote_id: ins.id,
        kind: it.kind,
        furniture_item_id: it.furniture_item_id,
        name: it.name,
        qty: it.qty,
        price_mode: it.price_mode,
        unit_price: it.unit_price,
        days: it.days,
        line_total: it.line_total,
        sort_order: idx,
      }));
      if (rows.length) await supabase.from("quote_items").insert(rows);
      return ins.id;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Kalkulácia duplikovaná");
      navigate({ to: "/quotes/$id", params: { id: newId } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendEmail = () => {
    if (!quote.data) return;
    const q = quote.data as any;
    const to = q.clients?.email ?? "";
    const subject = `Cenová ponuka ${q.quote_number}`;
    const body = `Dobrý deň,\n\nzasielame Vám cenovú ponuku č. ${q.quote_number} v celkovej sume ${formatEur(Number(q.total_with_vat))} (s DPH).\n\nS pozdravom,\nMima Production`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    supabase.from("quotes").update({ status: "sent" }).eq("id", id).then(() => qc.invalidateQueries({ queryKey: ["quote", id] }));
  };

  if (quote.isLoading) return <><AppHeader title="Kalkulácia" /><div className="p-6 text-muted-foreground">Načítavam…</div></>;
  if (!quote.data) return <><AppHeader title="Kalkulácia" /><div className="p-6">Nenájdené.</div></>;

  const q = quote.data as any;

  if (editing) {
    const items: QuoteLine[] = (q.quote_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((it: any) => ({
      id: it.id,
      kind: it.kind,
      furniture_item_id: it.furniture_item_id,
      name: it.name,
      qty: Number(it.qty),
      price_mode: it.price_mode,
      unit_price: Number(it.unit_price),
      days: Number(it.days),
    }));
    return (
      <>
        <AppHeader title={`Upraviť ${q.quote_number}`} />
        <div className="p-4 md:p-6 max-w-5xl">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="mb-3">Zrušiť úpravu</Button>
          <QuoteForm quoteId={id} initial={{ ...q, items }} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader title={`Kalkulácia ${q.quote_number}`} />
      <div className="p-4 md:p-6 max-w-5xl space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{q.quote_number}</h2>
            <Badge variant={QUOTE_STATUS_VARIANT[q.status as keyof typeof QUOTE_STATUS_VARIANT]}>{QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlačiť / PDF</Button>
            <Button variant="outline" onClick={sendEmail}><Mail className="size-4 mr-1" />Odoslať emailom</Button>
            <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
              {duplicate.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Copy className="size-4 mr-1" />}
              Duplikovať
            </Button>
            <Button onClick={() => setEditing(true)}>Upraviť</Button>
            <Button variant="destructive" onClick={() => { if (confirm("Naozaj zmazať túto kalkuláciu?")) remove.mutate(); }}>
              <Trash2 className="size-4 mr-1" />Zmazať
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Klient</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="font-semibold">{q.clients?.company_name ?? "—"}</div>
              {q.clients?.ico && <div className="text-muted-foreground">IČO: {q.clients.ico}</div>}
              {q.clients?.contact_person && <div>{q.clients.contact_person}</div>}
              {q.clients?.email && <div className="text-muted-foreground">{q.clients.email}</div>}
              {q.clients?.phone && <div className="text-muted-foreground">{q.clients.phone}</div>}
              {q.clients?.address && <div className="text-muted-foreground">{q.clients.address}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Detaily</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Dátum vystavenia:</span> {new Date(q.issue_date).toLocaleDateString("sk-SK")}</div>
              {q.valid_until && <div><span className="text-muted-foreground">Platnosť do:</span> {new Date(q.valid_until).toLocaleDateString("sk-SK")}</div>}
              {q.reservations && <div><span className="text-muted-foreground">Rezervácia:</span> {q.reservations.event_name}</div>}
              <div><span className="text-muted-foreground">DPH:</span> {q.vat_rate}%</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Položky</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Názov</th><th>Ks</th><th>Typ</th><th>Dní</th><th className="text-right">Cena/ks</th><th className="text-right">Spolu</th></tr>
              </thead>
              <tbody>
                {(q.quote_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((it: any) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2">{it.name} {it.kind === "service" && <span className="text-xs text-muted-foreground">(služba)</span>}</td>
                    <td>{it.qty}</td>
                    <td className="text-xs text-muted-foreground">{it.price_mode === "per_day" ? "denná" : it.price_mode === "fixed" ? "fixná" : "—"}</td>
                    <td>{it.price_mode === "per_day" ? it.days : "—"}</td>
                    <td className="text-right">{formatEur(Number(it.unit_price))}</td>
                    <td className="text-right font-medium">{formatEur(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1 text-sm">
            <Row label="Medzisúčet" value={formatEur(Number(q.subtotal))} />
            <Row label="Spolu bez DPH" value={formatEur(Number(q.total_without_vat))} bold />
            <Row label={`DPH ${q.vat_rate}%`} value={formatEur(Number(q.vat_amount))} />
            <div className="border-t pt-2 mt-2">
              <Row label="Spolu s DPH" value={formatEur(Number(q.total_with_vat))} bold big />
            </div>
          </CardContent>
        </Card>

        {q.notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Poznámka</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{q.notes}</CardContent>
          </Card>
        )}
      </div>

      {/* Print-only view */}
      <PrintView quote={q} />
    </>
  );
}

function Row({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "text-lg" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

function PrintView({ quote: q }: { quote: any }) {
  return (
    <div className="hidden print:block p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img src="/mima-logo.png" alt="Mima Production" className="h-14 w-auto" />
          <div>
            <div className="text-xl font-bold">Mima Production</div>
            <div className="text-xs text-gray-600">Eventový nábytok a logistika</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">Cenová ponuka</div>
          <div className="font-mono text-lg">{q.quote_number}</div>
          <div className="text-xs text-gray-600 mt-1">Dátum: {new Date(q.issue_date).toLocaleDateString("sk-SK")}</div>
          {q.valid_until && <div className="text-xs text-gray-600">Platnosť do: {new Date(q.valid_until).toLocaleDateString("sk-SK")}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Dodávateľ</div>
          <div className="font-semibold">Mima Production</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Odberateľ</div>
          <div className="font-semibold">{q.clients?.company_name ?? "—"}</div>
          {q.clients?.ico && <div>IČO: {q.clients.ico}</div>}
          {q.clients?.contact_person && <div>{q.clients.contact_person}</div>}
          {q.clients?.address && <div>{q.clients.address}</div>}
          {q.clients?.email && <div>{q.clients.email}</div>}
          {q.clients?.phone && <div>{q.clients.phone}</div>}
        </div>
      </div>

      <table className="w-full border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2">Názov</th>
            <th className="text-right py-2 w-16">Ks</th>
            <th className="text-right py-2 w-16">Dní</th>
            <th className="text-right py-2 w-28">Cena/ks</th>
            <th className="text-right py-2 w-28">Spolu</th>
          </tr>
        </thead>
        <tbody>
          {(q.quote_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((it: any) => (
            <tr key={it.id} className="border-b border-gray-300">
              <td className="py-2">{it.name}</td>
              <td className="text-right">{Number(it.qty)}</td>
              <td className="text-right">{it.price_mode === "per_day" ? it.days : "—"}</td>
              <td className="text-right">{formatEur(Number(it.unit_price))}</td>
              <td className="text-right font-medium">{formatEur(Number(it.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-72 space-y-1">
          <div className="flex justify-between"><span>Medzisúčet</span><span>{formatEur(Number(q.subtotal))}</span></div>
          {Number(q.subtotal) !== Number(q.total_without_vat) && (
            <div className="flex justify-between"><span>Po úpravách</span><span>{formatEur(Number(q.total_without_vat))}</span></div>
          )}
          <div className="flex justify-between"><span>DPH {q.vat_rate}%</span><span>{formatEur(Number(q.vat_amount))}</span></div>
          <div className="flex justify-between border-t-2 border-black pt-2 text-lg font-bold">
            <span>Spolu s DPH</span><span>{formatEur(Number(q.total_with_vat))}</span>
          </div>
        </div>
      </div>

      {q.notes && (
        <div className="mt-8 pt-4 border-t">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Poznámka</div>
          <div className="whitespace-pre-wrap">{q.notes}</div>
        </div>
      )}

      <div className="mt-12 text-xs text-gray-500 text-center">
        Cenová ponuka {q.quote_number} · Mima Production
      </div>
    </div>
  );
}