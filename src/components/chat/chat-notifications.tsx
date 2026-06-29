import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

/**
 * Mounts once inside the authenticated layout. Subscribes to:
 *  - all new messages (any conversation) — invalidates conversation list
 *  - mentions targeted at the current user — shows a toast
 */
export function ChatNotifications() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!me?.id) return;
    const meId = me.id;

    const channel = supabase
      .channel(`chat-notify:${meId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: any) => {
          const row = payload.new;
          qc.invalidateQueries({ queryKey: ["chat", "conversations", meId] });
          if (row.sender_id === meId) return;
          // Toast only when not currently viewing chat
          if (!pathnameRef.current.startsWith("/chat")) {
            const { data: sender } = await supabase
              .from("profiles").select("full_name,email").eq("id", row.sender_id).maybeSingle();
            const name = sender?.full_name ?? sender?.email ?? "Niekto";
            const preview = row.body
              ? (row.body.length > 80 ? row.body.slice(0, 80) + "…" : row.body)
              : row.attachment_name ? `📎 ${row.attachment_name}` : "";
            toast(`💬 ${name}`, { description: preview });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_mentions", filter: `user_id=eq.${meId}` },
        async (payload: any) => {
          const { data: msg } = await supabase
            .from("messages")
            .select("body,sender_id,profiles!messages_sender_id_fkey(full_name,email)")
            .eq("id", payload.new.message_id).maybeSingle();
          const name = (msg as any)?.profiles?.full_name ?? (msg as any)?.profiles?.email ?? "Kolega";
          toast.info(`@${name} vás spomenul/a`, { description: (msg as any)?.body ?? "" });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [me?.id, qc]);

  return null;
}