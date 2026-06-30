import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveLoginEmail } from "@/lib/users.functions";
const mimaLogo = "/mima-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Prihlásenie · Mima Production CRM" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { email } = await resolveLoginEmail({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Prihlásenie úspešné");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error("Nesprávne prihlasovacie údaje");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)/10,_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_var(--color-accent)/15,_transparent_50%)] bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={mimaLogo} alt="Mima Production" className="w-64 h-auto mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">Mima Production CRM</h1>
          <p className="text-sm text-muted-foreground">Interný systém</p>
        </div>
        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Prihlásenie</CardTitle>
            <CardDescription>Prístup len pre zamestnancov Mima Production.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Meno alebo email</Label>
                <Input id="identifier" type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Prihlásiť sa"}
              </Button>
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Zabudnuté heslo?
                </button>
                <p className="text-xs text-muted-foreground">Nový účet vytvára administrátor.</p>
              </div>
            </form>
            <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultIdentifier={identifier} />
            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground mb-1">Dočasné prihlasovacie údaje (počas vývoja systému)</p>
              <p className="text-muted-foreground">Meno: <span className="font-mono">admin</span></p>
              <p className="text-muted-foreground">Heslo: <span className="font-mono">Mima2026</span></p>
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Nie ste zamestnanec? <a href="/katalog" className="underline hover:text-foreground">Pozrieť verejný katalóg</a>
        </p>
      </div>
    </div>
  );
}
