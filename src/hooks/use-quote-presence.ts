import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export interface QuoteViewer {
  key: string;
  user_id: string;
  name: string;
  editing: boolean;
  online_at: string;
}

/**
 * Realtime presence for a single quote: who has it open and who is editing it.
 */
export function useQuotePresence(quoteId: string | undefined, editing: boolean) {
  const { data: user } = useCurrentUser();
  const [viewers, setViewers] = useState<QuoteViewer[]>([]);

  useEffect(() => {
    if (!quoteId || !user?.id) return;

    const channel = supabase.channel(`quote-presence:${quoteId}`, {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      const state = channel.presenceState<Record<string, unknown>>();
      const list: QuoteViewer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        const last = (entries as any[])[entries.length - 1];
        if (!last) continue;
        list.push({
          key,
          user_id: String(last.user_id ?? key),
          name: String(last.name ?? "Používateľ"),
          editing: Boolean(last.editing),
          online_at: String(last.online_at ?? ""),
        });
      }
      setViewers(list);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({
            user_id: user.id,
            name: user.full_name ?? user.email,
            editing,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quoteId, user?.id, user?.full_name, user?.email, editing]);

  const others = viewers.filter((v) => v.user_id !== user?.id);
  return {
    viewers,
    others,
    othersEditing: others.filter((v) => v.editing),
    me: user,
  };
}
