import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Klienti · Mima Production CRM" }] }),
  component: Clients,
});

function Clients() {
  const qc = useQueryClient();
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
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/clients/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.company_name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ico ?? "—"}</TableCell>
                  <TableCell>{c.contact_person ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
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
  const [form, setForm] = useState({
    company_name: item?.company_name ?? "",
    ico: item?.ico ?? "",
    contact_person: item?.contact_person ?? "",
    phone: item?.phone ?? "",
    email: item?.email ?? "",
    address: item?.address ?? "",
    notes: item?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (item) {
        const { error } = await supabase.from("clients").update(form).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(item ? "Klient upravený" : "Klient pridaný"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-xl">
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
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Zrušiť</Button>
        <Button onClick={() => save.mutate()} disabled={!form.company_name || save.isPending}>Uložiť</Button>
      </DialogFooter>
    </DialogContent>
  );
}