/**
 * Detekcia natívnej platformy (Capacitor).
 *
 * Bezpečne vracia `false` na webe aj keď Capacitor nie je nainštalovaný.
 * Keď sa neskôr pridá Capacitor (@capacitor/core), automaticky sa
 * zapne — na natívnom telefóne bude `Capacitor.isNativePlatform()` true.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  try {
    if (cap && typeof cap.isNativePlatform === "function") {
      return cap.isNativePlatform() === true;
    }
    // starsi fallback
    if (cap && typeof cap.getPlatform === "function") {
      const p = cap.getPlatform();
      return p === "ios" || p === "android";
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Pre lokálne testovanie natívneho UI aj v prehliadači: ?native=1 v URL. */
export function isNativePreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("native") === "1";
  } catch {
    return false;
  }
}

export function shouldShowNativeLauncher(): boolean {
  return isNativeApp() || isNativePreview();
}