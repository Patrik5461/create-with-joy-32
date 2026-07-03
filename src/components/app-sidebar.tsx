import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Package, CalendarRange, Users, Truck, UserCog, ShieldCheck, LayoutPanelTop, Wrench, Calculator, ClipboardCheck, MessageSquare, Inbox, Clock, Calendar, Mail, KeyRound, HardHat } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { useUnreadTotal } from "@/hooks/use-chat-conversations";
import { ChatNotifications } from "@/components/chat/chat-notifications";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Rezervácie", url: "/reservations", icon: CalendarRange },
  { title: "Sklad", url: "/warehouse", icon: Package },
  { title: "Klienti", url: "/clients", icon: Users },
  { title: "Logistika", url: "/logistics", icon: Truck },
  { title: "Údržba nábytku", url: "/maintenance", icon: Wrench },
  { title: "Plán rozloženia", url: "/layouts", icon: LayoutPanelTop },
  { title: "Kalkulácie", url: "/quotes", icon: Calculator },
  { title: "Logistické dotazníky", url: "/surveys", icon: ClipboardCheck },
  { title: "Verejné dopyty", url: "/inquiries", icon: Inbox },
  { title: "Interný Chat", url: "/chat", icon: MessageSquare },
  { title: "Dochádzka", url: "/attendance", icon: Clock },
] as const;

const itemClass =
  "h-10 rounded-xl px-3 font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground [&>a>svg]:size-[18px] data-[active=true]:[&_svg]:text-sidebar-primary-foreground";

export function AppSidebar() {
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const { total: unread } = useUnreadTotal(user?.id);

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
                      <span className="flex-1">{item.title}</span>
                      {item.url === "/chat" && unread > 0 && (
                        <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{unread > 99 ? "99+" : unread}</Badge>
                      )}
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
                <SidebarMenuButton asChild isActive={isActive("/settings/calendar")} tooltip="Kalendár" className={itemClass}>
                  <Link to="/settings/calendar" className="flex items-center gap-3">
                    <Calendar className="size-[18px]" />
                    <span>Kalendár</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasRole(user, "admin") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/settings/email")} tooltip="Email (Resend)" className={itemClass}>
                    <Link to="/settings/email" className="flex items-center gap-3">
                      <Mail className="size-[18px]" />
                      <span>Email (Resend)</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {hasRole(user, "admin") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/settings/helpers")} tooltip="Helperi (PIN)" className={itemClass}>
                    <Link to="/settings/helpers" className="flex items-center gap-3">
                      <HardHat className="size-[18px]" />
                      <span>Helperi (PIN)</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings/account")} tooltip="Účet a heslo" className={itemClass}>
                  <Link to="/settings/account" className="flex items-center gap-3">
                    <KeyRound className="size-[18px]" />
                    <span>Účet a heslo</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <ChatNotifications />
    </Sidebar>
  );
}