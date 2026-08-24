/**
 * Client-only PDF generator pre cenovú ponuku — NATÍVNE PDF.
 *
 * Kreslí skutočný text cez jsPDF + autoTable:
 *  - text je vyberateľný a vyhľadateľný
 *  - hlavička tabuľky sa opakuje na každej strane
 *  - okraje strany, pätička a číslovanie strán fungujú
 *
 * Importuje sa VÝHRADNE dynamicky z klientského kódu. Nikdy na serveri / SSR.
 *
 * FONTY: vstavané fonty jsPDF nemajú slovenskú diakritiku, preto sa za behu
 * načítajú TTF z /fonts/. Font vymeníš nahradením týchto súborov:
 *   public/fonts/quote-regular.ttf
 *   public/fonts/quote-bold.ttf
 */

import type { ClientLine } from "./document-utils";

export type QuoteBreakdown = {
  furniture: number;
  discount: number;
  services: number;
  other: number;
  surcharge: number;
};

export type RenderQuotePdfOptions = {
  filename: string;
  supplierLines: ClientLine[];
  clientLines: ClientLine[];
  breakdown: QuoteBreakdown;
  logoUrl?: string;
};

const MARGIN = 15;
const COLOR_TEXT: [number, number, number] = [17, 17, 17];
const COLOR_MUTED: [number, number, number] = [110, 110, 110];
const COLOR_LINE: [number, number, number] = [210, 210, 210];
const COLOR_HEAD_BG: [number, number, number] = [242, 244, 245];
const FONT = "QuoteSans";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function registerFont(
  doc: any,
  url: string,
  vfsName: string,
  style: "normal" | "bold",
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const b64 = arrayBufferToBase64(await res.arrayBuffer());
    doc.addFileToVFS(vfsName, b64);
    doc.addFont(vfsName, FONT, style);
    return true;
  } catch {
    return false;
  }
}

async function loadImageDataUrl(
  url: string,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = dataUrl;
    });
    if (!dims.w || !dims.h) return null;
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

function fmtDate(v: any): string {
  if (!v) return "";
  return new Date(v).toLocaleDateString("sk-SK");
}

function fmtDateTime(v: any): string {
  if (!v) return "";
  return new Date(v).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" });
}

function fmtEur(n: number | null | undefined): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
}

export async function renderQuotePdfBase64(
  quote: any,
  opts: RenderQuotePdfOptions,
): Promise<{ base64: string; filename: string }> {
  if (typeof window === "undefined") {
    throw new Error("renderQuotePdfBase64 môže bežať iba v prehliadači");
  }

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const okRegular = await registerFont(
    doc,
    "/fonts/quote-regular.ttf",
    "quote-regular.ttf",
    "normal",
  );
  const okBold = await registerFont(doc, "/fonts/quote-bold.ttf", "quote-bold.ttf", "bold");
  if (!okRegular || !okBold) {
    console.warn(
      "[quote-pdf] Font sa nenacital (regular=%s, bold=%s) - diakritika bude poskodena. " +
        "Skontroluj /fonts/quote-regular.ttf a /fonts/quote-bold.ttf",
      okRegular,
      okBold,
    );
  }
  const font = okRegular ? FONT : "helvetica";
  const boldStyle = okBold ? "bold" : okRegular ? "normal" : "bold";

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const rightX = pageW - MARGIN;

  const q = quote;
  const logo = opts.logoUrl ? await loadImageDataUrl(opts.logoUrl) : null;

  let y = MARGIN;

  if (logo) {
    const logoH = 18;
    const logoW = (logo.w / logo.h) * logoH;
    doc.addImage(logo.dataUrl, "PNG", MARGIN, y, logoW, logoH, undefined, "FAST");
  }

  doc.setFont(font, boldStyle);
  doc.setFontSize(20);
  doc.setTextColor(...COLOR_TEXT);
  doc.text("Cenová ponuka", rightX, y + 7, { align: "right" });

  doc.setFont(font, "normal");
  doc.setFontSize(12);
  doc.text(String(q.quote_number ?? ""), rightX, y + 13.5, { align: "right" });

  const meta: string[] = [];
  if (q.issue_date) meta.push(`Dátum: ${fmtDate(q.issue_date)}`);
  if (q.valid_until) meta.push(`Platnosť do: ${fmtDate(q.valid_until)}`);
  if (q.installation_date) meta.push(`Inštalácia: ${fmtDateTime(q.installation_date)}`);
  if (q.event_date) meta.push(`Event: ${fmtDate(q.event_date)}`);
  if (q.dismantling_date) meta.push(`Demontáž: ${fmtDateTime(q.dismantling_date)}`);
  const venue = q.venue ?? q.reservations?.venue;
  if (venue) meta.push(`Miesto: ${venue}`);
  const addr = q.address ?? q.reservations?.address;
  if (addr) meta.push(String(addr));

  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  let metaY = y + 19;
  for (const line of meta) {
    doc.text(line, rightX, metaY, { align: "right" });
    metaY += 4;
  }

  y = Math.max(y + 24, metaY) + 2;

  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, rightX, y);
  y += 7;

  const colW = contentW / 2 - 4;
  const drawParty = (title: string, lines: ClientLine[], x: number): number => {
    let ly = y;
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(title.toUpperCase(), x, ly);
    ly += 5;
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_TEXT);
    for (const l of lines.length ? lines : [{ text: "—" }]) {
      doc.setFont(font, l.bold ? boldStyle : "normal");
      const wrapped = doc.splitTextToSize(String(l.text), colW);
      doc.text(wrapped, x, ly);
      ly += 4.6 * wrapped.length;
    }
    return ly;
  };

  const leftEnd = drawParty("Dodávateľ", opts.supplierLines, MARGIN);
  const rightEnd = drawParty("Odberateľ", opts.clientLines, MARGIN + contentW / 2 + 4);
  y = Math.max(leftEnd, rightEnd) + 6;

  const rank = (k: string) => (k === "furniture" ? 0 : k === "other" ? 1 : 2);
  const items = (q.quote_items ?? []).slice().sort((a: any, b: any) => {
    const d = rank(a.kind) - rank(b.kind);
    return d !== 0 ? d : (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const body = items.map((it: any) => [
    String(it.name ?? "").trim(),
    String(Number(it.qty)),
    it.price_mode === "per_day" ? String(it.days ?? "") : "—",
    fmtEur(Number(it.unit_price)),
    fmtEur(Number(it.line_total)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Názov", "Ks", "Dní", "Cena/ks", "Spolu"]],
    body,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
    styles: {
      font,
      fontSize: 9,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      textColor: COLOR_TEXT,
      lineColor: COLOR_LINE,
      lineWidth: { bottom: 0.1 },
    },
    headStyles: {
      font,
      fontStyle: boldStyle,
      fontSize: 8.5,
      fillColor: COLOR_HEAD_BG,
      textColor: COLOR_TEXT,
      lineWidth: { bottom: 0.3 },
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 14, halign: "right" },
      2: { cellWidth: 14, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 28, halign: "right", fontStyle: boldStyle },
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber === 1) return;
      doc.setFont(font, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLOR_MUTED);
      doc.text(`Cenová ponuka ${q.quote_number ?? ""}`, MARGIN, MARGIN - 4);
      doc.setDrawColor(...COLOR_LINE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, MARGIN - 2, rightX, MARGIN - 2);
    },
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  const b = opts.breakdown;
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [];
  rows.push({ label: "Medzisúčet – nábytok", value: fmtEur(b.furniture) });
  if (b.discount > 0) rows.push({ label: "Zľava (len nábytok)", value: `− ${fmtEur(b.discount)}` });
  if (b.services > 0) {
    rows.push({ label: "Medzisúčet – služby / doprava", value: fmtEur(b.services) });
  }
  if (b.other > 0) rows.push({ label: "Medzisúčet – iné", value: fmtEur(b.other) });
  if (b.surcharge > 0) {
    rows.push({ label: String(q.surcharge_label || "Príplatok"), value: `+ ${fmtEur(b.surcharge)}` });
  }
  rows.push({ label: "Spolu bez DPH", value: fmtEur(Number(q.total_without_vat)), bold: true });
  rows.push({ label: `DPH ${q.vat_rate}%`, value: fmtEur(Number(q.vat_amount)) });

  const boxW = 82;
  const boxX = rightX - boxW;
  const neededH = rows.length * 5.2 + 16;

  if (y + neededH > pageH - MARGIN - 8) {
    doc.addPage();
    y = MARGIN + 4;
  }

  doc.setFillColor(...COLOR_HEAD_BG);
  doc.rect(boxX - 4, y - 5, boxW + 4, rows.length * 5.2 + 14, "F");

  doc.setFontSize(9.5);
  for (const r of rows) {
    doc.setFont(font, r.bold ? boldStyle : "normal");
    doc.setTextColor(...COLOR_TEXT);
    doc.text(r.label, boxX, y);
    doc.text(r.value, rightX, y, { align: "right" });
    y += 5.2;
  }

  y += 1.5;
  doc.setDrawColor(...COLOR_TEXT);
  doc.setLineWidth(0.5);
  doc.line(boxX, y, rightX, y);
  y += 6.5;

  doc.setFont(font, boldStyle);
  doc.setFontSize(13);
  doc.text("Spolu s DPH", boxX, y);
  doc.text(fmtEur(Number(q.total_with_vat)), rightX, y, { align: "right" });
  y += 6;

  doc.setFont(font, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR_MUTED);
  const disclaimer = doc.splitTextToSize(
    "Zľava sa vzťahuje výhradne na nábytok; služby a doprava sa nezľavňujú.",
    boxW,
  );
  doc.text(disclaimer, boxX, y);
  y += 4 * disclaimer.length + 6;

  if (q.notes) {
    const noteLines = doc.splitTextToSize(String(q.notes), contentW);
    const noteH = 10 + noteLines.length * 4.4;
    if (y + noteH > pageH - MARGIN - 8) {
      doc.addPage();
      y = MARGIN + 4;
    }
    doc.setDrawColor(...COLOR_LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, rightX, y);
    y += 6;
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text("POZNÁMKA", MARGIN, y);
    y += 5;
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(noteLines, MARGIN, y);
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Cenová ponuka ${q.quote_number ?? ""} · mima production`, MARGIN, pageH - MARGIN + 5);
    doc.text(`Strana ${i} z ${total}`, rightX, pageH - MARGIN + 5, { align: "right" });
  }

  const dataUri = doc.output("datauristring");
  return { base64: dataUri.split(",")[1] ?? "", filename: opts.filename };
}
