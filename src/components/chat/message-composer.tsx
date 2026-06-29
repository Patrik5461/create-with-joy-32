import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useChatProfiles } from "@/hooks/use-chat-profiles";

interface Props {
  conversationId: string;
  meId: string;
}

export function MessageComposer({ conversationId, meId }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const profilesQ = useChatProfiles(meId);

  const mentionMatches =
    mentionQuery !== null
      ? (profilesQ.data ?? [])
          .filter((p) => (p.full_name ?? p.email).toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [];

  function onChange(v: string) {
    setText(v);
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? v.length;
    const upto = v.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(name: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}0-9._-]*)$/u, `@${name.replace(/\s+/g, "_")} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      let attachment_path: string | null = null;
      let attachment_name: string | null = null;
      let attachment_mime: string | null = null;
      if (file) {
        const path = `${conversationId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        attachment_path = path;
        attachment_name = file.name;
        attachment_mime = file.type || null;
      }

      // detect mentions by matching @Name_With_Underscores against profiles
      const profiles = profilesQ.data ?? [];
      const mentionedIds: string[] = [];
      const matches = text.match(/@([\p{L}0-9._-]+)/gu) ?? [];
      for (const raw of matches) {
        const handle = raw.slice(1).replace(/_/g, " ").toLowerCase();
        const found = profiles.find((p) => (p.full_name ?? p.email).toLowerCase() === handle);
        if (found && !mentionedIds.includes(found.id)) mentionedIds.push(found.id);
      }

      const { data: msg, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: meId,
          body: text.trim() || null,
          attachment_path,
          attachment_name,
          attachment_mime,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (mentionedIds.length && msg) {
        await supabase.from("message_mentions").insert(
          mentionedIds.map((user_id) => ({ message_id: msg.id, user_id })),
        );
      }

      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa odoslať správu");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t bg-background px-3 py-2.5">
      {file && (
        <div className="mb-2 inline-flex items-center gap-2 text-xs bg-muted rounded-md px-2 py-1">
          <Paperclip className="size-3" />{file.name}
          <button onClick={() => setFile(null)} aria-label="Odstrániť prílohu"><X className="size-3" /></button>
        </div>
      )}
      {mentionMatches.length > 0 && (
        <div className="mb-2 border rounded-md bg-popover shadow-sm overflow-hidden">
          {mentionMatches.map((p) => (
            <button
              key={p.id}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
              onClick={() => insertMention(p.full_name ?? p.email)}
            >
              @{p.full_name ?? p.email}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="ghost" size="icon" aria-label="Pripojiť súbor" onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Napíšte správu... (Enter odošle, Shift+Enter nový riadok, @ na označenie kolegu)"
          rows={1}
          className="min-h-[40px] max-h-32 resize-none flex-1"
        />
        <Button type="button" onClick={() => void send()} disabled={sending || (!text.trim() && !file)} aria-label="Odoslať">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}