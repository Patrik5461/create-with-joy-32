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

/**
 * Položky, ktoré nie sú v sklade, a teda nie sú ani v `reservation_items`:
 * nábytok mimo skladu (dopožičaný), služby/doprava a položky „Iné“. Do
 * kalendára patria — dopožičaný nábytok sa na akciu vezie rovnako ako vlastný
 * a služby hovoria, čo sa tam bude robiť. Čítajú sa z aktuálnej verzie
 * kalkulácie, nie z rezervácie, lebo rezervácia ich nemá kam uložiť.
 */
export interface IcsExtraRow {
  kind: string | null;
  furniture_item_id: string | null;
  name: string | null;
  qty: number | null;
}

const EXTRA_LABEL: Record<string, string> = {
  offstock: "mimo skladu",
  service: "služba",
  other: "iné",
};

/** Poradie v zozname: najprv tovar, potom služby, nakoniec ostatné. */
const EXTRA_ORDER = ["offstock", "service", "other"];

function extraKind(row: IcsExtraRow): string | null {
  const kind = (row?.kind ?? "").trim();
  if (kind === "furniture") return row.furniture_item_id ? null : "offstock";
  if (kind === "service") return "service";
  if (kind === "other") return "other";
  return null;
}

export function formatExtraItems(rows: IcsExtraRow[] | null | undefined): string | null {
  const merged = new Map<string, { name: string; qty: number; kind: string }>();
  for (const row of rows ?? []) {
    const kind = extraKind(row);
    if (!kind) continue;
    const name = (row?.name ?? "").trim();
    const qty = Math.max(0, Math.round(Number(row?.qty) || 0));
    if (!name || qty === 0) continue;
    const key = `${kind}::${name}`;
    const prev = merged.get(key);
    merged.set(key, { name, qty: (prev?.qty ?? 0) + qty, kind });
  }
  if (merged.size === 0) return null;

  const rowsOut = [...merged.values()].sort(
    (a, b) =>
      EXTRA_ORDER.indexOf(a.kind) - EXTRA_ORDER.indexOf(b.kind) ||
      b.qty - a.qty ||
      a.name.localeCompare(b.name, "sk"),
  );
  const lines = rowsOut
    .slice(0, MAX_ITEM_LINES)
    .map((r) => `• ${r.qty}× ${r.name} — ${EXTRA_LABEL[r.kind]}`);
  if (rowsOut.length > MAX_ITEM_LINES) {
    lines.push(`• … a ďalších ${rowsOut.length - MAX_ITEM_LINES} položiek`);
  }
  return `Ďalšie položky (${polozky(rowsOut.length)}):\n${lines.join("\n")}`;
}
