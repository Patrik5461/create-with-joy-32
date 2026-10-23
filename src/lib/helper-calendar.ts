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

/** Akcie zoradené pod kľúč dňa, v ktorom začínajú. */
export function eventsByDay<T extends { startAt: string | null }>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const ev of events) {
    const key = dayKey(ev.startAt);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), ev]);
  }
  return map;
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
