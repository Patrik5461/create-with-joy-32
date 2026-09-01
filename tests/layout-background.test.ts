/**
 * Testy rozpoznávania formátov podkladu (pôdorysu). Samotný prevod PDF a
 * zmenšovanie potrebujú canvas z prehliadača, takže sa tu netestujú — testuje sa
 * rozhodovanie, ktoré určuje, čo sa vôbec pustí ďalej.
 */
import { describe, expect, it } from "bun:test";
import {
  BACKGROUND_ACCEPT,
  BACKGROUND_MAX_PX,
  backgroundKind,
  fileExtension,
  scaleToFit,
  tooLargeMessage,
  undecodableMessage,
  unsupportedMessage,
} from "../src/lib/layout-background";

const f = (name: string, type = "") => ({ name, type });

describe("rozpoznanie formátu", () => {
  it("PDF podľa typu aj podľa prípony", () => {
    expect(backgroundKind(f("podorys.pdf", "application/pdf"))).toBe("pdf");
    // Niektoré prehliadače pri drag & drop typ nepošlú.
    expect(backgroundKind(f("podorys.pdf", ""))).toBe("pdf");
    expect(backgroundKind(f("PODORYS.PDF", ""))).toBe("pdf");
  });

  it("bežné obrázkové formáty prejdú", () => {
    for (const name of ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.gif", "a.bmp", "a.avif", "a.svg"]) {
      expect(backgroundKind(f(name))).toBe("image");
    }
  });

  it("obrázok bez prípony prejde podľa MIME typu", () => {
    expect(backgroundKind(f("scan", "image/png"))).toBe("image");
  });

  it("HEIC a TIFF sa pustia ďalej — rozhodne až prehliadač", () => {
    expect(backgroundKind(f("IMG_0421.heic"))).toBe("image");
    expect(backgroundKind(f("plan.tiff"))).toBe("image");
  });

  it("dokumenty a archívy sa odmietnu", () => {
    for (const name of ["zmluva.docx", "plan.dwg", "data.zip", "video.mp4", "tabulka.xlsx"]) {
      expect(backgroundKind(f(name))).toBe("unsupported");
    }
  });

  it("výber súboru ponúka PDF aj obrázky", () => {
    expect(BACKGROUND_ACCEPT).toContain("application/pdf");
    expect(BACKGROUND_ACCEPT).toContain("image/*");
    expect(BACKGROUND_ACCEPT).toContain(".jpg");
  });
});

describe("prípona súboru", () => {
  it("berie tú poslednú a malými písmenami", () => {
    expect(fileExtension("Pôdorys sály v2.FINAL.JPG")).toBe("jpg");
  });
  it("bez prípony vráti prázdno", () => {
    expect(fileExtension("scan")).toBe("");
    expect(fileExtension("scan.")).toBe("");
  });
});

describe("zmenšovanie", () => {
  it("malý obrázok nechá tak", () => {
    expect(scaleToFit(1200, 800, BACKGROUND_MAX_PX)).toBe(1);
    expect(scaleToFit(BACKGROUND_MAX_PX, 100, BACKGROUND_MAX_PX)).toBe(1);
  });

  it("veľký zmenší na dlhšiu stranu, pomer strán zostane", () => {
    const r = scaleToFit(8000, 4000, BACKGROUND_MAX_PX);
    expect(Math.round(8000 * r)).toBe(BACKGROUND_MAX_PX);
    expect(Math.round(4000 * r)).toBe(BACKGROUND_MAX_PX / 2);
  });

  it("nikdy nezväčšuje a nespadne na nule", () => {
    expect(scaleToFit(10, 10, BACKGROUND_MAX_PX)).toBe(1);
    expect(scaleToFit(0, 0, BACKGROUND_MAX_PX)).toBe(1);
  });
});

describe("hlášky vysvetlia, čo s tým", () => {
  it("nepodporovaný súbor pomenuje príponu aj povolené formáty", () => {
    const m = unsupportedMessage(f("zmluva.docx"));
    expect(m).toContain(".docx");
    expect(m).toContain("PDF");
  });

  it("HEIC poradí, ako to prepnúť v iPhone", () => {
    expect(undecodableMessage(f("IMG_1.heic"))).toContain("iPhone");
    expect(undecodableMessage(f("x", "image/heif"))).toContain("iPhone");
  });

  it("TIFF poradí uložiť inak", () => {
    expect(undecodableMessage(f("plan.tif"))).toContain("TIFF");
  });

  it("veľký súbor povie, koľko má a koľko smie", () => {
    const m = tooLargeMessage(52 * 1024 * 1024);
    expect(m).toContain("52.0 MB");
    expect(m).toContain("40 MB");
  });
});
