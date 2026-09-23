/**
 * Dátum bez času sa nesmie stratiť — presne to sa dialo pri `datetime-local`.
 */
import { describe, expect, it } from "bun:test";
import { MAX_YEAR, MIN_YEAR, combineDateTime, implausibleYear, isoToLocalDate, isoToLocalTime } from "../src/lib/date-time-field";

describe("dátum a čas v kalkulácii", () => {
  it("dátum bez času sa uloží s predvolenou hodinou", () => {
    const iso = combineDateTime("2026-09-17", "", "08:00");
    expect(iso).not.toBeNull();
    expect(isoToLocalDate(iso)).toBe("2026-09-17");
    expect(isoToLocalTime(iso)).toBe("08:00");
  });

  it("zadaný čas prebije predvolený", () => {
    const iso = combineDateTime("2026-09-17", "14:30", "08:00");
    expect(isoToLocalTime(iso)).toBe("14:30");
    expect(isoToLocalDate(iso)).toBe("2026-09-17");
  });

  it("bez dátumu nevznikne nič — samotný čas nič neznamená", () => {
    expect(combineDateTime("", "14:30", "08:00")).toBeNull();
    expect(combineDateTime("", "", "08:00")).toBeNull();
  });

  it("vymazaný dátum vymaže celý údaj", () => {
    const iso = combineDateTime("2026-09-17", "10:00", "08:00");
    expect(iso).not.toBeNull();
    expect(combineDateTime("", isoToLocalTime(iso), "08:00")).toBeNull();
  });

  it("nezmysly neprejdú", () => {
    expect(combineDateTime("nie-je-datum", "", "08:00")).toBeNull();
    expect(isoToLocalDate(null)).toBe("");
    expect(isoToLocalTime(undefined)).toBe("");
    expect(isoToLocalDate("úplný nezmysel")).toBe("");
  });

  it("uložený a znova načítaný údaj sa nezmení", () => {
    const first = combineDateTime("2026-12-31", "", "18:00")!;
    const reopened = combineDateTime(isoToLocalDate(first), isoToLocalTime(first), "18:00");
    expect(reopened).toBe(first);
  });

  it("polnoc je platný čas, nie prázdna hodnota", () => {
    const iso = combineDateTime("2026-09-17", "00:00", "08:00");
    expect(isoToLocalTime(iso)).toBe("00:00");
  });
});

describe("rok sa píše po cifrách", () => {
  // Prehliadač dopĺňa rok postupne: 2 → 20 → 202 → 2026. Každý medzikrok musí
  // prežiť nedotknutý, inak sa dátum nedá dopísať.
  it("rok pod 100 sa neposunie do 20. storočia", () => {
    expect(isoToLocalDate(combineDateTime("0002-09-17", "", "08:00"))).toBe("0002-09-17");
    expect(isoToLocalDate(combineDateTime("0020-09-17", "", "08:00"))).toBe("0020-09-17");
  });

  it("trojciferný rok si zachová štyri číslice, inak políčko hodnotu zahodí", () => {
    expect(isoToLocalDate(combineDateTime("0202-09-17", "", "08:00"))).toBe("0202-09-17");
  });

  it("dopísaný rok je presne ten, ktorý človek napísal", () => {
    const iso = combineDateTime("2026-09-17", "", "08:00");
    expect(isoToLocalDate(iso)).toBe("2026-09-17");
    expect(new Date(iso!).getFullYear()).toBe(2026);
  });

  it("celá postupnosť písania skončí na správnom roku", () => {
    let iso: string | null = null;
    for (const rok of ["0002", "0020", "0202", "2026"]) {
      iso = combineDateTime(`${rok}-09-17`, isoToLocalTime(iso), "08:00");
      expect(iso).not.toBeNull();
    }
    expect(isoToLocalDate(iso)).toBe("2026-09-17");
  });
});

describe("poistka na rok", () => {
  it("rozpísaný rok označí ako chybu", () => {
    expect(implausibleYear(combineDateTime("0202-09-17", "", "08:00"))).toBe(true);
    expect(implausibleYear(combineDateTime("1902-09-17", "", "08:00"))).toBe(true);
  });

  it("bežné roky prejdú", () => {
    expect(implausibleYear(combineDateTime("2026-09-17", "", "08:00"))).toBe(false);
    expect(implausibleYear(combineDateTime(`${MIN_YEAR}-01-01`, "", "08:00"))).toBe(false);
    expect(implausibleYear(combineDateTime(`${MAX_YEAR}-12-31`, "", "08:00"))).toBe(false);
  });

  it("prázdna hodnota nie je chyba", () => {
    expect(implausibleYear(null)).toBe(false);
    expect(implausibleYear("")).toBe(false);
  });
});
