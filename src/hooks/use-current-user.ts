import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "warehouse";

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name").eq("id", userData.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
      ]);
      return {
        id: userData.user.id,
        email: profile?.email ?? userData.user.email ?? "",
        full_name: profile?.full_name ?? null,
        roles: (roles ?? []).map((r) => r.role as AppRole),
      };
    },
    staleTime: 60_000,
  });
}

export function hasRole(user: CurrentUser | null | undefined, ...roles: AppRole[]) {
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}