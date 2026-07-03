import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Calendar, KeyRound, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

const items = [
  { to: "/settings/calendar", label: "Kalendár (Google / Apple)", icon: Calendar },
  { to: "/settings/email", label: "Email (Resend)", icon: Mail },
  { to: "/settings/account", label: "Účet a heslo", icon: KeyRound },
] as const;

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nastavenia</h1>
        <p className="text-sm text-muted-foreground">Spravuj svoj účet a prepojené služby.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="flex md:flex-col gap-1">
          {items.map((it) => {
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
                )}
              >
                <it.icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}