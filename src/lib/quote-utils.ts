export type AdjustType = "none" | "percent" | "fixed";
export type PriceMode = "per_day" | "fixed" | "service";
export type ItemKind = "furniture" | "service";

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

export interface QuoteTotals {
  subtotal: number;
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
  const subtotal = opts.lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount =
    opts.discountType === "percent" ? (subtotal * opts.discountValue) / 100 :
    opts.discountType === "fixed" ? opts.discountValue : 0;
  const afterDiscount = Math.max(0, subtotal - discount);
  const surcharge =
    opts.surchargeType === "percent" ? (afterDiscount * opts.surchargeValue) / 100 :
    opts.surchargeType === "fixed" ? opts.surchargeValue : 0;
  const totalWithoutVat = Math.max(0, afterDiscount + surcharge);
  const vatAmount = (totalWithoutVat * opts.vatRate) / 100;
  const totalWithVat = totalWithoutVat + vatAmount;
  return { subtotal, discount, surcharge, totalWithoutVat, vatAmount, totalWithVat };
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