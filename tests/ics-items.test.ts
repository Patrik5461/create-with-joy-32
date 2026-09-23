/**
 * Testy zoznamu nábytku, ktorý ide do popisu udalosti v Apple/Google kalendári.
 */
import { describe, expect, it } from "bun:test";
import { MAX_ITEM_LINES, formatExtraItems, formatReservationItems, type IcsExtraRow, type IcsItemRow } from "../src/lib/ics-items";

const it_ = (name: string, qty: number): IcsItemRow => ({ qty, furniture_items: { name } });

describe("nábytok v popise udalosti", () => {
  it("vypíše položky s počtom kusov", () => {
    const out = formatReservationItems([it_("Ghost stolička", 12), it_("Barový stôl", 3)]);
    expect(out).toBe("Nábytok (2 položky, 15 ks):\n• 12× Ghost stolička\n• 3× Barový stôl");
  });

  it("radí od najväčšieho počtu", () => {
    const out = formatReservationItems([it_("Stôl", 2), it_("Stolička", 40), it_("Bar", 5)]);
    expect(out!.split("\n").slice(1)).toEqual(["• 40× Stolička", "• 5× Bar", "• 2× Stôl"]);
  });

  it("tú istú položku z viacerých riadkov spočíta do jednej", () => {
    const out = formatReservationItems([it_("Stolička", 10), it_("Stolička", 6)]);
    expect(out).toBe("Nábytok (1 položka, 16 ks):\n• 16× Stolička");
  });

  it("prázdna rezervácia nepridá do popisu nič", () => {
    expect(formatReservationItems([])).toBeNull();
    expect(formatReservationItems(null)).toBeNull();
    expect(formatReservationItems(undefined)).toBeNull();
  });

  it("položky bez názvu alebo s nulou sa preskočia", () => {
    expect(formatReservationItems([
      { qty: 5, furniture_items: null },
      { qty: 0, furniture_items: { name: "Stôl" } },
      { qty: null, furniture_items: { name: "Bar" } },
    ])).toBeNull();
  });

  it("veľmi dlhý zoznam sa oreže a povie, koľko ešte chýba", () => {
    const many = Array.from({ length: MAX_ITEM_LINES + 5 }, (_, i) => it_(`Polozka ${i}`, i + 1));
    const out = formatReservationItems(many)!;
    const lines = out.split("\n");
    expect(lines).toHaveLength(1 + MAX_ITEM_LINES + 1);
    expect(lines[lines.length - 1]).toBe("• … a ďalších 5 položiek");
  });

  it("slovenské tvary čísloviek sedia", () => {
    expect(formatReservationItems([it_("A", 1)])).toContain("(1 položka,");
    expect(formatReservationItems([it_("A", 1), it_("B", 1), it_("C", 1)])).toContain("(3 položky,");
    expect(formatReservationItems(
      ["A", "B", "C", "D", "E"].map((n) => it_(n, 1)),
    )).toContain("(5 položiek,");
  });
});

const extra = (kind: string, name: string, qty: number, stock = false): IcsExtraRow => ({
  kind, name, qty, furniture_item_id: stock ? "stock-1" : null,
});

describe("ďalšie položky v popise udalosti", () => {
  it("vypíše nábytok mimo skladu, služby aj „Iné“ a označí, čo je čo", () => {
    const out = formatExtraItems([
      extra("service", "doprava + montáž", 1),
      extra("furniture", "koberec kruh 4m", 3),
      extra("other", "vešanie banerov", 2),
    ]);
    expect(out).toBe(
      "Ďalšie položky (3 položky):\n" +
      "• 3× koberec kruh 4m — mimo skladu\n" +
      "• 1× doprava + montáž — služba\n" +
      "• 2× vešanie banerov — iné",
    );
  });

  it("nábytok zo skladu nepridá — ten je už v zozname nábytku", () => {
    expect(formatExtraItems([extra("furniture", "Ghost stolička", 12, true)])).toBeNull();
  });

  it("nič navyše = nič v popise", () => {
    expect(formatExtraItems([])).toBeNull();
    expect(formatExtraItems(null)).toBeNull();
    expect(formatExtraItems(undefined)).toBeNull();
  });

  it("tú istú položku spočíta, prázdne a nulové preskočí", () => {
    const out = formatExtraItems([
      extra("service", "doprava", 1),
      extra("service", "doprava", 2),
      extra("other", "", 5),
      extra("other", "nič", 0),
    ]);
    expect(out).toBe("Ďalšie položky (1 položka):\n• 3× doprava — služba");
  });

  it("dlhý zoznam sa oreže rovnako ako nábytok", () => {
    const many = Array.from({ length: MAX_ITEM_LINES + 3 }, (_, i) => extra("other", `Polozka ${i}`, i + 1));
    const lines = formatExtraItems(many)!.split("\n");
    expect(lines).toHaveLength(1 + MAX_ITEM_LINES + 1);
    expect(lines[lines.length - 1]).toBe("• … a ďalších 3 položiek");
  });
});
