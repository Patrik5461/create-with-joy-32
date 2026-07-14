import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  computeEffectivePermissions,
  type Permission,
  type PermissionOverride,
} from "@/lib/permissions";

export function usePermissions() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const {
    data: overrides,
    isLoading: permLoading,
  } = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<PermissionOverride[]> => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission, granted")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as PermissionOverride[];
    },
  });

  const effective = useMemo(
    () => computeEffectivePermissions(user?.roles ?? [], overrides ?? []),
    [user, overrides],
  );

  return {
    isLoading: userLoading || (!!user?.id && permLoading),
    effective,
    can: (perm: Permission) => effective.has(perm),
    canAny: (perms: Permission[]) => perms.some((p) => effective.has(p)),
  };
}