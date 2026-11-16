/**
 * Dátum v slovenskom tvare (16. 11. 2026) ⇄ `RRRR-MM-DD`.
 *
 * Výber dátumu z prehliadača (`<input type="date">`) má jazyk prehliadača
 * a systému, nie stránky — u mnohých bol v češtine. Preto má aplikácia
 * vlastné dátumové polia; tieto funkcie im prekladajú, čo človek napíše.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const SK_MONTHS = [
  "január", "február", "marec", "apríl", "máj", "jún",
  "júl", "august", "september", "október", "november", "december",
] as const;

/** Existuje taký deň? (31. 4. ani 29. 2. 2027 neprejdú) */
function validDay(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Text od človeka → `RRRR-MM-DD`, alebo `null` keď sa nedá pochopiť.
 * Berie `16.11.2026`, `16. 11. 2026`, `16/11/2026`, `16-11-2026`,
 * dvojmiestny rok (`16.11.26` → 2026) aj `2026-11-16`.
 */
export function parseSkDate(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2}|\d{4})\.?$/.exec(t);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += 2000;
  return validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** `RRRR-MM-DD` → `16. 11. 2026`; prázdne/nezmysel → `""`. */
export function formatSkDate(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return "";
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/** `RRRR-MM-DD` → miestny `Date` o poludní (bez posunu časovým pásmom). */
export function dayToDate(day: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return undefined;
  const dt = new Date(2000, 0, 1, 12, 0, 0, 0);
  dt.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt;
}

/** Miestny `Date` → `RRRR-MM-DD`. */
export function dateToDay(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `RRRR-MM-DDTHH:MM` (hodnota bývalého `datetime-local`) → [deň, čas]. */
export function splitLocalDateTime(v: string | null | undefined): [string, string] {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(v ?? "");
  return m ? [m[1], m[2] ?? ""] : ["", ""];
}
