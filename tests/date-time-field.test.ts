/**
 * Dátum bez času sa nesmie stratiť — presne to sa dialo pri `datetime-local`.
 */
import { describe, expect, it } from "bun:test";
import { combineDateTime, isoToLocalDate, isoToLocalTime } from "../src/lib/date-time-field";

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
