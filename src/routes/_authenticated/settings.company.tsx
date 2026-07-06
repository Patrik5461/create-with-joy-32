import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({ meta: [{ title: "Firemné údaje · Nastavenia" }] }),
  component: CompanySettings,
});

type Form = {
  id?: string;
  company_name: string;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  ico: string;
  dic: string;
  ic_dph: string;
  iban: string;
};

const EMPTY: Form = {
  company_name: "",
  address: "",
  contact_person: "",
  phone: "",
  email: "",
  ico: "",
  dic: "",
  ic_dph: "",
  iban: "",
};

function CompanySettings() {
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setForm({
          id: data.id,
          company_name: data.company_name ?? "",
          address: data.address ?? "",
          contact_person: data.contact_person ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          ico: data.ico ?? "",
          dic: data.dic ?? "",
          ic_dph: data.ic_dph ?? "",
          iban: data.iban ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = {
        company_name: form.company_name,
        address: form.address || null,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        ico: form.ico || null,
        dic: form.dic || null,
        ic_dph: form.ic_dph || null,
        iban: form.iban || null,
      };
      if (form.id) {
        const { error } = await supabase.from("company_settings").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("company_settings").insert(payload).select("id").single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: data.id }));
      }
      toast.success("Uložené");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-2"><Loader2 className="size-4 animate-spin" />Načítavam…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="size-5" />Firemné údaje dodávateľa</CardTitle>
        <CardDescription>
          Tieto údaje sa zobrazujú v sekcii „Dodávateľ" na všetkých dokumentoch (cenové ponuky, zmluvy, protokoly).
          {!canEdit && " Iba admin ich môže upraviť."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Názov firmy</Label>
            <Input value={form.company_name} disabled={!canEdit} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Adresa</Label>
            <Input value={form.address} disabled={!canEdit} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ulica, PSČ Mesto" />
          </div>
          <div className="space-y-1.5"><Label>IČO</Label><Input value={form.ico} disabled={!canEdit} onChange={(e) => setForm({ ...form, ico: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>DIČ</Label><Input value={form.dic} disabled={!canEdit} onChange={(e) => setForm({ ...form, dic: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>IČ DPH</Label><Input value={form.ic_dph} disabled={!canEdit} onChange={(e) => setForm({ ...form, ic_dph: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Kontaktná osoba</Label><Input value={form.contact_person} disabled={!canEdit} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Telefón</Label><Input value={form.phone} disabled={!canEdit} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} disabled={!canEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>IBAN</Label><Input value={form.iban} disabled={!canEdit} onChange={(e) => setForm({ ...form, iban: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!canEdit || saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-1" />}Uložiť
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}