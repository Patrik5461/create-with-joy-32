import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListHelpers,
  adminCreateHelper,
  adminResetHelperPin,
  adminUpdateHelper,
  adminDeleteHelper,
} from "@/lib/helper.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { HardHat, Plus, KeyRound, Trash2, Copy, Loader2 } from "lucide-react";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/settings/helpers")({
  component: HelpersAdmin,
});

type Helper = {
  id: string;
  name: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function HelpersAdmin() {
  const { data: user } = useCurrentUser();
  const isAdmin = hasRole(user, "admin");
  const listFn = useServerFn(adminListHelpers);
  const [helpers, setHelpers] = useState<Helper[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<{ id: string; pin: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await listFn();
      setHelpers(rows as Helper[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa načítať helperov.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Prístup majú iba administrátori.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><HardHat className="size-5" />Helperi</CardTitle>
            <CardDescription>Brigádnici, ktorí si pichajú dochádzku cez PIN v natívnej appke.</CardDescription>
          </div>
          <CreateHelperDialog onCreated={(pin, id) => { setRevealed({ id, pin }); refresh(); }} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="size-5 inline animate-spin mr-2" />Načítavam…</div>
          ) : !helpers || helpers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Zatiaľ žiadni helperi.</div>
          ) : (
            <div className="divide-y border rounded-md">
              {helpers.map((h) => (
                <HelperRow key={h.id} helper={h} onChanged={refresh} onPinRevealed={(pin) => setRevealed({ id: h.id, pin })} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PinRevealDialog data={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

function HelperRow({ helper, onChanged, onPinRevealed }: {
  helper: Helper;
  onChanged: () => void;
  onPinRevealed: (pin: string) => void;
}) {
  const updateFn = useServerFn(adminUpdateHelper);
  const resetFn = useServerFn(adminResetHelperPin);
  const deleteFn = useServerFn(adminDeleteHelper);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(helper.name);
  const [editing, setEditing] = useState(false);

  async function toggleActive(next: boolean) {
    setBusy(true);
    try {
      await updateFn({ data: { helperId: helper.id, is_active: next } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa uložiť.");
    } finally { setBusy(false); }
  }

  async function saveName() {
    if (!name.trim() || name.trim() === helper.name) { setEditing(false); return; }
    setBusy(true);
    try {
      await updateFn({ data: { helperId: helper.id, name: name.trim() } });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa uložiť.");
    } finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const { pin } = await resetFn({ data: { helperId: helper.id, pin: null } });
      onPinRevealed(pin);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa regenerovať PIN.");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteFn({ data: { helperId: helper.id } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa zmazať.");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-40">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} autoFocus />
            <Button size="sm" onClick={saveName} disabled={busy}>Uložiť</Button>
            <Button size="sm" variant="ghost" onClick={() => { setName(helper.name); setEditing(false); }}>Zrušiť</Button>
          </div>
        ) : (
          <button className="font-medium hover:underline text-left" onClick={() => setEditing(true)}>{helper.name}</button>
        )}
        {helper.note && <div className="text-xs text-muted-foreground">{helper.note}</div>}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{helper.is_active ? "Aktívny" : "Neaktívny"}</span>
        <Switch checked={helper.is_active} onCheckedChange={toggleActive} disabled={busy} />
      </div>
      <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>
        <KeyRound className="size-4 mr-1" />Regenerovať PIN
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" disabled={busy} aria-label="Zmazať"><Trash2 className="size-4" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zmazať {helper.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Existujúce záznamy dochádzky ostanú (helper_id sa nastaví na null). Túto akciu nemožno vrátiť.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Zmazať</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateHelperDialog({ onCreated }: { onCreated: (pin: string, id: string) => void }) {
  const createFn = useServerFn(adminCreateHelper);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Zadaj meno."); return; }
    setBusy(true);
    try {
      const { id, pin: assigned } = await createFn({
        data: { name: name.trim(), pin: pin.trim() || null, note: note.trim() || null },
      });
      setOpen(false);
      setName(""); setPin(""); setNote("");
      onCreated(assigned, id);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa vytvoriť helpera.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4 mr-1" />Pridať helpera</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový helper</DialogTitle>
          <DialogDescription>PIN bude zobrazený iba raz — po vytvorení si ho poznač.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Meno *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno Priezvisko" /></div>
          <div>
            <Label>PIN (4 číslice) — nechaj prázdne pre automatické vygenerovanie</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="napr. 4218" inputMode="numeric" />
          </div>
          <div><Label>Poznámka</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin mr-2" />}Vytvoriť</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PinRevealDialog({ data, onClose }: { data: { id: string; pin: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PIN vygenerovaný</DialogTitle>
          <DialogDescription>Tento PIN sa už nebude dať zobraziť. Odovzdaj ho helperovi bezpečne.</DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center">
          <div className="text-5xl font-mono font-bold tracking-widest">{data?.pin}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { if (data) { navigator.clipboard?.writeText(data.pin).then(() => toast.success("PIN skopírovaný.")); } }}>
            <Copy className="size-4 mr-1" />Kopírovať
          </Button>
          <Button onClick={onClose}>Hotovo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}