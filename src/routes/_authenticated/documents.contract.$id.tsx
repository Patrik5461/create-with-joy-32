import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Save, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { COMPANY_INFO, DEFAULT_CONTRACT_TERMS, buildClientLines, formatDate, formatEur, type ContractTerms } from "@/lib/document-utils";
import { buildCompanyLines } from "@/lib/document-utils";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/documents/contract/$id")({
  head: () => ({ meta: [{ title: "Zmluva o prenájme · Mima Production CRM" }] }),
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin", "manager");

  const q = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const companyQ = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [terms, setTerms] = useState<ContractTerms | null>(null);
  const [sigCo, setSigCo] = useState<string | null>(null);
  const [sigCl, setSigCl] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState<string>("");

  // Initialize from loaded data
  if (q.data && terms === null) {
    setTerms({ ...DEFAULT_CONTRACT_TERMS, ...(q.data.terms ?? {}) });
    setSigCo(q.data.signature_company ?? null);
    setSigCl(q.data.signature_client ?? null);
    setSignedByName(q.data.signed_by_name ?? "");
  }

  const save = useMutation({
    mutationFn: async (extra: Partial<any> = {}) => {
      const { error } = await supabase.from("contracts").update({
        terms,
        signature_company: sigCo,
        signature_client: sigCl,
        signed_by_name: signedByName || null,
        ...extra,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); toast.success("Uložené"); },
    onError: (e: any) => toast.error(e.message),
  });

  const markSigned = useMutation({
    mutationFn: async () => {
      if (!sigCo || !sigCl) throw new Error("Chýbajú podpisy oboch strán.");
      const { error } = await supabase.from("contracts").update({
        terms, signature_company: sigCo, signature_client: sigCl, signed_by_name: signedByName || null,
        status: "signed", signed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract", id] });
      qc.invalidateQueries({ queryKey: ["res-documents"] });
      toast.success("Zmluva podpísaná");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Zmluva zmazaná"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading || !q.data || !terms) return <><AppHeader title="Zmluva" /><div className="p-6 text-muted-foreground">Načítavam…</div></>;
  const c = q.data;
  const d = c.data ?? {};
  const isSigned = c.status === "signed";

  return (
    <>
      <AppHeader title={`Zmluva ${c.contract_number}`} />
      <div className="p-4 md:p-6 max-w-5xl space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reservations/$id" params={{ id: c.reservation_id }}><ArrowLeft className="size-4 mr-1" />Späť na rezerváciu</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant={isSigned ? "default" : "outline"}>{isSigned ? "Podpísaná" : "Vygenerovaná"}</Badge>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlačiť / PDF</Button>
            {canEdit && !isSigned && (
              <Button size="sm" onClick={() => save.mutate({})} disabled={save.isPending}><Save className="size-4 mr-1" />Uložiť</Button>
            )}
            {canEdit && !isSigned && (
              <Button size="sm" onClick={() => markSigned.mutate()} disabled={markSigned.isPending}><CheckCircle2 className="size-4 mr-1" />Označiť ako podpísanú</Button>
            )}
            {canEdit && (
              <Button variant="ghost" size="sm" aria-label="Zmazať zmluvu" onClick={() => { if (confirm("Naozaj zmazať zmluvu?")) remove.mutate(); }}><Trash2 className="size-4" /></Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Prenajímateľ</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-0.5">
              {(() => {
                const lines = buildCompanyLines(companyQ.data);
                if (!lines.length) return <><div className="font-semibold">{COMPANY_INFO.name}</div><div className="text-muted-foreground">{COMPANY_INFO.email}</div></>;
                return lines.map((l, i) => (
                  <div key={i} className={l.bold ? "font-semibold" : "text-muted-foreground"}>{l.text}</div>
                ));
              })()}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Nájomca</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-0.5">
              {buildClientLines(d.client, null, { email: d.client?.email, phone: d.client?.phone, contactName: d.client?.contact_person }).map((l, i) => (
                <div key={i} className={l.bold ? "font-semibold" : "text-muted-foreground"}>{l.text}</div>
              ))}
              {!d.client?.company_name && <div className="font-semibold">—</div>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Event a termíny</CardTitle></CardHeader>
          <CardContent className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-muted-foreground">Event:</span> {d.event?.event_name}</div>
            <div><span className="text-muted-foreground">Miesto:</span> {d.event?.venue}{d.event?.address ? `, ${d.event.address}` : ""}</div>
            <div><span className="text-muted-foreground">Nakládka:</span> {formatDate(d.event?.load_at)}</div>
            <div><span className="text-muted-foreground">Návrat:</span> {formatDate(d.event?.return_at)}</div>
            <div><span className="text-muted-foreground">Začiatok eventu:</span> {formatDate(d.event?.event_start_at)}</div>
            <div><span className="text-muted-foreground">Koniec eventu:</span> {formatDate(d.event?.event_end_at)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Predmet prenájmu</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b"><tr><th className="py-2">Kód</th><th>Názov</th><th className="text-right">Ks</th></tr></thead>
              <tbody>
                {(d.items ?? []).map((it: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground font-mono text-xs">{it.code ?? "—"}</td>
                    <td>{it.name}</td>
                    <td className="text-right font-medium">{it.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.total_with_vat != null && (
              <div className="flex justify-end mt-3 text-base font-semibold">
                Spolu s DPH: {formatEur(Number(c.total_with_vat))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Zmluvné podmienky</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(DEFAULT_CONTRACT_TERMS) as (keyof ContractTerms)[]).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="capitalize">{TERMS_LABEL[k]}</Label>
                <Textarea
                  rows={3}
                  disabled={!canEdit || isSigned}
                  value={terms[k]}
                  onChange={(e) => setTerms({ ...terms, [k]: e.target.value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Podpisy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 max-w-sm">
              <Label>Meno podpisujúceho za nájomcu</Label>
              <Input value={signedByName} disabled={!canEdit || isSigned} onChange={(e) => setSignedByName(e.target.value)} placeholder="Meno a priezvisko" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <SignaturePad label="Podpis za prenajímateľa" value={sigCo} onChange={setSigCo} disabled={!canEdit || isSigned} />
              <SignaturePad label="Podpis za nájomcu" value={sigCl} onChange={setSigCl} disabled={!canEdit || isSigned} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print-only */}
      <PrintContract c={c} d={d} terms={terms} sigCo={sigCo} sigCl={sigCl} signedByName={signedByName} company={companyQ.data} />
    </>
  );
}

const TERMS_LABEL: Record<keyof ContractTerms, string> = {
  subject: "1. Predmet prenájmu",
  duration: "2. Doba prenájmu",
  price: "3. Cena a platobné podmienky",
  liability: "4. Zodpovednosť za poškodenie / stratu",
  return: "5. Podmienky vrátenia",
};

function PrintContract({ c, d, terms, sigCo, sigCl, signedByName, company }: any) {
  const supplierLines = buildCompanyLines(company);
  return (
    <div className="hidden print:block p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img src="/mima-logo.png" alt="Mima Production" className="h-14 w-auto" />
          <div>
            <div className="text-xl font-bold">{COMPANY_INFO.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">Zmluva o prenájme</div>
          <div className="font-mono">{c.contract_number}</div>
          <div className="text-xs text-gray-600 mt-1">Dátum vystavenia: {formatDate(c.created_at)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Prenajímateľ</div>
          {supplierLines.length ? supplierLines.map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold" : undefined}>{l.text}</div>
          )) : <><div className="font-semibold">{COMPANY_INFO.name}</div><div>{COMPANY_INFO.email}</div></>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Nájomca</div>
          {buildClientLines(d.client, null, { email: d.client?.email, phone: d.client?.phone, contactName: d.client?.contact_person }).map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold" : undefined}>{l.text}</div>
          ))}
          {!d.client?.company_name && <div className="font-semibold">—</div>}
        </div>
      </div>

      <div className="mb-6">
        <div className="font-semibold mb-2">Event: {d.event?.event_name}</div>
        <div>Miesto: {d.event?.venue}{d.event?.address ? `, ${d.event.address}` : ""}</div>
        <div>Nakládka: {formatDate(d.event?.load_at)} · Návrat: {formatDate(d.event?.return_at)}</div>
      </div>

      <table className="w-full border-collapse mb-6">
        <thead><tr className="border-b-2 border-black"><th className="text-left py-2">Kód</th><th className="text-left">Položka</th><th className="text-right w-20">Ks</th></tr></thead>
        <tbody>
          {(d.items ?? []).map((it: any, i: number) => (
            <tr key={i} className="border-b border-gray-300"><td className="py-1 font-mono text-xs">{it.code ?? "—"}</td><td>{it.name}</td><td className="text-right">{it.qty}</td></tr>
          ))}
        </tbody>
      </table>

      {c.total_with_vat != null && (
        <div className="flex justify-end mb-6 text-base font-bold">Celková suma s DPH: {formatEur(Number(c.total_with_vat))}</div>
      )}

      {(Object.keys(DEFAULT_CONTRACT_TERMS) as (keyof ContractTerms)[]).map((k) => (
        <div key={k} className="mb-3">
          <div className="font-semibold">{TERMS_LABEL[k]}</div>
          <p className="whitespace-pre-wrap">{terms[k]}</p>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-12 mt-12">
        <div>
          <div className="border-b border-black h-20 flex items-end justify-center">
            {sigCo && <img src={sigCo} alt="Podpis prenajímateľa" className="max-h-20" />}
          </div>
          <div className="text-xs text-center mt-1">Za prenajímateľa · {COMPANY_INFO.name}</div>
        </div>
        <div>
          <div className="border-b border-black h-20 flex items-end justify-center">
            {sigCl && <img src={sigCl} alt="Podpis nájomcu" className="max-h-20" />}
          </div>
          <div className="text-xs text-center mt-1">Za nájomcu{signedByName ? ` · ${signedByName}` : ""}</div>
        </div>
      </div>
    </div>
  );
}