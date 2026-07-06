import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, Copy, Trash2, Mail, Loader2, History } from "lucide-react";
import { CalendarPlus, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { QuoteForm } from "@/components/quote-form";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT, formatEur, lineTotal, type QuoteLine } from "@/lib/quote-utils";
import { computeItemsDiff, createReservationFromQuote, syncReservationFromQuote, type DiffRow } from "@/lib/quote-reservation-link";
import { useServerFn } from "@tanstack/react-start";
import { sendQuoteEmail } from "@/lib/email.functions";
import { buildQuotePdfBase64 } from "@/lib/quote-pdf";
import { buildClientLines } from "@/lib/document-utils";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  head: () => ({ meta: [{ title: "Kalkulácia · Mima Production CRM" }] }),
  component: QuoteDetail,
});

function QuoteDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const sendQuoteFn = useServerFn(sendQuoteEmail);

  const quote = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, clients(*), client_contacts(id, full_name, role, phone, email), reservations(event_name, venue), quote_items(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      let creator: { full_name: string | null; email: string | null } | null = null;
      if ((data as any).created_by) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", (data as any).created_by)
          .maybeSingle();
        creator = (p as any) ?? null;
      }
      return { ...(data as any), creator };
    },
  });

  const versions = useQuery({
    queryKey: ["quote-versions", (quote.data as any)?.quote_group_id],
    enabled: !!(quote.data as any)?.quote_group_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, version_number, is_current, created_at, created_by")
        .eq("quote_group_id", (quote.data as any).quote_group_id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((v: any) => v.created_by).filter(Boolean)));
      const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        for (const p of (profs ?? []) as any[]) profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
      return (data ?? []).map((v: any) => ({ ...v, creator: v.created_by ? profileMap.get(v.created_by) ?? null : null }));
    },
  });

  // Reservation linked to this quote-group (obojsmerná väzba cez quote_group_id).
  const linkedReservation = useQuery({
    queryKey: ["quote-linked-reservation", (quote.data as any)?.quote_group_id],
    enabled: !!(quote.data as any)?.quote_group_id,
    queryFn: async () => {
      const gid = (quote.data as any).quote_group_id as string;
      const { data, error } = await supabase
        .from("reservations")
        .select("id, event_name, status, load_at, available_from_at, reservation_items(id, qty, furniture_item_id, furniture_items(name))")
        .eq("quote_group_id", gid)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const createRes = useMutation({
    mutationFn: async () => createReservationFromQuote((quote.data as any).id),
    onSuccess: (rid) => {
      qc.invalidateQueries({ queryKey: ["quote-linked-reservation"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Rezervácia vytvorená z kalkulácie");
      navigate({ to: "/reservations/$id", params: { id: rid } });
    },
    onError: (e: any) => toast.error(e.message ?? "Nepodarilo sa vytvoriť rezerváciu"),
  });

  const syncRes = useMutation({
    mutationFn: async () => {
      const r = linkedReservation.data;
      if (!r) throw new Error("Nie je prepojená rezervácia.");
      await syncReservationFromQuote(r.id, (quote.data as any).id);
      return r.id;
    },
    onSuccess: (rid) => {
      qc.invalidateQueries({ queryKey: ["quote-linked-reservation"] });
      qc.invalidateQueries({ queryKey: ["reservation", rid] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Rezervácia zosúladená s aktuálnou verziou kalkulácie");
      setSyncOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Zosúladenie zlyhalo"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("quotes")
        .update({ deleted_at: new Date().toISOString(), deleted_by: userData?.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;

      // Ak sme zmazali aktuálnu verziu, povýš najvyššiu zostávajúcu verziu skupiny na aktuálnu,
      // aby sa kalkulácia nestratila zo zoznamu (zoznam filtruje is_current=true).
      const q = quote.data as any;
      if (q?.is_current && q?.quote_group_id) {
        const { data: remaining } = await supabase
          .from("quotes")
          .select("id, version_number")
          .eq("quote_group_id", q.quote_group_id)
          .is("deleted_at", null)
          .order("version_number", { ascending: false })
          .limit(1);
        const next = (remaining ?? [])[0];
        if (next) {
          await supabase.from("quotes").update({ is_current: true }).eq("id", next.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes-trash"] });
      qc.invalidateQueries({ queryKey: ["quote-versions"] });
      const q = quote.data as any;
      const others = (versions.data ?? []).filter((v: any) => v.id !== q.id);
      toast.success(
        others.length > 0 ? `Verzia v${q.version_number} presunutá do koša` : "Kalkulácia presunutá do koša",
        { description: "Nájdeš ju v Kalkulácie → Kôš a môžeš ju obnoviť." },
      );
      if (others.length > 0) {
        // Prejdi na najnovšiu zostávajúcu verziu.
        const next = [...others].sort((a: any, b: any) => b.version_number - a.version_number)[0];
        navigate({ to: "/quotes/$id", params: { id: next.id } });
      } else {
        navigate({ to: "/quotes" });
      }
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
        contact_id: q.contact_id,
        reservation_id: null,
        status: "draft",
        issue_date: new Date().toISOString().slice(0, 10),
        valid_until: q.valid_until,
        event_start_at: q.event_start_at,
        event_end_at: q.event_end_at,
        event_date: q.event_date,
        installation_date: q.installation_date,
        dismantling_date: q.dismantling_date,
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
        version_number: 1,
        is_current: true,
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

  const sendEmail = async () => {
    if (!quote.data) return;
    const q = quote.data as any;
    const to = q.client_contacts?.email ?? q.clients?.email ?? "";
    if (!to) return toast.error("Klient nemá email");
    setSendingEmail(true);
    try {
      const { base64, filename } = buildQuotePdfBase64(q);
      await sendQuoteFn({
        data: {
          quoteId: q.id,
          to,
          pdfBase64: base64,
          pdfFilename: filename,
        },
      });
      toast.success(`Ponuka odoslaná na ${to}`);
      qc.invalidateQueries({ queryKey: ["quote", id] });
    } catch (err: any) {
      toast.error(err.message ?? "Odoslanie zlyhalo");
    } finally {
      setSendingEmail(false);
    }
  };

  if (quote.isLoading) return <><AppHeader title="Kalkulácia" /><div className="p-6 text-muted-foreground">Načítavam…</div></>;
  if (!quote.data) return <><AppHeader title="Kalkulácia" /><div className="p-6">Nenájdené.</div></>;

  const q = quote.data as any;
  const maxVersion = Math.max(q.version_number ?? 1, ...(versions.data?.map((v) => v.version_number) ?? [1]));
  const nextVersion = maxVersion + 1;

  const res = linkedReservation.data as any | null;
  const diffs: DiffRow[] = res && q.is_current
    ? computeItemsDiff(
        (q.quote_items ?? []).map((it: any) => ({
          furniture_item_id: it.furniture_item_id,
          name: it.name,
          qty: Number(it.qty),
          kind: it.kind,
        })),
        (res.reservation_items ?? []) as any,
      )
    : [];
  const isMismatched = diffs.length > 0;

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
        <AppHeader title={`Upraviť ${q.quote_number} → v${nextVersion}`} />
        <div className="p-4 md:p-6 max-w-5xl">
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Zrušiť úpravu</Button>
            <div className="text-xs text-muted-foreground">
              Úpravou sa vytvorí nová verzia <span className="font-semibold">v{nextVersion}</span>; verzia v{q.version_number} zostane zachovaná.
            </div>
          </div>
          <QuoteForm
            initial={{ ...q, items }}
            versionParent={{
              quote_group_id: q.quote_group_id,
              quote_number: q.quote_number,
              next_version: nextVersion,
              prev_id: q.id,
            }}
          />
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
            <Badge variant={q.is_current ? "default" : "outline"} className="font-mono">
              v{q.version_number}{q.is_current ? " · aktuálna" : " · staršia"}
            </Badge>
            <Badge variant={QUOTE_STATUS_VARIANT[q.status as keyof typeof QUOTE_STATUS_VARIANT]}>{QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}</Badge>
            {res && (
              isMismatched ? (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                  <AlertTriangle className="size-3 mr-1" />Nezosúladené s rezerváciou
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-400 bg-emerald-50 text-emerald-800">
                  Zosúladené s rezerváciou
                </Badge>
              )
            )}
            {versions.data && versions.data.length > 1 && (
              <div className="flex items-center gap-1.5">
                <History className="size-3.5 text-muted-foreground" />
                <Select
                  value={q.id}
                  onValueChange={(vid) => { if (vid !== q.id) navigate({ to: "/quotes/$id", params: { id: vid } }); }}
                >
                  <SelectTrigger className="h-8 w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
              {versions.data.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        v{v.version_number}{v.is_current ? " · aktuálna" : ""} — {new Date(v.created_at).toLocaleString("sk-SK")}
                  {v.creator?.full_name ? ` · ${v.creator.full_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlačiť / PDF</Button>
            <Button variant="outline" onClick={sendEmail} disabled={sendingEmail}>
              {sendingEmail ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Mail className="size-4 mr-1" />}
              Odoslať emailom
            </Button>
            {res ? (
              <>
                <Button variant="outline" onClick={() => navigate({ to: "/reservations/$id", params: { id: res.id } })}>
                  <ExternalLink className="size-4 mr-1" />Zobraziť rezerváciu
                </Button>
                {q.is_current && isMismatched && (
                  <Button variant="outline" onClick={() => setSyncOpen(true)}>
                    <RefreshCw className="size-4 mr-1" />Zosúladiť rezerváciu
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant={q.status === "approved" ? "default" : "outline"}
                onClick={() => {
                  if (q.status !== "approved") {
                    const ok = window.confirm(
                      'Kalkulácia ešte nie je v stave „Schválená". Naozaj chcete vytvoriť rezerváciu?',
                    );
                    if (!ok) return;
                  }
                  createRes.mutate();
                }}
                disabled={createRes.isPending || !q.is_current}
                title={!q.is_current ? "Rezerváciu možno vytvoriť len z aktuálnej verzie" : undefined}
              >
                {createRes.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CalendarPlus className="size-4 mr-1" />}
                Vytvoriť rezerváciu
              </Button>
            )}
            <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
              {duplicate.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Copy className="size-4 mr-1" />}
              Duplikovať
            </Button>
            <Button onClick={() => setEditing(true)} disabled={!q.is_current} title={!q.is_current ? "Upraviť je možné len aktuálnu verziu" : undefined}>
              Upraviť → v{nextVersion}
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="size-4 mr-1" />Zmazať</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Zmazať verziu v{q.version_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {(versions.data?.length ?? 1) > 1 ? (
                      <>
                        Zmaže sa <span className="font-semibold">iba verzia v{q.version_number}</span> — ostatné verzie kalkulácie <span className="font-mono">{q.quote_number}</span> zostanú zachované.
                        {q.is_current && " Najnovšia zostávajúca verzia sa stane aktuálnou."}
                        {" "}Verziu nájdeš v Kalkulácie → Kôš a môžeš ju obnoviť.
                      </>
                    ) : (
                      <>Kalkulácia bude presunutá do koša. Môžeš ju neskôr obnoviť cez Kalkulácie → Kôš.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Zrušiť</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => remove.mutate()}
                  >
                    {(versions.data?.length ?? 1) > 1 ? `Zmazať v${q.version_number}` : "Zmazať"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {res && (
          <div className={`rounded-md border p-3 text-sm ${isMismatched ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
            Prepojená rezervácia:{" "}
            <button className="font-semibold underline" onClick={() => navigate({ to: "/reservations/$id", params: { id: res.id } })}>
              {res.event_name}
            </button>
            {isMismatched && q.is_current && (
              <>
                {" · "}
                <button className="underline font-medium" onClick={() => setSyncOpen(true)}>Zosúladiť podľa v{q.version_number}</button>
              </>
            )}
          </div>
        )}

        {!q.is_current && (
          <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
            Prezeráte staršiu verziu <span className="font-semibold">v{q.version_number}</span> (len na čítanie).
            Kliknutím na dropdown verzií prejdite na aktuálnu.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Klient</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {buildClientLines(q.clients, q.client_contacts).map((l, i) => (
                <div key={i} className={l.bold ? "font-semibold" : "text-muted-foreground"}>{l.text}</div>
              ))}
              {!q.clients?.company_name && <div className="font-semibold">—</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Detaily</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Dátum vystavenia:</span> {new Date(q.issue_date).toLocaleDateString("sk-SK")}</div>
              {q.valid_until && <div><span className="text-muted-foreground">Platnosť do:</span> {new Date(q.valid_until).toLocaleDateString("sk-SK")}</div>}
              {q.event_start_at && <div><span className="text-muted-foreground">Začiatok eventu:</span> {new Date(q.event_start_at).toLocaleString("sk-SK")}</div>}
              {q.event_end_at && <div><span className="text-muted-foreground">Koniec eventu:</span> {new Date(q.event_end_at).toLocaleString("sk-SK")}</div>}
              {q.installation_date && <div><span className="text-muted-foreground">Dátum inštalácie:</span> {new Date(q.installation_date).toLocaleDateString("sk-SK")}</div>}
              {q.event_date && <div><span className="text-muted-foreground">Dátum eventu:</span> {new Date(q.event_date).toLocaleDateString("sk-SK")}</div>}
              {q.dismantling_date && <div><span className="text-muted-foreground">Dátum demontáže:</span> {new Date(q.dismantling_date).toLocaleDateString("sk-SK")}</div>}
              {q.reservations && <div><span className="text-muted-foreground">Rezervácia:</span> {q.reservations.event_name}</div>}
              <div><span className="text-muted-foreground">DPH:</span> {q.vat_rate}%</div>
              <div><span className="text-muted-foreground">Verzia:</span> v{q.version_number} · vytvorená {new Date(q.created_at).toLocaleString("sk-SK")}{q.creator?.full_name ? ` · ${q.creator.full_name}` : ""}</div>
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
            {renderBreakdown(q)}
            <Row label={`DPH ${q.vat_rate}%`} value={formatEur(Number(q.vat_amount))} />
            <div className="border-t pt-2 mt-2">
              <Row label="Spolu s DPH" value={formatEur(Number(q.total_with_vat))} bold big />
            </div>
            <p className="text-xs text-muted-foreground pt-1">Zľava sa vzťahuje výhradne na nábytok; služby a doprava sa nezľavňujú.</p>
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

      <AlertDialog open={syncOpen} onOpenChange={setSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktualizovať rezerváciu podľa aktuálnej verzie kalkulácie?</AlertDialogTitle>
            <AlertDialogDescription>
              Kalkulácia sa zmenila oproti prepojenej rezervácii. Skontrolujte zmeny nižšie a potvrďte aktualizáciu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            {diffs.length === 0 && <div className="text-muted-foreground">Žiadne rozdiely.</div>}
            {diffs.map((d, i) => {
              if (d.type === "added") return <div key={i} className="text-emerald-800">+ Pridané: <b>{d.name}</b> {d.qty} ks</div>;
              if (d.type === "removed") return <div key={i} className="text-rose-800">− Odobrané: <b>{d.name}</b> {d.qty} ks</div>;
              return <div key={i} className="text-amber-800">↻ <b>{d.name}</b>: {d.from} → {d.to} ks</div>;
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Ponechať rezerváciu</AlertDialogCancel>
            <AlertDialogAction onClick={() => syncRes.mutate()} disabled={syncRes.isPending}>
              {syncRes.isPending ? "Aktualizujem…" : "Aktualizovať rezerváciu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function deriveBreakdown(q: any) {
  const items = (q.quote_items ?? []) as any[];
  const furniture = items.filter((it) => it.kind === "furniture")
    .reduce((s, it) => s + Number(it.line_total ?? 0), 0);
  const services = items.filter((it) => it.kind === "service")
    .reduce((s, it) => s + Number(it.line_total ?? 0), 0);
  const totalWithoutVat = Number(q.total_without_vat ?? 0);
  const dtype = q.discount_type ?? "none";
  const dval = Number(q.discount_value ?? 0);
  const rawDiscount = dtype === "percent" ? (furniture * dval) / 100 : dtype === "fixed" ? dval : 0;
  const discount = Math.min(Math.max(0, rawDiscount), furniture);
  const furnitureAfter = Math.max(0, furniture - discount);
  const baseForSurcharge = furnitureAfter + services;
  const surcharge = Math.max(0, totalWithoutVat - baseForSurcharge);
  return { furniture, services, discount, surcharge };
}

function renderBreakdown(q: any) {
  const b = deriveBreakdown(q);
  return (
    <>
      <Row label="Medzisúčet – nábytok" value={formatEur(b.furniture)} />
      {b.discount > 0 && <Row label="Zľava (len nábytok)" value={`− ${formatEur(b.discount)}`} />}
      {b.services > 0 && <Row label="Medzisúčet – služby / doprava" value={formatEur(b.services)} />}
      {b.surcharge > 0 && <Row label={q.surcharge_label || "Príplatok"} value={`+ ${formatEur(b.surcharge)}`} />}
      <Row label="Spolu bez DPH" value={formatEur(Number(q.total_without_vat))} bold />
    </>
  );
}

function renderPrintBreakdown(q: any) {
  const b = deriveBreakdown(q);
  return (
    <>
      <div className="flex justify-between"><span>Medzisúčet – nábytok</span><span>{formatEur(b.furniture)}</span></div>
      {b.discount > 0 && (
        <div className="flex justify-between"><span>Zľava (len nábytok)</span><span>− {formatEur(b.discount)}</span></div>
      )}
      {b.services > 0 && (
        <div className="flex justify-between"><span>Medzisúčet – služby / doprava</span><span>{formatEur(b.services)}</span></div>
      )}
      {b.surcharge > 0 && (
        <div className="flex justify-between"><span>{q.surcharge_label || "Príplatok"}</span><span>+ {formatEur(b.surcharge)}</span></div>
      )}
      <div className="flex justify-between font-medium"><span>Spolu bez DPH</span><span>{formatEur(Number(q.total_without_vat))}</span></div>
    </>
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
          {buildClientLines(q.clients, q.client_contacts).map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold" : undefined}>{l.text}</div>
          ))}
          {!q.clients?.company_name && <div className="font-semibold">—</div>}
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
          {renderPrintBreakdown(q)}
          <div className="flex justify-between"><span>DPH {q.vat_rate}%</span><span>{formatEur(Number(q.vat_amount))}</span></div>
          <div className="flex justify-between border-t-2 border-black pt-2 text-lg font-bold">
            <span>Spolu s DPH</span><span>{formatEur(Number(q.total_with_vat))}</span>
          </div>
          <p className="text-[10px] text-gray-500 pt-1">Zľava sa vzťahuje výhradne na nábytok; služby a doprava sa nezľavňujú.</p>
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