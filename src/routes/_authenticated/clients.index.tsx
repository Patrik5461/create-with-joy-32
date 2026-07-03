import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Pencil, Trash2, Star, ExternalLink, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { lookupCompanyByIco, searchCompaniesByName, type RpoCompany } from "@/lib/rpo.functions";

type DraftContact = {
  id: string;
  existingId?: string;
  full_name: string;
  role: string;
  phone: string;
  email: string;
  note: string;
  is_primary: boolean;
};

const createDraftContact = (isPrimary = false): DraftContact => ({
  id: crypto.randomUUID(),
  full_name: "",
  role: "",
  phone: "",
  email: "",
  note: "",
  is_primary: isPrimary,
});

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Klienti · Mima Production CRM" }] }),
  component: Clients,
});

function Clients() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const canManage = hasRole(user, "admin", "manager");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("company_name");
      if (error) throw error;
      return data;
    },
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klient odstránený");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Nepodarilo sa odstrániť klienta"),
  });

  const filtered = useMemo(() => {
    if (!search) return clients.data ?? [];
    const q = search.toLowerCase();
    return (clients.data ?? []).filter((c) =>
      c.company_name.toLowerCase().includes(q) ||
      (c.ico ?? "").toLowerCase().includes(q) ||
      (c.contact_person ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients.data, search]);

  return (
    <>
      <AppHeader title="Klienti" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Klienti</h2>
            <p className="text-sm text-muted-foreground">Evidencia firiem a kontaktných osôb.</p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="size-4 mr-1" />Nový klient</Button>
              </DialogTrigger>
              <ClientDialog key={editing?.id ?? "new"} item={editing} onClose={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
            </Dialog>
          )}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Hľadať klienta…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>IČO</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>Telefón</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate({ to: "/clients/$id", params: { id: c.id } })}>
                  <TableCell>
                    <Link to="/clients/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.company_name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ico ?? "—"}</TableCell>
                  <TableCell>{c.contact_person ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" asChild aria-label={`Otvoriť detail klienta ${c.company_name}`}>
                      <Link to="/clients/$id" params={{ id: c.id }}><ExternalLink className="size-4" /></Link>
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} aria-label={`Upraviť klienta ${c.company_name}`}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canManage && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" aria-label={`Odstrániť klienta ${c.company_name}`}>
                            <Trash2 className="size-4 text-rose-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Odstrániť klienta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Klient <strong>{c.company_name}</strong> a všetky jeho kontaktné osoby budú trvalo odstránené. Túto akciu nie je možné vrátiť späť. Ak má klient existujúce rezervácie alebo kalkulácie, odstránenie sa nemusí podariť.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteClient.mutate(c.id)} className="bg-rose-600 hover:bg-rose-700">Odstrániť</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !clients.isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Žiadni klienti.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function ClientDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company_name: item?.company_name ?? "",
    ico: item?.ico ?? "",
    contact_person: item?.contact_person ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
    address: item?.address ?? "",
    notes: item?.notes ?? "",
  });
  const [contacts, setContacts] = useState<DraftContact[]>([createDraftContact(true)]);
  const [removedContactIds, setRemovedContactIds] = useState<string[]>([]);

  useQuery({
    queryKey: ["client-contacts-edit", item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", item.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const loaded: DraftContact[] = (data ?? []).map((c: any) => ({
        id: crypto.randomUUID(),
        existingId: c.id,
        full_name: c.full_name ?? "",
        role: c.role ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        note: c.note ?? "",
        is_primary: !!c.is_primary,
      }));
      setContacts(loaded.length > 0 ? loaded : [createDraftContact(true)]);
      return data;
    },
  });

  const updateContact = (id: string, patch: Partial<DraftContact>) => {
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...patch } : contact));
  };

  const setPrimaryContact = (id: string) => {
    setContacts((current) => current.map((contact) => ({ ...contact, is_primary: contact.id === id })));
  };

  const removeContact = (id: string) => {
    setContacts((current) => {
      const target = current.find((c) => c.id === id);
      if (target?.existingId) setRemovedContactIds((ids) => [...ids, target.existingId!]);
      const next = current.filter((contact) => contact.id !== id);
      if (next.length === 0 || next.some((contact) => contact.is_primary)) return next;
      return next.map((contact, index) => ({ ...contact, is_primary: index === 0 }));
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const preparedContacts = contacts
        .map((contact) => ({
          full_name: contact.full_name.trim(),
          role: contact.role.trim() || null,
          phone: contact.phone.trim() || null,
          email: contact.email.trim() || null,
          note: contact.note.trim() || null,
          is_primary: contact.is_primary,
        }))
        .filter((contact) => contact.full_name);
      if (preparedContacts.length === 0 && form.contact_person.trim()) {
        preparedContacts.push({
          full_name: form.contact_person.trim(),
          role: null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          note: null,
          is_primary: true,
        });
      }

      if (item) {
        const { error } = await supabase.from("clients").update(form).eq("id", item.id);
        if (error) throw error;

        // Delete removed contacts
        if (removedContactIds.length > 0) {
          const { error: delErr } = await supabase.from("client_contacts").delete().in("id", removedContactIds);
          if (delErr) throw delErr;
        }

        const hasPrimary = contacts.some((c) => c.is_primary && c.full_name.trim());
        const filledContacts = contacts.filter((c) => c.full_name.trim());

        // Upsert each contact preserving order
        for (let i = 0; i < filledContacts.length; i++) {
          const c = filledContacts[i];
          const payload = {
            client_id: item.id,
            full_name: c.full_name.trim(),
            role: c.role.trim() || null,
            phone: c.phone.trim() || null,
            email: c.email.trim() || null,
            note: c.note.trim() || null,
            is_primary: hasPrimary ? c.is_primary : i === 0,
          };
          if (c.existingId) {
            const { error: upErr } = await supabase.from("client_contacts").update(payload).eq("id", c.existingId);
            if (upErr) throw upErr;
          } else {
            const { error: insErr } = await supabase.from("client_contacts").insert(payload);
            if (insErr) throw insErr;
          }
        }
      } else {
        const { data, error } = await supabase.from("clients").insert(form).select("id").single();
        if (error) throw error;
        if (data && preparedContacts.length > 0) {
          const normalizedContacts = preparedContacts.map((contact, index) => ({
            ...contact,
            client_id: data.id,
            is_primary: preparedContacts.some((c) => c.is_primary) ? contact.is_primary : index === 0,
          }));
          const { error: contactsError } = await supabase.from("client_contacts").insert(normalizedContacts);
          if (contactsError) throw contactsError;
        }
      }
    },
    onSuccess: () => {
      toast.success(item ? "Klient upravený" : "Klient pridaný");
      qc.invalidateQueries({ queryKey: ["client-contacts"] });
      if (item?.id) qc.invalidateQueries({ queryKey: ["client", item.id] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{item ? "Upraviť klienta" : "Nový klient"}</DialogTitle>
        <DialogDescription>Údaje o klientovi.</DialogDescription>
      </DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2"><Label>Názov firmy</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>IČO</Label><Input value={form.ico} onChange={(e) => setForm({ ...form, ico: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Kontaktná osoba</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Telefón</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Adresa</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Poznámky</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Kontaktné osoby</h3>
              <p className="text-xs text-muted-foreground">{item ? "Spravujte kontakty klienta — pridajte, upravte alebo odstráňte." : "Pridajte kontakty hneď pri vytváraní klienta."}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setContacts((current) => [...current, createDraftContact(current.length === 0)])}>
              <Plus className="size-4 mr-1" />Pridať kontakt
            </Button>
          </div>
          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div key={contact.id} className="rounded-md border bg-background p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Kontakt {index + 1}</span>
                    {contact.is_primary && <Badge variant="outline"><Star className="size-3 mr-1" />Primárny</Badge>}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(contact.id)} aria-label={`Odstrániť kontakt ${index + 1}`}>
                    <Trash2 className="size-4 text-rose-600" />
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2"><Label>Meno a priezvisko</Label><Input value={contact.full_name} onChange={(e) => updateContact(contact.id, { full_name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Pozícia / rola</Label><Input placeholder="napr. produkčný, fakturácia" value={contact.role} onChange={(e) => updateContact(contact.id, { role: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Telefón</Label><Input value={contact.phone} onChange={(e) => updateContact(contact.id, { phone: e.target.value })} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>Email</Label><Input type="email" value={contact.email} onChange={(e) => updateContact(contact.id, { email: e.target.value })} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>Poznámka</Label><Textarea rows={2} value={contact.note} onChange={(e) => updateContact(contact.id, { note: e.target.value })} /></div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox checked={contact.is_primary} onCheckedChange={() => setPrimaryContact(contact.id)} />
                    Primárny kontakt
                  </label>
                </div>
              </div>
            ))}
          </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={!form.company_name || save.isPending}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}