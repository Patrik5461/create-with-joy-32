import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { listUsers, createUser, setUserRole, setUserActive, checkIsAdmin } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";

const ROLE_LABEL: Record<string, string> = { admin: "Administrátor", manager: "Manažér", warehouse: "Skladník" };

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Používatelia · Mima Production CRM" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { isAdmin } = await checkIsAdmin();
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

function UsersPage() {
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const setRole = useServerFn(setUserRole);
  const setActive = useServerFn(setUserActive);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: (data: any) => create({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Používateľ vytvorený"); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Chyba"),
  });
  const roleMut = useMutation({
    mutationFn: (data: any) => setRole({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Rola zmenená"); },
    onError: (e: any) => toast.error(e?.message ?? "Chyba"),
  });
  const activeMut = useMutation({
    mutationFn: (data: any) => setActive({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Stav zmenený"); },
    onError: (e: any) => toast.error(e?.message ?? "Chyba"),
  });

  return (
    <>
      <AppHeader title="Používatelia" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Používatelia</h2>
            <p className="text-sm text-muted-foreground">Spravujte zamestnancov a ich roly.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1" />Nový používateľ</Button></DialogTrigger>
            <NewUserDialog onSubmit={(d) => createMut.mutate(d)} loading={createMut.isPending} />
          </Dialog>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meno</TableHead>
                <TableHead>Používateľské meno</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username ?? "—"}</TableCell>
                  <TableCell className="text-xs">{u.email?.endsWith("@users.mimaproduction.local") ? <span className="text-muted-foreground italic">—</span> : u.email}</TableCell>
                  <TableCell>
                    <Select value={u.roles[0] ?? ""} onValueChange={(v) => roleMut.mutate({ user_id: u.id, role: v })}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Bez roly" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrátor</SelectItem>
                        <SelectItem value="manager">Manažér</SelectItem>
                        <SelectItem value="warehouse">Skladník</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Badge variant={u.active ? "default" : "destructive"}>{u.active ? "Aktívny" : "Deaktivovaný"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => activeMut.mutate({ user_id: u.id, active: !u.active })}><Power className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!users.isLoading && users.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Žiadni používatelia.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
        <p className="text-xs text-muted-foreground">Tip: prvý admin sa nastavuje manuálne v Supabase dashboarde — pridajte si rolu <code>admin</code> do tabuľky <code>user_roles</code>.</p>
      </div>
    </>
  );
}

function NewUserDialog({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", full_name: "", role: "manager" });
  const usernameValid = /^[a-zA-Z0-9._-]{3,32}$/.test(form.username);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nový používateľ</DialogTitle>
        <DialogDescription>Vytvorí účet so zvolenou rolou. Prihlasovať sa bude pomocou používateľského mena.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Meno a priezvisko</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Používateľské meno</Label>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="napr. jano.novak" autoCapitalize="none" />
          <p className="text-xs text-muted-foreground">3–32 znakov: a–z, 0–9, bodka, podčiarkovník, pomlčka.</p>
        </div>
        <div className="space-y-1.5"><Label>Email (voliteľné)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="napr. jano@firma.sk" /></div>
        <div className="space-y-1.5"><Label>Heslo (min. 8 znakov)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Rola</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrátor</SelectItem>
              <SelectItem value="manager">Manažér</SelectItem>
              <SelectItem value="warehouse">Skladník</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading || !usernameValid || form.password.length < 8 || !form.full_name}>Vytvoriť</Button>
      </DialogFooter>
    </DialogContent>
  );
}