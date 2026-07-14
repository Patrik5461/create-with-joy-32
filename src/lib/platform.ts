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

/**
 * Dočasný flag: kým nie je natívna appka v storoch, ukazujeme rozcestník
 * (Helper / Prihlásenie / Katalóg) aj na mobilnom webe. Po vydaní appky
 * stačí prepnúť na `false` a mobilný web pôjde rovno na /dashboard alebo /auth.
 */
export const SHOW_LAUNCHER_ON_MOBILE_WEB = true;

const MOBILE_WEB_BREAKPOINT_PX = 768;

/** Mobilné zariadenie v prehliadači — viewport šírka alebo mobilný UA. */
export function isMobileWeb(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.innerWidth > 0 && window.innerWidth < MOBILE_WEB_BREAKPOINT_PX) return true;
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  } catch {
    return false;
  }
}

export function shouldShowLauncher(): boolean {
  return isNativeApp() || isNativePreview() || (SHOW_LAUNCHER_ON_MOBILE_WEB && isMobileWeb());
}