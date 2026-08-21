import { Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuotePresence } from "@/hooks/use-quote-presence";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Small badges showing everyone who currently has this quote open (incl. you). */
export function QuotePresenceBadges({ quoteId, editing }: { quoteId?: string; editing: boolean }) {
  const { viewers, me } = useQuotePresence(quoteId, editing);
  if (viewers.length === 0) return null;

  const sorted = [...viewers].sort((a, b) => (a.user_id === me?.id ? -1 : b.user_id === me?.id ? 1 : 0));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {sorted.map((v) => {
        const isMe = v.user_id === me?.id;
        const label = isMe ? "vy" : v.name;
        return (
          <Badge
            key={v.key}
            variant="outline"
            className={
              isMe
                ? "border-muted-foreground/30 bg-muted text-muted-foreground gap-1"
                : v.editing
                  ? "border-amber-400 bg-amber-50 text-amber-800 gap-1"
                  : "border-sky-400 bg-sky-50 text-sky-800 gap-1"
            }
            title={`${label} · ${v.editing ? "upravuje" : "pozerá"}`}
          >
            {v.editing ? <Pencil className="size-3" /> : <Eye className="size-3" />}
            <span className="font-medium">{isMe ? "Vy" : initials(v.name)}</span>
            {!isMe && <span className="hidden sm:inline">{v.name}</span>}
          </Badge>
        );
      })}
    </div>
  );
}

/** Warning banner shown when someone else is editing the same quote. */
export function QuoteEditingWarning({ quoteId, editing }: { quoteId?: string; editing: boolean }) {
  const { others, othersEditing } = useQuotePresence(quoteId, editing);
  if (others.length === 0) return null;

  const names = (othersEditing.length ? othersEditing : others).map((v) => v.name).join(", ");

  if (othersEditing.length > 0) {
    return (
      <Alert className="border-amber-400 bg-amber-50 text-amber-900">
        <Pencil className="size-4" />
        <AlertDescription>
          <span className="font-semibold">{names}</span> práve upravuje túto kalkuláciu. Ak budete ukladať súčasne,
          vznikne konfliktná verzia — dohodnite sa, kto zmeny uloží.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-sky-400 bg-sky-50 text-sky-900">
      <Eye className="size-4" />
      <AlertDescription>
        Kalkuláciu má otvorenú aj <span className="font-semibold">{names}</span>.
      </AlertDescription>
    </Alert>
  );
}
