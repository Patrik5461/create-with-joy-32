import { toast } from "sonner";
import type { AutoSyncResult } from "@/lib/quote-reservation-link";

/**
 * Hlásenie o automatickom zosúladení rezervácie.
 *
 * Deje sa to na pozadí po schválení kalkulácie, takže človek musí vidieť, že sa
 * rezervácia (a s ňou kalendár) zmenila — inak by to bola tichá zmena termínov
 * a položiek akcie.
 */
export function reportAutoSync(result: AutoSyncResult): void {
  if (!result.synced) return;
  toast.success(
    `Rezervácia „${result.eventName ?? "bez názvu"}“ zosúladená s verziou v${result.quoteVersion}`,
    { description: "Položky aj termíny idú do kalendára podľa schválenej verzie." },
  );
  if (result.skipped.length) {
    toast.warning(
      `Položky mimo skladu (${result.skipped.length}) sú zapísané v poznámke rezervácie: ` +
        result.skipped.map((s) => `${s.name} ×${s.qty}`).join(", "),
    );
  }
}

/** Zosúladenie nesmie zhodiť samotné schválenie — to už je uložené. */
export function reportAutoSyncError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  toast.error("Kalkulácia je schválená, ale rezerváciu sa nepodarilo zosúladiť", {
    description: `${msg} — skús to tlačidlom „Zosúladiť rezerváciu“ v detaile kalkulácie.`,
  });
}
