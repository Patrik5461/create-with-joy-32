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