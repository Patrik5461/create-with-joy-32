import { Link, useRouterState } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/use-permissions";
import { requiredPermissionForPath } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/**
 * Global permission guard mounted inside `_authenticated` layout.
 * Redirects/blocks access to any route the user does not have permission for.
 * Rendered as a friendly "no access" screen (users still see the sidebar,
 * but the sidebar itself hides items they can't reach).
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isLoading, can } = usePermissions();
  const required = requiredPermissionForPath(pathname);

  if (!required) return <>{children}</>;
  if (isLoading) return <>{children}</>;
  if (can(required)) return <>{children}</>;

  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-4">
        <ShieldAlert className="size-12 text-muted-foreground mx-auto" />
        <div>
          <h2 className="text-xl font-semibold">Nemáte prístup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Na túto sekciu nemáte oprávnenie. Ak si myslíte, že by ste ho mať mali,
            požiadajte administrátora o jeho pridelenie.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard">Späť na dashboard</Link>
        </Button>
      </div>
    </div>
  );
}