/**
 * Client-only PDF generator pre cenovú ponuku.
 *
 * Zachytí pekný HTML+CSS layout (rovnaký ako výstup "Tlačiť/PDF") z DOM
 * uzla, ktorý poskytne caller, a vráti PDF ako base64 (bez data: prefixu).
 *
 * DOLEŽITÉ:
 * - Importuje sa VÝHRADNE dynamicky z klientského kódu (napr. onClick).
 * - Nikdy sa neimportuje na server / SSR — html2canvas a jsPDF potrebujú
 *   `window`, `document`, `HTMLCanvasElement`.
 * - Preto tento súbor NIE JE `.server.ts` a nesmie sa importovať v
 *   `*.functions.ts` handleroch ani v route loaderoch.
 */

export type RenderPdfOptions = {
  filename: string;
  /** Optional: šírka renderovanej stránky v pixeloch (A4 pri 96dpi ≈ 794). */
  pageWidthPx?: number;
};

/**
 * Vezme (skrytý) DOM element s obsahom tlačovej stránky, dočasne ho
 * zviditeľní off-screen, urobí canvas snapshot cez html2canvas, rozdelí
 * ho na A4 stránky a vráti PDF ako base64.
 */
export async function renderElementToPdfBase64(
  el: HTMLElement,
  opts: RenderPdfOptions,
): Promise<{ base64: string; filename: string }> {
  if (typeof window === "undefined") {
    throw new Error("renderElementToPdfBase64 môže bežať iba v prehliadači");
  }

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const pageWidthPx = opts.pageWidthPx ?? 794; // ~A4 @ 96dpi

  // Zálohuj inline štýly + classList, aby sme ich mohli po capture obnoviť.
  const prev = {
    cssText: el.style.cssText,
    className: el.className,
  };

  // Dočasne vypni Tailwind `hidden` / `print:block` triedy tým, že
  // pretlačíme display cez inline style; a odsuň off-screen.
  el.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${pageWidthPx}px`,
    "max-width:none",
    "background:#ffffff",
    "color:#000000",
    "display:block",
    "visibility:visible",
    "opacity:1",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");

  // Počkaj kým sa načítajú obrázky (napr. logo).
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            // safety timeout
            setTimeout(done, 3000);
          }),
    ),
  );

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: pageWidthPx,
    });
  } finally {
    el.style.cssText = prev.cssText;
    el.className = prev.className;
  }

  // A4 v mm
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWmm = pdf.internal.pageSize.getWidth();
  const pageHmm = pdf.internal.pageSize.getHeight();

  const imgWmm = pageWmm;
  const imgHmm = (canvas.height * imgWmm) / canvas.width;

  // Ak sa obsah zmestí na 1 stránku, urob jednoduchý addImage.
  if (imgHmm <= pageHmm) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(dataUrl, "JPEG", 0, 0, imgWmm, imgHmm, undefined, "FAST");
  } else {
    // Rozdeľ canvas na A4 stránky.
    const pageHpx = Math.floor((pageHmm * canvas.width) / pageWmm);
    let offsetY = 0;
    let pageIndex = 0;
    while (offsetY < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - offsetY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D kontext nedostupný");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceHmm = (sliceH * imgWmm) / canvas.width;
      const dataUrl = slice.toDataURL("image/jpeg", 0.92);
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", 0, 0, imgWmm, sliceHmm, undefined, "FAST");
      offsetY += sliceH;
      pageIndex += 1;
    }
  }

  const dataUri = pdf.output("datauristring");
  const base64 = dataUri.split(",")[1] ?? "";
  return { base64, filename: opts.filename };
}