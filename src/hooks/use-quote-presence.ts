import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
 * One shared realtime channel per quote group, reference-counted, so multiple
 * components (badges + warning) don't create competing presence entries.
 */
interface Entry {
  channel: RealtimeChannel;
  refs: number;
  viewers: QuoteViewer[];
  editing: boolean;
  meta: { user_id: string; name: string };
  listeners: Set<(v: QuoteViewer[]) => void>;
}

const registry = new Map<string, Entry>();

function readState(entry: Entry) {
  const state = entry.channel.presenceState<Record<string, unknown>>();
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
  entry.viewers = list;
  entry.listeners.forEach((fn) => fn(list));
}

function acquire(quoteId: string, meta: { user_id: string; name: string }, editing: boolean) {
  let entry = registry.get(quoteId);
  if (!entry) {
    const channel = supabase.channel(`quote-presence:${quoteId}`, {
      config: { presence: { key: meta.user_id } },
    });
    entry = { channel, refs: 0, viewers: [], editing, meta, listeners: new Set() };
    registry.set(quoteId, entry);
    const e = entry;
    channel
      .on("presence", { event: "sync" }, () => readState(e))
      .on("presence", { event: "join" }, () => readState(e))
      .on("presence", { event: "leave" }, () => readState(e))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({
            user_id: e.meta.user_id,
            name: e.meta.name,
            editing: e.editing,
            online_at: new Date().toISOString(),
          });
        }
      });
  }
  entry.refs += 1;
  return entry;
}

function release(quoteId: string) {
  const entry = registry.get(quoteId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    registry.delete(quoteId);
    void supabase.removeChannel(entry.channel);
  }
}

export function useQuotePresence(quoteId: string | undefined, editing: boolean) {
  const { data: user } = useCurrentUser();
  const [viewers, setViewers] = useState<QuoteViewer[]>([]);
  const name = user?.full_name ?? user?.email ?? "";

  useEffect(() => {
    if (!quoteId || !user?.id) return;
    const entry = acquire(quoteId, { user_id: user.id, name }, editing);
    const listener = (v: QuoteViewer[]) => setViewers(v);
    entry.listeners.add(listener);
    setViewers(entry.viewers);
    return () => {
      entry.listeners.delete(listener);
      release(quoteId);
    };
  }, [quoteId, user?.id, name]);

  // Promote editing state on the shared channel (any mounted consumer editing wins).
  useEffect(() => {
    if (!quoteId || !user?.id || !editing) return;
    const entry = registry.get(quoteId);
    if (!entry) return;
    entry.editing = true;
    void entry.channel.track({
      user_id: user.id,
      name,
      editing: true,
      online_at: new Date().toISOString(),
    });
    return () => {
      const e = registry.get(quoteId);
      if (!e) return;
      e.editing = false;
      void e.channel.track({ user_id: user.id, name, editing: false, online_at: new Date().toISOString() });
    };
  }, [quoteId, user?.id, name, editing]);

  const others = viewers.filter((v) => v.user_id !== user?.id);
  return {
    viewers,
    others,
    othersEditing: others.filter((v) => v.editing),
    me: user,
  };
}
