/**
 * Mesačná mriežka pre kalendár brigádnika.
 *
 * Čistá logika bez Reactu aj bez databázy — brigádnik vidí z kalendára len to,
 * čo mu server pošle (dátum, čas, názov, miesto), a zapísať odtiaľ nemôže nič
 * okrem vlastnej prihlášky. Toto rieši len rozloženie dní do mriežky.
 */

export interface CalendarDay {
  date: Date;
  /** Kľúč dňa, podľa ktorého sa k dňu priraďujú akcie. */
  key: string;
  /** false = deň z predchádzajúceho alebo nasledujúceho mesiaca. */
  inMonth: boolean;
  isToday: boolean;
}

/** Deň v miestnom čase ako `RRRR-MM-DD`. */
export function dayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Celé týždne mesiaca, pondelkom počnúc. Doplnené dni zo susedných mesiacov sú
 * označené `inMonth: false`, aby sa dali stlmiť.
 */
export function monthGrid(anchor: Date, today: Date = new Date()): CalendarDay[][] {
  const first = startOfMonth(anchor);
  // getDay(): nedeľa = 0; chceme pondelok = 0.
  const shift = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift);
  const todayKey = dayKey(today);

  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  while (true) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor);
      week.push({
        date,
        key: dayKey(date),
        inMonth: sameMonth(date, first),
        isToday: dayKey(date) === todayKey,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Hotovo, keď ďalší týždeň už do mesiaca nezasahuje.
    if (!sameMonth(cursor, first)) break;
  }
  return weeks;
}

/** Od ktorého do ktorého mesiaca má zmysel listovať. */
export function monthRange<T extends { startAt: string | null }>(
  events: T[],
  today: Date = new Date(),
): { from: Date; to: Date } {
  const from = startOfMonth(today);
  let to = from;
  for (const ev of events) {
    if (!ev.startAt) continue;
    const m = startOfMonth(new Date(ev.startAt));
    if (m.getTime() > to.getTime()) to = m;
  }
  return { from, to };
}

/** Čo sa s nábytkom deje: nakládka v sklade → inštalácia na mieste → demontáž. */
export type PhaseKind = "load" | "install" | "teardown";

/** Jeden riadok v časovom rozpise akcie. */
export interface ScheduleRow {
  /** Čo sa v tom čase deje. Viac naraz, keď to padá na tú istú minútu —
   *  kalkulácia vtedy nerozlišuje nakládku a inštaláciu. */
  kinds: PhaseKind[];
  /** ISO čas, tak ako prišiel zo servera. */
  at: string;
  /** true = je to iný deň než ten, ku ktorému sa rozpis vzťahuje. */
  otherDay: boolean;
}

/**
 * Čo a kedy sa na akcii deje, v poradí nakládka → inštalácia → demontáž.
 *
 * Brigádnik potrebuje zo všetkého najskôr vedieť, **kedy je nakládka** — holý
 * čas bez popisu mu nepovie, či má prísť do skladu alebo na miesto. Preto má
 * každý riadok svoj druh a formátovanie si rieši zobrazenie.
 *
 * Termíny na tú istú minútu sa zlúčia do jedného riadku (`kinds`), aby tam
 * dvakrát nestál ten istý čas; chýbajúci termín vypadne.
 */
export function scheduleRows(
  ev: { startAt: string | null; eventStartAt?: string | null; endAt: string | null },
  /** Deň, z pohľadu ktorého sa rozpis číta; inak je to deň nakládky. */
  baseDay?: string,
): ScheduleRow[] {
  const baseKey = baseDay || dayKey(ev.startAt) || dayKey(ev.eventStartAt) || dayKey(ev.endAt);
  const entries: [PhaseKind, string | null | undefined][] = [
    ["load", ev.startAt],
    ["install", ev.eventStartAt],
    ["teardown", ev.endAt],
  ];

  const byTime = new Map<number, ScheduleRow>();
  for (const [kind, at] of entries) {
    if (!at) continue;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) continue;
    const row = byTime.get(t);
    if (row) row.kinds.push(kind);
    else byTime.set(t, { kinds: [kind], at, otherDay: !!baseKey && dayKey(at) !== baseKey });
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/**
 * Akcia rozpísaná na dni — tak, ako to robí Google Calendar.
 *
 * Keď je nakládka 27. a demontáž 28., akcia sa objaví pod oboma dátumami a pri
 * každom je napísané, čo sa v ten deň robí. Brigádnik si inak musel domyslieť,
 * či 28. má prísť nakladať alebo rozoberať.
 *
 * Čo padne na ten istý deň, sa spojí do jedného výskytu (`kinds`), aby tá istá
 * akcia nebola v jednom dni dvakrát.
 */
export interface PhaseOccurrence<T> {
  /** Stabilný kľúč pre zoznam. */
  key: string;
  ev: T;
  /** Deň, pod ktorým sa výskyt zobrazí (`RRRR-MM-DD`). */
  day: string;
  /** Čo sa v ten deň deje, v poradí nakládka → inštalácia → demontáž. */
  kinds: PhaseKind[];
  /** Najskorší čas toho dňa (ISO). */
  at: string;
}

export interface PhaseSource {
  id: string;
  startAt: string | null;
  eventStartAt?: string | null;
  endAt: string | null;
}

export function expandPhases<T extends PhaseSource>(events: T[]): PhaseOccurrence<T>[] {
  const out: PhaseOccurrence<T>[] = [];
  for (const ev of events) {
    const byDay = new Map<string, { kinds: PhaseKind[]; at: string }>();
    for (const row of scheduleRows(ev)) {
      const day = dayKey(row.at);
      if (!day) continue;
      const cur = byDay.get(day);
      if (!cur) byDay.set(day, { kinds: [...row.kinds], at: row.at });
      else {
        cur.kinds.push(...row.kinds);
        if (new Date(row.at).getTime() < new Date(cur.at).getTime()) cur.at = row.at;
      }
    }
    for (const [day, v] of byDay) out.push({ key: `${ev.id}-${day}`, ev, day, kinds: v.kinds, at: v.at });
  }
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}

/** Výskyty zoradené pod kľúč dňa. */
export function occurrencesByDay<T extends PhaseSource>(
  events: T[],
): Map<string, PhaseOccurrence<T>[]> {
  const map = new Map<string, PhaseOccurrence<T>[]>();
  for (const occ of expandPhases(events)) {
    map.set(occ.day, [...(map.get(occ.day) ?? []), occ]);
  }
  return map;
}
