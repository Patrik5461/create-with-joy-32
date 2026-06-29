import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatConversation {
  id: string;
  type: "global" | "direct";
  title: string;
  other_user_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_read_at: string;
  unread: number;
}

export function useChatConversations(meId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "conversations", meId],
    enabled: !!meId,
    staleTime: 10_000,
    queryFn: async (): Promise<ChatConversation[]> => {
      if (!meId) return [];
      const { data: parts, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id,last_read_at,conversations!inner(id,type,created_at)")
        .eq("user_id", meId);
      if (error) throw error;
      const convIds = (parts ?? []).map((p: any) => p.conversation_id);
      if (!convIds.length) return [];

      // last message per conversation
      const { data: msgs } = await supabase
        .from("messages")
        .select("id,conversation_id,body,attachment_name,created_at,sender_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });

      const lastByConv = new Map<string, any>();
      (msgs ?? []).forEach((m: any) => {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      });

      // For direct conversations, fetch other participants
      const directIds = (parts ?? [])
        .filter((p: any) => p.conversations?.type === "direct")
        .map((p: any) => p.conversation_id);
      const otherByConv = new Map<string, { id: string; name: string }>();
      if (directIds.length) {
        const { data: others } = await supabase
          .from("conversation_participants")
          .select("conversation_id,user_id,profiles!inner(id,full_name,email)")
          .in("conversation_id", directIds)
          .neq("user_id", meId);
        (others ?? []).forEach((o: any) => {
          otherByConv.set(o.conversation_id, {
            id: o.user_id,
            name: o.profiles?.full_name ?? o.profiles?.email ?? "Používateľ",
          });
        });
      }

      const result: ChatConversation[] = (parts ?? []).map((p: any) => {
        const last = lastByConv.get(p.conversation_id);
        const isGlobal = p.conversations?.type === "global";
        const other = otherByConv.get(p.conversation_id);
        const lastAt = last?.created_at ?? p.conversations?.created_at ?? null;

        // unread = number of messages newer than last_read_at, not sent by me
        // We'll fill below in a second pass to keep one round-trip.
        return {
          id: p.conversation_id,
          type: isGlobal ? "global" : "direct",
          title: isGlobal ? "Všetci" : other?.name ?? "Súkromná konverzácia",
          other_user_id: other?.id ?? null,
          last_message: last?.body ?? (last?.attachment_name ? `📎 ${last.attachment_name}` : null),
          last_message_at: lastAt,
          last_read_at: p.last_read_at,
          unread: 0,
        };
      });

      // unread counts
      await Promise.all(
        result.map(async (c) => {
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", c.id)
            .gt("created_at", c.last_read_at)
            .neq("sender_id", meId);
          c.unread = count ?? 0;
        }),
      );

      // sort: unread first, then by last_message_at desc, global pinned on top
      result.sort((a, b) => {
        if (a.type === "global" && b.type !== "global") return -1;
        if (b.type === "global" && a.type !== "global") return 1;
        const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bt - at;
      });
      return result;
    },
  });
}

export function useUnreadTotal(meId: string | undefined) {
  const q = useChatConversations(meId);
  const total = (q.data ?? []).reduce((s, c) => s + c.unread, 0);
  return { total, query: q };
}