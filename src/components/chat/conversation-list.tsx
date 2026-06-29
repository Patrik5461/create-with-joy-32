import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { sk } from "date-fns/locale";
import type { ChatConversation } from "@/hooks/use-chat-conversations";
import { useChatProfiles } from "@/hooks/use-chat-profiles";

interface Props {
  conversations: ChatConversation[];
  activeId: string | null;
  meId: string | undefined;
  onSelect: (id: string) => void;
  onStartDirect: (otherId: string) => void;
}

export function ConversationList({ conversations, activeId, meId, onSelect, onStartDirect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const profilesQ = useChatProfiles(meId);
  const filtered = (profilesQ.data ?? []).filter((p) =>
    (p.full_name ?? p.email).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <h2 className="text-sm font-semibold">Konverzácie</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Nová správa"><Plus className="size-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nová správa</DialogTitle></DialogHeader>
            <Input placeholder="Hľadať kolegu..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                  onClick={() => { onStartDirect(p.id); setOpen(false); setSearch(""); }}
                >
                  <div className="text-sm font-medium">{p.full_name ?? p.email}</div>
                  {p.full_name && <div className="text-xs text-muted-foreground">{p.email}</div>}
                </button>
              ))}
              {!filtered.length && <p className="text-sm text-muted-foreground p-3 text-center">Žiadny používateľ.</p>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors flex items-start gap-3",
              activeId === c.id && "bg-muted",
            )}
          >
            <div className={cn(
              "size-9 rounded-full grid place-items-center shrink-0",
              c.type === "global" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}>
              {c.type === "global" ? <Users className="size-4" /> : <MessageSquare className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{c.title}</span>
                {c.last_message_at && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNowStrict(new Date(c.last_message_at), { locale: sk, addSuffix: false })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate">{c.last_message ?? "Žiadne správy"}</span>
                {c.unread > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{c.unread}</Badge>}
              </div>
            </div>
          </button>
        ))}
        {!conversations.length && <p className="text-sm text-muted-foreground p-4 text-center">Žiadne konverzácie.</p>}
      </div>
    </div>
  );
}