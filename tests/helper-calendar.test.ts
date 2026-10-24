/**
 * Mesačná mriežka v kalendári brigádnika.
 */
import { describe, expect, it } from "bun:test";
import {
  addMonths, dayKey, expandPhases, monthGrid, monthRange, occurrencesByDay, sameMonth, scheduleRows,
  startOfMonth,
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
  const ev = (id: string, startAt: string | null, eventStartAt?: string | null, endAt?: string | null) =>
    ({ id, startAt, eventStartAt: eventStartAt ?? null, endAt: endAt ?? null });

  it("zoradí akcie pod deň, v ktorom sa na nich robí", () => {
    const map = occurrencesByDay([
      ev("a", "2026-10-15T08:00:00Z"),
      ev("b", "2026-10-15T14:00:00Z"),
      ev("c", "2026-10-20T08:00:00Z"),
    ]);
    expect(map.get("2026-10-15")?.map((o) => o.ev.id)).toEqual(["a", "b"]);
    expect(map.get("2026-10-20")?.map((o) => o.ev.id)).toEqual(["c"]);
  });

  it("akciu bez termínu do mriežky nedá", () => {
    expect(occurrencesByDay([ev("x", null)]).size).toBe(0);
  });

  it("listovať sa dá od tohto mesiaca po mesiac poslednej akcie", () => {
    const { from, to } = monthRange([{ startAt: "2026-12-24T08:00:00Z" }], d("2026-10-15"));
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
    expect(rows.map((r) => r.kinds)).toEqual([["load"], ["install"], ["teardown"]]);
    expect(rows[0].at).toBe("2026-10-15T06:00:00Z");
  });

  it("vrátenie v iný deň si pýta dátum, ostatné nie", () => {
    const rows = scheduleRows(ev("2026-10-15T06:00:00Z", "2026-10-15T15:00:00Z", "2026-10-16T08:00:00Z"));
    expect(rows.map((r) => r.otherDay)).toEqual([false, false, true]);
  });

  it("nakládka a inštalácia na tú istú minútu sú jeden riadok, nie dva časy", () => {
    const rows = scheduleRows(ev("2026-10-15T06:00:00Z", "2026-10-15T06:00:00Z", "2026-10-15T20:00:00Z"));
    expect(rows.map((r) => r.kinds)).toEqual([["load", "install"], ["teardown"]]);
  });

  it("chýbajúce termíny vynechá a z ničoho nespraví riadok", () => {
    expect(scheduleRows(ev(null, null, null))).toEqual([]);
    expect(scheduleRows(ev(null, "2026-10-15T15:00:00Z", null)).map((r) => r.kinds)).toEqual([["install"]]);
    expect(scheduleRows(ev("nedátum", null, null))).toEqual([]);
  });

  it("bez nakládky sa dátum počíta od prvého známeho termínu", () => {
    const rows = scheduleRows(ev(null, "2026-10-15T15:00:00Z", "2026-10-16T08:00:00Z"));
    expect(rows.map((r) => r.otherDay)).toEqual([false, true]);
  });
});

describe("akcia rozpísaná na dni", () => {
  const ev = { id: "r1", startAt: "2026-10-27T05:00:00Z", eventStartAt: "2026-10-28T07:00:00Z", endAt: "2026-10-28T16:00:00Z" };

  it("nakládka 27. a demontáž 28. sú pod oboma dátumami", () => {
    const occ = expandPhases([ev]);
    expect(occ.map((o) => o.day)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(occ[0].kinds).toEqual(["load"]);
  });

  it("čo padne na ten istý deň, je jeden výskyt s oboma názvami", () => {
    const occ = expandPhases([ev]);
    expect(occ[1].kinds).toEqual(["install", "teardown"]);
    // čas výskytu je ten najskorší v danom dni
    expect(occ[1].at).toBe("2026-10-28T07:00:00Z");
  });

  it("výskyty idú v čase, naprieč akciami", () => {
    const iny = { id: "r2", startAt: "2026-10-27T12:00:00Z", eventStartAt: null, endAt: null };
    expect(expandPhases([iny, ev]).map((o) => `${o.ev.id}@${o.day}`))
      .toEqual(["r1@2026-10-27", "r2@2026-10-27", "r1@2026-10-28"]);
  });

  it("kľúč výskytu je jedinečný, aby sa dni nemiešali", () => {
    const keys = expandPhases([ev]).map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keď je nakládka aj inštalácia na tú istú minútu, deň to povie oboje", () => {
    const [occ] = expandPhases([{ id: "r3", startAt: "2026-11-02T07:00:00Z", eventStartAt: "2026-11-02T07:00:00Z", endAt: null }]);
    expect(occ.kinds).toEqual(["load", "install"]);
  });

  it("rozpis sa dá čítať z pohľadu vybraného dňa", () => {
    const rows = scheduleRows(ev, "2026-10-28");
    expect(rows.map((r) => r.otherDay)).toEqual([true, false, false]);
  });
});
