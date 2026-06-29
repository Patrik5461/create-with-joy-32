import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Paperclip } from "lucide-react";
import type { ChatMessage } from "@/hooks/use-chat-messages";

function renderBody(body: string | null) {
  if (!body) return null;
  // highlight @mentions
  const parts = body.split(/(@[\p{L}0-9._-]+)/u);
  return parts.map((p, i) =>
    p.startsWith("@")
      ? <span key={i} className="font-medium text-primary">{p}</span>
      : <span key={i}>{p}</span>,
  );
}

function Attachment({ path, name, mime }: { path: string; name: string; mime: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.storage.from("chat-attachments").createSignedUrl(path, 3600).then((res) => {
      if (alive) setUrl(res.data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [path]);
  const isImage = mime?.startsWith("image/");
  if (!url) return <span className="text-xs text-muted-foreground">Načítavam prílohu...</span>;
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block max-w-xs">
        <img src={url} alt={name} className="rounded-md max-h-64 object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline text-xs">
      <Paperclip className="size-3" />{name}
    </a>
  );
}

export function MessageList({ messages, meId }: { messages: ChatMessage[]; meId: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m) => {
        const mine = m.sender_id === meId;
        const mentioned = meId ? m.mentioned_user_ids.includes(meId) : false;
        return (
          <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            <div className={cn("text-[11px] text-muted-foreground mb-1 px-1", mine && "text-right")}>
              {mine ? "Ja" : m.sender_name ?? "Používateľ"} · {format(new Date(m.created_at), "HH:mm")}
            </div>
            <div className={cn(
              "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
              mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
              mentioned && !mine && "ring-2 ring-primary/40",
            )}>
              {renderBody(m.body)}
              {m.attachment_path && m.attachment_name && (
                <div className={cn("mt-2", m.body && "border-t border-border/30 pt-2")}>
                  <Attachment path={m.attachment_path} name={m.attachment_name} mime={m.attachment_mime} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!messages.length && (
        <p className="text-center text-sm text-muted-foreground py-12">Zatiaľ žiadne správy. Napíšte prvú.</p>
      )}
    </div>
  );
}