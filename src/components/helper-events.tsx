import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Hourglass, List, Loader2, MapPin, Package, PartyPopper, Truck, Undo2, X } from "lucide-react";
import {
  addMonths, dayKey as dayKeyOf, eventsByDay, monthGrid, monthRange, scheduleRows, startOfMonth,
  type ScheduleRow,
} from "@/lib/helper-calendar";
import {
  helperEventItems,
  helperSignUp,
  helperUpcomingEvents,
  helperWithdrawSignup,
  type HelperEvent,
  type HelperEventItems,
} from "@/lib/helper-shifts.functions";
import { EXTRA_LABEL } from "@/lib/ics-items";

/**
 * Rozpis akcií pre brigádnika. Len na čítanie — jediné, čo sa odtiaľto dá
 * zapísať, je vlastná prihláška; server ani nič iné neposiela a nič iné
 * neprijíma.
 *
 * Dve zobrazenia: mesačný kalendár (prehľad, čo kedy je) a zoznam po dňoch
 * (čas a miesto pod sebou). Prepína sa to hore a kalendár je predvolený.
 */
const MONTH = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" });
const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

const DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });
const SHORT_DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "short", day: "numeric", month: "numeric" });

/**
 * Čo brigádnik na akcii vidí ako prvé: kedy je nakládka. Holý čas bez popisu
 * mu nepovie, či má prísť do skladu, na miesto, alebo až po nábytok naspäť.
 */
const SCHEDULE: Record<ScheduleRow["kind"], { label: string; icon: typeof Truck; hint: string }> = {
  load: { label: "Nakládka", icon: Truck, hint: "vyzdvihnutie nábytku v sklade" },
  event: { label: "Akcia", icon: PartyPopper, hint: "začiatok akcie" },
  return: { label: "Vrátenie", icon: Undo2, hint: "nábytok späť v sklade" },
};

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
  const [view, setView] = useState<"kalendar" | "zoznam">("kalendar");
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string>(() => dayKeyOf(new Date()));

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
        <div className="mt-1.5 flex items-center gap-1.5">
          <Truck className="size-3 shrink-0" />
          Akcia je v kalendári v deň nakládky — vtedy sa nábytok vyzdvihuje zo skladu.
        </div>
      </div>

      <div className="inline-flex w-full rounded-md border p-0.5 bg-muted/40">
        {([["kalendar", "Kalendár", CalendarDays], ["zoznam", "Zoznam", List]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 h-9 rounded text-sm inline-flex items-center justify-center gap-1.5 ${
              view === key ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {days.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Zatiaľ tu nie sú žiadne nadchádzajúce akcie.
        </p>
      )}

      {view === "kalendar" && days.length > 0 && (
        <MonthView
          events={events}
          month={month}
          onMonth={setMonth}
          selected={selected}
          onSelect={setSelected}
          busyId={busyId}
          onToggle={toggle}
          token={token}
        />
      )}

      {view === "zoznam" && days.map((day) => (
        <section key={day.label} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {day.label}
            {day.today && <Badge variant="secondary" className="text-[10px]">dnes</Badge>}
          </h2>
          {day.items.map((ev) => (
            <EventCard key={ev.id} ev={ev} busy={busyId === ev.id} onToggle={() => toggle(ev)} token={token} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Mesačný kalendár — len na prezeranie. Deň s akciou má bodku, po kliknutí sa
 * pod mriežkou rozbalia akcie toho dňa (rovnaké kartičky ako v zozname).
 * Dotknúť sa dá jedine vlastnej prihlášky, nič v kalendári sa upraviť nedá.
 */
function MonthView({
  events, month, onMonth, selected, onSelect, busyId, onToggle, token,
}: {
  events: HelperEvent[];
  month: Date;
  onMonth: (d: Date) => void;
  selected: string;
  onSelect: (key: string) => void;
  busyId: string | null;
  onToggle: (ev: HelperEvent) => void;
  token: string;
}) {
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const range = useMemo(() => monthRange(events), [events]);
  const canBack = month.getTime() > range.from.getTime();
  const canFwd = month.getTime() < range.to.getTime();
  const dnesne = byDay.get(selected) ?? [];

  /** Prelistovanie mesiaca hneď ukáže prvú akciu v ňom — inak by pod mriežkou
   *  ostalo „žiadna akcia" aj v mesiaci, kde akcie sú. */
  const goMonth = (delta: number) => {
    const next = addMonths(month, delta);
    onMonth(next);
    const prefix = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    const firstDay = [...byDay.keys()].filter((k) => k.startsWith(prefix)).sort()[0];
    if (firstDay) onSelect(firstDay);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline" size="icon" className="size-9 shrink-0"
          aria-label="Predchádzajúci mesiac"
          disabled={!canBack}
          onClick={() => goMonth(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-sm font-medium capitalize text-center flex-1">{MONTH.format(month)}</div>
        <Button
          variant="outline" size="icon" className="size-9 shrink-0"
          aria-label="Nasledujúci mesiac"
          disabled={!canFwd}
          onClick={() => goMonth(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wide text-muted-foreground py-1">{d}</div>
        ))}
        {weeks.flat().map((day) => {
          const list = byDay.get(day.key) ?? [];
          const mine = list.some((e) => e.assigned || e.signup === "accepted");
          const isSel = day.key === selected;
          // V bunke je čas prvej nakládky — brigádnik tak vidí z mriežky, kedy
          // sa v ten deň nakladá, bez toho aby deň otváral.
          const firstLoad = list.map((e) => e.startAt).filter(Boolean).sort()[0];
          return (
            <button
              key={day.key}
              onClick={() => onSelect(day.key)}
              aria-label={`${day.date.getDate()}. — ${
                list.length === 0
                  ? "bez akcií"
                  : `${list.length} ${list.length === 1 ? "akcia" : list.length < 5 ? "akcie" : "akcií"}${
                      firstLoad ? `, nakládka o ${TIME.format(new Date(firstLoad))}` : ""
                    }`
              }`}
              className={`aspect-square rounded-md border text-sm flex flex-col items-center justify-center gap-0.5
                ${isSel ? "border-foreground bg-muted font-semibold" : "border-transparent"}
                ${day.inMonth ? "" : "text-muted-foreground/40"}
                ${day.isToday && !isSel ? "ring-1 ring-foreground/30" : ""}
                ${list.length > 0 ? "bg-muted/50" : ""}`}
            >
              <span className="leading-none">{day.date.getDate()}</span>
              {list.length > 0 && (
                <>
                  <span className="flex gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`size-1.5 rounded-full ${
                          e.assigned || e.signup === "accepted" ? "bg-emerald-600" : "bg-foreground/50"
                        }`}
                      />
                    ))}
                  </span>
                  {firstLoad && (
                    <span className={`text-[9px] leading-none tabular-nums ${mine ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {TIME.format(new Date(firstLoad))}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-foreground/50" />akcia</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-600" />si na nej nasadený</span>
        <span className="inline-flex items-center gap-1"><Truck className="size-3" />čas v bunke = nakládka</span>
      </div>

      <div className="space-y-2 border-t pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {selected ? DAY.format(new Date(`${selected}T12:00:00`)) : "Vyber deň"}
        </h2>
        {dnesne.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">V tento deň nie je žiadna akcia.</p>
        ) : (
          dnesne.map((ev) => (
            <EventCard key={ev.id} ev={ev} busy={busyId === ev.id} onToggle={() => onToggle(ev)} token={token} />
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, busy, onToggle, token }: { ev: HelperEvent; busy: boolean; onToggle: () => void; token: string }) {
  const rows = useMemo(() => scheduleRows(ev), [ev.startAt, ev.eventStartAt, ev.endAt]);
  const confirmed = ev.assigned || ev.signup === "accepted";
  const itemsFn = useServerFn(helperEventItems);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HelperEventItems | null>(null);
  const [loading, setLoading] = useState(false);

  /** Zoznam sa ťahá až pri rozkliknutí — na mobilnom internete sa nenaťahuje
   *  nábytok z dvadsiatich akcií, ktoré nikto neotvoril. */
  async function toggleItems() {
    const next = !open;
    setOpen(next);
    if (!next || items || loading) return;
    setLoading(true);
    try {
      setItems(await itemsFn({ data: { token, reservationId: ev.id } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Zoznam sa nepodarilo načítať.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

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

      <div className="rounded-md bg-muted/40 px-2.5 py-2 space-y-1">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Termín zatiaľ nie je zadaný.</p>}
        {rows.map((r) => {
          const { label, icon: Icon, hint } = SCHEDULE[r.kind];
          const at = new Date(r.at);
          const main = r.kind === "load";
          return (
            <div key={r.kind} className="flex items-center justify-between gap-2 text-xs" title={hint}>
              <span className={`inline-flex items-center gap-1.5 ${main ? "font-medium" : "text-muted-foreground"}`}>
                <Icon className="size-3.5 shrink-0" />{label}
              </span>
              <span className={`tabular-nums shrink-0 ${main ? "font-semibold" : "text-muted-foreground"}`}>
                {r.otherDay && <span className="font-normal">{SHORT_DAY.format(at)}, </span>}
                {TIME.format(at)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border bg-muted/30">
        <button
          onClick={toggleItems}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium"
          aria-expanded={open}
        >
          <span className="inline-flex items-center gap-1.5">
            <Package className="size-3.5" />
            Čo sa vezie
            {items && <span className="text-muted-foreground font-normal">· {items.totalQty} ks</span>}
          </span>
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
        </button>
        {open && items && (
          <div className="px-2.5 pb-2.5 space-y-1.5">
            {items.furniture.length === 0 && items.extras.length === 0 && (
              <p className="text-xs text-muted-foreground">Na akcii zatiaľ nie je zapísaný žiadny nábytok.</p>
            )}
            {items.furniture.map((it) => (
              <div key={it.name} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0">{it.name}</span>
                <span className="font-semibold tabular-nums shrink-0">{it.qty} ks</span>
              </div>
            ))}
            {items.extras.length > 0 && (
              <div className="pt-1.5 border-t space-y-1.5">
                {items.extras.map((it) => (
                  <div key={`${it.kind}-${it.name}`} className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0">{it.name} <span className="opacity-70">({EXTRA_LABEL[it.kind] ?? it.kind})</span></span>
                    <span className="font-semibold tabular-nums shrink-0">{it.qty} ks</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
