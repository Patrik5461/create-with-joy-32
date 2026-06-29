// Lifecycle (in order). `cancelled` is a side-state reachable from anywhere.
export const RESERVATION_FLOW = [
  "inquiry", "quote", "confirmed", "in_progress", "returned", "invoiced",
] as const;

export const RESERVATION_STATUSES = [
  ...RESERVATION_FLOW, "cancelled",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  inquiry: "Dopyt",
  quote: "Ponuka",
  confirmed: "Potvrdené",
  in_progress: "Prebieha",
  returned: "Vrátené",
  invoiced: "Fakturované",
  cancelled: "Zrušené",
};

export const STATUS_DESCRIPTION: Record<ReservationStatus, string> = {
  inquiry: "Klient prejavil záujem, ešte nie je cenová ponuka",
  quote: "Vytvorená kalkulácia, čaká na schválenie klientom",
  confirmed: "Klient schválil, event je záväzne objednaný",
  in_progress: "Nábytok je vyvezený / event práve beží",
  returned: "Nábytok sa vrátil, treba skontrolovať stav",
  invoiced: "Vystavená faktúra, obchod uzavretý",
  cancelled: "Rezervácia zrušená",
};

export const STATUS_BADGE_VARIANT: Record<ReservationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  inquiry: "outline",
  quote: "secondary",
  confirmed: "secondary",
  in_progress: "default",
  returned: "secondary",
  invoiced: "default",
  cancelled: "destructive",
};

// Tailwind utility classes for calendar event blocks (bg + text + border).
export const STATUS_COLOR: Record<ReservationStatus, string> = {
  inquiry: "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200",
  quote: "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200",
  in_progress: "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200",
  returned: "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200",
  invoiced: "bg-emerald-200 text-emerald-900 border-emerald-400 hover:bg-emerald-300",
  cancelled: "bg-rose-100 text-rose-900 border-rose-300 line-through hover:bg-rose-200",
};

// Solid color tokens for stepper dots / progress bars.
export const STATUS_DOT: Record<ReservationStatus, string> = {
  inquiry: "bg-amber-500",
  quote: "bg-sky-500",
  confirmed: "bg-emerald-500",
  in_progress: "bg-blue-500",
  returned: "bg-violet-500",
  invoiced: "bg-emerald-600",
  cancelled: "bg-rose-500",
};

export function nextStatus(s: ReservationStatus): ReservationStatus | null {
  if (s === "cancelled") return null;
  const i = RESERVATION_FLOW.indexOf(s as (typeof RESERVATION_FLOW)[number]);
  if (i < 0 || i >= RESERVATION_FLOW.length - 1) return null;
  return RESERVATION_FLOW[i + 1];
}

export function prevStatus(s: ReservationStatus): ReservationStatus | null {
  if (s === "cancelled") return null;
  const i = RESERVATION_FLOW.indexOf(s as (typeof RESERVATION_FLOW)[number]);
  if (i <= 0) return null;
  return RESERVATION_FLOW[i - 1];
}