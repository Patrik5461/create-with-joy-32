import type { AppRole } from "@/hooks/use-current-user";

export const PERMISSIONS = [
  "warehouse.view",
  "warehouse.edit",
  "reservations.view",
  "reservations.edit",
  "quotes.view",
  "quotes.edit",
  "clients.view",
  "clients.edit",
  "logistics.view",
  "logistics.edit",
  "contracts.view",
  "contracts.edit",
  "maintenance.view",
  "maintenance.edit",
  "attendance.view_all",
  "chat.access",
  "layouts.view",
  "layouts.edit",
  "settings.manage",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface PermissionGroup {
  label: string;
  items: { key: Permission; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: "Sklad", items: [
    { key: "warehouse.view", label: "Zobraziť" },
    { key: "warehouse.edit", label: "Upravovať / mazať" },
  ]},
  { label: "Rezervácie a dopyty", items: [
    { key: "reservations.view", label: "Zobraziť" },
    { key: "reservations.edit", label: "Vytvárať / upravovať / mazať" },
  ]},
  { label: "Kalkulácie", items: [
    { key: "quotes.view", label: "Zobraziť" },
    { key: "quotes.edit", label: "Vytvárať / upravovať / odosielať" },
  ]},
  { label: "Klienti", items: [
    { key: "clients.view", label: "Zobraziť" },
    { key: "clients.edit", label: "Upravovať" },
  ]},
  { label: "Logistika a dotazníky", items: [
    { key: "logistics.view", label: "Zobraziť" },
    { key: "logistics.edit", label: "Upravovať" },
  ]},
  { label: "Zmluvy a protokoly", items: [
    { key: "contracts.view", label: "Zobraziť" },
    { key: "contracts.edit", label: "Vytvárať / podpisovať" },
  ]},
  { label: "Údržba nábytku", items: [
    { key: "maintenance.view", label: "Zobraziť" },
    { key: "maintenance.edit", label: "Nahlasovať / riešiť" },
  ]},
  { label: "Plán rozloženia", items: [
    { key: "layouts.view", label: "Zobraziť" },
    { key: "layouts.edit", label: "Upravovať" },
  ]},
  { label: "Dochádzka", items: [
    { key: "attendance.view_all", label: "Vidieť dochádzku všetkých" },
  ]},
  { label: "Chat", items: [
    { key: "chat.access", label: "Prístup do interného chatu" },
  ]},
  { label: "Administrácia", items: [
    { key: "settings.manage", label: "Nastavenia (firemné údaje, email, helperi)" },
    { key: "users.manage", label: "Správa používateľov" },
  ]},
];

export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, Permission[]> = {
  admin: [...PERMISSIONS],
  manager: PERMISSIONS.filter((p) => p !== "users.manage" && p !== "settings.manage") as Permission[],
  warehouse: [
    "warehouse.view",
    "warehouse.edit",
    "reservations.view",
    "maintenance.view",
    "maintenance.edit",
    "chat.access",
  ],
};

export interface PermissionTemplate {
  key: string;
  label: string;
  description: string;
  permissions: Permission[];
}

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    key: "admin",
    label: "Admin",
    description: "Plný prístup ku všetkému.",
    permissions: [...PERMISSIONS],
  },
  {
    key: "manager",
    label: "Manažér",
    description: "Všetko okrem správy používateľov a nastavení.",
    permissions: ROLE_DEFAULT_PERMISSIONS.manager,
  },
  {
    key: "warehouse",
    label: "Skladník",
    description: "Sklad, prehľad rezervácií, údržba, chat.",
    permissions: ROLE_DEFAULT_PERMISSIONS.warehouse,
  },
  {
    key: "driver",
    label: "Šofér",
    description: "Rezervácie na čítanie, logistika, chat.",
    permissions: ["reservations.view", "logistics.view", "logistics.edit", "chat.access"],
  },
  {
    key: "none",
    label: "Bez prístupu",
    description: "Žiadne oprávnenia — používateľ nič neuvidí.",
    permissions: [],
  },
];

export interface PermissionOverride {
  permission: Permission;
  granted: boolean;
}

/**
 * Compute effective permission set from role defaults + explicit overrides.
 * Overrides win: granted=false explicitly removes a default; granted=true adds a permission.
 */
export function computeEffectivePermissions(
  roles: AppRole[],
  overrides: PermissionOverride[],
): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) {
    for (const p of ROLE_DEFAULT_PERMISSIONS[r] ?? []) set.add(p);
  }
  for (const o of overrides) {
    if (o.granted) set.add(o.permission);
    else set.delete(o.permission);
  }
  return set;
}

/**
 * Turn a full "target permissions" set into the minimal overrides diff vs. role defaults.
 */
export function diffPermissions(
  roles: AppRole[],
  target: Permission[],
): PermissionOverride[] {
  const defaults = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_DEFAULT_PERMISSIONS[r] ?? []) defaults.add(p);
  const targetSet = new Set(target);
  const overrides: PermissionOverride[] = [];
  for (const p of PERMISSIONS) {
    const inDefault = defaults.has(p);
    const inTarget = targetSet.has(p);
    if (inDefault && !inTarget) overrides.push({ permission: p, granted: false });
    else if (!inDefault && inTarget) overrides.push({ permission: p, granted: true });
  }
  return overrides;
}

/** Map of URL prefix -> required permission. Used by sidebar and route guard. */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/warehouse", permission: "warehouse.view" },
  { prefix: "/reservations", permission: "reservations.view" },
  { prefix: "/inquiries", permission: "reservations.view" },
  { prefix: "/quotes", permission: "quotes.view" },
  { prefix: "/clients", permission: "clients.view" },
  { prefix: "/logistics", permission: "logistics.view" },
  { prefix: "/surveys", permission: "logistics.view" },
  { prefix: "/documents/contract", permission: "contracts.view" },
  { prefix: "/documents/protocol", permission: "contracts.view" },
  { prefix: "/maintenance", permission: "maintenance.view" },
  { prefix: "/layouts", permission: "layouts.view" },
  { prefix: "/chat", permission: "chat.access" },
  { prefix: "/settings/company", permission: "settings.manage" },
  { prefix: "/settings/email", permission: "settings.manage" },
  { prefix: "/settings/helpers", permission: "settings.manage" },
  { prefix: "/users", permission: "users.manage" },
];

/**
 * Returns the permission required for a given pathname, or null if the route is
 * always available to any authenticated user (dashboard, /settings/account, /settings/calendar, /attendance).
 */
export function requiredPermissionForPath(pathname: string): Permission | null {
  for (const r of ROUTE_PERMISSIONS) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.permission;
  }
  return null;
}