export type AdjustType = "none" | "percent" | "fixed";
export type PriceMode = "per_day" | "fixed" | "service";
export type ItemKind = "furniture" | "service" | "other";

export interface QuoteLine {
  id: string;
  kind: ItemKind;
  furniture_item_id: string | null;
  name: string;
  qty: number;
  price_mode: PriceMode;
  unit_price: number;
  days: number;
}

export function lineTotal(l: QuoteLine): number {
  const days = l.price_mode === "per_day" ? Math.max(1, l.days) : 1;
  return Math.max(0, l.qty) * Math.max(0, l.unit_price) * days;
}

/** Nábytok mimo skladu — voľne napísaná položka bez väzby na sklad. Takýto kus
 *  sa dopožičiava alebo dokupuje, takže sa naň zľava neuplatňuje. */
export function isOffStock(l: Pick<QuoteLine, "kind" | "furniture_item_id">): boolean {
  return l.kind === "furniture" && !l.furniture_item_id;
}

export interface QuoteTotals {
  subtotal: number;
  /** Všetok nábytok — zo skladu aj mimo neho. */
  furnitureSubtotal: number;
  /** Len nábytok zo skladu; z tohto sa počíta zľava. */
  stockFurnitureSubtotal: number;
  /** Nábytok mimo skladu (dopožičaný / dokúpený) — bez zľavy. */
  offStockSubtotal: number;
  servicesSubtotal: number;
  otherSubtotal: number;
  discount: number;
  surcharge: number;
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
}

export function computeTotals(opts: {
  lines: QuoteLine[];
  discountType: AdjustType;
  discountValue: number;
  surchargeType: AdjustType;
  surchargeValue: number;
  vatRate: number;
}): QuoteTotals {
  const stockFurnitureSubtotal = opts.lines
    .filter((l) => l.kind === "furniture" && !isOffStock(l))
    .reduce((s, l) => s + lineTotal(l), 0);
  const offStockSubtotal = opts.lines
    .filter(isOffStock)
    .reduce((s, l) => s + lineTotal(l), 0);
  const furnitureSubtotal = stockFurnitureSubtotal + offStockSubtotal;
  const servicesSubtotal = opts.lines
    .filter((l) => l.kind === "service")
    .reduce((s, l) => s + lineTotal(l), 0);
  const otherSubtotal = opts.lines
    .filter((l) => l.kind === "other")
    .reduce((s, l) => s + lineTotal(l), 0);
  const subtotal = furnitureSubtotal + servicesSubtotal + otherSubtotal;
  // Zľava sa vzťahuje LEN na nábytok zo skladu — nie na služby/dopravu, nie na
  // položky "Iné" a nie na nábytok mimo skladu (ten sa dopožičiava za cenu,
  // ktorú sami platíme, takže zľavňovať ho by znamenalo predávať pod cenu).
  const rawDiscount =
    opts.discountType === "percent" ? (stockFurnitureSubtotal * opts.discountValue) / 100 :
    opts.discountType === "fixed" ? opts.discountValue : 0;
  const discount = Math.min(Math.max(0, rawDiscount), stockFurnitureSubtotal);
  const furnitureAfterDiscount = Math.max(0, furnitureSubtotal - discount);
  const baseForSurcharge = furnitureAfterDiscount + servicesSubtotal + otherSubtotal;
  const surcharge =
    opts.surchargeType === "percent" ? (baseForSurcharge * opts.surchargeValue) / 100 :
    opts.surchargeType === "fixed" ? opts.surchargeValue : 0;
  const totalWithoutVat = Math.max(0, baseForSurcharge + surcharge);
  const vatAmount = (totalWithoutVat * opts.vatRate) / 100;
  const totalWithVat = totalWithoutVat + vatAmount;
  return { subtotal, furnitureSubtotal, stockFurnitureSubtotal, offStockSubtotal, servicesSubtotal, otherSubtotal, discount, surcharge, totalWithoutVat, vatAmount, totalWithVat };
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n || 0);
}

export const QUOTE_STATUS_LABEL: Record<"draft" | "sent" | "approved" | "rejected", string> = {
  draft: "Návrh",
  sent: "Odoslaná",
  approved: "Schválená",
  rejected: "Zamietnutá",
};

export const QUOTE_STATUS_VARIANT: Record<"draft" | "sent" | "approved" | "rejected", "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  approved: "default",
  rejected: "destructive",
};

/**
 * Kalkulácie v CRM identifikujeme podľa klienta, nie podľa čísla — číslo
 * (Q2026-0042) zostáva len na PDF a v emaile pre klienta, kde slúži ako
 * referencia dokladu.
 */
export function quoteClientName(q: any): string {
  const name = (q?.clients?.company_name ?? q?.client?.company_name ?? "").toString().trim();
  return name || "Bez klienta";
}
