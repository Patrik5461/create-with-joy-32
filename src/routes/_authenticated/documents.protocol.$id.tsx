import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, Save, Trash2, CheckCircle2, Wrench, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { COMPANY_INFO, formatDate, formatDateTime } from "@/lib/document-utils";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";

export const Route = createFileRoute("/_authenticated/documents/protocol/$id")({
  head: () => ({ meta: [{ title: "Protokol · Mima Production CRM" }] }),
  component: ProtocolDetail,
});

type Cond = "ok" | "damaged" | "missing";

function ProtocolDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin", "manager", "warehouse");

  const q = useQuery({
    queryKey: ["protocol", id],
    queryFn: async () => {
      const [{ data: p, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase.from("protocols").select("*").eq("id", id).single(),
        supabase.from("protocol_items").select("*").eq("protocol_id", id).order("created_at"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { p, items: items ?? [] } as { p: any; items: any[] };
    },
  });

  const [rows, setRows] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [receivedBy, setReceivedBy] = useState<string>("");
  const [issuedAt, setIssuedAt] = useState<string>("");
  const [sigCo, setSigCo] = useState<string | null>(null);
  const [sigCl, setSigCl] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (q.data && rows === null) {
      setRows(q.data.items);
      setNotes(q.data.p.notes ?? "");
      setReceivedBy(q.data.p.received_by_name ?? "");
      setIssuedAt(q.data.p.issued_at ?? new Date().toISOString());
      setSigCo(q.data.p.signature_company ?? null);
      setSigCl(q.data.p.signature_client ?? null);
    }
  }, [q.data, rows]);

  const save = useMutation({
    mutationFn: async (extra: Partial<any> = {}) => {
      const p = q.data!.p;
      const { error } = await supabase.from("protocols").update({
        notes: notes || null, received_by_name: receivedBy || null, issued_at: issuedAt,
        signature_company: sigCo, signature_client: sigCl, ...extra,
      }).eq("id", id);
      if (error) throw error;
      // Persist row changes
      for (const r of rows!) {
        const { error: e2 } = await supabase.from("protocol_items").update({
          qty_actual: r.qty_actual, condition: r.condition, note: r.note || null,
        }).eq("id", r.id);
        if (e2) throw e2;
      }
      void p;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["protocol", id] }); toast.success("Uložené"); },
    onError: (e: any) => toast.error(e.message),
  });

  const markSigned = useMutation({
    mutationFn: async () => {
      if (!sigCo || !sigCl) throw new Error("Chýbajú podpisy oboch strán.");
      await save.mutateAsync({ status: "signed", signed_at: new Date().toISOString() });
    },
    onSuccess: () => toast.success("Protokol podpísaný"),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("protocols").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Protokol zmazaný"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Create a damage report linked to a protocol row
  const createDamage = useMutation({
    mutationFn: async (row: any) => {
      const missing = Math.max(0, Number(row.qty_expected) - Number(row.qty_actual));
      const qty = row.condition === "missing" ? Math.max(1, missing) : Math.max(1, Number(row.qty_actual) || 1);
      const { data, error } = await supabase.from("damaged_items").insert({
        furniture_item_id: row.furniture_item_id,
        qty,
        severity: row.condition === "missing" ? "severe" : "medium",
        description: `${row.condition === "missing" ? "Chýba pri vrátení" : "Poškodené pri vrátení"} — ${row.item_name}${row.note ? ` (${row.note})` : ""}`,
        reservation_id: q.data!.p.reservation_id,
        reported_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("protocol_items").update({ damage_report_id: data.id }).eq("id", row.id);
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["protocol", id] });
      qc.invalidateQueries({ queryKey: ["furniture_items"] });
      toast.success("Záznam v Údržbe vytvorený");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading || !q.data || !rows) return <><AppHeader title="Protokol" /><div className="p-6 text-muted-foreground">Načítavam…</div></>;
  const p = q.data.p;
  const isReturn = p.type === "return";
  const isSigned = p.status === "signed";
  const title = isReturn ? "Preberací protokol" : "Odovzdávací protokol";

  const updateRow = (idx: number, patch: Partial<any>) => {
    setRows((cur) => cur!.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleScanned = (furnitureId: string) => {
    const idx = rows!.findIndex((r) => r.furniture_item_id === furnitureId);
    if (idx < 0) {
      toast.error("Táto položka nie je v zozname protokolu.");
      return;
    }
    const row = rows![idx];
    if (isReturn) {
      const next = Math.min(Number(row.qty_expected), Number(row.qty_actual || 0) + 1);
      updateRow(idx, { qty_actual: next });
      toast.success(`${row.item_name}: vrátené ${next}/${row.qty_expected}`);
    } else {
      const next = Math.min(Number(row.qty_expected), Number(row.qty_actual || 0) + 1);
      updateRow(idx, { qty_actual: next });
      toast.success(`${row.item_name}: naložené ${next}/${row.qty_expected}`);
    }
  };

  return (
    <>
      <AppHeader title={`${title} ${p.protocol_number}`} />
      <div className="p-4 md:p-6 max-w-5xl space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reservations/$id" params={{ id: p.reservation_id }}><ArrowLeft className="size-4 mr-1" />Späť na rezerváciu</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant={isSigned ? "default" : "outline"}>{isSigned ? "Podpísaný" : "Vygenerovaný"}</Badge>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlačiť / PDF</Button>
            {canEdit && !isSigned && (
              <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)}>
                <ScanLine className="size-4 mr-1" />Skenovať
              </Button>
            )}
            {canEdit && !isSigned && (
              <Button size="sm" onClick={() => save.mutate({})} disabled={save.isPending}><Save className="size-4 mr-1" />Uložiť</Button>
            )}
            {canEdit && !isSigned && (
              <Button size="sm" onClick={() => markSigned.mutate()} disabled={markSigned.isPending}><CheckCircle2 className="size-4 mr-1" />Označiť ako podpísaný</Button>
            )}
            {canEdit && (
              <Button variant="ghost" size="sm" aria-label="Zmazať protokol" onClick={() => { if (confirm("Naozaj zmazať protokol?")) remove.mutate(); }}><Trash2 className="size-4" /></Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Údaje</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Klient:</span> {p.data?.client?.company_name ?? "—"}</div>
            <div><span className="text-muted-foreground">Event:</span> {p.data?.event?.event_name ?? "—"}</div>
            <div><span className="text-muted-foreground">Miesto:</span> {p.data?.event?.venue ?? "—"}</div>
            <div><span className="text-muted-foreground">Vydal:</span> {p.issued_by_name ?? "—"}</div>
            <div className="space-y-1.5">
              <Label>{isReturn ? "Dátum a čas vrátenia" : "Dátum a čas výdaja"}</Label>
              <Input type="datetime-local" disabled={!canEdit || isSigned}
                value={issuedAt ? new Date(issuedAt).toISOString().slice(0, 16) : ""}
                onChange={(e) => setIssuedAt(new Date(e.target.value).toISOString())} />
            </div>
            <div className="space-y-1.5">
              <Label>{isReturn ? "Vrátil (meno)" : "Prevzal (meno za klienta)"}</Label>
              <Input disabled={!canEdit || isSigned} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Položky</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Položka</th>
                    <th className="w-20">Očak.</th>
                    <th className="w-24">Skut.</th>
                    <th className="w-36">Stav</th>
                    <th>Poznámka</th>
                    {isReturn && <th className="w-32"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2">
                        <div className="font-medium">{r.item_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.item_code ?? ""}</div>
                      </td>
                      <td className="text-muted-foreground">{r.qty_expected}</td>
                      <td>
                        <Input type="number" min={0} className="h-8 w-20" disabled={!canEdit || isSigned}
                          value={r.qty_actual}
                          onChange={(e) => updateRow(i, { qty_actual: Math.max(0, Number(e.target.value)) })} />
                      </td>
                      <td>
                        <Select value={r.condition} disabled={!canEdit || isSigned}
                          onValueChange={(v: Cond) => updateRow(i, { condition: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ok">OK</SelectItem>
                            <SelectItem value="damaged">Poškodené</SelectItem>
                            <SelectItem value="missing">Chýba</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Input className="h-8" disabled={!canEdit || isSigned} value={r.note ?? ""} onChange={(e) => updateRow(i, { note: e.target.value })} placeholder="—" />
                      </td>
                      {isReturn && (
                        <td>
                          {r.condition !== "ok" && !r.damage_report_id && canEdit && r.furniture_item_id && (
                            <Button size="sm" variant="outline" onClick={() => createDamage.mutate(r)} disabled={createDamage.isPending}>
                              <Wrench className="size-3.5 mr-1" /> Údržba
                            </Button>
                          )}
                          {r.damage_report_id && <Badge variant="secondary" className="text-xs">V Údržbe</Badge>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Poznámka k protokolu</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={3} disabled={!canEdit || isSigned} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Podpisy</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <SignaturePad label="Za Mima Production" value={sigCo} onChange={setSigCo} disabled={!canEdit || isSigned} />
            <SignaturePad label={isReturn ? "Za klienta (odovzdal)" : "Za klienta (prevzal)"} value={sigCl} onChange={setSigCl} disabled={!canEdit || isSigned} />
          </CardContent>
        </Card>
      </div>

      <PrintProtocol p={p} rows={rows} notes={notes} receivedBy={receivedBy} issuedAt={issuedAt} sigCo={sigCo} sigCl={sigCl} title={title} />

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title={isReturn ? "Skenovať vrátené položky" : "Skenovať nakládané položky"}
        description="Naskenujte QR kód položky — počet sa automaticky pripočíta. Skener zostáva otvorený, môžete pokračovať ďalším skenom."
        onDetected={(fid) => {
          handleScanned(fid);
          // Re-open scanner immediately for continuous scanning
          setScannerOpen(false);
          setTimeout(() => setScannerOpen(true), 350);
        }}
      />
    </>
  );
}

function PrintProtocol({ p, rows, notes, receivedBy, issuedAt, sigCo, sigCl, title }: any) {
  const d = p.data ?? {};
  return (
    <div className="hidden print:block p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img src="/mima-logo.png" alt="Mima Production" className="h-14 w-auto" />
          <div>
            <div className="text-xl font-bold">{COMPANY_INFO.name}</div>
            <div className="text-xs text-gray-600">{COMPANY_INFO.tagline}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{title}</div>
          <div className="font-mono">{p.protocol_number}</div>
          <div className="text-xs text-gray-600 mt-1">{formatDateTime(issuedAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Klient</div>
          <div className="font-semibold">{d.client?.company_name ?? "—"}</div>
          {d.client?.address && <div>{d.client.address}</div>}
          {receivedBy && <div>Prevzal/Vrátil: {receivedBy}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Event</div>
          <div className="font-semibold">{d.event?.event_name}</div>
          <div>{d.event?.venue}{d.event?.address ? `, ${d.event.address}` : ""}</div>
          <div>Nakládka: {formatDate(d.event?.load_at)} · Návrat: {formatDate(d.event?.return_at)}</div>
          <div>Vydal: {p.issued_by_name ?? "—"}</div>
        </div>
      </div>

      <table className="w-full border-collapse mb-6">
        <thead><tr className="border-b-2 border-black">
          <th className="text-left py-2">Kód</th><th className="text-left">Položka</th>
          <th className="text-right w-16">Očak.</th><th className="text-right w-16">Skut.</th>
          <th className="text-left w-28">Stav</th><th className="text-left">Poznámka</th>
        </tr></thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b border-gray-300">
              <td className="py-1 font-mono text-xs">{r.item_code ?? "—"}</td>
              <td>{r.item_name}</td>
              <td className="text-right">{r.qty_expected}</td>
              <td className="text-right">{r.qty_actual}</td>
              <td>{r.condition === "ok" ? "OK" : r.condition === "damaged" ? "Poškodené" : "Chýba"}</td>
              <td>{r.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {notes && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Poznámka</div>
          <div className="whitespace-pre-wrap">{notes}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-12 mt-12">
        <div>
          <div className="border-b border-black h-20 flex items-end justify-center">{sigCo && <img src={sigCo} alt="Podpis za Mima Production" className="max-h-20" />}</div>
          <div className="text-xs text-center mt-1">Za {COMPANY_INFO.name}{p.issued_by_name ? ` · ${p.issued_by_name}` : ""}</div>
        </div>
        <div>
          <div className="border-b border-black h-20 flex items-end justify-center">{sigCl && <img src={sigCl} alt="Podpis klienta" className="max-h-20" />}</div>
          <div className="text-xs text-center mt-1">Za klienta{receivedBy ? ` · ${receivedBy}` : ""}</div>
        </div>
      </div>
    </div>
  );
}