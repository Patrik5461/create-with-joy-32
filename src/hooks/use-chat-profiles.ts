import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatProfile {
  id: string;
  full_name: string | null;
  email: string;
}

export function useChatProfiles(meId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "profiles"],
    staleTime: 60_000,
    queryFn: async (): Promise<ChatProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.id !== meId) as ChatProfile[];
    },
  });
}