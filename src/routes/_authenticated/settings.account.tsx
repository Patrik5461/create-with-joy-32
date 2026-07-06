import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({ meta: [{ title: "Účet · Mima Production CRM" }] }),
  component: AccountSettings,
});

function AccountSettings() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setProfileLoading(false); return; }
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, work_email, phone, job_title")
        .eq("id", u.user.id)
        .maybeSingle();
      if (cancelled) return;
      setFullName((p as any)?.full_name ?? "");
      setWorkEmail((p as any)?.work_email ?? "");
      setPhone((p as any)?.phone ?? "");
      setJobTitle((p as any)?.job_title ?? "");
      setProfileLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setProfileSaving(false); return toast.error("Nie ste prihlásený"); }
    const trimmedWork = workEmail.trim();
    if (trimmedWork && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedWork)) {
      setProfileSaving(false);
      return toast.error("Neplatný firemný email");
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        work_email: trimmedWork ? trimmedWork.toLowerCase() : null,
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
      })
      .eq("id", u.user.id);
    setProfileSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil bol uložený");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Heslo musí mať aspoň 8 znakov");
    if (password !== confirm) return toast.error("Heslá sa nezhodujú");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirm("");
    toast.success("Heslo bolo zmenené");
  };

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Môj profil</CardTitle>
        <CardDescription>Údaje sa zobrazia v podpise pri odosielaní cenových ponúk klientom. Reply-To v emaile bude nastavený na firemný email.</CardDescription>
      </CardHeader>
      <CardContent>
        {profileLoading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : (
          <form onSubmit={saveProfile} className="grid gap-4 max-w-xl md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="full-name">Meno a priezvisko</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-email">Firemný email</Label>
              <Input id="work-email" type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} placeholder="meno@mimapro.sk" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefón</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+421 …" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="job-title">Pozícia / funkcia</Label>
              <Input id="job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Sales Manager" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? <Loader2 className="size-4 animate-spin" /> : "Uložiť profil"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Zmena hesla</CardTitle>
        <CardDescription>Nastav si nové heslo k svojmu účtu.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="new-pwd">Nové heslo</Label>
            <Input id="new-pwd" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pwd2">Potvrď heslo</Label>
            <Input id="new-pwd2" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Uložiť nové heslo"}
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
