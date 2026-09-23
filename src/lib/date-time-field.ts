/**
 * Dátum a čas ako dve samostatné políčka.
 *
 * Jedno políčko `datetime-local` vyzerá pohodlne, ale má zradu: kým v ňom nie je
 * vyplnený aj dátum aj čas, prehliadač nevráti vôbec nič — hodnota je prázdny
 * reťazec. Kto teda zadal len dátum a uložil, prišiel oň a ani sa to nedozvedel;
 * po otvorení kalkulácie bolo políčko prázdne.
 *
 * Preto sú to dve políčka a čas je nepovinný — keď sa nevyplní, doplní sa
 * predvolená hodina a používateľ ju hneď vidí v políčku.
 */

/** ISO reťazec → `YYYY-MM-DD` v miestnom čase; `""` keď nič. */
export function isoToLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO reťazec → `HH:MM` v miestnom čase; `""` keď nič. */
export function isoToLocalTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Dátum + (nepovinný) čas → ISO reťazec.
 *
 * Bez dátumu nevznikne nič — samotný čas nemá čo znamenať. Bez času sa použije
 * `fallbackTime`, takže zadaný dátum sa nikdy nestratí.
 */
export function combineDateTime(
  date: string,
  time: string,
  fallbackTime: string,
): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time || fallbackTime).split(":").map(Number);
  const dt = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
