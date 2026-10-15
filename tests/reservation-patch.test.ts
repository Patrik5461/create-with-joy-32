/**
 * Čo zosúladenie prenesie z kalkulácie na rezerváciu.
 *
 * Podstatné je, čo NEPREPÍŠE: keď kalkulácia pozná len dátum eventu, hodiny si
 * funkcia dopočíta (10:00–23:00). Odkedy zosúladenie beží samo po schválení,
 * nesmie takou vymyslenou hodinou prepísať skutočný čas akcie.
 */
import { describe, expect, it } from "bun:test";
import { buildReservationPatch, computeFieldsDiff, computeItemsDiff } from "../src/lib/quote-reservation-link";

const quote = (p: Partial<Parameters<typeof buildReservationPatch>[0]> = {}) => ({
  event_start_at: null, event_end_at: null, event_date: null,
  installation_date: null, dismantling_date: null, venue: null, address: null,
  ...p,
});

const hod = (iso: string) => new Date(iso).getHours();

describe("čas zadaný v kalkulácii", () => {
  it("prepíše rezerváciu — to je dohoda s klientom", () => {
    const patch = buildReservationPatch(
      quote({ event_start_at: "2026-09-17T12:00:00Z", event_end_at: "2026-09-17T20:00:00Z" }),
      { event_start_at: "2026-09-17T06:00:00Z", event_end_at: "2026-09-17T18:00:00Z" },
    );
    expect(patch.event_start_at).toBe("2026-09-17T12:00:00.000Z");
    expect(patch.event_end_at).toBe("2026-09-17T20:00:00.000Z");
  });

  it("montáž a demontáž idú z presného času kalkulácie", () => {
    const patch = buildReservationPatch(
      quote({ installation_date: "2026-09-16T05:00:00Z", dismantling_date: "2026-09-18T09:00:00Z" }),
      { load_at: "2026-09-16T08:00:00Z", return_at: "2026-09-18T08:00:00Z" },
    );
    expect(patch.load_at).toBe("2026-09-16T05:00:00.000Z");
    expect(patch.return_at).toBe("2026-09-18T09:00:00.000Z");
  });

  it("miesto a adresa sa prenesú, prázdne nič nevymaže", () => {
    expect(buildReservationPatch(quote({ venue: "Nová hala", address: "Ulica 1" })))
      .toMatchObject({ venue: "Nová hala", address: "Ulica 1" });
    const patch = buildReservationPatch(quote({ venue: "   " }), { venue: "Stará hala" });
    expect(patch.venue).toBeUndefined();
  });
});

describe("čas, ktorý si funkcia len dopočítala z dátumu eventu", () => {
  const len_datum = quote({ event_date: "2026-09-17" });

  it("sa na rezerváciu zapíše, keď tam ešte nič nie je", () => {
    const patch = buildReservationPatch(len_datum, {});
    expect(hod(patch.event_start_at)).toBe(10);
    expect(hod(patch.event_end_at)).toBe(23);
  });

  it("NEPREPÍŠE skutočný čas akcie v ten istý deň", () => {
    const patch = buildReservationPatch(len_datum, {
      event_start_at: "2026-09-17T06:00:00Z",   // 08:00 u nás
      event_end_at: "2026-09-17T19:00:00Z",
      load_at: "2026-09-17T04:00:00Z",
      return_at: "2026-09-17T21:00:00Z",
      available_from_at: "2026-09-18T06:00:00Z",
    });
    expect(patch.event_start_at).toBeUndefined();
    expect(patch.event_end_at).toBeUndefined();
    expect(patch.load_at).toBeUndefined();
    expect(patch.return_at).toBeUndefined();
    expect(patch.available_from_at).toBeUndefined();
  });

  it("ale keď sa event presunie na iný deň, čas sa prepíše", () => {
    const patch = buildReservationPatch(quote({ event_date: "2026-09-24" }), {
      event_start_at: "2026-09-17T06:00:00Z",
      event_end_at: "2026-09-17T19:00:00Z",
    });
    expect(patch.event_start_at?.slice(0, 10)).toBe("2026-09-24");
    expect(patch.event_end_at?.slice(0, 10)).toBe("2026-09-24");
  });

  it("„dostupné od“ sa nepretláča, keď už nejaké na rezervácii je", () => {
    const sDemontazou = quote({ dismantling_date: "2026-09-18T09:00:00Z" });
    expect(buildReservationPatch(sDemontazou, {}).available_from_at).toBeDefined();
    expect(buildReservationPatch(sDemontazou, { available_from_at: "2026-09-18T14:00:00Z" }).available_from_at)
      .toBeUndefined();
  });
});

describe("hlásenie rozdielov", () => {
  it("nehlási rozdiel tam, kde by zosúladenie nič nemenilo", () => {
    // Rezervácia má všetky termíny vyplnené a kalkulácia pozná len dátum —
    // zosúladenie by nesiahlo na nič, takže sa nemá na čo sťažovať.
    const rez = {
      event_start_at: "2026-09-17T06:00:00Z",
      event_end_at: "2026-09-17T19:00:00Z",
      load_at: "2026-09-17T04:00:00Z",
      return_at: "2026-09-17T21:00:00Z",
      available_from_at: "2026-09-18T06:00:00Z",
    };
    expect(computeFieldsDiff(quote({ event_date: "2026-09-17" }), rez)).toEqual([]);
  });

  it("rozdiel v zadanom čase ohlási", () => {
    const diffs = computeFieldsDiff(
      quote({ event_start_at: "2026-09-17T12:00:00Z" }),
      { event_start_at: "2026-09-17T06:00:00Z", load_at: "2026-09-17T04:00:00Z" },
    );
    expect(diffs.map((d) => d.field)).toEqual(["event_start_at"]);
  });
});

describe("porovnanie položiek", () => {
  const q = (furniture_item_id: string | null, qty: number, kind: any = "furniture") =>
    ({ furniture_item_id, qty, kind, name: "Stolička" });

  it("neplnú položku porovná tak, ako ju zosúladenie zapíše (0,5 ks → 1 ks)", () => {
    expect(computeItemsDiff([q("a", 0.5)], [{ furniture_item_id: "a", qty: 1 }])).toEqual([]);
  });

  it("nulovú položku neberie — na rezerváciu sa nedostane", () => {
    expect(computeItemsDiff([q("a", 0)], [])).toEqual([]);
  });

  it("skutočný rozdiel stále ohlási", () => {
    expect(computeItemsDiff([q("a", 5)], [{ furniture_item_id: "a", qty: 3 }]))
      .toEqual([{ type: "changed", name: "Stolička", from: 3, to: 5 }]);
  });
});
