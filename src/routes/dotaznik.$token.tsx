import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSurveyByToken, submitSurveyByToken, type SurveyPayload } from "@/lib/logistics-survey.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dotaznik/$token")({
  head: () => ({ meta: [
    { title: "Logistický dotazník · Mima Production" },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: SurveyPage,
});

const ACCESS_TYPES = [
  { value: "direct", label: "Priamy vjazd" },
  { value: "ramp", label: "Rampa" },
  { value: "stairs", label: "Schody" },
  { value: "other", label: "Iné" },
];

function SurveyPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const loadFn = useServerFn(getSurveyByToken);
  const submitFn = useServerFn(submitSurveyByToken);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resInfo, setResInfo] = useState<any>(null);
  const [form, setForm] = useState<SurveyPayload>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data: any = await loadFn({ data: { token } });
        if (cancel) return;
        setResInfo(data.reservations);
        setForm({
          address_override: data.address_override ?? data.reservations?.address ?? "",
          floor: data.floor ?? "",
          has_elevator: data.has_elevator ?? null,
          elevator_info: data.elevator_info ?? "",
          access_type: data.access_type ?? "",
          access_note: data.access_note ?? "",
          parking_available: data.parking_available ?? null,
          parking_note: data.parking_note ?? "",
          distance_info: data.distance_info ?? "",
          door_width: data.door_width ?? "",
          time_restrictions: data.time_restrictions ?? "",
          onsite_contact_name: data.onsite_contact_name ?? "",
          onsite_contact_phone: data.onsite_contact_phone ?? "",
          prearrival_contact_name: data.prearrival_contact_name ?? "",
          prearrival_contact_phone: data.prearrival_contact_phone ?? "",
          notes: data.notes ?? "",
        });
      } catch (e: any) {
        setError(e?.message?.includes("NOT_FOUND") || e?.message?.includes("Invalid") ? "Tento odkaz nie je platný." : "Nepodarilo sa načítať dotazník.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [token, loadFn]);

  const set = <K extends keyof SurveyPayload>(k: K, v: SurveyPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submitFn({ data: { token, payload: form } });
      setSubmitted(true);
      toast.success("Údaje boli odoslané. Ďakujeme!");
    } catch (err: any) {
      toast.error(err?.message ?? "Odoslanie zlyhalo");
    }
  }

  if (loading) {
    return <Shell><p className="text-sm text-muted-foreground">Načítavam dotazník…</p></Shell>;
  }
  if (error) {
    return <Shell><p className="text-sm text-destructive">{error}</p></Shell>;
  }
  if (submitted) {
    return (
      <Shell>
        <div className="text-center py-8 space-y-3">
          <CheckCircle2 className="size-12 text-green-600 mx-auto" />
          <h2 className="text-xl font-semibold">Ďakujeme, údaje boli odoslané.</h2>
          <p className="text-sm text-muted-foreground">Náš tím sa s nimi oboznámi a v prípade potreby vás bude kontaktovať.</p>
          <p className="text-xs text-muted-foreground">Túto stránku môžete zavrieť. Ak potrebujete údaje doplniť, otvorte rovnaký odkaz znova.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Logistický dotazník</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {resInfo?.event_name && <p><span className="text-muted-foreground">Event:</span> <strong>{resInfo.event_name}</strong></p>}
          {resInfo?.clients?.company_name && <p><span className="text-muted-foreground">Klient:</span> {resInfo.clients.company_name}</p>}
          {resInfo?.venue && <p><span className="text-muted-foreground">Miesto:</span> {resInfo.venue}</p>}
          {resInfo?.event_start_at && (
            <p><span className="text-muted-foreground">Termín:</span> {format(new Date(resInfo.event_start_at), "d. M. yyyy HH:mm", { locale: sk })}</p>
          )}
          <p className="text-muted-foreground pt-2">Prosím vyplňte podrobnosti o prístupe na miesto eventu, aby sme zabezpečili hladkú nakládku a vykládku.</p>
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} className="space-y-4">
        <Section title="Miesto a prístup">
          <Field label="Adresa miesta konania">
            <Input value={form.address_override ?? ""} onChange={(e) => set("address_override", e.target.value)} />
          </Field>
          <Field label="Poschodie, na ktoré sa nábytok dováža">
            <Input value={form.floor ?? ""} onChange={(e) => set("floor", e.target.value)} placeholder="napr. prízemie / 2. poschodie" />
          </Field>
          <Field label="Je k dispozícii výťah?">
            <YesNo value={form.has_elevator ?? null} onChange={(v) => set("has_elevator", v)} />
          </Field>
          {form.has_elevator && (
            <Field label="Rozmery / nosnosť výťahu">
              <Input value={form.elevator_info ?? ""} onChange={(e) => set("elevator_info", e.target.value)} placeholder="napr. 1.2 × 2.1 m, 630 kg" />
            </Field>
          )}
          <Field label="Typ prístupu">
            <Select value={form.access_type ?? ""} onValueChange={(v) => set("access_type", v)}>
              <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
              <SelectContent>
                {ACCESS_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Popis prístupu (doplnenie)">
            <Textarea rows={2} value={form.access_note ?? ""} onChange={(e) => set("access_note", e.target.value)} />
          </Field>
        </Section>

        <Section title="Parkovanie a vykládka">
          <Field label="Je možné zaparkovať/zastaviť dodávku pri vchode?">
            <YesNo value={form.parking_available ?? null} onChange={(v) => set("parking_available", v)} />
          </Field>
          <Field label="Poznámka k parkovaniu">
            <Textarea rows={2} value={form.parking_note ?? ""} onChange={(e) => set("parking_note", e.target.value)} />
          </Field>
          <Field label="Vzdialenosť od parkovania/vykládky po miesto">
            <Input value={form.distance_info ?? ""} onChange={(e) => set("distance_info", e.target.value)} placeholder="napr. 20 metrov, cez dvor" />
          </Field>
          <Field label="Šírka dverí / vstupu">
            <Input value={form.door_width ?? ""} onChange={(e) => set("door_width", e.target.value)} placeholder="napr. dvojkrídlové, 1.6 m" />
          </Field>
          <Field label="Časové obmedzenia prístupu">
            <Input value={form.time_restrictions ?? ""} onChange={(e) => set("time_restrictions", e.target.value)} placeholder="napr. len do 18:00, treba ohlásiť recepcii" />
          </Field>
        </Section>

        <Section title="Kontakty">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Kontaktná osoba na mieste — meno">
              <Input value={form.onsite_contact_name ?? ""} onChange={(e) => set("onsite_contact_name", e.target.value)} />
            </Field>
            <Field label="Telefón">
              <Input value={form.onsite_contact_phone ?? ""} onChange={(e) => set("onsite_contact_phone", e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Komu volať pred príchodom — meno (ak iné)">
              <Input value={form.prearrival_contact_name ?? ""} onChange={(e) => set("prearrival_contact_name", e.target.value)} />
            </Field>
            <Field label="Telefón">
              <Input value={form.prearrival_contact_phone ?? ""} onChange={(e) => set("prearrival_contact_phone", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Poznámky">
          <Field label="Špeciálne pokyny / poznámky">
            <Textarea rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </Section>

        <div className="flex justify-end pt-2">
          <Button type="submit">Odoslať údaje</Button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <img src="/mima-logo.png" alt="Mima Production" className="h-10 w-auto" />
          <span className="font-semibold">Mima Production</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <RadioGroup
      value={value === null ? "" : value ? "yes" : "no"}
      onValueChange={(v) => onChange(v === "yes")}
      className="flex gap-4"
    >
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="yes" />Áno</label>
      <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="no" />Nie</label>
    </RadioGroup>
  );
}