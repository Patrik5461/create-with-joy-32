import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
};

/**
 * Client-only QR code renderer. Dynamically imports `qrcode` inside
 * useEffect so the package never runs during SSR / build prerender.
 */
export function QRCode({ value, size = 192, className, alt }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const QR = await import("qrcode");
        const url = await QR.toDataURL(value, {
          width: size,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled && mounted.current) setDataUrl(url);
      } catch {
        if (!cancelled && mounted.current) setDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`bg-muted animate-pulse rounded ${className ?? ""}`}
        style={{ width: size, height: size }}
        aria-label="Načítavam QR kód"
      />
    );
  }
  return (
    <img
      src={dataUrl}
      alt={alt ?? `QR: ${value}`}
      width={size}
      height={size}
      className={className}
    />
  );
}

/** Convenience: builds an absolute URL pointing at the scan route. */
export function buildFurnitureScanUrl(id: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/warehouse/scan/${id}`;
}

/** Parse a scanned QR text and try to extract a furniture id. */
export function parseFurnitureId(scanned: string): string | null {
  const trimmed = scanned.trim();
  if (!trimmed) return null;
  // Match /warehouse/scan/<uuid> anywhere in the string
  const m = trimmed.match(/warehouse\/scan\/([0-9a-f-]{8,})/i);
  if (m) return m[1];
  // Or a bare uuid
  if (/^[0-9a-f-]{8,}$/i.test(trimmed)) return trimmed;
  return null;
}