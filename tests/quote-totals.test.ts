/**
 * Súčty kalkulácie — najmä to, na čo sa zľava vzťahuje a na čo nie.
 */
import { describe, expect, it } from "bun:test";
import { computeTotals, isOffStock, type QuoteLine } from "../src/lib/quote-utils";

const line = (p: Partial<QuoteLine>): QuoteLine => ({
  id: Math.random().toString(36).slice(2),
  kind: "furniture",
  furniture_item_id: "stock-1",
  name: "Položka",
  qty: 1,
  price_mode: "fixed",
  unit_price: 100,
  days: 1,
  ...p,
});

const totals = (lines: QuoteLine[], over: Partial<Parameters<typeof computeTotals>[0]> = {}) =>
  computeTotals({
    lines,
    discountType: "none",
    discountValue: 0,
    surchargeType: "none",
    surchargeValue: 0,
    vatRate: 23,
    ...over,
  });

describe("položka mimo skladu", () => {
  it("je nábytok bez väzby na sklad", () => {
    expect(isOffStock({ kind: "furniture", furniture_item_id: null })).toBe(true);
    expect(isOffStock({ kind: "furniture", furniture_item_id: "abc" })).toBe(false);
    expect(isOffStock({ kind: "service", furniture_item_id: null })).toBe(false);
    expect(isOffStock({ kind: "other", furniture_item_id: null })).toBe(false);
  });
});

describe("zľava", () => {
  it("sa počíta len z nábytku zo skladu, nie z položiek mimo skladu", () => {
    const t = totals(
      [line({ unit_price: 1000 }), line({ furniture_item_id: null, unit_price: 500 })],
      { discountType: "percent", discountValue: 10 },
    );
    expect(t.stockFurnitureSubtotal).toBe(1000);
    expect(t.offStockSubtotal).toBe(500);
    expect(t.furnitureSubtotal).toBe(1500);
    expect(t.discount).toBe(100); // 10 % z 1000, nie z 1500
    expect(t.totalWithoutVat).toBe(1400);
  });

  it("fixná zľava sa zastaví na sume nábytku zo skladu", () => {
    const t = totals(
      [line({ unit_price: 300 }), line({ furniture_item_id: null, unit_price: 900 })],
      { discountType: "fixed", discountValue: 1000 },
    );
    expect(t.discount).toBe(300);
    expect(t.totalWithoutVat).toBe(900); // položka mimo skladu ostala celá
  });

  it("nezľavňuje služby ani položky „Iné“", () => {
    const t = totals(
      [
        line({ unit_price: 200 }),
        line({ kind: "service", furniture_item_id: null, unit_price: 300 }),
        line({ kind: "other", furniture_item_id: null, unit_price: 100 }),
      ],
      { discountType: "percent", discountValue: 50 },
    );
    expect(t.discount).toBe(100);
    expect(t.servicesSubtotal).toBe(300);
    expect(t.otherSubtotal).toBe(100);
    expect(t.totalWithoutVat).toBe(500);
  });

  it("kalkulácia bez položiek zo skladu nedostane žiadnu zľavu", () => {
    const t = totals([line({ furniture_item_id: null, unit_price: 800 })], {
      discountType: "percent",
      discountValue: 25,
    });
    expect(t.discount).toBe(0);
    expect(t.totalWithoutVat).toBe(800);
  });
});

describe("príplatok a DPH", () => {
  it("príplatok sa počíta až zo sumy po zľave, vrátane položiek mimo skladu", () => {
    const t = totals(
      [line({ unit_price: 1000 }), line({ furniture_item_id: null, unit_price: 1000 })],
      { discountType: "percent", discountValue: 10, surchargeType: "percent", surchargeValue: 10 },
    );
    // 2000 − 100 = 1900, +10 % = 2090
    expect(t.surcharge).toBeCloseTo(190, 6);
    expect(t.totalWithoutVat).toBeCloseTo(2090, 6);
    expect(t.vatAmount).toBeCloseTo(2090 * 0.23, 6);
    expect(t.totalWithVat).toBeCloseTo(2090 * 1.23, 6);
  });

  it("denná cena násobí počtom dní", () => {
    const t = totals([line({ price_mode: "per_day", unit_price: 10, qty: 5, days: 3 })]);
    expect(t.stockFurnitureSubtotal).toBe(150);
  });
});
