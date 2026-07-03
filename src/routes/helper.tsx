import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listHelperNames,
  verifyHelperPin,
  helperStatus,
  helperPunch,
} from "@/lib/helper.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Clock, Delete, HardHat, LogOut, Play, Square, Loader2 } from "lucide-react";

export const Route = createFileRoute("/helper")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Helper – dochádzka" },
      { name: "description", content: "Pichanie dochádzky pre výpomoc." },
    ],
  }),
  component: HelperScreen,
});

const TOKEN_KEY = "helper.session.token";
const NAME_KEY = "helper.session.name";

function HelperScreen() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(TOKEN_KEY);
  });
  const [name, setName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(NAME_KEY);
  });

  const onSignedIn = (tk: string, nm: string | null) => {
    sessionStorage.setItem(TOKEN_KEY, tk);
    if (nm) sessionStorage.setItem(NAME_KEY, nm);
    setToken(tk);
    setName(nm);
  };
  const onSignOut = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    setToken(null);
    setName(null);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/40">
      <header className="px-4 pt-4 pb-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ArrowLeft className="size-4 mr-1" />Späť</Link>
        </Button>
      </header>
      <main className="px-4 pb-8 max-w-md mx-auto">
        {!token ? (
          <HelperLogin onSignedIn={onSignedIn} />
        ) : (
          <HelperPunch token={token} name={name} onSignOut={onSignOut} />
        )}
      </main>
    </div>
  );
}

function HelperLogin({ onSignedIn }: { onSignedIn: (token: string, name: string | null) => void }) {
  const listFn = useServerFn(listHelperNames);
  const verifyFn = useServerFn(verifyHelperPin);
  const [helpers, setHelpers] = useState<{ id: string; name: string }[] | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    listFn()
      .then((rows) => { if (!cancel) setHelpers(rows); })
      .catch((e: any) => toast.error(e?.message ?? "Nepodarilo sa načítať zoznam."));
    return () => { cancel = true; };
  }, [listFn]);

  const selected = useMemo(() => helpers?.find((h) => h.id === helperId) ?? null, [helpers, helperId]);

  async function submit() {
    if (!helperId || pin.length < 3) return;
    setBusy(true);
    try {
      const { token, name } = await verifyFn({ data: { helperId, pin } });
      onSignedIn(token, name);
    } catch (e: any) {
      toast.error(e?.message ?? "Prihlásenie zlyhalo.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="text-center">
        <div className="inline-flex size-14 rounded-2xl bg-primary text-primary-foreground items-center justify-center shadow-md mb-3">
          <HardHat className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Helper – dochádzka</h1>
        <p className="text-sm text-muted-foreground">Vyber svoje meno a zadaj PIN.</p>
      </div>

      {!helperId ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground px-1">Kto si?</div>
          {helpers === null ? (
            <div className="text-center text-muted-foreground py-8"><Loader2 className="size-5 animate-spin inline mr-2" />Načítavam…</div>
          ) : helpers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Zatiaľ nie sú pridaní žiadni helperi.</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {helpers.map((h) => (
                <Button key={h.id} variant="outline" className="h-14 justify-start text-base" onClick={() => setHelperId(h.id)}>
                  {h.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button className="text-sm text-muted-foreground underline" onClick={() => { setHelperId(null); setPin(""); }}>
            ← Zmeniť meno
          </button>
          <div className="text-center">
            <div className="text-lg font-semibold">{selected?.name}</div>
            <div className="text-sm text-muted-foreground">Zadaj 4-miestny PIN</div>
          </div>
          <div className="flex justify-center gap-2 py-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`size-4 rounded-full border-2 ${pin.length > i ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
            ))}
          </div>
          <Pad
            onDigit={(d) => setPin((p) => (p.length >= 4 ? p : p + d))}
            onBack={() => setPin((p) => p.slice(0, -1))}
            onSubmit={submit}
            canSubmit={pin.length === 4 && !busy}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function Pad({ onDigit, onBack, onSubmit, canSubmit, busy }: {
  onDigit: (d: string) => void; onBack: () => void; onSubmit: () => void; canSubmit: boolean; busy: boolean;
}) {
  const keys = ["1","2","3","4","5","6","7","8","9"];
  return (
    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
      {keys.map((k) => (
        <Button key={k} variant="outline" className="h-16 text-2xl font-semibold" onClick={() => onDigit(k)}>{k}</Button>
      ))}
      <Button variant="ghost" className="h-16" onClick={onBack} aria-label="Zmazať">
        <Delete className="size-6" />
      </Button>
      <Button variant="outline" className="h-16 text-2xl font-semibold" onClick={() => onDigit("0")}>0</Button>
      <Button className="h-16 text-lg font-semibold" disabled={!canSubmit} onClick={onSubmit}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : "OK"}
      </Button>
    </div>
  );
}

function HelperPunch({ token, name, onSignOut }: { token: string; name: string | null; onSignOut: () => void }) {
  const statusFn = useServerFn(helperStatus);
  const punchFn = useServerFn(helperPunch);
  const [status, setStatus] = useState<{ name: string | null; open: { id: string; clock_in: string } | null } | null>(null);
  const [busy, setBusy] = useState<"start" | "end" | null>(null);

  async function refresh() {
    try {
      const s = await statusFn({ data: { token } });
      setStatus(s);
    } catch (e: any) {
      toast.error(e?.message ?? "Session vypršala.");
      onSignOut();
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doPunch(action: "start" | "end") {
    setBusy(action);
    try {
      await punchFn({ data: { token, action } });
      await refresh();
      toast.success(action === "start" ? "Začiatok práce zaznamenaný." : "Koniec práce zaznamenaný.");
      if (action === "end") {
        // krátky odhlas — na rozcestník
        setTimeout(() => onSignOut(), 1500);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa.");
    } finally {
      setBusy(null);
    }
  }

  const clockedIn = !!status?.open;
  const openSince = status?.open?.clock_in ? new Date(status.open.clock_in) : null;

  return (
    <div className="space-y-6 pt-6">
      <div className="text-center">
        <div className="inline-flex size-14 rounded-2xl bg-primary text-primary-foreground items-center justify-center shadow-md mb-3">
          <HardHat className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{status?.name ?? name ?? "Helper"}</h1>
        {status === null ? (
          <p className="text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin inline mr-1" />Načítavam stav…</p>
        ) : clockedIn && openSince ? (
          <p className="text-sm text-muted-foreground">
            <Clock className="size-4 inline mr-1" />
            Pracuješ od {openSince.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Momentálne nepracuješ.</p>
        )}
      </div>

      <div className="grid gap-3">
        <Button
          size="lg"
          className="h-20 text-lg font-semibold"
          disabled={clockedIn || busy !== null || status === null}
          onClick={() => doPunch("start")}
        >
          {busy === "start" ? <Loader2 className="size-6 animate-spin" /> : <><Play className="size-6 mr-2" />Štart práce</>}
        </Button>
        <Button
          size="lg"
          variant="destructive"
          className="h-20 text-lg font-semibold"
          disabled={!clockedIn || busy !== null}
          onClick={() => doPunch("end")}
        >
          {busy === "end" ? <Loader2 className="size-6 animate-spin" /> : <><Square className="size-6 mr-2" />Koniec práce</>}
        </Button>
      </div>

      <div className="pt-4 text-center">
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          <LogOut className="size-4 mr-1" />Odhlásiť
        </Button>
      </div>
    </div>
  );
}