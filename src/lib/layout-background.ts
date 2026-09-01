/**
 * Príprava podkladu (pôdorysu) pred nahratím do plánu rozloženia.
 *
 * Editor aj export kreslia podklad ako obrázok, takže PDF sa musí najprv
 * previesť — a formát, ktorý prehliadač nevie zobraziť (typicky HEIC z iPhonu),
 * treba odmietnuť s jasnou hláškou. Predtým sa dal nahrať len obrázok a čokoľvek
 * iné skončilo hláškou „Nahrajte prosím obrázok“ bez ďalšieho vysvetlenia.
 */

/** Čo ponúkne dialóg na výber súboru. */
export const BACKGROUND_ACCEPT =
  "application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg,.heic,.tif,.tiff";

/** Ľudský zoznam do hlášok a popiskov. */
export const BACKGROUND_FORMATS_LABEL = "PDF, JPEG, PNG, WEBP, AVIF, GIF, BMP alebo SVG";

export const BACKGROUND_MAX_BYTES = 40 * 1024 * 1024;

/** Najdlhšia strana podkladu. Väčší obrázok už len spomaľuje editor aj export. */
export const BACKGROUND_MAX_PX = 4000;

/** Cieľová šírka pri prevode PDF na obrázok — dosť na čitateľné kóty. */
export const PDF_TARGET_WIDTH = 2400;

export type BackgroundKind = "pdf" | "image" | "unsupported";

const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "jfif", "png", "webp", "gif", "bmp", "avif", "svg",
  // HEIC a TIFF pustíme ďalej — Safari ich vie, ostatné prehliadače spadnú až
  // pri dekódovaní a vtedy vieme povedať presne, ktorý formát zlyhal.
  "heic", "heif", "tif", "tiff",
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function backgroundKind(file: { name: string; type: string }): BackgroundKind {
  const ext = fileExtension(file.name);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (file.type.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  return "unsupported";
}

/** Hláška pre súbor, ktorý podkladom byť nemôže (dokument, archív, video…). */
export function unsupportedMessage(file: { name: string; type: string }): string {
  const ext = fileExtension(file.name);
  const what = ext ? `Súbor .${ext}` : "Tento súbor";
  return `${what} sa ako pôdorys použiť nedá. Nahrajte ${BACKGROUND_FORMATS_LABEL}.`;
}

/** Hláška, keď prehliadač formát nevie zobraziť — typicky HEIC z iPhonu. */
export function undecodableMessage(file: { name: string; type: string }): string {
  const ext = fileExtension(file.name);
  if (ext === "heic" || ext === "heif" || file.type.includes("heic") || file.type.includes("heif")) {
    return "HEIC z iPhonu tento prehliadač nezobrazí. V iPhone prepnite Nastavenia → Fotoaparát → Formáty na „Najkompatibilnejší“, alebo fotku pošlite ako JPEG.";
  }
  if (ext === "tif" || ext === "tiff") {
    return "TIFF tento prehliadač nezobrazí. Uložte pôdorys ako PDF, JPEG alebo PNG.";
  }
  return `Súbor sa nepodarilo načítať ako obrázok. Skúste ${BACKGROUND_FORMATS_LABEL}.`;
}

export function tooLargeMessage(bytes: number): string {
  return `Súbor má ${(bytes / 1024 / 1024).toFixed(1)} MB, limit je ${BACKGROUND_MAX_BYTES / 1024 / 1024} MB. Zmenšite ho alebo uložte ako PDF.`;
}

/** Pomer, ktorým sa obrázok zmestí do `max`. Nikdy nezväčšuje. */
export function scaleToFit(width: number, height: number, max: number): number {
  const longest = Math.max(width, height);
  if (longest <= 0 || longest <= max) return 1;
  return max / longest;
}

export interface PreparedBackground {
  blob: Blob;
  contentType: string;
  /** Prípona, pod ktorou sa súbor uloží. */
  ext: string;
  /** Doplnok do hlášky — napr. že PDF malo viac strán alebo že sa obrázok zmenšil. */
  note?: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-failed"));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Obrázok sa nepodarilo vytvoriť."))),
      type,
      quality,
    );
  });
}

/** Prvá strana PDF vykreslená do PNG. Viac strán pôdorys nemáva. */
async function pdfToPng(file: File): Promise<PreparedBackground> {
  const pdfjs = await import("pdfjs-dist");
  // Bez workera by pdf.js bežal na hlavnom vlákne a stránka by na chvíľu zamrzla.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, Math.max(1, PDF_TARGET_WIDTH / base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Prehliadač neposkytol canvas na prevod PDF.");
    // Priehľadné pozadie by v pláne vyzeralo ako čierna plocha.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob = await canvasToBlob(canvas, "image/png");
    return {
      blob,
      contentType: "image/png",
      ext: "png",
      note: doc.numPages > 1 ? `PDF malo ${doc.numPages} strán, použil som prvú.` : undefined,
    };
  } finally {
    task.destroy();
  }
}

/**
 * Skontroluje, či prehliadač obrázok naozaj zobrazí, a priveľký zmenší.
 * Vektorové SVG a obrázky v rozumnej veľkosti sa nahrávajú bez prekódovania.
 */
async function prepareImage(file: File): Promise<PreparedBackground> {
  const url = URL.createObjectURL(file);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(url);
    } catch {
      throw new Error(undecodableMessage(file));
    }

    const ext = fileExtension(file.name) || (file.type.split("/")[1] ?? "png");
    const isSvg = file.type === "image/svg+xml" || ext === "svg";
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const ratio = scaleToFit(w, h, BACKGROUND_MAX_PX);

    if (isSvg || ratio === 1) {
      return { blob: file, contentType: file.type || "image/png", ext };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, contentType: file.type || "image/png", ext };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const asJpeg = file.type === "image/jpeg" || ext === "jpg" || ext === "jpeg";
    const type = asJpeg ? "image/jpeg" : "image/png";
    const blob = await canvasToBlob(canvas, type, asJpeg ? 0.92 : undefined);
    return {
      blob,
      contentType: type,
      ext: asJpeg ? "jpg" : "png",
      note: `Obrázok mal ${w}×${h} px, zmenšil som ho na ${canvas.width}×${canvas.height} px.`,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pripraví ľubovoľný bežný súbor na nahratie ako podklad plánu. */
export async function prepareBackground(file: File): Promise<PreparedBackground> {
  if (file.size > BACKGROUND_MAX_BYTES) throw new Error(tooLargeMessage(file.size));
  const kind = backgroundKind(file);
  if (kind === "unsupported") throw new Error(unsupportedMessage(file));
  if (kind === "pdf") return pdfToPng(file);
  return prepareImage(file);
}
