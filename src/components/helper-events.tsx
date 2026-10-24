import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Hourglass, List, Loader2, MapPin, Package, PackageOpen, Truck, Wrench, X } from "lucide-react";
import {
  addMonths, dayKey as dayKeyOf, expandPhases, monthGrid, monthRange, scheduleRows, startOfMonth,
  type PhaseKind, type PhaseOccurrence,
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
 *
 * Akcia nie je v kalendári raz, ale v každý deň, keď sa na nej robí — tak, ako
 * to má Google Calendar. Pri nakládke 27. a demontáži 28. visí pod oboma
 * dátumami a pri každom je napísané, čo sa v ten deň robí.
 */
const MONTH = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" });
const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

const DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });
const SHORT_DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "short", day: "numeric", month: "numeric" });

/**
 * Čo brigádnik potrebuje vedieť ako prvé: čo sa v ten deň robí. Holý čas bez
 * popisu mu nepovie, či má prísť nakladať do skladu, stavať na mieste, alebo
 * už len rozoberať.
 */
const PHASE: Record<PhaseKind, { label: string; short: string; icon: typeof Truck; hint: string }> = {
  load: { label: "Nakládka", short: "N", icon: Truck, hint: "vyzdvihnutie nábytku v sklade" },
  install: { label: "Inštalácia", short: "I", icon: Wrench, hint: "stavba na mieste" },
  teardown: { label: "Demontáž", short: "D", icon: PackageOpen, hint: "zbalenie a návrat do skladu" },
};

/** Deň výskytu ako nadpis: „streda 28. októbra“. */
const dayLabel = (day: string) => DAY.format(new Date(`${day}T12:00:00`));

type Occ = PhaseOccurrence<HelperEvent>;

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

  const occurrences = useMemo(() => expandPhases(events ?? []), [events]);

  const days = useMemo(() => {
    const today = dayKeyOf(new Date());
    const map = new Map<string, { day: string; label: string; today: boolean; items: Occ[] }>();
    for (const occ of occurrences) {
      if (!map.has(occ.day)) {
        map.set(occ.day, { day: occ.day, label: dayLabel(occ.day), today: occ.day === today, items: [] });
      }
      map.get(occ.day)!.items.push(occ);
    }
    return [...map.values()];
  }, [occurrences]);

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
        <div className="mt-1.5 flex items-start gap-1.5">
          <CalendarDays className="size-3 shrink-0 mt-0.5" />
          <span>
            Akcia je v kalendári v každý deň, keď sa na nej robí, a pri každom dátume je
            napísané čo: <span className="font-medium">nakládka</span>,{" "}
            <span className="font-medium">inštalácia</span> alebo{" "}
            <span className="font-medium">demontáž</span>.
          </span>
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
          occurrences={occurrences}
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
        <section key={day.day} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {day.label}
            {day.today && <Badge variant="secondary" className="text-[10px]">dnes</Badge>}
          </h2>
          {day.items.map((occ) => (
            <EventCard key={occ.key} occ={occ} busy={busyId === occ.ev.id} onToggle={() => toggle(occ.ev)} token={token} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Mesačný kalendár — len na prezeranie. Deň, keď sa na nejakej akcii robí, má
 * bodku a pod ňou skratku toho, čo sa robí (N/I/D) a čas; po kliknutí sa pod
 * mriežkou rozbalia kartičky toho dňa. Dotknúť sa dá jedine vlastnej
 * prihlášky, nič v kalendári sa upraviť nedá.
 */
function MonthView({
  occurrences, month, onMonth, selected, onSelect, busyId, onToggle, token,
}: {
  occurrences: Occ[];
  month: Date;
  onMonth: (d: Date) => void;
  selected: string;
  onSelect: (key: string) => void;
  busyId: string | null;
  onToggle: (ev: HelperEvent) => void;
  token: string;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Occ[]>();
    for (const occ of occurrences) map.set(occ.day, [...(map.get(occ.day) ?? []), occ]);
    return map;
  }, [occurrences]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  // Listuje sa po posledný deň, keď sa ešte na niečom robí — nie len po
  // poslednú nakládku.
  const range = useMemo(() => monthRange(occurrences.map((o) => ({ startAt: o.at }))), [occurrences]);
  const canBack = month.getTime() > range.from.getTime();
  const canFwd = month.getTime() < range.to.getTime();
  const dnesne = byDay.get(selected) ?? [];

  /** Prelistovanie mesiaca hneď ukáže prvý deň s prácou — inak by pod mriežkou
   *  ostalo „žiadna akcia“ aj v mesiaci, kde akcie sú. */
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
          const mine = list.some((o) => o.ev.assigned || o.ev.signup === "accepted");
          const isSel = day.key === selected;
          const first = list[0];
          // Skratka v bunke hovorí, čo sa v ten deň robí — bez nej je čas
          // nejednoznačný: o siedmej ráno sa dá rovnako dobre nakladať aj
          // rozoberať.
          const short = first ? first.kinds.map((k) => PHASE[k].short).join("") : "";
          const popis = list
            .map((o) => `${o.kinds.map((k) => PHASE[k].label).join(" + ")} ${TIME.format(new Date(o.at))} — ${o.ev.name}`)
            .join("\n");
          return (
            <button
              key={day.key}
              onClick={() => onSelect(day.key)}
              title={popis || undefined}
              aria-label={`${day.date.getDate()}. — ${list.length === 0 ? "nič" : popis.replace(/\n/g, "; ")}`}
              className={`aspect-square rounded-md border text-sm flex flex-col items-center justify-center gap-0.5
                ${isSel ? "border-foreground bg-muted font-semibold" : "border-transparent"}
                ${day.inMonth ? "" : "text-muted-foreground/40"}
                ${day.isToday && !isSel ? "ring-1 ring-foreground/30" : ""}
                ${list.length > 0 ? "bg-muted/50" : ""}`}
            >
              <span className="leading-none">{day.date.getDate()}</span>
              {first && (
                <>
                  <span className="flex gap-0.5">
                    {list.slice(0, 3).map((o) => (
                      <span
                        key={o.key}
                        className={`size-1.5 rounded-full ${
                          o.ev.assigned || o.ev.signup === "accepted" ? "bg-emerald-600" : "bg-foreground/50"
                        }`}
                      />
                    ))}
                  </span>
                  <span className={`text-[9px] leading-none tabular-nums ${mine ? "text-emerald-700" : "text-muted-foreground"}`}>
                    <span className="font-semibold">{short}</span> {TIME.format(new Date(first.at))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(["load", "install", "teardown"] as PhaseKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="font-semibold text-foreground">{PHASE[k].short}</span>
            {PHASE[k].label.toLowerCase()}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-600" />si na nej nasadený
        </span>
      </div>

      <div className="space-y-2 border-t pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {selected ? dayLabel(selected) : "Vyber deň"}
        </h2>
        {dnesne.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">V tento deň sa na ničom nerobí.</p>
        ) : (
          dnesne.map((occ) => (
            <EventCard key={occ.key} occ={occ} busy={busyId === occ.ev.id} onToggle={() => onToggle(occ.ev)} token={token} />
          ))
        )}
      </div>
    </div>
  );
}

function EventCard({ occ, busy, onToggle, token }: { occ: Occ; busy: boolean; onToggle: () => void; token: string }) {
  const ev = occ.ev;
  // Rozpis sa číta z pohľadu dňa, pod ktorým kartička visí: čo je v tento deň,
  // je zvýraznené, ostatné termíny majú pri sebe dátum.
  const rows = useMemo(() => scheduleRows(ev, occ.day), [ev.startAt, ev.eventStartAt, ev.endAt, occ.day]);
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
      <div className="flex flex-wrap items-center gap-1">
        {occ.kinds.map((k) => {
          const { label, icon: Icon, hint } = PHASE[k];
          return (
            <span
              key={k}
              title={hint}
              className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            >
              <Icon className="size-3" />{label}
            </span>
          );
        })}
      </div>

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
          const Icon = PHASE[r.kinds[0]].icon;
          const at = new Date(r.at);
          const dnes = !r.otherDay;
          return (
            <div
              key={r.at}
              className="flex items-center justify-between gap-2 text-xs"
              title={r.kinds.map((k) => PHASE[k].hint).join(" + ")}
            >
              <span className={`inline-flex items-center gap-1.5 ${dnes ? "font-medium" : "text-muted-foreground"}`}>
                <Icon className="size-3.5 shrink-0" />{r.kinds.map((k) => PHASE[k].label).join(" + ")}
              </span>
              <span className={`tabular-nums shrink-0 ${dnes ? "font-semibold" : "text-muted-foreground"}`}>
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
