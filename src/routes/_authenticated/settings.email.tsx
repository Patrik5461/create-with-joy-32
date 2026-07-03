import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Mail, Send } from "lucide-react";
import { getEmailSettings, updateEmailSettings, sendTestEmail } from "@/lib/email.functions";

export const Route = createFileRoute("/_authenticated/settings/email")({
  head: () => ({ meta: [{ title: "Email · Nastavenia" }] }),
  component: EmailSettings,
});

function EmailSettings() {
  const fetchSettings = useServerFn(getEmailSettings);
  const saveSettings = useServerFn(updateEmailSettings);
  const testFn = useServerFn(sendTestEmail);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [notifyList, setNotifyList] = useState("");
  const [quoteSubj, setQuoteSubj] = useState("");
  const [surveyLinkSubj, setSurveyLinkSubj] = useState("");
  const [inquirySubj, setInquirySubj] = useState("");
  const [surveyFilledSubj, setSurveyFilledSubj] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s: any = await fetchSettings();
        if (s) {
          setFromEmail(s.from_email ?? "");
          setFromName(s.from_name ?? "");
          setReplyTo(s.reply_to_email ?? "");
          setNotifyList((s.notification_recipients ?? []).join(", "));
          setQuoteSubj(s.quote_subject_template ?? "");
          setSurveyLinkSubj(s.survey_link_subject_template ?? "");
          setInquirySubj(s.inquiry_notify_subject_template ?? "");
          setSurveyFilledSubj(s.survey_filled_subject_template ?? "");
        }
      } catch (e: any) {
        toast.error(e.message ?? "Nepodarilo sa načítať nastavenia");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const recipients = notifyList
        .split(/[\s,;]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      await saveSettings({
        data: {
          from_email: fromEmail,
          from_name: fromName,
          reply_to_email: replyTo || null,
          notification_recipients: recipients,
          quote_subject_template: quoteSubj,
          survey_link_subject_template: surveyLinkSubj,
          inquiry_notify_subject_template: inquirySubj,
          survey_filled_subject_template: surveyFilledSubj,
        },
      });
      toast.success("Nastavenia uložené");
    } catch (err: any) {
      toast.error(err.message ?? "Uloženie zlyhalo");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testTo) return toast.error("Zadaj adresu príjemcu testu");
    setTesting(true);
    try {
      await testFn({ data: { to: testTo } });
      toast.success(`Testovací email odoslaný na ${testTo}`);
    } catch (err: any) {
      toast.error(err.message ?? "Odoslanie zlyhalo");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="size-4 animate-spin" />Načítavam…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="size-5" />Email — Resend</CardTitle>
          <CardDescription>
            Kľúč <code>RESEND_API_KEY</code> je uložený na serveri. Reply-To smeruj na reálnu schránku — from adresa Resendu neprijíma odpovede.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from_email">From adresa</Label>
                <Input id="from_email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@send.mimapro.sk" required />
                <p className="text-xs text-muted-foreground">Musí byť verifikovaná v Resend paneli.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from_name">Meno odosielateľa</Label>
                <Input id="from_name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Mima Production" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="reply_to">Reply-To</Label>
                <Input id="reply_to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="info@mimapro.sk" />
                <p className="text-xs text-muted-foreground">Odpovede klientov chodia na túto adresu.</p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="notify">Interné notifikačné adresy</Label>
                <Textarea id="notify" value={notifyList} onChange={(e) => setNotifyList(e.target.value)} placeholder="info@mimapro.sk, logistika@mimapro.sk" rows={2} />
                <p className="text-xs text-muted-foreground">Kam chodia notifikácie o nových dopytoch a vyplnených dotazníkoch. Oddeľuj čiarkou.</p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-medium">Šablóny predmetov</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cenová ponuka</Label>
                  <Input value={quoteSubj} onChange={(e) => setQuoteSubj(e.target.value)} placeholder="Cenová ponuka {{quote_number}}" />
                  <p className="text-xs text-muted-foreground">Premenné: {"{{quote_number}}, {{version}}"}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Odkaz na dotazník</Label>
                  <Input value={surveyLinkSubj} onChange={(e) => setSurveyLinkSubj(e.target.value)} placeholder="Logistický dotazník k akcii {{event_name}}" />
                  <p className="text-xs text-muted-foreground">Premenné: {"{{event_name}}"}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Notifikácia — nový dopyt</Label>
                  <Input value={inquirySubj} onChange={(e) => setInquirySubj(e.target.value)} placeholder="Nový dopyt z katalógu — {{name}}" />
                  <p className="text-xs text-muted-foreground">Premenné: {"{{name}}, {{company}}"}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Notifikácia — dotazník vyplnený</Label>
                  <Input value={surveyFilledSubj} onChange={(e) => setSurveyFilledSubj(e.target.value)} placeholder="Logistický dotazník vyplnený — {{event_name}}" />
                </div>
              </div>
            </div>

            <div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 mr-1 animate-spin" />}Uložiť
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="size-5" />Testovací email</CardTitle>
          <CardDescription>Odošle testovaciu správu cez Resend, aby si overil, že integrácia funguje.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="grow min-w-[220px] space-y-1.5">
              <Label htmlFor="test_to">Príjemca</Label>
              <Input id="test_to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tvoj@email.sk" />
            </div>
            <Button onClick={runTest} disabled={testing || !testTo}>
              {testing && <Loader2 className="size-4 mr-1 animate-spin" />}Poslať test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}