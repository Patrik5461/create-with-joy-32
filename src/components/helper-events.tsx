import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, Clock, Hourglass, Loader2, MapPin, X } from "lucide-react";
import {
  helperSignUp,
  helperUpcomingEvents,
  helperWithdrawSignup,
  type HelperEvent,
} from "@/lib/helper-shifts.functions";

/**
 * Rozpis akcií pre brigádnika. Len na čítanie — jediné, čo sa odtiaľto dá
 * zapísať, je vlastná prihláška. Na telefóne je to zoznam po dňoch, nie mesačná
 * mriežka: brigádnik potrebuje vidieť čas a miesto, nie farebné bodky.
 */

const DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });

function dayKey(iso: string | null): string {
  if (!iso) return "bez-terminu";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return dayKey(iso) === dayKey(new Date().toISOString());
}

export function HelperEvents({ token, onExpired }: { token: string; onExpired: () => void }) {
  const listFn = useServerFn(helperUpcomingEvents);
  const signUpFn = useServerFn(helperSignUp);
  const withdrawFn = useServerFn(helperWithdrawSignup);

  const [events, setEvents] = useState<HelperEvent[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setEvents(await listFn({ data: { token } }));
    } catch (e: any) {
      const msg = e?.message ?? "Rozpis sa nepodarilo načítať.";
      toast.error(msg);
      if (msg.includes("Session")) onExpired();
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(ev: HelperEvent) {
    setBusyId(ev.id);
    try {
      if (ev.signup === "pending") {
        await withdrawFn({ data: { token, reservationId: ev.id } });
        toast.success("Prihláška stiahnutá");
      } else {
        await signUpFn({ data: { token, reservationId: ev.id } });
        toast.success("Prihlásené — čaká na potvrdenie");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa.");
    } finally {
      setBusyId(null);
    }
  }

  const days = useMemo(() => {
    const map = new Map<string, { label: string; today: boolean; items: HelperEvent[] }>();
    for (const ev of events ?? []) {
      const key = dayKey(ev.startAt);
      if (!map.has(key)) {
        map.set(key, {
          label: ev.startAt ? DAY.format(new Date(ev.startAt)) : "Bez termínu",
          today: isToday(ev.startAt),
          items: [],
        });
      }
      map.get(key)!.items.push(ev);
    }
    return [...map.values()];
  }, [events]);

  const mine = (events ?? []).filter((e) => e.assigned || e.signup === "pending" || e.signup === "accepted");

  if (events === null) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        <Loader2 className="size-4 animate-spin inline mr-1" />Načítavam rozpis…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        Klikni na akciu, na ktorej by si chcel robiť. Prihláška ide na schválenie —
        keď ju vedenie potvrdí, uvidíš tu <span className="font-medium text-emerald-700">Potvrdené</span>.
        {mine.length > 0 && (
          <> Zatiaľ máš {mine.length} {mine.length === 1 ? "akciu" : mine.length < 5 ? "akcie" : "akcií"}.</>
        )}
      </div>

      {days.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Zatiaľ tu nie sú žiadne nadchádzajúce akcie.
        </p>
      )}

      {days.map((day) => (
        <section key={day.label} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {day.label}
            {day.today && <Badge variant="secondary" className="text-[10px]">dnes</Badge>}
          </h2>
          {day.items.map((ev) => (
            <EventCard key={ev.id} ev={ev} busy={busyId === ev.id} onToggle={() => toggle(ev)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function EventCard({ ev, busy, onToggle }: { ev: HelperEvent; busy: boolean; onToggle: () => void }) {
  const start = ev.startAt ? new Date(ev.startAt) : null;
  const end = ev.endAt ? new Date(ev.endAt) : null;
  const confirmed = ev.assigned || ev.signup === "accepted";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${confirmed ? "border-emerald-300 bg-emerald-50/50" : "bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium leading-tight">{ev.name}</div>
          {ev.venue && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{ev.venue}</span>
            </div>
          )}
        </div>
        {confirmed ? (
          <Badge className="bg-emerald-600 text-white shrink-0"><Check className="size-3 mr-1" />Potvrdené</Badge>
        ) : ev.signup === "pending" ? (
          <Badge variant="secondary" className="shrink-0"><Hourglass className="size-3 mr-1" />Čaká</Badge>
        ) : ev.signup === "declined" ? (
          <Badge variant="outline" className="shrink-0 text-muted-foreground">Neprijaté</Badge>
        ) : null}
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="size-3 shrink-0" />
        {start ? TIME.format(start) : "—"}
        {end && <> – {TIME.format(end)}{dayKey(ev.endAt) !== dayKey(ev.startAt) && " (nasl. deň)"}</>}
      </div>

      {confirmed ? (
        <p className="text-[11px] text-emerald-800">Si nasadený na túto akciu.</p>
      ) : (
        <Button
          size="sm"
          variant={ev.signup === "pending" ? "outline" : "default"}
          className="w-full h-9"
          disabled={busy}
          onClick={onToggle}
        >
          {busy ? <Loader2 className="size-4 animate-spin" />
            : ev.signup === "pending"
              ? <><X className="size-4 mr-1" />Stiahnuť prihlášku</>
              : <><Check className="size-4 mr-1" />Mám záujem</>}
        </Button>
      )}
    </div>
  );
}
