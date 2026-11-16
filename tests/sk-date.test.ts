import { describe, expect, it } from "bun:test";
import { dateToDay, dayToDate, formatSkDate, parseSkDate, splitLocalDateTime } from "../src/lib/sk-date";

describe("slovenský dátum v poliach", () => {
  it("pochopí bežné zápisy", () => {
    for (const t of ["16.11.2026", "16. 11. 2026", "16/11/2026", "16-11-2026", "16.11.26", "2026-11-16", " 16.11.2026. "]) {
      expect(parseSkDate(t)).toBe("2026-11-16");
    }
    expect(parseSkDate("1.2.2027")).toBe("2027-02-01");
  });

  it("neexistujúci deň ani nezmysel neprejde", () => {
    for (const t of ["31.4.2026", "29.2.2027", "16.13.2026", "abc", "16.11.", "", null]) {
      expect(parseSkDate(t as any)).toBeNull();
    }
    expect(parseSkDate("29.2.2028")).toBe("2028-02-29");
  });

  it("zobrazí sa po slovensky", () => {
    expect(formatSkDate("2026-11-06")).toBe("6. 11. 2026");
    expect(formatSkDate("")).toBe("");
    expect(parseSkDate(formatSkDate("2026-01-09"))).toBe("2026-01-09");
  });

  it("deň ⇄ Date bez posunu časovým pásmom", () => {
    expect(dateToDay(dayToDate("2026-03-29")!)).toBe("2026-03-29");
    expect(dateToDay(dayToDate("2026-10-25")!)).toBe("2026-10-25");
    expect(dayToDate("")).toBeUndefined();
  });

  it("hodnota s časom sa rozdelí", () => {
    expect(splitLocalDateTime("2026-11-16T08:30")).toEqual(["2026-11-16", "08:30"]);
    expect(splitLocalDateTime("2026-11-16")).toEqual(["2026-11-16", ""]);
    expect(splitLocalDateTime("")).toEqual(["", ""]);
  });
});
