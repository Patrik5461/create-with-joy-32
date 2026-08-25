/**
 * Plán rozloženia — čistá logika (bez Reactu a bez DOM).
 *
 * Všetko, čo sa dá pokaziť výpočtom (mierka, kapacita, zarovnanie, prichytávanie,
 * export do SVG), žije tu, aby sa to dalo otestovať bez prehliadača.
 * Súradnice prvkov sú v pixeloch plátna; prevod na metre robí `pxPerMeter`.
 */
import { z } from "zod";

// ---------------------------------------------------------------- typy

export const EL_TYPES = [
  // pôvodné typy (schéma v1/v2) — nikdy neodstraňovať, sú v uložených plánoch
  "rect_table",
  "chair",
  "round_table",
  "round_table_chairs",
  "stage",
  "zone_podium",
  "zone_entry",
  "zone_vip",
  "zone_custom",
  // pridané v schéme v3
  "bar",
  "dance_floor",
  "buffet",
  "wall",
  "text",
  "furniture",
] as const;

export type ElType = (typeof EL_TYPES)[number];
export type ChairVariant = "standard" | "bar" | "upholstered";
export type Shape = "rect" | "round";

export interface LayoutElement {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  color?: string;
  chairCount?: number;
  chairVariant?: ChairVariant;
  z?: number;
  locked?: boolean;
  /** Počet miest na sedenie, ktoré prvok poskytuje. Nezadané = odhad podľa typu a rozmeru. */
  seats?: number;
  /** Tvar pre prvky z katalógu (`furniture`). */
  shape?: Shape;
  /** Väzba na skladovú položku — takto vieme, koľko z rezervácie je už rozmiestnené. */
  furnitureItemId?: string;
}

export interface BackgroundImage {
  path: string;
  opacity?: number;
}

export interface LayoutData {
  width: number;
  height: number;
  elements: LayoutElement[];
  schemaVersion?: number;
  roomWidthM?: number;
  roomHeightM?: number;
  pxPerMeter?: number;
  backgroundImage?: BackgroundImage | null;
}

export const SCHEMA_VERSION = 3;

/** Predvolená mierka kreslenia: 1 meter = 50 px. */
export const DEFAULT_PX_PER_METER = 50;
export const DEFAULT_ROOM_W_M = 20;
export const DEFAULT_ROOM_H_M = 12;
export const GRID = 20;
/** Vzdialenosť (v px plátna), do ktorej sa prvok prichytí k inému prvku. */
export const SNAP_TOLERANCE = 6;
/** Šírka miesta pri stole — koľko cm stola potrebuje jeden hosť. */
export const SEAT_WIDTH_M = 0.6;

// ---------------------------------------------------------------- zod

const ElTypeSchema = z.enum(EL_TYPES);

export const LayoutElementSchema = z.object({
  id: z.string(),
  type: ElTypeSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
  chairCount: z.number().optional(),
  chairVariant: z.enum(["standard", "bar", "upholstered"]).optional(),
  z: z.number().optional(),
  locked: z.boolean().optional(),
  seats: z.number().optional(),
  shape: z.enum(["rect", "round"]).optional(),
  furnitureItemId: z.string().optional(),
});

const BackgroundImageSchema = z
  .object({ path: z.string(), opacity: z.number().min(0).max(1).optional() })
  .nullable()
  .optional();

export const LayoutDataSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  elements: z.array(LayoutElementSchema),
  schemaVersion: z.number().optional().default(1),
  roomWidthM: z.number().positive().optional(),
  roomHeightM: z.number().positive().optional(),
  pxPerMeter: z.number().positive().optional(),
  backgroundImage: BackgroundImageSchema,
});

/**
 * Načíta uložený plán. Staršie plány (v1/v2) nemali mierku — dopočítame ju
 * z rozmerov miestnosti, aby sa rozmery dali zobraziť v metroch. Plán sa pritom
 * nesmie posunúť ani preškálovať: pixely zostávajú tak, ako boli uložené.
 */
export function parseLayout(raw: unknown): { layout: LayoutData | null; invalid: boolean } {
  if (raw === null || raw === undefined) return { layout: null, invalid: false };
  const res = LayoutDataSchema.safeParse(raw);
  if (!res.success) return { layout: null, invalid: true };
  const d = res.data;
  const ppm = resolvePxPerMeter(d);
  // Staré plány nemali rozmery miestnosti. Dopočítame ich z plátna, aby sa dali
  // zobraziť a upravovať v metroch — plátno ani prvky sa pritom nehýbu.
  const roundHalf = (n: number) => Math.round(n * 2) / 2;
  return {
    layout: {
      ...d,
      schemaVersion: d.schemaVersion ?? 1,
      pxPerMeter: ppm,
      roomWidthM: d.roomWidthM ?? roundHalf(d.width / ppm),
      roomHeightM: d.roomHeightM ?? roundHalf(d.height / ppm),
      backgroundImage: d.backgroundImage ?? null,
    },
    invalid: false,
  };
}

export function resolvePxPerMeter(l: Pick<LayoutData, "pxPerMeter" | "roomWidthM" | "width">): number {
  if (l.pxPerMeter && l.pxPerMeter > 0) return l.pxPerMeter;
  if (l.roomWidthM && l.roomWidthM > 0 && l.width > 0) return l.width / l.roomWidthM;
  return DEFAULT_PX_PER_METER;
}

export function emptyLayout(): LayoutData {
  return {
    width: Math.round(DEFAULT_ROOM_W_M * DEFAULT_PX_PER_METER),
    height: Math.round(DEFAULT_ROOM_H_M * DEFAULT_PX_PER_METER),
    elements: [],
    schemaVersion: SCHEMA_VERSION,
    roomWidthM: DEFAULT_ROOM_W_M,
    roomHeightM: DEFAULT_ROOM_H_M,
    pxPerMeter: DEFAULT_PX_PER_METER,
    backgroundImage: null,
  };
}

// ---------------------------------------------------------------- mierka

export function mToPx(m: number, pxPerMeter: number): number {
  return m * pxPerMeter;
}
export function pxToM(px: number, pxPerMeter: number): number {
  return px / pxPerMeter;
}
/** Rozmer v px na čitateľný text v metroch, napr. „1,6 m“. */
export function formatMeters(px: number, pxPerMeter: number, digits = 2): string {
  const m = pxToM(px, pxPerMeter);
  return `${m.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",")} m`;
}

/**
 * Zmena rozmerov miestnosti. Plátno = miestnosť, takže px rozmer plátna
 * vyplýva z metrov a mierky. Prvky si nechávajú svoju pozíciu v metroch
 * (t. j. px sa nemenia); tie, čo by po zmenšení vypadli von, sa vtiahnu dnu.
 */
export function resizeRoom(layout: LayoutData, roomWidthM: number, roomHeightM: number): LayoutData {
  const ppm = resolvePxPerMeter(layout);
  const width = Math.max(GRID, Math.round(mToPx(roomWidthM, ppm)));
  const height = Math.max(GRID, Math.round(mToPx(roomHeightM, ppm)));
  return {
    ...layout,
    width,
    height,
    roomWidthM,
    roomHeightM,
    pxPerMeter: ppm,
    elements: clampElementsInto(layout.elements, width, height),
  };
}

/** Vtiahne prvky do plátna. Prvok väčší ako plátno sa posunie k ľavému hornému rohu. */
export function clampElementsInto(els: LayoutElement[], width: number, height: number): LayoutElement[] {
  return els.map((e) => ({
    ...e,
    x: Math.max(0, Math.min(e.x, width - e.w)),
    y: Math.max(0, Math.min(e.y, height - e.h)),
  }));
}

// ---------------------------------------------------------------- pomôcky

export function snap(v: number, grid = GRID): number {
  return Math.round(v / grid) * grid;
}
export function isZone(t: ElType): boolean {
  return t.startsWith("zone_");
}
export function isTable(t: ElType): boolean {
  return t === "rect_table" || t === "round_table" || t === "round_table_chairs";
}
export function sortByZ(els: LayoutElement[]): LayoutElement[] {
  return [...els].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}
export function nextMaxZ(els: LayoutElement[]): number {
  return els.reduce((m, e) => Math.max(m, e.z ?? 0), 0) + 1;
}
export function nextMinZ(els: LayoutElement[]): number {
  return els.reduce((m, e) => Math.min(m, e.z ?? 0), 0) - 1;
}
export function escapeXml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
export function shadeColor(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  if (Number.isNaN(num)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// ---------------------------------------------------------------- kapacita

/**
 * Koľko hostí prvok posadí. Ručne zadané `seats` má prednosť; inak odhad:
 * okolo stola sa počíta obvod delený šírkou miesta (60 cm).
 */
export function seatsOf(el: LayoutElement, pxPerMeter: number): number {
  if (typeof el.seats === "number") return Math.max(0, Math.round(el.seats));
  switch (el.type) {
    case "chair":
      return 1;
    case "round_table_chairs":
      return el.chairCount ?? 0;
    case "round_table":
      return suggestSeatsRound(el.w, el.h, pxPerMeter);
    case "rect_table":
      return suggestSeatsRect(el.w, el.h, pxPerMeter);
    default:
      return 0;
  }
}

/** Obdĺžnikový stôl: hostia sedia po oboch dlhších stranách. */
export function suggestSeatsRect(w: number, h: number, pxPerMeter: number): number {
  const longM = pxToM(Math.max(w, h), pxPerMeter);
  const perSide = Math.floor(longM / SEAT_WIDTH_M);
  return Math.max(0, perSide * 2);
}

/** Okrúhly stôl: obvod delený šírkou miesta. */
export function suggestSeatsRound(w: number, h: number, pxPerMeter: number): number {
  const dM = pxToM((w + h) / 2, pxPerMeter);
  return Math.max(0, Math.floor((Math.PI * dM) / SEAT_WIDTH_M));
}

export interface Capacity {
  seats: number;
  tables: number;
  chairs: number;
  /** Podlahová plocha miestnosti v m², ak je zadaná. */
  roomAreaM2: number | null;
  /** Plocha zabraná prvkami v m². */
  usedAreaM2: number;
}

export function computeCapacity(layout: LayoutData): Capacity {
  const ppm = resolvePxPerMeter(layout);
  let seats = 0;
  let tables = 0;
  let chairs = 0;
  let usedPx2 = 0;
  for (const el of layout.elements) {
    seats += seatsOf(el, ppm);
    if (isTable(el.type)) tables++;
    if (el.type === "chair") chairs++;
    if (el.type === "round_table_chairs") chairs += el.chairCount ?? 0;
    if (el.type !== "text") usedPx2 += el.w * el.h;
  }
  const roomAreaM2 =
    layout.roomWidthM && layout.roomHeightM ? layout.roomWidthM * layout.roomHeightM : null;
  return {
    seats,
    tables,
    chairs,
    roomAreaM2,
    usedAreaM2: usedPx2 / (ppm * ppm),
  };
}

// ---------------------------------------------------------------- katalóg

export interface ParsedDimensions {
  shape: Shape;
  /** Šírka v metroch. */
  wM: number;
  /** Hĺbka v metroch (pri kruhu rovná priemeru). */
  hM: number;
}

/**
 * Rozmery zo skladu sú voľný text: „150 x 150“, „priemer 80 cm“, „78x78x80“,
 * „160 x 100 cm, výška 80 cm“, „165“, „mix“. Vytiahneme z nich pôdorys v metroch.
 * Tretie číslo je výška — na pôdoryse nás nezaujíma.
 */
export function parseDimensions(raw: string | null | undefined): ParsedDimensions | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(",", ".");
  // „výška 80 cm“ je zvislý rozmer, nie pôdorys — odrežeme ho.
  const head = text.split(/vý[sš]ka|height/)[0];
  const round = /priemer|Ø|priemeru|diameter/.test(head);
  const numbers = (head.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
  if (numbers.length === 0) return null;

  // Čísla sú takmer vždy v centimetroch; hodnoty pod 10 berieme ako metre.
  const toM = (n: number) => (n < 10 ? n : n / 100);

  if (round || numbers.length === 1) {
    const d = toM(numbers[0]);
    return { shape: "round", wM: d, hM: d };
  }
  const wM = toM(numbers[0]);
  const hM = toM(numbers[1]);
  return { shape: "rect", wM, hM };
}

/** Aby sa dal prvok chytiť myšou, aj keď je v skutočnosti maličký. */
const MIN_ITEM_PX = 24;

export interface CatalogueItem {
  id: string;
  name: string;
  dimensions?: string | null;
  qty: number;
}

/** Prvok z katalógu v skutočnej mierke; neznámy rozmer dostane rozumnú náhradu. */
export function furnitureElementSize(
  item: Pick<CatalogueItem, "name" | "dimensions">,
  pxPerMeter: number,
): { w: number; h: number; shape: Shape } {
  const parsed = parseDimensions(item.dimensions);
  if (parsed) {
    return {
      w: Math.max(MIN_ITEM_PX, Math.round(mToPx(parsed.wM, pxPerMeter))),
      h: Math.max(MIN_ITEM_PX, Math.round(mToPx(parsed.hM, pxPerMeter))),
      shape: parsed.shape,
    };
  }
  const n = item.name.toLowerCase();
  const guessM: [number, number, Shape] = n.includes("stolič") || n.includes("kreslo")
    ? [0.45, 0.45, "rect"]
    : n.includes("stôl") || n.includes("stol")
      ? [0.8, 0.8, "round"]
      : [0.6, 0.6, "rect"];
  return {
    w: Math.max(MIN_ITEM_PX, Math.round(mToPx(guessM[0], pxPerMeter))),
    h: Math.max(MIN_ITEM_PX, Math.round(mToPx(guessM[1], pxPerMeter))),
    shape: guessM[2],
  };
}

export interface PlacementRow extends CatalogueItem {
  placed: number;
  remaining: number;
}

/** Koľko kusov z rezervácie je už na pláne a koľko ešte chýba. */
export function computePlacement(items: CatalogueItem[], els: LayoutElement[]): PlacementRow[] {
  const placedBy = new Map<string, number>();
  for (const el of els) {
    if (!el.furnitureItemId) continue;
    placedBy.set(el.furnitureItemId, (placedBy.get(el.furnitureItemId) ?? 0) + 1);
  }
  return items.map((it) => {
    const placed = placedBy.get(it.id) ?? 0;
    return { ...it, placed, remaining: it.qty - placed };
  });
}

// ---------------------------------------------------------------- zarovnanie

export type AlignMode = "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "distH" | "distV";

/**
 * Zarovná zadané prvky. Vracia `null`, keď na daný režim nie je dosť prvkov —
 * volajúci vtedy zobrazí hlášku a nič nemení.
 */
export function alignElements(targets: LayoutElement[], mode: AlignMode): LayoutElement[] | null {
  if (targets.length < 2) return null;
  if ((mode === "distH" || mode === "distV") && targets.length < 3) return null;

  // Zarovnanie sa zámerne neprichytáva na mriežku: zaokrúhlenie na mriežku
  // rozhádže hrany prvkov rôznej veľkosti a výsledok potom zarovnaný nie je.
  switch (mode) {
    case "left": {
      const x = Math.min(...targets.map((t) => t.x));
      return targets.map((t) => ({ ...t, x: Math.round(x) }));
    }
    case "right": {
      const r = Math.max(...targets.map((t) => t.x + t.w));
      return targets.map((t) => ({ ...t, x: Math.round(r - t.w) }));
    }
    case "top": {
      const y = Math.min(...targets.map((t) => t.y));
      return targets.map((t) => ({ ...t, y: Math.round(y) }));
    }
    case "bottom": {
      const b = Math.max(...targets.map((t) => t.y + t.h));
      return targets.map((t) => ({ ...t, y: Math.round(b - t.h) }));
    }
    case "hcenter": {
      const cx = targets.reduce((s, t) => s + t.x + t.w / 2, 0) / targets.length;
      return targets.map((t) => ({ ...t, x: Math.round(cx - t.w / 2) }));
    }
    case "vcenter": {
      const cy = targets.reduce((s, t) => s + t.y + t.h / 2, 0) / targets.length;
      return targets.map((t) => ({ ...t, y: Math.round(cy - t.h / 2) }));
    }
    case "distH": {
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalW = sorted.reduce((s, t) => s + t.w, 0);
      const gap = (last.x + last.w - first.x - totalW) / (sorted.length - 1);
      let cursor = first.x;
      return sorted.map((t) => {
        const nt = { ...t, x: Math.round(cursor) };
        cursor += t.w + gap;
        return nt;
      });
    }
    case "distV": {
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalH = sorted.reduce((s, t) => s + t.h, 0);
      const gap = (last.y + last.h - first.y - totalH) / (sorted.length - 1);
      let cursor = first.y;
      return sorted.map((t) => {
        const nt = { ...t, y: Math.round(cursor) };
        cursor += t.h + gap;
        return nt;
      });
    }
  }
}

/** Rozostavia stoly do pravidelnej mriežky vycentrovanej v miestnosti. */
export function arrangeGrid(tables: LayoutElement[], width: number, gap = 40, startY = 80): LayoutElement[] {
  if (tables.length === 0) return [];
  const maxW = Math.max(...tables.map((t) => t.w));
  const maxH = Math.max(...tables.map((t) => t.h));
  const cellW = maxW + gap;
  const cellH = maxH + gap;
  const cols = Math.max(1, Math.floor((width - gap) / cellW));
  const usedCols = Math.min(tables.length, cols);
  const startX = snap((width - (usedCols * cellW - gap)) / 2);
  return tables.map((t, i) => ({
    ...t,
    x: snap(startX + (i % cols) * cellW + (maxW - t.w) / 2),
    y: snap(startY + Math.floor(i / cols) * cellH + (maxH - t.h) / 2),
  }));
}

/** Prečísluje stoly zhora nadol a zľava doprava. */
export function renumberTables(els: LayoutElement[]): { elements: LayoutElement[]; count: number } {
  const tables = els.filter((e) => isTable(e.type)).sort((a, b) => a.y - b.y || a.x - b.x);
  const map = new Map<string, string>();
  tables.forEach((t, i) => map.set(t.id, String(i + 1)));
  return {
    elements: els.map((e) => (map.has(e.id) ? { ...e, label: map.get(e.id) } : e)),
    count: map.size,
  };
}

// ---------------------------------------------------------------- prichytávanie

export interface SnapResult {
  x: number;
  y: number;
  /** Zvislé vodiace čiary (x v px plátna), ktoré sa majú zobraziť. */
  guidesV: number[];
  guidesH: number[];
}

/**
 * Prichytenie k hranám a stredom ostatných prvkov a k stredu miestnosti.
 * Keď nič nie je nablízku, ostáva prichytenie na mriežku.
 */
export function computeSnap(
  moving: { x: number; y: number; w: number; h: number },
  others: LayoutElement[],
  room: { width: number; height: number },
  tolerance = SNAP_TOLERANCE,
): SnapResult {
  const candX: number[] = [0, room.width / 2, room.width];
  const candY: number[] = [0, room.height / 2, room.height];
  for (const o of others) {
    candX.push(o.x, o.x + o.w / 2, o.x + o.w);
    candY.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const edgesX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const edgesY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let bestX: { delta: number; line: number } | null = null;
  for (let i = 0; i < edgesX.length; i++) {
    for (const c of candX) {
      const d = c - edgesX[i];
      if (Math.abs(d) <= tolerance && (bestX === null || Math.abs(d) < Math.abs(bestX.delta))) {
        bestX = { delta: d, line: c };
      }
    }
  }
  let bestY: { delta: number; line: number } | null = null;
  for (let i = 0; i < edgesY.length; i++) {
    for (const c of candY) {
      const d = c - edgesY[i];
      if (Math.abs(d) <= tolerance && (bestY === null || Math.abs(d) < Math.abs(bestY.delta))) {
        bestY = { delta: d, line: c };
      }
    }
  }

  return {
    x: bestX ? moving.x + bestX.delta : snap(moving.x),
    y: bestY ? moving.y + bestY.delta : snap(moving.y),
    guidesV: bestX ? [bestX.line] : [],
    guidesH: bestY ? [bestY.line] : [],
  };
}

// ---------------------------------------------------------------- história

export interface History {
  stack: LayoutData[];
  idx: number;
  /** Kľúč poslednej zlúčiteľnej zmeny (ťahanie, posuvník, písanie). */
  lastKey?: string;
}

export const HISTORY_LIMIT = 60;

export function historySeed(l: LayoutData): History {
  return { stack: [l], idx: 0 };
}

/**
 * Pridá krok do histórie. Súvislé zmeny toho istého druhu (`key`) sa zlúčia
 * do jedného kroku — inak by jedno preťahovanie alebo napísanie názvu spravilo
 * desiatky krokov a Späť by sa stalo nepoužiteľným.
 */
export function historyPush(h: History, next: LayoutData, key?: string): History {
  if (key && h.lastKey === key && h.idx >= 0) {
    const stack = h.stack.slice(0, h.idx + 1);
    stack[stack.length - 1] = next;
    return { stack, idx: stack.length - 1, lastKey: key };
  }
  const trimmed = h.stack.slice(0, h.idx + 1);
  trimmed.push(next);
  const capped = trimmed.slice(-HISTORY_LIMIT);
  return { stack: capped, idx: capped.length - 1, lastKey: key };
}

export function historyUndo(h: History): History {
  if (h.idx <= 0) return { ...h, lastKey: undefined };
  return { stack: h.stack, idx: h.idx - 1, lastKey: undefined };
}
export function historyRedo(h: History): History {
  if (h.idx >= h.stack.length - 1) return { ...h, lastKey: undefined };
  return { stack: h.stack, idx: h.idx + 1, lastKey: undefined };
}
export function canUndo(h: History): boolean {
  return h.idx > 0;
}
export function canRedo(h: History): boolean {
  return h.idx < h.stack.length - 1;
}

// ---------------------------------------------------------------- vzhľad

export const ZONE_COLORS: Record<string, string> = {
  zone_podium: "#fb923c",
  zone_entry: "#22c55e",
  zone_vip: "#a855f7",
  zone_custom: "#0ea5e9",
};

export const TABLE_DEFAULT_FILL = "#fef3c7";
export const TABLE_DEFAULT_STROKE = "#b45309";

export const CHAIR_VARIANT_STYLE: Record<ChairVariant, { fill: string; stroke: string; label: string; badge: string }> = {
  standard: { fill: "#e2e8f0", stroke: "#94a3b8", label: "Štandard", badge: "" },
  bar: { fill: "#fde68a", stroke: "#b45309", label: "Barová", badge: "B" },
  upholstered: { fill: "#c7d2fe", stroke: "#4f46e5", label: "Čalúnená", badge: "Č" },
};

/** Výplň a obrys pre typy, ktoré nie sú stôl, stolička ani zóna. */
export const SURFACE_STYLE: Partial<Record<ElType, { fill: string; stroke: string; text: string }>> = {
  bar: { fill: "#7c2d12", stroke: "#f59e0b", text: "#ffffff" },
  dance_floor: { fill: "#ede9fe", stroke: "#7c3aed", text: "#5b21b6" },
  buffet: { fill: "#ecfccb", stroke: "#4d7c0f", text: "#3f6212" },
  wall: { fill: "#94a3b8", stroke: "#475569", text: "#0f172a" },
};

export const TYPE_LABEL: Record<ElType, string> = {
  rect_table: "Stôl (obdĺžnik)",
  round_table: "Okrúhly stôl",
  round_table_chairs: "Stôl so stoličkami",
  chair: "Stolička",
  stage: "Pódium / Stage",
  bar: "Bar",
  dance_floor: "Parket",
  buffet: "Bufet / raut",
  wall: "Stena / zábrana",
  text: "Text / poznámka",
  furniture: "Položka zo skladu",
  zone_podium: "Zóna: Pódium",
  zone_entry: "Zóna: Vstup",
  zone_vip: "Zóna: VIP sedenie",
  zone_custom: "Vlastná zóna",
};

/** Predvolené rozmery sú v metroch, aby prvky sedeli do skutočnej mierky. */
export const TYPE_DEFAULTS: Record<ElType, { wM: number; hM: number; label?: string; chairCount?: number }> = {
  rect_table: { wM: 1.8, hM: 0.8 },
  round_table: { wM: 1.6, hM: 1.6 },
  round_table_chairs: { wM: 2.4, hM: 2.4, chairCount: 8 },
  chair: { wM: 0.45, hM: 0.45 },
  stage: { wM: 6, hM: 3, label: "PÓDIUM" },
  bar: { wM: 3, hM: 0.7, label: "BAR" },
  dance_floor: { wM: 6, hM: 6, label: "PARKET" },
  buffet: { wM: 4, hM: 0.8, label: "BUFET" },
  wall: { wM: 4, hM: 0.2 },
  text: { wM: 3, hM: 0.6, label: "Poznámka" },
  furniture: { wM: 0.8, hM: 0.8 },
  zone_podium: { wM: 6, hM: 4, label: "Pódium" },
  zone_entry: { wM: 4, hM: 2.4, label: "Vstup" },
  zone_vip: { wM: 6, hM: 4, label: "VIP" },
  zone_custom: { wM: 5, hM: 3.5, label: "Zóna" },
};

export function defaultSizePx(type: ElType, pxPerMeter: number): { w: number; h: number } {
  const d = TYPE_DEFAULTS[type];
  return {
    w: Math.max(MIN_ITEM_PX, Math.round(mToPx(d.wM, pxPerMeter))),
    h: Math.max(MIN_ITEM_PX, Math.round(mToPx(d.hM, pxPerMeter))),
  };
}

export function elementFill(el: LayoutElement): { fill: string; stroke: string; text: string } {
  if (el.type === "chair") {
    const v = CHAIR_VARIANT_STYLE[el.chairVariant ?? "standard"];
    return { fill: v.fill, stroke: v.stroke, text: "#1f2937" };
  }
  if (isZone(el.type)) {
    const c = el.color ?? ZONE_COLORS[el.type] ?? "#0ea5e9";
    return { fill: `${c}33`, stroke: c, text: c };
  }
  const surface = SURFACE_STYLE[el.type];
  if (surface) {
    const c = el.color;
    return c ? { fill: c, stroke: shadeColor(c, -40), text: surface.text } : surface;
  }
  const fill = el.color ?? TABLE_DEFAULT_FILL;
  return { fill, stroke: el.color ? shadeColor(el.color, -30) : TABLE_DEFAULT_STROKE, text: "#1f2937" };
}

/** Text, ktorý sa má na prvku vypísať. */
export function elementLabel(el: LayoutElement): string {
  if (el.label) return el.label;
  if (el.type === "chair") return "";
  if (el.type === "furniture") return "";
  if (isZone(el.type)) return "Zóna";
  if (el.type === "stage") return "PÓDIUM";
  if (isTable(el.type)) return "Stôl";
  return TYPE_LABEL[el.type];
}

// ---------------------------------------------------------------- SVG export

export interface SvgOptions {
  /** Podklad ako data: URL — do exportu sa nedá dať odkaz na chránený súbor. */
  backgroundDataUrl?: string;
  /** Mriežku v exporte väčšinou nechceme. */
  grid?: boolean;
  /** Kóty miestnosti po okrajoch. */
  dimensions?: boolean;
}

function chairRingSvg(el: LayoutElement): string {
  const n = el.chairCount ?? 8;
  const chairSize = Math.min(el.w, el.h) * 0.18;
  const radius = Math.min(el.w, el.h) / 2 - chairSize / 2;
  return Array.from({ length: n })
    .map((_, i) => {
      const angle = (i / n) * Math.PI * 2;
      const x = el.w / 2 + Math.cos(angle) * radius - chairSize / 2;
      const y = el.h / 2 + Math.sin(angle) * radius - chairSize / 2;
      return `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(chairSize)}" height="${round2(chairSize)}" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>`;
    })
    .join("");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function elementSvg(el: LayoutElement): string {
  const label = escapeXml(elementLabel(el));
  const t = `translate(${round2(el.x)} ${round2(el.y)}) rotate(${el.rotation} ${round2(el.w / 2)} ${round2(el.h / 2)})`;
  const { fill, stroke, text } = elementFill(el);
  const cx = round2(el.w / 2);
  const cy = round2(el.h / 2);
  const fontSize = el.type === "chair" || el.type === "furniture" ? 11 : 13;
  const textNode = label
    ? `<text x="${cx}" y="${cy + fontSize / 3}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${text}">${label}</text>`
    : "";

  if (el.type === "text") {
    return `<g transform="${t}"><text x="0" y="${cy + 5}" font-size="14" font-weight="600" fill="#0f172a">${label}</text></g>`;
  }
  if (el.type === "round_table" || (el.type === "furniture" && el.shape === "round")) {
    return `<g transform="${t}"><ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${textNode}</g>`;
  }
  if (el.type === "round_table_chairs") {
    const tableSize = Math.min(el.w, el.h) * 0.55;
    return `<g transform="${t}">${chairRingSvg(el)}<circle cx="${cx}" cy="${cy}" r="${round2(tableSize / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${textNode}</g>`;
  }
  if (el.type === "stage") {
    const stripes = Array.from({ length: Math.ceil(el.w / 48) })
      .map((_, i) => `M ${i * 48 + 24} 0 V ${round2(el.h)}`)
      .join(" ");
    return `<g transform="${t}"><rect width="${round2(el.w)}" height="${round2(el.h)}" rx="6" fill="#111827" stroke="#f59e0b" stroke-width="3"/><path d="${stripes}" stroke="#1f2937" stroke-width="24"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="3" fill="#ffffff">${label}</text></g>`;
  }
  const dashed = isZone(el.type) ? ` stroke-dasharray="8 6"` : "";
  const rx = el.type === "chair" || el.type === "furniture" ? 4 : 6;
  return `<g transform="${t}"><rect width="${round2(el.w)}" height="${round2(el.h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"${dashed}/>${textNode}</g>`;
}

/** Vykreslí plán do samostatného SVG — používa sa pre PNG aj PDF export. */
export function layoutToSvg(layout: LayoutData, opts: SvgOptions = {}): string {
  const parts: string[] = [`<rect width="100%" height="100%" fill="#ffffff"/>`];

  if (opts.backgroundDataUrl && layout.backgroundImage) {
    parts.push(
      `<image href="${opts.backgroundDataUrl}" x="0" y="0" width="${layout.width}" height="${layout.height}" opacity="${layout.backgroundImage.opacity ?? 0.5}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  if (opts.grid) {
    const lines: string[] = [];
    for (let x = 0; x <= layout.width; x += GRID)
      lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${layout.height}" stroke="#e5e7eb" stroke-width="1"/>`);
    for (let y = 0; y <= layout.height; y += GRID)
      lines.push(`<line x1="0" y1="${y}" x2="${layout.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(lines.join(""));
  }

  parts.push(
    `<rect x="1" y="1" width="${layout.width - 2}" height="${layout.height - 2}" fill="none" stroke="#334155" stroke-width="2"/>`,
  );

  if (opts.dimensions !== false && layout.roomWidthM && layout.roomHeightM) {
    parts.push(
      `<text x="${layout.width / 2}" y="${layout.height - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#475569">${layout.roomWidthM} m</text>`,
      `<text x="14" y="${layout.height / 2}" text-anchor="middle" font-size="12" font-weight="600" fill="#475569" transform="rotate(-90 14 ${layout.height / 2})">${layout.roomHeightM} m</text>`,
    );
  }

  parts.push(sortByZ(layout.elements).map(elementSvg).join(""));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" font-family="Helvetica, Arial, sans-serif">${parts.join("")}</svg>`;
}

// ---------------------------------------------------------------- súpis

export interface SummaryRow {
  label: string;
  count: number;
  seats: number;
}

/** Súpis prvkov pre pätu exportu — čo všetko na pláne je. */
export function summarize(layout: LayoutData): SummaryRow[] {
  const ppm = resolvePxPerMeter(layout);
  const rows = new Map<string, SummaryRow>();
  for (const el of layout.elements) {
    if (el.type === "text") continue;
    const key = el.type === "furniture" ? el.label || "Položka zo skladu" : TYPE_LABEL[el.type];
    const row = rows.get(key) ?? { label: key, count: 0, seats: 0 };
    row.count++;
    row.seats += seatsOf(el, ppm);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count);
}
