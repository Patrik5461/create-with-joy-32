/**
 * Mesačná mriežka v kalendári brigádnika.
 */
import { describe, expect, it } from "bun:test";
import {
  addMonths, dayKey, eventsByDay, monthGrid, monthRange, sameMonth, scheduleRows, startOfMonth,
} from "../src/lib/helper-calendar";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("mriežka mesiaca", () => {
  it("začína pondelkom a pokrýva celý mesiac", () => {
    const weeks = monthGrid(d("2026-10-15"), d("2026-10-15"));
    const flat = weeks.flat();
    expect(flat.length % 7).toBe(0);
    expect(flat[0].date.getDay()).toBe(1);              // pondelok
    expect(flat[flat.length - 1].date.getDay()).toBe(0); // nedeľa
    // október 2026 má 31 dní a všetky sú v mriežke
    expect(flat.filter((x) => x.inMonth)).toHaveLength(31);
  });

  it("dni zo susedných mesiacov označí, aby sa dali stlmiť", () => {
    const flat = monthGrid(d("2026-10-15"), d("2026-10-15")).flat();
    expect(flat[0].inMonth).toBe(false);
    expect(flat[0].key).toBe("2026-09-28");
  });

  it("dnešok pozná", () => {
    const flat = monthGrid(d("2026-10-15"), d("2026-10-15")).flat();
    expect(flat.filter((x) => x.isToday).map((x) => x.key)).toEqual(["2026-10-15"]);
  });

  it("mesiac, čo začína v nedeľu, nestratí prvý deň", () => {
    const flat = monthGrid(d("2026-11-10"), d("2026-11-10")).flat();
    expect(flat.some((x) => x.key === "2026-11-01" && x.inMonth)).toBe(true);
    expect(flat.filter((x) => x.inMonth)).toHaveLength(30);
  });

  it("február v priestupnom roku má 29 dní", () => {
    expect(monthGrid(d("2028-02-10"), d("2028-02-10")).flat().filter((x) => x.inMonth)).toHaveLength(29);
  });
});

describe("pomocné funkcie", () => {
  it("kľúč dňa je miestny dátum, nezmysly dajú prázdno", () => {
    expect(dayKey(d("2026-01-05"))).toBe("2026-01-05");
    expect(dayKey(null)).toBe("");
    expect(dayKey("vôbec nie dátum")).toBe("");
  });

  it("posun mesiaca prejde aj cez rok", () => {
    expect(dayKey(addMonths(d("2026-12-20"), 1))).toBe("2027-01-01");
    expect(dayKey(addMonths(d("2026-01-20"), -1))).toBe("2025-12-01");
    expect(dayKey(startOfMonth(d("2026-10-15")))).toBe("2026-10-01");
    expect(sameMonth(d("2026-10-01"), d("2026-10-31"))).toBe(true);
    expect(sameMonth(d("2026-10-31"), d("2026-11-01"))).toBe(false);
  });
});

describe("akcie v dňoch", () => {
  const ev = (id: string, startAt: string | null) => ({ id, startAt });

  it("zoradí akcie pod deň, v ktorom začínajú", () => {
    const map = eventsByDay([
      ev("a", "2026-10-15T08:00:00Z"),
      ev("b", "2026-10-15T14:00:00Z"),
      ev("c", "2026-10-20T08:00:00Z"),
    ]);
    expect(map.get("2026-10-15")?.map((e) => e.id)).toEqual(["a", "b"]);
    expect(map.get("2026-10-20")?.map((e) => e.id)).toEqual(["c"]);
  });

  it("akciu bez termínu do mriežky nedá", () => {
    expect(eventsByDay([ev("x", null)]).size).toBe(0);
  });

  it("listovať sa dá od tohto mesiaca po mesiac poslednej akcie", () => {
    const { from, to } = monthRange([ev("a", "2026-12-24T08:00:00Z")], d("2026-10-15"));
    expect(dayKey(from)).toBe("2026-10-01");
    expect(dayKey(to)).toBe("2026-12-01");
  });

  it("bez akcií sa nikam nelistuje", () => {
    const { from, to } = monthRange([], d("2026-10-15"));
    expect(from.getTime()).toBe(to.getTime());
  });
});

describe("rozpis akcie", () => {
  const ev = (startAt: string | null, eventStartAt: string | null, endAt: string | null) =>
    ({ startAt, eventStartAt, endAt });

  it("nakládka je prvá a je označená", () => {
    const rows = scheduleRows(ev("2026-10-15T06:00:00Z", "2026-10-15T15:00:00Z", "2026-10-16T08:00:00Z"));
    expect(rows.map((r) => r.kind)).toEqual(["load", "event", "return"]);
    expect(rows[0].at).toBe("2026-10-15T06:00:00Z");
  });

  it("vrátenie v iný deň si pýta dátum, ostatné nie", () => {
    const rows = scheduleRows(ev("2026-10-15T06:00:00Z", "2026-10-15T15:00:00Z", "2026-10-16T08:00:00Z"));
    expect(rows.map((r) => r.otherDay)).toEqual([false, false, true]);
  });

  it("začiatok akcie zhodný s nakládkou sa neopakuje", () => {
    const rows = scheduleRows(ev("2026-10-15T06:00:00Z", "2026-10-15T06:00:00Z", "2026-10-15T20:00:00Z"));
    expect(rows.map((r) => r.kind)).toEqual(["load", "return"]);
  });

  it("chýbajúce termíny vynechá a z ničoho nespraví riadok", () => {
    expect(scheduleRows(ev(null, null, null))).toEqual([]);
    expect(scheduleRows(ev(null, "2026-10-15T15:00:00Z", null)).map((r) => r.kind)).toEqual(["event"]);
    expect(scheduleRows(ev("nedátum", null, null))).toEqual([]);
  });

  it("bez nakládky sa dátum počíta od prvého známeho termínu", () => {
    const rows = scheduleRows(ev(null, "2026-10-15T15:00:00Z", "2026-10-16T08:00:00Z"));
    expect(rows.map((r) => r.otherDay)).toEqual([false, true]);
  });
});
