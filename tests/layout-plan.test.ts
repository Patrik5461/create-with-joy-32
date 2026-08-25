/**
 * Testy logiky plánu rozloženia. Spúšťa sa `bun test`.
 * Kreslenie a React sa netestujú — tu ide o výpočty, na ktorých plán stojí.
 */
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PX_PER_METER,
  GRID,
  alignElements,
  arrangeGrid,
  clampElementsInto,
  computeCapacity,
  computePlacement,
  computeSnap,
  defaultSizePx,
  elementFill,
  emptyLayout,
  formatMeters,
  furnitureElementSize,
  historyPush,
  historyRedo,
  historySeed,
  historyUndo,
  canRedo,
  canUndo,
  layoutToSvg,
  parseDimensions,
  parseLayout,
  renumberTables,
  resizeRoom,
  resolvePxPerMeter,
  seatsOf,
  shadeColor,
  snap,
  suggestSeatsRect,
  suggestSeatsRound,
  summarize,
  type LayoutData,
  type LayoutElement,
} from "../src/lib/layout-plan";

function el(over: Partial<LayoutElement> = {}): LayoutElement {
  return { id: over.id ?? "e1", type: "rect_table", x: 0, y: 0, w: 100, h: 50, rotation: 0, ...over };
}

// ------------------------------------------------------------------ mierka

describe("mierka a miestnosť", () => {
  it("prázdny plán má plátno presne v pomere miestnosti", () => {
    const l = emptyLayout();
    expect(l.width / l.height).toBeCloseTo(l.roomWidthM! / l.roomHeightM!, 5);
    expect(l.pxPerMeter).toBe(DEFAULT_PX_PER_METER);
  });

  it("mierku dopočíta zo starého plánu, ktorý ju nemal uloženú", () => {
    expect(resolvePxPerMeter({ width: 1400, roomWidthM: 28, pxPerMeter: undefined })).toBe(50);
  });

  it("bez rozmerov miestnosti použije predvolenú mierku", () => {
    expect(resolvePxPerMeter({ width: 1400, roomWidthM: undefined, pxPerMeter: undefined })).toBe(
      DEFAULT_PX_PER_METER,
    );
  });

  it("zmena rozmerov miestnosti zmení plátno a zachová mierku", () => {
    const l = resizeRoom(emptyLayout(), 30, 10);
    expect(l.width).toBe(30 * DEFAULT_PX_PER_METER);
    expect(l.height).toBe(10 * DEFAULT_PX_PER_METER);
    expect(resolvePxPerMeter(l)).toBe(DEFAULT_PX_PER_METER);
  });

  it("zmenšenie miestnosti vtiahne prvky dovnútra, nestratí ich", () => {
    const start: LayoutData = { ...emptyLayout(), elements: [el({ x: 900, y: 500, w: 100, h: 50 })] };
    const l = resizeRoom(start, 10, 6);
    const e = l.elements[0];
    expect(l.elements).toHaveLength(1);
    expect(e.x + e.w).toBeLessThanOrEqual(l.width);
    expect(e.y + e.h).toBeLessThanOrEqual(l.height);
  });

  it("prvok väčší ako miestnosť skončí v ľavom hornom rohu, nie v zápornej súradnici", () => {
    const [e] = clampElementsInto([el({ x: 50, y: 50, w: 400, h: 400 })], 200, 200);
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });

  it("rozmery vypisuje v metroch po slovensky", () => {
    expect(formatMeters(80, 50)).toBe("1,6 m");
    expect(formatMeters(100, 50)).toBe("2 m");
  });
});

// ------------------------------------------------------------------ kapacita

describe("kapacita", () => {
  it("obdĺžnikový stôl posadí ľudí po oboch dlhších stranách", () => {
    // 1,8 m dlhý stôl → 3 miesta na stranu (60 cm na hosťa) → 6 miest
    expect(suggestSeatsRect(90, 40, 50)).toBe(6);
  });

  it("okrúhly stôl počíta z obvodu", () => {
    // priemer 1,6 m → obvod 5,03 m → 8 miest
    expect(suggestSeatsRound(80, 80, 50)).toBe(8);
  });

  it("ručne zadaný počet miest má prednosť pred odhadom", () => {
    expect(seatsOf(el({ type: "round_table", w: 80, h: 80, seats: 4 }), 50)).toBe(4);
  });

  it("stolička je jedno miesto, zóna žiadne", () => {
    expect(seatsOf(el({ type: "chair" }), 50)).toBe(1);
    expect(seatsOf(el({ type: "zone_vip" }), 50)).toBe(0);
  });

  it("stôl so stoličkami počíta svoje stoličky", () => {
    expect(seatsOf(el({ type: "round_table_chairs", chairCount: 10 }), 50)).toBe(10);
  });

  it("celková kapacita sčíta všetky prvky a plochu", () => {
    const layout: LayoutData = {
      ...emptyLayout(),
      elements: [
        el({ id: "a", type: "round_table_chairs", chairCount: 8, w: 120, h: 120 }),
        el({ id: "b", type: "chair", w: 20, h: 20 }),
        el({ id: "c", type: "zone_vip", w: 200, h: 100 }),
      ],
    };
    const cap = computeCapacity(layout);
    expect(cap.seats).toBe(9);
    expect(cap.chairs).toBe(9);
    expect(cap.tables).toBe(1);
    expect(cap.roomAreaM2).toBe(240);
    // 120×120 + 20×20 + 200×100 px pri 50 px/m
    expect(cap.usedAreaM2).toBeCloseTo((120 * 120 + 20 * 20 + 200 * 100) / 2500, 5);
  });

  it("textová poznámka nezaberá plochu", () => {
    const cap = computeCapacity({ ...emptyLayout(), elements: [el({ type: "text", w: 200, h: 40 })] });
    expect(cap.usedAreaM2).toBe(0);
  });
});

// ------------------------------------------------------------------ katalóg

describe("rozmery zo skladu", () => {
  it("„150 x 150“ je obdĺžnik 1,5 × 1,5 m", () => {
    expect(parseDimensions("150 x 150")).toEqual({ shape: "rect", wM: 1.5, hM: 1.5 });
  });

  it("„priemer 80 cm“ je kruh", () => {
    expect(parseDimensions("priemer 80 cm")).toEqual({ shape: "round", wM: 0.8, hM: 0.8 });
  });

  it("tretí rozmer je výška a na pôdorys nepatrí", () => {
    expect(parseDimensions("78x78x80")).toEqual({ shape: "rect", wM: 0.78, hM: 0.78 });
  });

  it("„160 x 100 cm, výška 80 cm“ ignoruje výšku", () => {
    expect(parseDimensions("160 x 100 cm, výška 80 cm")).toEqual({ shape: "rect", wM: 1.6, hM: 1 });
  });

  it("samotné číslo berie ako priemer okrúhleho stola", () => {
    expect(parseDimensions("165")).toEqual({ shape: "round", wM: 1.65, hM: 1.65 });
  });

  it("nezmyselný text nespadne, len sa nedá použiť", () => {
    expect(parseDimensions("mix")).toBeNull();
    expect(parseDimensions("")).toBeNull();
    expect(parseDimensions(null)).toBeNull();
  });

  it("položka bez rozmerov dostane odhad podľa názvu", () => {
    const chair = furnitureElementSize({ name: "stolička Ikon", dimensions: null }, 50);
    expect(chair.w).toBeGreaterThan(0);
    expect(chair.shape).toBe("rect");
    const table = furnitureElementSize({ name: "sklenený stôl", dimensions: "mix" }, 50);
    expect(table.shape).toBe("round");
  });

  it("veľmi malá položka dostane minimálnu uchopiteľnú veľkosť", () => {
    const tiny = furnitureElementSize({ name: "sviečka", dimensions: "5 x 5 cm" }, 50);
    expect(tiny.w).toBeGreaterThanOrEqual(24);
  });

  it("položka zo skladu je na pláne v skutočnej mierke", () => {
    const s = furnitureElementSize({ name: "bufetový stôl", dimensions: "180 x 80 cm" }, 50);
    expect(s.w).toBe(90);
    expect(s.h).toBe(40);
  });
});

describe("rozmiestnenie rezervovaných kusov", () => {
  const items = [
    { id: "f1", name: "Stolička", dimensions: null, qty: 10 },
    { id: "f2", name: "Stôl", dimensions: null, qty: 2 },
  ];

  it("spočíta, koľko kusov je už na pláne", () => {
    const els = [
      el({ id: "a", furnitureItemId: "f1" }),
      el({ id: "b", furnitureItemId: "f1" }),
      el({ id: "c", furnitureItemId: "f2" }),
    ];
    const rows = computePlacement(items, els);
    expect(rows[0].placed).toBe(2);
    expect(rows[0].remaining).toBe(8);
    expect(rows[1].remaining).toBe(1);
  });

  it("keď je na pláne viac kusov ako v rezervácii, zvyšok ide do mínusu", () => {
    const els = Array.from({ length: 12 }, (_, i) => el({ id: `x${i}`, furnitureItemId: "f1" }));
    expect(computePlacement(items, els)[0].remaining).toBe(-2);
  });

  it("prvky bez väzby na sklad sa nepočítajú", () => {
    expect(computePlacement(items, [el({ id: "a" })])[0].placed).toBe(0);
  });
});

// ------------------------------------------------------------------ zarovnanie

describe("zarovnanie", () => {
  const a = el({ id: "a", x: 10, y: 10, w: 100, h: 50 });
  const b = el({ id: "b", x: 200, y: 80, w: 60, h: 40 });
  const c = el({ id: "c", x: 400, y: 300, w: 80, h: 20 });

  it("vľavo zarovná na najmenšie x", () => {
    const out = alignElements([a, b], "left")!;
    expect(out.every((e) => e.x === 10)).toBe(true);
  });

  it("vpravo zarovná pravé hrany", () => {
    const out = alignElements([a, b], "right")!;
    const right = out.map((e) => e.x + e.w);
    expect(right[0]).toBe(right[1]);
  });

  it("hore a dole zarovná vodorovné hrany", () => {
    expect(alignElements([a, b], "top")!.every((e) => e.y === 10)).toBe(true);
    const bottoms = alignElements([a, b], "bottom")!.map((e) => e.y + e.h);
    expect(bottoms[0]).toBe(bottoms[1]);
  });

  it("centrovanie dá rovnaký stred", () => {
    const out = alignElements([a, b], "hcenter")!;
    const centers = out.map((e) => e.x + e.w / 2);
    expect(Math.abs(centers[0] - centers[1])).toBeLessThanOrEqual(1);
  });

  it("rovnomerné rozloženie nechá krajné prvky na mieste", () => {
    const out = alignElements([a, b, c], "distH")!;
    expect(out[0].x).toBe(a.x);
    expect(out[2].x + out[2].w).toBe(c.x + c.w);
  });

  it("rovnomerné rozloženie vyrobí rovnaké medzery", () => {
    const out = alignElements([a, b, c], "distH")!;
    const gap1 = out[1].x - (out[0].x + out[0].w);
    const gap2 = out[2].x - (out[1].x + out[1].w);
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });

  it("na jeden prvok sa zarovnať nedá", () => {
    expect(alignElements([a], "left")).toBeNull();
  });

  it("rozložiť sa dá až od troch prvkov", () => {
    expect(alignElements([a, b], "distH")).toBeNull();
  });

  it("mriežka stolov drží prvky v miestnosti", () => {
    const tables = Array.from({ length: 7 }, (_, i) => el({ id: `t${i}`, w: 120, h: 120 }));
    const out = arrangeGrid(tables, 1000);
    expect(out).toHaveLength(7);
    for (const t of out) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(1000);
    }
  });

  it("mriežka na prázdnom zozname nespadne", () => {
    expect(arrangeGrid([], 1000)).toEqual([]);
  });

  it("stoly sa čísluju zhora nadol a zľava doprava", () => {
    const els = [
      el({ id: "c", type: "round_table", x: 300, y: 300 }),
      el({ id: "a", type: "rect_table", x: 10, y: 10 }),
      el({ id: "b", type: "rect_table", x: 200, y: 10 }),
      el({ id: "z", type: "chair", x: 0, y: 0 }),
    ];
    const { elements, count } = renumberTables(els);
    expect(count).toBe(3);
    expect(elements.find((e) => e.id === "a")!.label).toBe("1");
    expect(elements.find((e) => e.id === "b")!.label).toBe("2");
    expect(elements.find((e) => e.id === "c")!.label).toBe("3");
    // stolička nie je stôl a číslo nedostane
    expect(elements.find((e) => e.id === "z")!.label).toBeUndefined();
  });
});

// ------------------------------------------------------------------ prichytávanie

describe("prichytávanie", () => {
  const room = { width: 1000, height: 600 };
  const other = el({ id: "o", x: 300, y: 200, w: 100, h: 100 });

  it("prichytí ľavú hranu k ľavej hrane suseda", () => {
    const r = computeSnap({ x: 303, y: 0, w: 50, h: 50 }, [other], room);
    expect(r.x).toBe(300);
    expect(r.guidesV).toEqual([300]);
  });

  it("prichytí stred k stredu suseda", () => {
    const r = computeSnap({ x: 322, y: 0, w: 50, h: 50 }, [other], room);
    expect(r.x + 25).toBe(350);
  });

  it("prichytí k stredu miestnosti", () => {
    const r = computeSnap({ x: 0, y: 297, w: 50, h: 50 }, [], room);
    expect(r.y).toBe(300);
  });

  it("keď nie je nič nablízku, drží mriežku", () => {
    const r = computeSnap({ x: 123, y: 456, w: 50, h: 50 }, [other], room);
    expect(r.x % GRID).toBe(0);
    expect(r.guidesV).toEqual([]);
  });

  it("vyberie najbližšiu z viacerých možností", () => {
    const near = el({ id: "n", x: 297, y: 0, w: 10, h: 10 });
    const r = computeSnap({ x: 298, y: 0, w: 50, h: 50 }, [other, near], room);
    expect(r.x).toBe(297);
  });
});

// ------------------------------------------------------------------ história

describe("história (Späť / Znovu)", () => {
  const a = emptyLayout();
  const b: LayoutData = { ...a, elements: [el({ id: "1" })] };
  const c: LayoutData = { ...a, elements: [el({ id: "1" }), el({ id: "2" })] };

  it("späť a znovu chodí po krokoch", () => {
    let h = historySeed(a);
    h = historyPush(h, b);
    h = historyPush(h, c);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    h = historyUndo(h);
    expect(h.stack[h.idx]).toBe(b);
    expect(canRedo(h)).toBe(true);
    h = historyRedo(h);
    expect(h.stack[h.idx]).toBe(c);
  });

  it("na začiatku sa už späť ísť nedá", () => {
    const h = historyUndo(historySeed(a));
    expect(h.idx).toBe(0);
  });

  it("súvislé ťahanie je jeden krok, nie sto", () => {
    let h = historySeed(a);
    for (let i = 0; i < 50; i++) h = historyPush(h, { ...b, elements: [el({ x: i })] }, "drag:1");
    expect(h.stack).toHaveLength(2);
    h = historyUndo(h);
    expect(h.stack[h.idx]).toBe(a);
  });

  it("iný druh zmeny začne nový krok", () => {
    let h = historySeed(a);
    h = historyPush(h, b, "drag:1");
    h = historyPush(h, c, "drag:2");
    expect(h.stack).toHaveLength(3);
  });

  it("po kroku späť sa nová zmena zapíše a budúcnosť zahodí", () => {
    let h = historySeed(a);
    h = historyPush(h, b);
    h = historyPush(h, c);
    h = historyUndo(h);
    h = historyPush(h, { ...a, elements: [el({ id: "x" })] });
    expect(canRedo(h)).toBe(false);
    expect(h.stack).toHaveLength(3);
  });

  it("história je zastropovaná, nerastie donekonečna", () => {
    let h = historySeed(a);
    for (let i = 0; i < 500; i++) h = historyPush(h, { ...b, elements: [el({ x: i })] }, `k${i}`);
    expect(h.stack.length).toBeLessThanOrEqual(60);
    expect(h.idx).toBe(h.stack.length - 1);
  });

  it("krok späť zruší zlučovanie, aby sa ďalšia zmena nezlúčila so starou", () => {
    let h = historySeed(a);
    h = historyPush(h, b, "drag:1");
    h = historyUndo(h);
    h = historyPush(h, c, "drag:1");
    expect(h.stack[h.idx]).toBe(c);
    expect(h.stack).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ načítanie

describe("načítanie uloženého plánu", () => {
  it("prázdny plán z databázy nie je chyba", () => {
    expect(parseLayout(null)).toEqual({ layout: null, invalid: false });
  });

  it("nezmyselné dáta označí ako neplatné, nie ako prázdne", () => {
    expect(parseLayout({ width: "veľa" }).invalid).toBe(true);
  });

  it("starý plán v1 sa načíta a dostane mierku", () => {
    const raw = {
      width: 1400,
      height: 900,
      elements: [{ id: "a", type: "rect_table", x: 0, y: 0, w: 10, h: 10, rotation: 0 }],
      roomWidthM: 28,
    };
    const { layout, invalid } = parseLayout(raw);
    expect(invalid).toBe(false);
    expect(layout!.width).toBe(1400);
    expect(layout!.pxPerMeter).toBe(50);
    // prvok sa nesmie pohnúť
    expect(layout!.elements[0].x).toBe(0);
  });

  it("plánu bez rozmerov miestnosti ich dopočíta z plátna", () => {
    const { layout } = parseLayout({ width: 1400, height: 900, elements: [] });
    expect(layout!.roomWidthM).toBe(28);
    expect(layout!.roomHeightM).toBe(18);
    expect(layout!.width).toBe(1400);
  });

  it("neznámy typ prvku plán zneplatní, radšej než ho tichodane zahodí", () => {
    const raw = {
      width: 100,
      height: 100,
      elements: [{ id: "a", type: "vrtulnik", x: 0, y: 0, w: 10, h: 10, rotation: 0 }],
    };
    expect(parseLayout(raw).invalid).toBe(true);
  });

  it("nové polia (miesta, tvar, väzba na sklad) prejdú validáciou", () => {
    const raw = {
      width: 100,
      height: 100,
      schemaVersion: 3,
      elements: [
        { id: "a", type: "furniture", x: 0, y: 0, w: 10, h: 10, rotation: 0, seats: 4, shape: "round", furnitureItemId: "f1" },
      ],
    };
    const { layout, invalid } = parseLayout(raw);
    expect(invalid).toBe(false);
    expect(layout!.elements[0].furnitureItemId).toBe("f1");
  });
});

// ------------------------------------------------------------------ vzhľad a export

describe("vzhľad a export", () => {
  it("stmavenie farby drží formát a nepretečie", () => {
    expect(shadeColor("#ffffff", -30)).toBe("#e1e1e1");
    expect(shadeColor("#000000", -30)).toBe("#000000");
    expect(shadeColor("nefarba", -30)).toBe("nefarba");
  });

  it("vlastná farba prebije predvolenú farbu stola", () => {
    expect(elementFill(el({ color: "#ff0000" })).fill).toBe("#ff0000");
  });

  it("predvolené rozmery sú v skutočnej mierke", () => {
    // barový pult 3 m pri 50 px/m
    expect(defaultSizePx("bar", 50).w).toBe(150);
  });

  it("SVG obsahuje všetky prvky a rozmery miestnosti", () => {
    const layout: LayoutData = {
      ...emptyLayout(),
      elements: [el({ id: "a", label: "Stôl 1" }), el({ id: "b", type: "chair", x: 200, y: 200 })],
    };
    const svg = layoutToSvg(layout);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Stôl 1");
    expect(svg).toContain("20 m");
    expect((svg.match(/<g transform/g) ?? []).length).toBe(2);
  });

  it("popis prvku sa v SVG ošetrí, nerozbije značky", () => {
    const svg = layoutToSvg({ ...emptyLayout(), elements: [el({ label: '<script>"x"' })] });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("prvky sa kreslia v poradí podľa vrstvy", () => {
    const svg = layoutToSvg({
      ...emptyLayout(),
      elements: [el({ id: "hore", label: "HORE", z: 5 }), el({ id: "dole", label: "DOLE", z: 1 })],
    });
    expect(svg.indexOf("DOLE")).toBeLessThan(svg.indexOf("HORE"));
  });

  it("súpis zoskupí prvky podľa druhu a spočíta miesta", () => {
    const layout: LayoutData = {
      ...emptyLayout(),
      elements: [
        el({ id: "a", type: "round_table_chairs", chairCount: 8 }),
        el({ id: "b", type: "round_table_chairs", chairCount: 8 }),
        el({ id: "c", type: "bar" }),
      ],
    };
    const rows = summarize(layout);
    expect(rows[0].count).toBe(2);
    expect(rows[0].seats).toBe(16);
    expect(rows).toHaveLength(2);
  });

  it("položky zo skladu sa v súpise volajú svojím názvom", () => {
    const rows = summarize({
      ...emptyLayout(),
      elements: [el({ type: "furniture", label: "SB Ikon biely" })],
    });
    expect(rows[0].label).toBe("SB Ikon biely");
  });
});

// ------------------------------------------------------------------ scenár

describe("scenár: svadba na 80 hostí", () => {
  /** Sála 20 × 12 m, desať okrúhlych stolov po osem, pódium a parket. */
  function buildWedding(): LayoutData {
    const base = emptyLayout();
    const tables: LayoutElement[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      type: "round_table_chairs" as const,
      x: 0,
      y: 0,
      w: 120,
      h: 120,
      rotation: 0,
      chairCount: 8,
    }));
    const arranged = arrangeGrid(tables, base.width);
    return {
      ...base,
      elements: [
        ...arranged,
        { id: "stage", type: "stage", x: 400, y: 20, w: 300, h: 150, rotation: 0, label: "PÓDIUM" },
        { id: "floor", type: "dance_floor", x: 380, y: 420, w: 300, h: 150, rotation: 0, label: "PARKET" },
      ],
    };
  }

  it("kapacita sedí a stoly sa vojdú do sály", () => {
    const l = buildWedding();
    const cap = computeCapacity(l);
    expect(cap.seats).toBe(80);
    expect(cap.tables).toBe(10);
    for (const e of l.elements) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(l.width);
    }
  });

  it("prečíslovanie dá stolom čísla 1 až 10", () => {
    const { elements, count } = renumberTables(buildWedding().elements);
    expect(count).toBe(10);
    const labels = elements.filter((e) => e.type === "round_table_chairs").map((e) => e.label);
    expect(labels.sort((a, b) => Number(a) - Number(b))).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    );
  });

  it("plán prejde uložením do databázy a načítaním späť bez straty", () => {
    const l = buildWedding();
    const roundTrip = parseLayout(JSON.parse(JSON.stringify(l)));
    expect(roundTrip.invalid).toBe(false);
    expect(roundTrip.layout!.elements).toHaveLength(12);
    expect(computeCapacity(roundTrip.layout!).seats).toBe(80);
  });

  it("export do SVG obsahuje pódium aj parket", () => {
    const svg = layoutToSvg(buildWedding());
    expect(svg).toContain("PÓDIUM");
    expect(svg).toContain("PARKET");
  });

  it("zmenšenie sály na polovicu prvky zachová a nevysunie von", () => {
    const l = resizeRoom(buildWedding(), 10, 6);
    expect(l.elements).toHaveLength(12);
    for (const e of l.elements) {
      expect(e.x + e.w).toBeLessThanOrEqual(l.width);
      expect(e.y + e.h).toBeLessThanOrEqual(l.height);
    }
  });
});
