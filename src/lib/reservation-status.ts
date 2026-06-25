export const RESERVATION_STATUSES = [
  "inquiry", "confirmed", "prepared", "loaded", "delivered", "in_progress", "returned", "cancelled",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  inquiry: "Dopyt",
  confirmed: "Potvrdené",
  prepared: "Pripravené",
  loaded: "Naložené",
  delivered: "Doručené",
  in_progress: "Prebieha event",
  returned: "Vrátené",
  cancelled: "Zrušené",
};

export const STATUS_BADGE_VARIANT: Record<ReservationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  inquiry: "outline",
  confirmed: "secondary",
  prepared: "secondary",
  loaded: "default",
  delivered: "default",
  in_progress: "default",
  returned: "secondary",
  cancelled: "destructive",
};

// Tailwind utility classes for calendar event blocks (bg + text + border).
export const STATUS_COLOR: Record<ReservationStatus, string> = {
  inquiry: "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200",
  prepared: "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200",
  loaded: "bg-indigo-100 text-indigo-900 border-indigo-300 hover:bg-indigo-200",
  delivered: "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200",
  in_progress: "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200",
  returned: "bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300",
  cancelled: "bg-rose-100 text-rose-900 border-rose-300 line-through hover:bg-rose-200",
};