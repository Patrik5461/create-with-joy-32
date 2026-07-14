import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { HardHat, LogIn, BookOpen } from "lucide-react";
import { shouldShowLauncher } from "@/lib/platform";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    // Ak je používateľ prihlásený, rozcestník mu nezobrazujeme — rovno do CRM.
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in (e as any)) throw e;
    }
    // Desktop web: pôvodné správanie — rovno na /dashboard (odtiaľ auth guard na /auth).
    // Natívna appka alebo mobilný web: zobraz rozcestník.
    if (!shouldShowLauncher()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: NativeLauncher,
});

function NativeLauncher() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/40 flex flex-col">
      <header className="px-6 pt-10 pb-6 text-center">
        <img src="/mima-logo.png" alt="Mima Production" className="h-14 mx-auto mb-4" />
        <h1 className="text-2xl font-bold tracking-tight">Mima Production</h1>
        <p className="text-sm text-muted-foreground mt-1">Vyber, ako chceš pokračovať</p>
      </header>
      <main className="flex-1 px-6 pb-10 max-w-md mx-auto w-full">
        <div className="grid gap-4">
          <LauncherTile
            to="/helper"
            icon={<HardHat className="size-8" />}
            title="Helper"
            subtitle="Pichnutie dochádzky cez PIN"
            tone="primary"
          />
          <LauncherTile
            to="/auth"
            icon={<LogIn className="size-8" />}
            title="Prihlásenie"
            subtitle="Zamestnanci a admin"
            tone="default"
          />
          <LauncherTile
            to="/katalog"
            icon={<BookOpen className="size-8" />}
            title="Katalóg"
            subtitle="Verejný katalóg nábytku"
            tone="default"
          />
        </div>
      </main>
      <footer className="py-4 text-center border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          © 2026 mima production s.r.o. Všetky práva vyhradené.
        </p>
      </footer>
    </div>
  );
}

function LauncherTile({ to, icon, title, subtitle, tone }: {
  to: "/helper" | "/auth" | "/katalog";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "primary" | "default";
}) {
  const isPrimary = tone === "primary";
  return (
    <Link
      to={to}
      className={
        "rounded-2xl p-5 flex items-center gap-4 shadow-sm border transition-colors active:scale-[0.99] " +
        (isPrimary
          ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
          : "bg-card text-card-foreground border-border hover:bg-accent")
      }
    >
      <div className={"size-14 rounded-xl grid place-items-center shrink-0 " + (isPrimary ? "bg-primary-foreground/15" : "bg-primary/10 text-primary")}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-lg font-semibold leading-tight">{title}</div>
        <div className={"text-sm " + (isPrimary ? "text-primary-foreground/80" : "text-muted-foreground")}>{subtitle}</div>
      </div>
    </Link>
  );
}
