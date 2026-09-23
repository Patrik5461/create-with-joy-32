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

/** ISO reťazec → `YYYY-MM-DD` v miestnom čase; `""` keď nič.
 *
 *  Rok musí mať štyri číslice aj počas písania (0202), inak políčko dostane
 *  neplatnú hodnotu, vyprázdni sa a rozpísaný dátum je preč. */
export function isoToLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const dt = new Date(2000, 0, 1, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  // Rok sa MUSÍ nastaviť cez setFullYear. `new Date(rok, …)` totiž roky 0–99
  // ticho posunie do 20. storočia — a keďže prehliadač rok dopisuje po
  // cifrách (2 → 20 → 202 → 2026), z prvej cifry sa stal rok 1902 a ďalej sa
  // to už nedalo prepísať. Presne to sa dialo v kalkuláciách.
  dt.setFullYear(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** Rozumný rozsah rokov pre kalkulácie. Mimo neho ide takmer isto o preklep —
 *  napríklad rozpísaný rok (0202), ktorý ostal nedopísaný. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** true = dátum má rok, ktorý takto nemohol byť myslený. */
export function implausibleYear(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  return y < MIN_YEAR || y > MAX_YEAR;
}
