import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  created_at: string;
  sender_name?: string | null;
  mentioned_user_ids: string[];
}

export function useChatMessages(conversationId: string | null, meId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["chat", "messages", conversationId],
    enabled: !!conversationId,
    staleTime: 5_000,
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("id,conversation_id,sender_id,body,attachment_path,attachment_name,attachment_mime,created_at,profiles!messages_sender_id_fkey(full_name,email),message_mentions(user_id)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        body: m.body,
        attachment_path: m.attachment_path,
        attachment_name: m.attachment_name,
        attachment_mime: m.attachment_mime,
        created_at: m.created_at,
        sender_name: m.profiles?.full_name ?? m.profiles?.email ?? null,
        mentioned_user_ids: (m.message_mentions ?? []).map((x: any) => x.user_id),
      }));
    },
  });

  // Mark conversation as read when messages load / change
  useEffect(() => {
    if (!conversationId || !meId) return;
    void supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", meId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", meId] });
      });
  }, [conversationId, meId, query.data?.length, qc]);

  // Realtime subscription to this conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:conv:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
          if (meId) qc.invalidateQueries({ queryKey: ["chat", "conversations", meId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["chat", "messages", conversationId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, meId, qc]);

  return query;
}