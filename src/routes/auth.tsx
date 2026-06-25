import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
const mimaLogo = "/mima-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Prihlásenie · MimaProduction CRM" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Nesprávne prihlasovacie údaje");
      return;
    }
    toast.success("Prihlásenie úspešné");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)/10,_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_var(--color-accent)/15,_transparent_50%)] bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={mimaLogo} alt="MimaProduction" className="w-64 h-auto mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">MimaProduction CRM</h1>
          <p className="text-sm text-muted-foreground">Interný systém</p>
        </div>
        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Prihlásenie</CardTitle>
            <CardDescription>Prístup len pre zamestnancov MimaProduction.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Prihlásiť sa"}
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Nový účet vytvára výhradne administrátor.
              </p>
            </form>
            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground mb-1">Dočasné prihlasovacie údaje (počas vývoja systému)</p>
              <p className="text-muted-foreground">Email: <span className="font-mono">admin@mimaproduction.sk</span></p>
              <p className="text-muted-foreground">Heslo: <span className="font-mono">Mima2026</span></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}