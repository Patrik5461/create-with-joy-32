import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  );
}
