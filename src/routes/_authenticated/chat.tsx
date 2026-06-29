import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useChatConversations } from "@/hooks/use-chat-conversations";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageList } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat")({
  ssr: false,
  head: () => ({ meta: [{ title: "Interný Chat · Mima Production CRM" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { data: me } = useCurrentUser();
  const meId = me?.id;
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState<string | null>(null);

  const convQ = useChatConversations(meId);
  const msgQ = useChatMessages(activeId, meId);

  // Pick global conversation by default once loaded
  if (!activeId && convQ.data?.length && !isMobile) {
    const g = convQ.data.find((c) => c.type === "global") ?? convQ.data[0];
    if (g) setActiveId(g.id);
  }

  async function startDirect(otherId: string) {
    try {
      const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { _other: otherId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["chat", "conversations", meId] });
      setActiveId(data as string);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa otvoriť konverzáciu");
    }
  }

  const active = convQ.data?.find((c) => c.id === activeId) ?? null;
  const showList = !isMobile || !activeId;
  const showThread = !isMobile || !!activeId;

  return (
    <>
      <AppHeader title="Interný Chat" />
      <div className="flex h-[calc(100vh-3.5rem)]">
        {showList && (
          <aside className="w-full md:w-80 border-r bg-card flex-shrink-0">
            <ConversationList
              conversations={convQ.data ?? []}
              activeId={activeId}
              meId={meId}
              onSelect={setActiveId}
              onStartDirect={startDirect}
            />
          </aside>
        )}
        {showThread && (
          <section className="flex-1 flex flex-col min-w-0">
            {active ? (
              <>
                <div className="border-b px-4 py-3 flex items-center gap-2">
                  {isMobile && (
                    <Button size="icon" variant="ghost" aria-label="Späť" onClick={() => setActiveId(null)}>
                      <ArrowLeft className="size-4" />
                    </Button>
                  )}
                  <div>
                    <div className="text-sm font-semibold">{active.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {active.type === "global" ? "Spoločný kanál pre všetkých zamestnancov" : "Súkromná konverzácia"}
                    </div>
                  </div>
                </div>
                <MessageList messages={msgQ.data ?? []} meId={meId} />
                {meId && <MessageComposer conversationId={active.id} meId={meId} />}
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-8 text-center">
                Vyberte konverzáciu zo zoznamu vľavo, alebo kliknite na „+" pre novú správu.
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}