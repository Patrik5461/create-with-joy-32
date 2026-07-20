import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Package, Truck, AlertTriangle, TrendingUp, Boxes, Wrench, ArrowRight, Calculator, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { RESERVATION_FLOW, STATUS_LABEL, STATUS_BADGE_VARIANT, STATUS_DOT, type ReservationStatus } from "@/lib/reservation-status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Mima Production CRM" }] }),
  component: Dashboard,
});

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function endOfToday() { const d = new Date(); d.setHours(23,59,59,999); return d; }

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const startToday = startOfToday().toISOString();
      const endToday = endOfToday().toISOString();
      const now = new Date().toISOString();
      const in7d = new Date(Date.now() + 7 * 86400000).toISOString();
      const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const endMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();

      const [todayLoad, todayReturn, outNow, upcoming, monthCount, active, items, allReservations, openDamage, quotes, statusBreakdown] = await Promise.all([
        supabase.from("reservations").select("id,event_name,load_at,venue,status,contact_person,clients(company_name)").gte("load_at", startToday).lte("load_at", endToday).neq("status", "cancelled").order("load_at"),
        supabase.from("reservations").select("id,event_name,return_at,venue,status,contact_person,clients(company_name)").gte("return_at", startToday).lte("return_at", endToday).neq("status", "cancelled").order("return_at"),
        supabase.from("reservations").select("id,event_name,return_at,venue,status,contact_person,clients(company_name)").lte("load_at", now).gte("available_from_at", now).neq("status", "cancelled"),
        supabase.from("reservations").select("id,event_name,load_at,event_start_at,venue,status,contact_person,clients(company_name)").gte("event_start_at", now).lte("event_start_at", in7d).neq("status", "cancelled").order("event_start_at").limit(8),
        supabase.from("reservations").select("id", { count: "exact", head: true }).gte("event_start_at", startMonth).lte("event_start_at", endMonth).neq("status", "cancelled"),
        supabase.from("reservations").select("id", { count: "exact", head: true }).in("status", ["confirmed", "in_progress"]),
        supabase.from("furniture_items").select("id,name,total_qty,damaged_qty,retired_qty").eq("active", true),
        supabase.from("reservation_items").select("qty,furniture_item_id,furniture_items(name)"),
        supabase.from("damaged_items").select("id,severity", { count: "exact" }).in("status", ["new", "in_progress"]),
        supabase.from("quotes").select("status").is("deleted_at", null),
        supabase.from("reservations").select("status"),
      ]);

      // Top rented items aggregation
      const counts = new Map<string, { name: string; qty: number }>();
      for (const r of allReservations.data ?? []) {
        const fi = (r as any).furniture_items;
        if (!fi) continue;
        const cur = counts.get(r.furniture_item_id) ?? { name: fi.name, qty: 0 };
        cur.qty += r.qty;
        counts.set(r.furniture_item_id, cur);
      }
      const topItems = [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

      const totalCapacity = (items.data ?? []).reduce((s, i) => s + Math.max(0, i.total_qty - i.damaged_qty - i.retired_qty), 0);

      const statusCounts: Record<string, number> = {};
      for (const row of (statusBreakdown.data ?? []) as { status: string }[]) {
        statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      }

      return {
        todayLoad: todayLoad.data ?? [],
        todayReturn: todayReturn.data ?? [],
        outNow: outNow.data ?? [],
        upcoming: upcoming.data ?? [],
        monthCount: monthCount.count ?? 0,
        active: active.count ?? 0,
        topItems,
        totalCapacity,
        itemCount: items.data?.length ?? 0,
        openDamageCount: openDamage.count ?? 0,
        severeDamageCount: (openDamage.data ?? []).filter((d: any) => d.severity === "severe").length,
        quotesDraft: (quotes.data ?? []).filter((q: any) => q.status === "draft").length,
        quotesSent: (quotes.data ?? []).filter((q: any) => q.status === "sent").length,
        quotesApproved: (quotes.data ?? []).filter((q: any) => q.status === "approved").length,
        statusCounts,
      };
    },
  });
}

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold mt-2">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useDashboardData();

  return (
    <>
      <AppHeader title="Dashboard" />
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Mima Production CRM</h2>
          <p className="text-sm text-muted-foreground">Prehľad dnešného dňa a stavu skladu.</p>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Stat icon={Truck} label="Dnešné nakládky" value={data?.todayLoad.length ?? "—"} />
          <Stat icon={Package} label="Dnešné návraty" value={data?.todayReturn.length ?? "—"} />
          <Stat icon={CalendarRange} label="Aktívne rezervácie" value={data?.active ?? "—"} />
          <Stat icon={TrendingUp} label="Eventy tento mesiac" value={data?.monthCount ?? "—"} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ListChecks className="size-4" />Rezervácie podľa stavu</CardTitle>
            <CardDescription>Životný cyklus eventov v reálnom čase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              {[...RESERVATION_FLOW, "cancelled" as const].map((s) => {
                const count = data?.statusCounts?.[s] ?? 0;
                return (
                  <Link
                    key={s}
                    to="/reservations"
                    search={{ status: s } as any}
                    className="block rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${STATUS_DOT[s as ReservationStatus]}`} />
                      <span className="text-xs font-medium text-muted-foreground truncate">{STATUS_LABEL[s as ReservationStatus]}</span>
                    </div>
                    <div className="text-2xl font-semibold mt-1">{count}</div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Truck className="size-4" />Dnešné nakládky</CardTitle>
              <CardDescription>Plán odvozov na dnes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Načítavam…</p>}
              {!isLoading && data?.todayLoad.length === 0 && <p className="text-sm text-muted-foreground">Žiadne nakládky.</p>}
              {data?.todayLoad.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.event_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.clients?.company_name} · {r.venue}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{format(new Date(r.load_at), "HH:mm")}</div>
                    <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]} className="text-[10px]">{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Package className="size-4" />Dnešné návraty</CardTitle>
              <CardDescription>Nábytok, ktorý sa dnes vracia na sklad</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!isLoading && data?.todayReturn.length === 0 && <p className="text-sm text-muted-foreground">Žiadne návraty.</p>}
              {data?.todayReturn.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.event_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.clients?.company_name} · {r.venue}</div>
                  </div>
                  <div className="text-right text-sm font-mono">{format(new Date(r.return_at), "HH:mm")}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CalendarRange className="size-4" />Najbližšie eventy</CardTitle>
              <CardDescription>Najbližších 7 dní</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!isLoading && data?.upcoming.length === 0 && <p className="text-sm text-muted-foreground">Žiadne eventy.</p>}
              {data?.upcoming.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.event_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.clients?.company_name} · {r.venue}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div>{format(new Date(r.event_start_at), "d. MMM HH:mm", { locale: sk })}</div>
                    <Badge variant={STATUS_BADGE_VARIANT[r.status as ReservationStatus]} className="text-[10px] mt-1">{STATUS_LABEL[r.status as ReservationStatus]}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Boxes className="size-4" />Najčastejšie prenajímaný nábytok</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data?.topItems.length === 0 && <p className="text-sm text-muted-foreground">Žiadne dáta.</p>}
              {data?.topItems.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-sm truncate">{i.name}</span>
                  <Badge variant="secondary">{i.qty} ks</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-warning" />Nábytok aktuálne mimo skladu</CardTitle>
            </CardHeader>
            <CardContent>
              {!isLoading && data?.outNow.length === 0 && <p className="text-sm text-muted-foreground">Všetko je na sklade.</p>}
              {data?.outNow.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <span className="truncate">{r.event_name} · {r.clients?.company_name}</span>
                  <span className="text-xs text-muted-foreground">návrat {format(new Date(r.return_at), "d.M. HH:mm")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kapacita skladu</CardTitle>
              <CardDescription>Celkový dostupný počet kusov</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold">{data?.totalCapacity ?? "—"}</div>
              <p className="text-sm text-muted-foreground mt-1">naprieč {data?.itemCount ?? 0} typmi nábytku</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Wrench className="size-4 text-rose-600" />Nahlásené poškodenia</CardTitle>
              <CardDescription>Otvorené záznamy údržby</CardDescription>
            </div>
            <Link to="/maintenance" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              Otvoriť modul <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-6">
              <div>
                <div className="text-4xl font-semibold">{data?.openDamageCount ?? "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">nevyriešených</p>
              </div>
              <div>
                <div className="text-2xl font-semibold text-rose-700">{data?.severeDamageCount ?? "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">z toho vážnych</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Calculator className="size-4 text-primary" />Kalkulácie</CardTitle>
              <CardDescription>Prehľad cenových ponúk</CardDescription>
            </div>
            <Link to="/quotes" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              Otvoriť modul <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-8">
              <div>
                <div className="text-3xl font-semibold">{data?.quotesDraft ?? "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">návrhov</p>
              </div>
              <div>
                <div className="text-3xl font-semibold text-sky-700">{data?.quotesSent ?? "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">odoslaných</p>
              </div>
              <div>
                <div className="text-3xl font-semibold text-emerald-700">{data?.quotesApproved ?? "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">schválených</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}