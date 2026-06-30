import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const mimaLogo = "/mima-logo.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Obnova hesla · Mima Production CRM" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase recovery link sets hash params; the client picks them up automatically.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Heslo musí mať aspoň 8 znakov");
    if (password !== confirm) return toast.error("Heslá sa nezhodujú");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Heslo bolo zmenené");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={mimaLogo} alt="Mima Production" className="w-64 h-auto mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">Obnova hesla</h1>
        </div>
        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Nastav nové heslo</CardTitle>
            <CardDescription>
              {ready
                ? "Zvoľ si nové heslo k svojmu účtu."
                : "Otvor odkaz z emailu, ktorý sme ti poslali. Tu nemôžeš nastaviť heslo bez platného odkazu."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pwd">Nové heslo</Label>
                <Input id="pwd" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pwd2">Potvrď heslo</Label>
                <Input id="pwd2" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Uložiť nové heslo"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
