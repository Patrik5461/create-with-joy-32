/**
 * Export plánu rozloženia do PNG a PDF. Potrebuje prehliadač (canvas, jsPDF),
 * preto je oddelený od čistej logiky v `layout-plan.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  computeCapacity,
  layoutToSvg,
  summarize,
  type LayoutData,
} from "@/lib/layout-plan";

export interface ExportMeta {
  /** Názov eventu do hlavičky dokumentu. */
  title: string;
  venue?: string | null;
  /** Termín eventu ako hotový text. */
  when?: string | null;
}

/** Podklad musí byť v exporte zabudovaný — odkaz na chránený súbor by sa nenačítal. */
export async function fetchBackgroundDataUrl(path: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase.storage
      .from("layout-backgrounds")
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return undefined;
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("Podklad sa nepodarilo načítať."));
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Vykreslí plán do PNG data: URL. `scale` 2 = dvojnásobné rozlíšenie. */
export async function renderLayoutPng(
  layout: LayoutData,
  backgroundDataUrl?: string,
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const svg = layoutToSvg(layout, { backgroundDataUrl });
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(layout.width * scale);
        canvas.height = Math.round(layout.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Prehliadač neposkytol canvas na export."));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Vykreslenie plánu do obrázka zlyhalo."));
      image.src = url;
    });
    return { dataUrl, width: layout.width * scale, height: layout.height * scale };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportLayoutPng(layout: LayoutData, filename: string, backgroundDataUrl?: string) {
  const { dataUrl } = await renderLayoutPng(layout, backgroundDataUrl);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}

/**
 * PDF na šírku s hlavičkou (event, miesto, termín), plánom v mierke a súpisom
 * prvkov. Predtým sa PDF robilo cez `window.open` + tlač, čo blokovali
 * vyskakovacie okná a výsledok závisel od nastavenia tlačiarne.
 */
export async function exportLayoutPdf(
  layout: LayoutData,
  filename: string,
  meta: ExportMeta,
  backgroundDataUrl?: string,
) {
  const { jsPDF } = await import("jspdf");
  const { dataUrl } = await renderLayoutPng(layout, backgroundDataUrl);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(meta.title || "Plán rozloženia", margin, margin + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const subtitle = [meta.venue, meta.when].filter(Boolean).join(" · ");
  if (subtitle) doc.text(subtitle, margin, margin + 11);

  const cap = computeCapacity(layout);
  const facts = [
    `Miest na sedenie: ${cap.seats}`,
    `Stolov: ${cap.tables}`,
    cap.roomAreaM2 ? `Miestnosť: ${layout.roomWidthM} × ${layout.roomHeightM} m (${cap.roomAreaM2.toFixed(0)} m²)` : null,
  ].filter(Boolean) as string[];
  doc.text(facts.join("   |   "), pageW - margin, margin + 5, { align: "right" });
  doc.setTextColor(0);

  const top = margin + 16;
  // Súpis prvkov ide pod plán; nechávame mu pevný pás, aby sa plán nekrížil s textom.
  const rows = summarize(layout);
  const summaryH = rows.length ? 8 + Math.ceil(rows.length / 4) * 5 : 0;
  const availW = pageW - margin * 2;
  const availH = pageH - top - margin - summaryH;
  const ratio = Math.min(availW / layout.width, availH / layout.height);
  const drawW = layout.width * ratio;
  const drawH = layout.height * ratio;
  const drawX = margin + (availW - drawW) / 2;

  doc.addImage(dataUrl, "PNG", drawX, top, drawW, drawH, undefined, "FAST");

  if (rows.length) {
    let y = top + drawH + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Na pláne", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 4.5;
    const colW = availW / 4;
    rows.forEach((r, i) => {
      const col = i % 4;
      if (col === 0 && i > 0) y += 5;
      const text = `${r.count}× ${r.label}${r.seats ? ` (${r.seats} miest)` : ""}`;
      doc.text(text, margin + col * colW, y, { maxWidth: colW - 4 });
    });
  }

  doc.save(`${filename}.pdf`);
}
