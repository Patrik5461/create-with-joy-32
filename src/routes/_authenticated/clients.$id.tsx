import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Star, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { STATUS_LABEL, STATUS_BADGE_VARIANT, type ReservationStatus } from "@/lib/reservation-status";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Klient · Mima Production CRM" }] }),
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();

  const client = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const reservations = useQuery({
    queryKey: ["client-reservations", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations").select("*").eq("client_id", id).order("event_start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <AppHeader title={client.data?.company_name ?? "Klient"} />
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/clients"><ArrowLeft className="size-4 mr-1" />Späť na klientov</Link></Button>
        {client.data && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>{client.data.company_name}</CardTitle>
                <EditClientButton client={client.data} />
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <Field label="IČO" value={client.data.ico} />
                <Field label="Hl. kontakt (legacy)" value={client.data.contact_person} />
                <Field label="Telefón" value={client.data.phone} />
                <Field label="Email" value={client.data.email} />
                <Field label="Adresa" value={client.data.address} />
                {client.data.notes && (
                  <div className="pt-2 border-t"><div className="text-xs text-muted-foreground mb-1">Poznámky</div><p className="whitespace-pre-wrap">{client.data.notes}</p></div>
                )}
              </CardContent>
            </Card>
            <div className="md:col-span-2 space-y-4">
              <ClientContactsCard clientId={id} />
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">História rezervácií</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {reservations.data?.length === 0 && <p className="text-sm text-muted-foreground">Žiadne rezervácie.</p>}
                {reservations.data?.map((r) => (
                  <Link key={r.id} to="/reservations/$id" params={{ id: r.id }} className="block rounded-md border p-3 hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.event_name}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(r.event_start_at ?? r.load_at), "d.M.yyyy HH:mm")} · {r.venue ?? "—"}</div>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]}>{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EditClientButton({ client }: { client: any }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "manager");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company_name: client.company_name ?? "",
    ico: client.ico ?? "",
    contact_person: client.contact_person ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.company_name.trim()) throw new Error("Názov firmy je povinný");
      const { error } = await supabase.from("clients").update(form).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klient upravený");
      qc.invalidateQueries({ queryKey: ["client", client.id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!canManage) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm({
      company_name: client.company_name ?? "",
      ico: client.ico ?? "",
      contact_person: client.contact_person ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    }); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="size-3.5 mr-1" />Upraviť</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Upraviť firmu</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2"><Label>Názov firmy *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>IČO</Label><Input value={form.ico} onChange={(e) => setForm({ ...form, ico: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Hl. kontakt (legacy)</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Telefón</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Adresa</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Poznámky</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.company_name.trim()}>Uložiť</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="text-right">{value ?? "—"}</span></div>
  );
}

function ClientContactsCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "manager");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const contacts = useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-contacts", clientId] }); toast.success("Kontakt zmazaný"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setPrimary = useMutation({
    mutationFn: async (id: string) => {
      // Remove primary from others first (partial unique index allows only one).
      const { error: e1 } = await supabase
        .from("client_contacts")
        .update({ is_primary: false })
        .eq("client_id", clientId)
        .neq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("client_contacts").update({ is_primary: true }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client-contacts", clientId] }); toast.success("Primárny kontakt nastavený"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Kontaktné osoby</CardTitle>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="size-3.5 mr-1" />Pridať kontakt</Button>
            </DialogTrigger>
            <ContactDialog
              key={editing?.id ?? "new"}
              clientId={clientId}
              item={editing}
              onClose={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["client-contacts", clientId] }); }}
            />
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {(contacts.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Zatiaľ žiadne kontaktné osoby. Pridajte produkčného, fakturačného a pod.</p>
        )}
        {(contacts.data ?? []).map((c) => (
          <div key={c.id} className="rounded-md border p-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{c.full_name}</span>
                {c.role && <Badge variant="outline">{c.role}</Badge>}
                {c.is_primary && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Star className="size-3 mr-1" />Primárny</Badge>}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {c.email && <span className="flex items-center gap-1"><Mail className="size-3" />{c.email}</span>}
                {c.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>}
              </div>
              {c.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.note}</p>}
            </div>
            {canManage && (
              <div className="flex gap-1">
                {!c.is_primary && (
                  <Button size="sm" variant="ghost" onClick={() => setPrimary.mutate(c.id)} aria-label="Nastaviť ako primárny">
                    <Star className="size-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} aria-label="Upraviť kontakt">
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Zmazať kontakt ${c.full_name}?`)) remove.mutate(c.id); }} aria-label="Zmazať kontakt">
                  <Trash2 className="size-4 text-rose-600" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ContactDialog({ clientId, item, onClose }: { clientId: string; item: any; onClose: () => void }) {
  const [form, setForm] = useState({
    full_name: item?.full_name ?? "",
    role: item?.role ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
    note: item?.note ?? "",
    is_primary: !!item?.is_primary,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Zadajte meno");
      const payload = {
        client_id: clientId,
        full_name: form.full_name.trim(),
        role: form.role || null,
        phone: form.phone || null,
        email: form.email || null,
        note: form.note || null,
        is_primary: form.is_primary,
      };
      if (form.is_primary) {
        // clear other primaries first to satisfy unique partial index
        const { error: e1 } = await supabase
          .from("client_contacts")
          .update({ is_primary: false })
          .eq("client_id", clientId)
          .neq("id", item?.id ?? "00000000-0000-0000-0000-000000000000");
        if (e1) throw e1;
      }
      if (item) {
        const { error } = await supabase.from("client_contacts").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_contacts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(item ? "Kontakt upravený" : "Kontakt pridaný"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{item ? "Upraviť kontakt" : "Nový kontakt"}</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2"><Label>Meno a priezvisko *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Pozícia / rola</Label><Input placeholder="napr. produkčný, fakturácia" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Telefón</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Poznámka</Label><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm">
          <Checkbox checked={form.is_primary} onCheckedChange={(v) => setForm({ ...form, is_primary: !!v })} />
          Označiť ako primárny kontakt
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}