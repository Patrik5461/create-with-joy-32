/**
 * Zoznam nábytku do popisu udalosti v kalendári (Apple, Google).
 *
 * Feed dovtedy posielal len termíny a kontakt, takže z kalendára sa nedalo
 * zistiť, čo sa na akciu vezie — a práve to človek pri nakládke potrebuje.
 * Čistá funkcia bez databázy, aby sa dala testovať.
 */

export interface IcsItemRow {
  qty: number | null;
  furniture_items: { name: string | null } | null;
}

/** Dlhší zoznam by v pozvánke nikto nečítal a niektorí klienti ho aj orežú. */
export const MAX_ITEM_LINES = 40;

/** 1 položka, 2–4 položky, 5+ položiek. */
function polozky(n: number): string {
  if (n === 1) return "1 položka";
  if (n >= 2 && n <= 4) return `${n} položky`;
  return `${n} položiek`;
}

export function formatReservationItems(items: IcsItemRow[] | null | undefined): string | null {
  // Tá istá položka môže byť na rezervácii na viacerých riadkoch — spočítame ju.
  const merged = new Map<string, number>();
  for (const it of items ?? []) {
    const name = (it?.furniture_items?.name ?? "").trim();
    const qty = Math.max(0, Math.round(Number(it?.qty) || 0));
    if (!name || qty === 0) continue;
    merged.set(name, (merged.get(name) ?? 0) + qty);
  }
  if (merged.size === 0) return null;

  // Od najväčšieho počtu — čo sa vezie najviac, je hore.
  const rows = [...merged.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sk"),
  );
  const total = rows.reduce((s, [, q]) => s + q, 0);
  const lines = rows.slice(0, MAX_ITEM_LINES).map(([name, qty]) => `• ${qty}× ${name}`);
  if (rows.length > MAX_ITEM_LINES) {
    lines.push(`• … a ďalších ${rows.length - MAX_ITEM_LINES} položiek`);
  }
  return `Nábytok (${polozky(rows.length)}, ${total} ks):\n${lines.join("\n")}`;
}
