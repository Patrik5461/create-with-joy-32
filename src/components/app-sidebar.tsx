import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Package, CalendarRange, Users, Truck, UserCog, Building2 } from "lucide-react";
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
] as const;

export function AppSidebar() {
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="size-8 rounded-lg bg-sidebar-primary grid place-items-center text-sidebar-primary-foreground shrink-0">
            <Building2 className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm text-sidebar-foreground">MimaProduction</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">CRM</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Hlavné menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
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
            <SidebarGroupLabel>Administrácia</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/users")} tooltip="Používatelia">
                    <Link to="/users" className="flex items-center gap-2">
                      <UserCog className="size-4" />
                      <span>Používatelia</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}