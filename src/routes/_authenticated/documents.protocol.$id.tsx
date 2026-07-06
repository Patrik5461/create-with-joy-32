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
import { ArrowLeft, Printer, Save, Trash2, CheckCircle2, Wrench, ScanLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { COMPANY_INFO, buildClientLines, formatDate, formatDateTime } from "@/lib/document-utils";
import { buildCompanyLines } from "@/lib/document-utils";
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

  const companyQ = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
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

  const syncItems = useMutation({
    mutationFn: async () => {
      const p = q.data!.p;
      // Source of truth: for handover -> reservation_items; for return -> latest handover items if any, else reservation_items
      type SrcItem = { furniture_item_id: string | null; name: string; code: string | null; qty: number };
      let source: SrcItem[] = [];
      if (p.type === "return" && p.related_handover_id) {
        const { data: hoItems, error: eHo } = await supabase
          .from("protocol_items")
          .select("furniture_item_id, item_name, item_code, qty_actual, qty_expected")
          .eq("protocol_id", p.related_handover_id);
        if (eHo) throw eHo;
        source = (hoItems ?? []).map((it: any) => ({
          furniture_item_id: it.furniture_item_id,
          name: it.item_name,
          code: it.item_code,
          qty: Number(it.qty_actual) || Number(it.qty_expected) || 0,
        }));
      } else {
        const { data: ri, error: eRi } = await supabase
          .from("reservation_items")
          .select("qty, furniture_item_id, furniture_items(name, internal_code)")
          .eq("reservation_id", p.reservation_id);
        if (eRi) throw eRi;
        source = (ri ?? []).map((r: any) => ({
          furniture_item_id: r.furniture_item_id,
          name: r.furniture_items?.name ?? "—",
          code: r.furniture_items?.internal_code ?? null,
          qty: Number(r.qty) || 0,
        }));
      }

      const existing = rows!;
      const byFid = new Map<string, any>();
      for (const r of existing) if (r.furniture_item_id) byFid.set(r.furniture_item_id, r);

      // 1. Update qty_expected for existing rows; collect new inserts
      const toInsert: any[] = [];
      const seen = new Set<string>();
      for (const s of source) {
        if (s.furniture_item_id && byFid.has(s.furniture_item_id)) {
          seen.add(s.furniture_item_id);
          const cur = byFid.get(s.furniture_item_id);
          if (Number(cur.qty_expected) !== s.qty) {
            const { error } = await supabase
              .from("protocol_items")
              .update({ qty_expected: s.qty })
              .eq("id", cur.id);
            if (error) throw error;
          }
        } else {
          toInsert.push({
            protocol_id: id,
            furniture_item_id: s.furniture_item_id,
            item_name: s.name,
            item_code: s.code,
            qty_expected: s.qty,
            qty_actual: 0,
            condition: "ok" as const,
          });
        }
      }
      if (toInsert.length) {
        const { error } = await supabase.from("protocol_items").insert(toInsert);
        if (error) throw error;
      }

      // 2. Delete rows no longer in source, but ONLY if untouched
      let keptStale = 0;
      for (const r of existing) {
        if (!r.furniture_item_id) continue;
        if (seen.has(r.furniture_item_id)) continue;
        const untouched =
          Number(r.qty_actual) === 0 &&
          (!r.note || r.note === "") &&
          r.condition === "ok" &&
          !r.damage_report_id;
        if (untouched) {
          const { error } = await supabase.from("protocol_items").delete().eq("id", r.id);
          if (error) throw error;
        } else {
          keptStale += 1;
        }
      }
      return { inserted: toInsert.length, keptStale };
    },
    onSuccess: (res) => {
      setRows(null); // force reload from query
      qc.invalidateQueries({ queryKey: ["protocol", id] });
      const parts = [`Pridané: ${res.inserted}`];
      if (res.keptStale > 0) parts.push(`ponechané ručne upravené: ${res.keptStale}`);
      toast.success(`Položky zosynchronizované (${parts.join(", ")})`);
    },
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
              <Button variant="outline" size="sm" onClick={() => {
                if (confirm("Zosynchronizovať položky protokolu s aktuálnou rezerváciou? Ručne upravené položky (počty, poznámky, stavy) zostanú zachované.")) {
                  syncItems.mutate();
                }
              }} disabled={syncItems.isPending}>
                <RefreshCw className={`size-4 mr-1 ${syncItems.isPending ? "animate-spin" : ""}`} />Aktualizovať podľa rezervácie
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
                    <th className="w-44">Priebeh</th>
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
                        <ScanProgress actual={Number(r.qty_actual) || 0} expected={Number(r.qty_expected) || 0} />
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
            <ScanSummary rows={rows} isReturn={isReturn} />
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

      <PrintProtocol p={p} rows={rows} notes={notes} receivedBy={receivedBy} issuedAt={issuedAt} sigCo={sigCo} sigCl={sigCl} title={title} company={companyQ.data} />

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

function PrintProtocol({ p, rows, notes, receivedBy, issuedAt, sigCo, sigCl, title, company }: any) {
  const d = p.data ?? {};
  void d;
  return _PrintProtocolImpl({ p, rows, notes, receivedBy, issuedAt, sigCo, sigCl, title, company });
}

function ScanProgress({ actual, expected }: { actual: number; expected: number }) {
  const pct = expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 0;
  const tone =
    expected === 0
      ? "bg-muted-foreground"
      : actual === expected
      ? "bg-emerald-500"
      : actual > expected
      ? "bg-red-500"
      : actual === 0
      ? "bg-muted-foreground/60"
      : "bg-amber-500";
  const textTone =
    actual === expected ? "text-emerald-700"
    : actual > expected ? "text-red-700"
    : actual === 0 ? "text-muted-foreground"
    : "text-amber-700";
  return (
    <div className="space-y-1">
      <div className={`text-xs font-medium ${textTone}`}>{actual} / {expected} ks</div>
      <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScanSummary({ rows, isReturn }: { rows: any[]; isReturn: boolean }) {
  const incomplete = rows.filter((r) => Number(r.qty_actual) < Number(r.qty_expected));
  const over = rows.filter((r) => Number(r.qty_actual) > Number(r.qty_expected));
  const done = rows.length - incomplete.length - over.length;
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 border-t pt-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Kompletné: {done}</Badge>
        {incomplete.length > 0 && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Chýba: {incomplete.length}</Badge>
        )}
        {over.length > 0 && (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Prebytok: {over.length}</Badge>
        )}
      </div>
      {incomplete.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {isReturn ? "Nevrátené" : "Nenaložené"} kusy:
          <ul className="list-disc ml-5 mt-1">
            {incomplete.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-foreground">{r.item_name}</span>: chýba {Number(r.qty_expected) - Number(r.qty_actual)} ks ({r.qty_actual}/{r.qty_expected})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function _PrintProtocolImpl({ p, rows, notes, receivedBy, issuedAt, sigCo, sigCl, title, company }: any) {
  const d = p.data ?? {};
  const supplierLines = buildCompanyLines(company);
  return (
    <div className="hidden print:block p-10 text-sm text-black bg-white">
      <div className="flex items-start justify-between border-b pb-4 mb-6">
        <div>
          <img src="/mima-logo.png" alt="mima production" className="h-16 w-auto" />
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{title}</div>
          <div className="font-mono">{p.protocol_number}</div>
          <div className="text-xs text-gray-600 mt-1">{formatDateTime(issuedAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Dodávateľ</div>
          {supplierLines.length ? supplierLines.map((l: any, i: number) => (
            <div key={i} className={l.bold ? "font-semibold" : undefined}>{l.text}</div>
          )) : <div className="font-semibold">{COMPANY_INFO.name}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Event</div>
          <div className="font-semibold">{d.event?.event_name}</div>
          <div>{d.event?.venue}{d.event?.address ? `, ${d.event.address}` : ""}</div>
          <div>Nakládka: {formatDate(d.event?.load_at)} · Návrat: {formatDate(d.event?.return_at)}</div>
          <div>Vydal: {p.issued_by_name ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Klient</div>
          {buildClientLines(d.client, null, { email: d.client?.email, phone: d.client?.phone, contactName: d.client?.contact_person }).map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold" : undefined}>{l.text}</div>
          ))}
          {!d.client?.company_name && <div className="font-semibold">—</div>}
          {receivedBy && <div>Prevzal/Vrátil: {receivedBy}</div>}
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