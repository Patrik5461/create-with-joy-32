import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureSurveyForReservation } from "@/lib/logistics-survey.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Mail, Link2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { publicUrl as buildPublicUrl } from "@/lib/public-url";

const ACCESS_LABEL: Record<string, string> = {
  direct: "Priamy vjazd",
  ramp: "Rampa",
  stairs: "Schody",
  other: "Iné",
};

export function SurveyCard({ reservationId, email, canGenerate }: { reservationId: string; email?: string | null; canGenerate: boolean }) {
  const qc = useQueryClient();
  const ensureFn = useServerFn(ensureSurveyForReservation);

  const survey = useQuery({
    queryKey: ["logistics-survey", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistics_surveys")
        .select("*")
        .eq("reservation_id", reservationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ensure = useMutation({
    mutationFn: async () => (await ensureFn({ data: { reservationId } })) as { token: string },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["logistics-survey", reservationId] }); toast.success("Odkaz vygenerovaný"); },
    onError: (e: any) => toast.error(e.message),
  });

  const s = survey.data as any;
  const publicUrl = s?.token ? buildPublicUrl(`/dotaznik/${s.token}`) : "";

  const status = !s ? "missing" : s.status === "filled" ? "filled" : "sent";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="size-4" />Logistický dotazník pre klienta</CardTitle>
          <SurveyStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!s && (
          <div className="space-y-3">
            <p className="text-muted-foreground">Vygenerujte verejný odkaz a pošlite ho klientovi. Klient vyplní informácie o prístupe na miesto eventu bez prihlásenia.</p>
            {canGenerate && (
              <Button size="sm" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
                <Link2 className="size-4 mr-1" />Vygenerovať dotazník pre klienta
              </Button>
            )}
          </div>
        )}

        {s && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="px-2 py-1 rounded bg-muted text-xs flex-1 truncate">{publicUrl}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Skopírované"); }}>
                <Copy className="size-4 mr-1" />Kopírovať
              </Button>
              {email && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${email}?subject=${encodeURIComponent("Logistický dotazník — Mima Production")}&body=${encodeURIComponent(`Dobrý deň,\n\nprosíme o vyplnenie krátkeho logistického dotazníka k vášmu eventu:\n${publicUrl}\n\nĎakujeme,\nTím Mima Production`)}`}>
                    <Mail className="size-4 mr-1" />Odoslať emailom
                  </a>
                </Button>
              )}
            </div>

            {s.status === "filled" ? (
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">Vyplnené {s.submitted_at ? format(new Date(s.submitted_at), "d. M. yyyy HH:mm", { locale: sk }) : ""}</p>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                  <Row label="Adresa" value={s.address_override} />
                  <Row label="Poschodie" value={s.floor} />
                  <Row label="Výťah" value={s.has_elevator === null ? null : s.has_elevator ? `Áno${s.elevator_info ? ` — ${s.elevator_info}` : ""}` : "Nie"} />
                  <Row label="Typ prístupu" value={s.access_type ? ACCESS_LABEL[s.access_type] ?? s.access_type : null} />
                  <Row label="Popis prístupu" value={s.access_note} />
                  <Row label="Parkovanie pri vchode" value={s.parking_available === null ? null : s.parking_available ? "Áno" : "Nie"} />
                  <Row label="Poznámka k parkovaniu" value={s.parking_note} />
                  <Row label="Vzdialenosť" value={s.distance_info} />
                  <Row label="Šírka dverí" value={s.door_width} />
                  <Row label="Časové obmedzenia" value={s.time_restrictions} />
                  <Row label="Kontakt na mieste" value={joinNamePhone(s.onsite_contact_name, s.onsite_contact_phone)} />
                  <Row label="Volať pred príchodom" value={joinNamePhone(s.prearrival_contact_name, s.prearrival_contact_phone)} />
                </div>
                {s.notes && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Poznámky</div>
                    <p className="whitespace-pre-wrap">{s.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">Čakáme na vyplnenie klientom. Po vyplnení sa údaje zobrazia tu.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function joinNamePhone(name?: string | null, phone?: string | null) {
  if (!name && !phone) return null;
  return [name, phone].filter(Boolean).join(" · ");
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function SurveyStatusBadge({ status }: { status: "missing" | "sent" | "filled" }) {
  if (status === "filled") return <Badge className="bg-green-600 hover:bg-green-600">Vyplnený</Badge>;
  if (status === "sent") return <Badge variant="secondary">Odoslaný klientovi</Badge>;
  return <Badge variant="outline">Nevyplnený</Badge>;
}