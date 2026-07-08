import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ExternalLink, Eye, Send, Loader2 } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ensureSurveyForReservation } from "@/lib/logistics-survey.functions";
import { sendSurveyLinkEmail } from "@/lib/email.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SurveyCard } from "@/components/survey-card";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { publicUrl as buildPublicUrl } from "@/lib/public-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/surveys")({
  head: () => ({ meta: [{ title: "Logistické dotazníky · Mima Production CRM" }] }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nenájdené</div>,
  component: SurveysPage,
});

function SurveysPage() {
  const [previewId, setPreviewId] = useState<{ id: string; email?: string | null } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<null | {
    reservationId: string;
    email: string;
    eventName: string | null;
    company: string | null;
    token: string | null | undefined;
  }>(null);
  const ensureFn = useServerFn(ensureSurveyForReservation);
  const sendFn = useServerFn(sendSurveyLinkEmail);

  const sendSurveyLink = async (reservationId: string, email: string | null | undefined, existingToken: string | null | undefined) => {
    if (!email) return toast.error("Rezervácia nemá klientský email");
    setSendingId(reservationId);
    try {
      let token = existingToken;
      if (!token) {
        const res = await ensureFn({ data: { reservationId } });
        token = res.token;
      }
      const url = buildPublicUrl(`/dotaznik/${token}`);
      await sendFn({ data: { reservationId, to: email, publicUrl: url } });
      toast.success(`Email odoslaný na ${email}`);
    } catch (err: any) {
      toast.error(err.message ?? "Odoslanie zlyhalo");
    } finally {
      setSendingId(null);
    }
  };

  const q = useQuery({
    queryKey: ["surveys-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id,event_name,venue,event_start_at,email,clients(company_name),logistics_surveys(token,status,submitted_at)")
        .order("event_start_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5" />
        <h1 className="text-2xl font-semibold">Logistické dotazníky</h1>
      </div>
      <p className="text-sm text-muted-foreground">Prehľad všetkých rezervácií a stavu logistického dotazníka pre klienta.</p>

      <Card>
        <CardHeader><CardTitle className="text-base">Rezervácie</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Načítavam…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žiadne rezervácie.</p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const raw = r.logistics_surveys;
                const s = Array.isArray(raw) ? raw[0] : raw;
                const status: "missing" | "sent" | "filled" = !s ? "missing" : s.status === "filled" ? "filled" : "sent";
                const url = s?.token ? buildPublicUrl(`/dotaznik/${s.token}`) : "";
                return (
                  <div key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-medium">{r.event_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.clients?.company_name ?? ""}{r.venue ? ` · ${r.venue}` : ""}
                        {r.event_start_at ? ` · ${format(new Date(r.event_start_at), "d. M. yyyy", { locale: sk })}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={status} />
                    <Button size="sm" variant="outline" onClick={() => setPreviewId({ id: r.id, email: r.email })}>
                      <Eye className="size-4 mr-1" />Náhľad
                    </Button>
                    {url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4 mr-1" />Verejný odkaz</a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!r.email) return toast.error("Rezervácia nemá klientský email");
                        setConfirmSend({
                          reservationId: r.id,
                          email: r.email,
                          eventName: r.event_name ?? null,
                          company: r.clients?.company_name ?? null,
                          token: s?.token,
                        });
                      }}
                      disabled={sendingId === r.id || !r.email}
                      title={!r.email ? "Rezervácia nemá email klienta" : undefined}
                    >
                      {sendingId === r.id ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                      Poslať klientovi
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/reservations/$id" params={{ id: r.id }}>Otvoriť rezerváciu</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Logistický dotazník</DialogTitle></DialogHeader>
          {previewId && <SurveyCard reservationId={previewId.id} email={previewId.email} canGenerate />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmSend} onOpenChange={(o) => { if (!o && !sendingId) setConfirmSend(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odoslať logistický dotazník klientovi?</AlertDialogTitle>
            <AlertDialogDescription>
              Skontrolujte údaje pred odoslaním. Email sa odošle až po potvrdení.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmSend && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1.5">
              <div><span className="text-muted-foreground">Komu: </span><b>{confirmSend.company || "—"}</b> &lt;<span className="font-mono">{confirmSend.email}</span>&gt;</div>
              <div><span className="text-muted-foreground">Predmet: </span>Logistický dotazník k akcii <b>{confirmSend.eventName || "—"}</b></div>
              <div><span className="text-muted-foreground">Obsah: </span>odkaz na verejný formulár na vyplnenie logistiky</div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!sendingId}>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!sendingId}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmSend) return;
                await sendSurveyLink(confirmSend.reservationId, confirmSend.email, confirmSend.token);
                setConfirmSend(null);
              }}
            >
              {sendingId ? <><Loader2 className="size-4 mr-1 animate-spin" />Odosielam…</> : "Áno, odoslať"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: "missing" | "sent" | "filled" }) {
  if (status === "filled") return <Badge className="bg-green-600 hover:bg-green-600">Vyplnený</Badge>;
  if (status === "sent") return <Badge variant="secondary">Odoslaný</Badge>;
  return <Badge variant="outline">Nevyplnený</Badge>;
}