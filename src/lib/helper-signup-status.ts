/**
 * Stav prihlášky brigádnika tak, ako ho má vidieť on sám.
 *
 * Jediný spoľahlivý dôkaz, že brigádnik na akciu ide, je riadok v personáli na
 * akcii. Prihláška je len záznam o tom, čo si želal a ako sa rozhodlo — a môže
 * hlásiť „prijaté" aj potom, čo ho z akcie vymazali. Preto sa to, čo uvidí,
 * počíta z oboch: bez nasadenia nie je potvrdené nič.
 */
export type HelperSignupStatus = "none" | "pending" | "accepted" | "declined";

export function visibleSignupStatus(
  stored: HelperSignupStatus,
  assigned: boolean,
): HelperSignupStatus {
  if (assigned) return "accepted";
  // Prijatá prihláška bez nasadenia znamená, že ho z akcie stiahli.
  if (stored === "accepted") return "declined";
  return stored;
}

/** Smie sa brigádnik na akciu (znova) prihlásiť? */
export function canSignUp(stored: HelperSignupStatus, assigned: boolean): boolean {
  return !assigned && stored !== "pending";
}

/** Smie prihlášku stiahnuť sám? Dohodnuté nasadenie ruší len vedenie. */
export function canWithdraw(stored: HelperSignupStatus, assigned: boolean): boolean {
  return !assigned && stored === "pending";
}
