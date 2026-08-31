/**
 * Testy blokácií skladu: ktoré kalkulácie a rezervácie držia tovar v danom
 * termíne. Spúšťa sa `bun test`. Sieť sa netestuje — tu ide o pravidlá.
 */
import { describe, expect, it } from "bun:test";
import {
  HOLDING_QUOTE_STATUSES,
  HOLD_STATUS_LABEL,
  collectQuoteBlockers,
  collectReservationBlockers,
  mergeBlockers,
  overlaps,
  quoteHoldQty,
  quoteWindow,
  sortBlockers,
  ts,
  type Blocker,
  type HoldQuoteRow,
  type HoldReservationRow,
} from "../src/lib/quote-holds";

const CHAIR = "item-chair";
const TABLE = "item-table";

/** Okno, v ktorom sa pýtame na dostupnosť: 4. – 6. septembra. */
const FROM = Date.parse("2026-09-04T08:00:00Z");
const TO = Date.parse("2026-09-06T08:00:00Z");

function quote(over: Partial<HoldQuoteRow> = {}): HoldQuoteRow {
  return {
    id: "q1",
    quote_number: "Q2026-0001",
    status: "sent",
    quote_group_id: "g1",
    reservation_id: null,
    installation_date: "2026-09-04T10:00:00Z",
    dismantling_date: "2026-09-05T20:00:00Z",
    event_start_at: null,
    event_end_at: null,
    event_date: null,
    clients: { company_name: "Svadba Nováková" },
    quote_items: [{ furniture_item_id: CHAIR, qty: 10, kind: "furniture" }],
    ...over,
  };
}

function reservationRow(over: Partial<HoldReservationRow["reservations"]> = {}, qty = 5): HoldReservationRow {
  return {
    furniture_item_id: CHAIR,
    qty,
    reservations: {
      id: "r1",
      event_name: "Firemný večierok",
      status: "confirmed",
      load_at: "2026-09-04T09:00:00Z",
      available_from_at: "2026-09-06T09:00:00Z",
      quote_group_id: null,
      ...over,
    },
  };
}

const opts = { itemIds: [CHAIR, TABLE], from: FROM, to: TO };

describe("časové okno kalkulácie", () => {
  it("uprednostní montáž a demontáž", () => {
    const w = quoteWindow({
      installation_date: "2026-09-04T06:00:00Z",
      dismantling_date: "2026-09-07T06:00:00Z",
      event_start_at: "2026-09-05T10:00:00Z",
      event_end_at: "2026-09-05T23:00:00Z",
      event_date: "2026-09-05",
    });
    expect(w.start).toBe(ts("2026-09-04T06:00:00Z"));
    expect(w.end).toBe(ts("2026-09-07T06:00:00Z"));
  });

  it("bez montáže padne na termín eventu", () => {
    const w = quoteWindow({
      installation_date: null,
      dismantling_date: null,
      event_start_at: "2026-09-05T10:00:00Z",
      event_end_at: "2026-09-05T23:00:00Z",
      event_date: "2026-09-05",
    });
    expect(w.start).toBe(ts("2026-09-05T10:00:00Z"));
    expect(w.end).toBe(ts("2026-09-05T23:00:00Z"));
  });

  it("so samotným dátumom drží celý deň", () => {
    const w = quoteWindow({
      installation_date: null, dismantling_date: null,
      event_start_at: null, event_end_at: null, event_date: "2026-09-05",
    });
    expect(w.end! - w.start!).toBe(24 * 3600 * 1000);
  });

  it("bez dátumov nedrží nič", () => {
    const w = quoteWindow({
      installation_date: null, dismantling_date: null,
      event_start_at: null, event_end_at: null, event_date: null,
    });
    expect(w.start).toBeNull();
    expect(w.end).toBeNull();
  });

  it("dotyk hranou sa neráta ako prekryv", () => {
    expect(overlaps(FROM - 1000, FROM, FROM, TO)).toBe(false);
    expect(overlaps(TO, TO + 1000, FROM, TO)).toBe(false);
    expect(overlaps(FROM, TO, FROM, TO)).toBe(true);
  });
});

describe("kalkulácie držia tovar", () => {
  it("rozpracovaná, odoslaná aj schválená blokujú", () => {
    for (const status of HOLDING_QUOTE_STATUSES) {
      const out = collectQuoteBlockers([quote({ status })], opts);
      expect(out[CHAIR]?.[0]?.qty).toBe(10);
      expect(out[CHAIR][0].statusLabel).toBe(HOLD_STATUS_LABEL[status]);
    }
  });

  it("schválená kalkulácia bez rezervácie tovar drží", () => {
    const out = collectQuoteBlockers([quote({ status: "approved" })], opts);
    expect(out[CHAIR][0].statusLabel).toBe("Schválená");
  });

  it("odoslaná sa hlási ako čakajúca na schválenie", () => {
    const out = collectQuoteBlockers([quote({ status: "sent" })], opts);
    expect(out[CHAIR][0].statusLabel).toBe("Čaká na schválenie");
  });

  it("zamietnutá neblokuje", () => {
    expect(collectQuoteBlockers([quote({ status: "rejected" })], opts)[CHAIR]).toBeUndefined();
  });

  it("kalkulácia s rezerváciou sa neráta druhýkrát", () => {
    const out = collectQuoteBlockers([quote({ reservation_id: "r1" })], opts);
    expect(out[CHAIR]).toBeUndefined();
  });

  it("kalkulácia, z ktorej už vznikla rezervácia, sa neráta druhýkrát", () => {
    const out = collectQuoteBlockers([quote()], { ...opts, reservedGroups: new Set(["g1"]) });
    expect(out[CHAIR]).toBeUndefined();
  });

  it("vlastná kalkulácia neblokuje samu seba", () => {
    const out = collectQuoteBlockers([quote()], { ...opts, excludeQuoteGroupId: "g1" });
    expect(out[CHAIR]).toBeUndefined();
  });

  it("iný termín neblokuje", () => {
    const out = collectQuoteBlockers(
      [quote({ installation_date: "2026-10-01T08:00:00Z", dismantling_date: "2026-10-02T08:00:00Z" })],
      opts,
    );
    expect(out[CHAIR]).toBeUndefined();
  });

  it("služby, voľný text a nulové kusy sa ignorujú", () => {
    const out = collectQuoteBlockers([quote({
      quote_items: [
        { furniture_item_id: null, qty: 3, kind: "furniture" },
        { furniture_item_id: CHAIR, qty: 4, kind: "service" },
        { furniture_item_id: CHAIR, qty: 0, kind: "furniture" },
      ],
    })], opts);
    expect(out[CHAIR]).toBeUndefined();
  });

  it("rovnaká položka na dvoch riadkoch sa spočíta do jednej blokácie", () => {
    const out = collectQuoteBlockers([quote({
      quote_items: [
        { furniture_item_id: CHAIR, qty: 10, kind: "furniture" },
        { furniture_item_id: CHAIR, qty: 6, kind: "furniture" },
        { furniture_item_id: TABLE, qty: 2, kind: "furniture" },
      ],
    })], opts);
    expect(out[CHAIR]).toHaveLength(1);
    expect(out[CHAIR][0].qty).toBe(16);
    expect(out[TABLE][0].qty).toBe(2);
  });

  it("blokáciu pomenuje klient, bez klienta číslo dokladu", () => {
    expect(collectQuoteBlockers([quote()], opts)[CHAIR][0].label).toBe("Svadba Nováková");
    const bez = collectQuoteBlockers([quote({ clients: null })], opts);
    expect(bez[CHAIR][0].label).toBe("Q2026-0001");
  });

  it("blokácia nesie id na preklik do kalkulácie", () => {
    expect(collectQuoteBlockers([quote({ id: "abc" })], opts)[CHAIR][0].id).toBe("abc");
  });
});

describe("rezervácie držia tovar", () => {
  it("potvrdená rezervácia v okne blokuje", () => {
    const { byItem } = collectReservationBlockers([reservationRow()], opts);
    expect(byItem[CHAIR][0]).toMatchObject({ kind: "reservation", qty: 5, label: "Firemný večierok" });
  });

  it("zrušená rezervácia neblokuje", () => {
    const { byItem } = collectReservationBlockers([reservationRow({ status: "cancelled" })], opts);
    expect(byItem[CHAIR]).toBeUndefined();
  });

  it("upravovaná rezervácia sa vynechá", () => {
    const { byItem } = collectReservationBlockers([reservationRow()], { ...opts, excludeReservationId: "r1" });
    expect(byItem[CHAIR]).toBeUndefined();
  });

  it("rezervácia mimo okna neblokuje", () => {
    const { byItem } = collectReservationBlockers(
      [reservationRow({ load_at: "2026-09-10T08:00:00Z", available_from_at: "2026-09-12T08:00:00Z" })],
      opts,
    );
    expect(byItem[CHAIR]).toBeUndefined();
  });

  it("ohlási skupinu kalkulácie, z ktorej rezervácia vznikla", () => {
    const { reservedGroups } = collectReservationBlockers([reservationRow({ quote_group_id: "g1" })], opts);
    expect(reservedGroups.has("g1")).toBe(true);
  });
});

describe("zoznam blokácií v UI", () => {
  it("radí od najistejšej: rezervácia, schválená, odoslaná, návrh", () => {
    const list: Blocker[] = [
      { kind: "quote", id: "d", label: "D", status: "draft", statusLabel: "Rozpracovaná", qty: 1 },
      { kind: "quote", id: "s", label: "S", status: "sent", statusLabel: "Čaká na schválenie", qty: 1 },
      { kind: "reservation", id: "r", label: "R", status: "confirmed", statusLabel: "Potvrdené", qty: 1 },
      { kind: "quote", id: "a", label: "A", status: "approved", statusLabel: "Schválená", qty: 1 },
    ];
    expect(sortBlockers(list).map((b) => b.id)).toEqual(["r", "a", "s", "d"]);
  });

  it("do soft-holdu sa rátajú len kalkulácie, rezervácie už ráta dostupnosť", () => {
    const merged = mergeBlockers(
      collectReservationBlockers([reservationRow()], opts).byItem,
      collectQuoteBlockers([quote()], opts),
    );
    expect(merged[CHAIR]).toHaveLength(2);
    expect(quoteHoldQty(merged[CHAIR])).toBe(10);
  });
});

describe("scenár: 20 stoličiek na jeden víkend", () => {
  const schvalena = quote({
    id: "qA", quote_group_id: "gA", status: "approved",
    clients: { company_name: "Svadba Nováková" },
    quote_items: [{ furniture_item_id: CHAIR, qty: 8, kind: "furniture" }],
  });
  const caka = quote({
    id: "qB", quote_group_id: "gB", status: "sent",
    clients: { company_name: "Obec Dolná" },
    quote_items: [{ furniture_item_id: CHAIR, qty: 6, kind: "furniture" }],
  });
  const TOTAL = 20;

  it("schválená aj čakajúca držia spolu 14 kusov, voľných ostáva 6", () => {
    const held = collectQuoteBlockers([schvalena, caka], opts);
    expect(quoteHoldQty(held[CHAIR])).toBe(14);
    expect(TOTAL - quoteHoldQty(held[CHAIR])).toBe(6);
  });

  it("nová kalkulácia vidí obe aj s ich stavom", () => {
    const held = sortBlockers(collectQuoteBlockers([schvalena, caka], opts)[CHAIR]);
    expect(held.map((b) => `${b.label} · ${b.statusLabel} · ${b.qty}`)).toEqual([
      "Svadba Nováková · Schválená · 8",
      "Obec Dolná · Čaká na schválenie · 6",
    ]);
  });

  it("po zmazaní kalkulácie sa jej kusy uvoľnia", () => {
    // Zmazaná kalkulácia sa do zoznamu vôbec nenačíta (filter `deleted_at`),
    // takže tovar sa uvoľní bez akéhokoľvek vracania na sklad.
    const held = collectQuoteBlockers([schvalena], opts);
    expect(quoteHoldQty(held[CHAIR])).toBe(8);
    expect(TOTAL - quoteHoldQty(held[CHAIR])).toBe(12);
  });

  it("po zmazaní oboch je sklad opäť celý voľný", () => {
    const held = collectQuoteBlockers([], opts);
    expect(quoteHoldQty(held[CHAIR])).toBe(0);
  });
});
