import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Package, CalendarRange, Users, Truck, UserCog, ShieldCheck, LayoutPanelTop, Settings, Wrench, Calculator } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Rezervácie", url: "/reservations", icon: CalendarRange },
  { title: "Sklad", url: "/warehouse", icon: Package },
  { title: "Klienti", url: "/clients", icon: Users },
  { title: "Logistika", url: "/logistics", icon: Truck },
  { title: "Údržba nábytku", url: "/maintenance", icon: Wrench },
  { title: "Plán rozloženia", url: "/layouts", icon: LayoutPanelTop },
  { title: "Kalkulácie", url: "/quotes", icon: Calculator },
] as const;

const itemClass =
  "h-10 rounded-xl px-3 font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground [&>a>svg]:size-[18px] data-[active=true]:[&_svg]:text-sidebar-primary-foreground";

export function AppSidebar() {
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border h-14 justify-center py-0">
        <div className="flex items-center gap-2.5 px-2">
          <div className="size-8 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground shrink-0 shadow-sm">
            <ShieldCheck className="size-[18px]" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-[15px] text-sidebar-foreground tracking-tight">Mima Production</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60 font-semibold">CRM</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3 gap-1">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">Hlavné menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={itemClass}>
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="size-[18px]" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {hasRole(user, "admin") && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">Administrácia</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/users")} tooltip="Používatelia" className={itemClass}>
                    <Link to="/users" className="flex items-center gap-3">
                      <UserCog className="size-[18px]" />
                      <span>Používatelia</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">Nastavenia</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Nastavenia" className={itemClass}>
                  <Link to="/settings/calendar" className="flex items-center gap-3">
                    <Settings className="size-[18px]" />
                    <span>Prepojenie kalendára</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}