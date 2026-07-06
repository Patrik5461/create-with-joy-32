import jsPDF from "jspdf";
import { formatEur, lineTotal } from "./quote-utils";

/**
 * Vygeneruje jednoduché PDF cenovej ponuky a vráti base64 (bez data: prefixu).
 * Beží čisto v prehliadači (jsPDF), aby to fungovalo aj bez server PDF renderu.
 */
export function buildQuotePdfBase64(quote: any): { base64: string; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 50;

  const client = quote.clients ?? {};
  const contact = quote.client_contacts ?? {};

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Cenova ponuka ${quote.quote_number}`, marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Verzia: v${quote.version_number}`, marginX, y);
  y += 14;
  if (quote.issued_at) {
    doc.text(`Datum vystavenia: ${new Date(quote.issued_at).toLocaleDateString("sk-SK")}`, marginX, y);
    y += 14;
  }
  if (quote.valid_until) {
    doc.text(`Platnost do: ${quote.valid_until}`, marginX, y);
    y += 14;
  }
  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("sk-SK") : null);
  const installD = fmtDate(quote.installation_date);
  const eventD = fmtDate(quote.event_date);
  const dismD = fmtDate(quote.dismantling_date);
  if (installD) { doc.text(`Datum instalacie: ${installD}`, marginX, y); y += 14; }
  if (eventD) { doc.text(`Datum eventu: ${eventD}`, marginX, y); y += 14; }
  if (dismD) { doc.text(`Datum demontaze: ${dismD}`, marginX, y); y += 14; }
  y += 6;

  // Client block
  doc.setFont("helvetica", "bold");
  doc.text("Odberatel:", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  if (client.company_name) { doc.text(String(client.company_name), marginX, y); y += 12; }
  if (contact.full_name || client.contact_person) { doc.text(String(contact.full_name ?? client.contact_person), marginX, y); y += 12; }
  if (contact.email || client.email) { doc.text(String(contact.email ?? client.email), marginX, y); y += 12; }
  y += 6;

  // Items table header
  const items = (quote.quote_items ?? []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  doc.setFont("helvetica", "bold");
  doc.text("Polozka", marginX, y);
  doc.text("Ks", marginX + 260, y, { align: "right" });
  doc.text("Dni", marginX + 300, y, { align: "right" });
  doc.text("Cena", marginX + 380, y, { align: "right" });
  doc.text("Spolu", marginX + 475, y, { align: "right" });
  y += 6;
  doc.setLineWidth(0.5);
  doc.line(marginX, y, marginX + 480, y);
  y += 14;
  doc.setFont("helvetica", "normal");

  for (const it of items) {
    if (y > 780) { doc.addPage(); y = 50; }
    const name = String(it.name ?? "").slice(0, 60);
    doc.text(name, marginX, y);
    doc.text(String(it.qty), marginX + 260, y, { align: "right" });
    doc.text(String(it.days ?? 1), marginX + 300, y, { align: "right" });
    doc.text(formatEur(Number(it.unit_price ?? 0)), marginX + 380, y, { align: "right" });
    doc.text(formatEur(lineTotal(it as any)), marginX + 475, y, { align: "right" });
    y += 14;
  }

  y += 10;
  doc.setLineWidth(0.5);
  doc.line(marginX, y, marginX + 480, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.text("Suma bez DPH:", marginX + 340, y, { align: "right" });
  doc.text(formatEur(Number(quote.total_without_vat ?? 0)), marginX + 475, y, { align: "right" });
  y += 14;
  doc.text("DPH:", marginX + 340, y, { align: "right" });
  doc.text(formatEur(Number(quote.vat_amount ?? 0)), marginX + 475, y, { align: "right" });
  y += 14;
  doc.text("Spolu s DPH:", marginX + 340, y, { align: "right" });
  doc.text(formatEur(Number(quote.total_with_vat ?? 0)), marginX + 475, y, { align: "right" });

  if (quote.notes) {
    y += 24;
    doc.setFont("helvetica", "bold");
    doc.text("Poznamka:", marginX, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(String(quote.notes), 515);
    doc.text(wrapped, marginX, y);
  }

  // base64 without data: prefix
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1] ?? "";
  return { base64, filename: `ponuka-${quote.quote_number}.pdf` };
}