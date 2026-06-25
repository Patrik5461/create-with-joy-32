import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, RefreshCw, ExternalLink, Calendar, Apple, Globe } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/calendar")({
  component: CalendarSettings,
});

function CalendarSettings() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-ics-token"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nie ste prihlásený");
      const { data: p, error } = await supabase
        .from("profiles")
        .select("ics_token")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return { token: (p as { ics_token: string } | null)?.ics_token ?? null };
    },
  });

  const rotate = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nie ste prihlásený");
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from("profiles")
        .update({ ics_token: newToken } as never)
        .eq("id", u.user.id);
      if (error) throw error;
      return newToken;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-ics-token"] });
      toast.success("Nový odkaz vygenerovaný. Starý prestane fungovať.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Chyba"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const icsUrl = data?.token ? `${origin}/api/public/calendar/${data.token}.ics` : "";
  const webcalUrl = data?.token ? `webcal://${origin.replace(/^https?:\/\//, "")}/api/public/calendar/${data.token}.ics` : "";
  const googleAddUrl = icsUrl
    ? `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(icsUrl)}`
    : "";

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Skopírované do schránky");
    } catch {
      toast.error("Nepodarilo sa skopírovať");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5" /> Prepojenie kalendára
          </CardTitle>
          <CardDescription>
            Pridaj si všetky rezervácie z CRM do svojho Google alebo Apple kalendára pomocou
            unikátnej ICS URL. Kalendár sa automaticky aktualizuje (obvykle do 1 hodiny).
            Synchronizácia je jednosmerná: CRM → tvoj kalendár.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Načítavam…</p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tvoja ICS URL (drž v tajnosti)
                </label>
                <div className="flex gap-2">
                  <Input readOnly value={icsUrl} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(icsUrl, "ics")} title="Kopírovať">
                    {copied === "ics" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Kto získa túto URL, môže vidieť všetky rezervácie. Pri podozrení vygeneruj nový odkaz.
                </p>
              </div>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Naozaj? Starý odkaz prestane fungovať a musíš ho znova pridať do kalendárov.")) {
                      rotate.mutate();
                    }
                  }}
                  disabled={rotate.isPending}
                >
                  <RefreshCw className="size-4 mr-2" />
                  Vygenerovať nový odkaz
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {data?.token && (
        <Card>
          <CardHeader>
            <CardTitle>Návod na pridanie</CardTitle>
            <CardDescription>Vyber si svoj kalendár.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="google">
              <TabsList>
                <TabsTrigger value="google"><Globe className="size-4 mr-1" /> Google</TabsTrigger>
                <TabsTrigger value="apple"><Apple className="size-4 mr-1" /> Apple</TabsTrigger>
                <TabsTrigger value="outlook">Outlook</TabsTrigger>
              </TabsList>

              <TabsContent value="google" className="space-y-3 pt-4">
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Otvor Google Calendar v prehliadači (na PC, nie v mobilnej aplikácii).</li>
                  <li>V ľavej lište klikni na <strong>+</strong> vedľa „Other calendars" a zvoľ <strong>„From URL"</strong>.</li>
                  <li>Vlož ICS URL vyššie a potvrď <strong>„Add calendar"</strong>.</li>
                  <li>Kalendár sa zobrazí do pár minút a Google ho automaticky obnoví ~každých 12–24 hodín.</li>
                </ol>
                <Button asChild variant="outline" size="sm">
                  <a href={googleAddUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4 mr-2" />
                    Otvoriť Google Calendar s predvyplnenou URL
                  </a>
                </Button>
              </TabsContent>

              <TabsContent value="apple" className="space-y-3 pt-4">
                <div>
                  <p className="text-sm font-medium mb-1">Na iPhone / iPad:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Nastavenia → Kalendár → Účty → Pridať účet → Iný.</li>
                    <li>„Pridať odoberaný kalendár" a vlož URL nižšie.</li>
                  </ol>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Na Macu (aplikácia Kalendár):</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Menu <strong>Súbor → Nový odoberaný kalendár…</strong></li>
                    <li>Vlož webcal URL nižšie a nastav obnovovanie na „Každú hodinu".</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={webcalUrl} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(webcalUrl, "webcal")}>
                    {copied === "webcal" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={webcalUrl}>
                    <ExternalLink className="size-4 mr-2" />
                    Otvoriť v Apple Kalendári
                  </a>
                </Button>
              </TabsContent>

              <TabsContent value="outlook" className="space-y-3 pt-4">
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Outlook (web) → Kalendár → <strong>Pridať kalendár</strong> → <strong>Z internetu</strong>.</li>
                  <li>Vlož ICS URL vyššie a potvrď.</li>
                </ol>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}