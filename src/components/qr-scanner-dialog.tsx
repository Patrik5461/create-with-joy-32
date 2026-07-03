import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, KeyboardIcon, AlertTriangle } from "lucide-react";
import { parseFurnitureId } from "./qr-code";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the parsed furniture id (uuid). */
  onDetected: (furnitureId: string, rawText: string) => void;
  title?: string;
  description?: string;
};

const SCANNER_ID = "qr-scanner-region";

export function QrScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Skenovať QR kód",
  description = "Namierte kameru na QR kód položky nábytku.",
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const scannerRef = useRef<any>(null);
  const isSecure =
    typeof window === "undefined"
      ? true
      : window.isSecureContext || window.location.hostname === "localhost";

  useEffect(() => {
    if (!open) return;
    setError(null);
    let stopped = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (stopped) return;
        const Html5Qrcode = mod.Html5Qrcode;
        // Element exists in DOM by the time the dialog content is rendered
        const region = document.getElementById(SCANNER_ID);
        if (!region) {
          setError("Skener sa nepodarilo inicializovať.");
          return;
        }
        const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            aspectRatio: 1,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const side = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
              return { width: side, height: side };
            },
          },
          (decoded: string) => {
            const id = parseFurnitureId(decoded);
            if (id) {
              // Stop before invoking handler so dialog can navigate freely
              scanner.stop().catch(() => {});
              onDetected(id, decoded);
            }
          },
          () => {
            // Ignore frame-decode errors
          },
        );
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        if (/permission|NotAllowed/i.test(msg)) {
          setError("Prístup ku kamere bol zamietnutý. Povoľte kameru v prehliadači.");
        } else if (/NotFound|no camera/i.test(msg)) {
          setError("Nenašla sa žiadna kamera na tomto zariadení.");
        } else if (!isSecure) {
          setError(
            "Skenovanie kamerou vyžaduje HTTPS. Zatiaľ použite manuálny vstup nižšie, alebo nasaďte HTTPS.",
          );
        } else {
          setError(msg || "Skener sa nepodarilo spustiť.");
        }
      }
    })();

    return () => {
      stopped = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().catch(() => {}).then(() => {
          try { s.clear(); } catch { /* noop */ }
        });
      }
    };
  }, [open, onDetected, isSecure]);

  const submitManual = () => {
    const id = parseFurnitureId(manual);
    if (id) {
      onDetected(id, manual);
      setManual("");
    } else {
      setError("Neplatný kód. Zadajte URL alebo ID položky.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!isSecure && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              Skenovanie kamerou vyžaduje HTTPS (secure context). Aktuálne beží
              cez HTTP — kamera sa pravdepodobne nespustí. Po nasadení HTTPS
              bude fungovať automaticky. Zatiaľ použite manuálny vstup nižšie.
            </div>
          </div>
        )}

        <div
          id={SCANNER_ID}
          className="w-full aspect-square bg-black rounded-md overflow-hidden"
        />

        {error && (
          <p className="text-xs text-rose-600">{error}</p>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <Label className="text-xs flex items-center gap-1">
            <KeyboardIcon className="size-3" /> Manuálny vstup (URL alebo ID)
          </Label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="napr. https://…/warehouse/scan/<id>"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitManual();
              }}
            />
            <Button onClick={submitManual} disabled={!manual.trim()}>
              Potvrdiť
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}