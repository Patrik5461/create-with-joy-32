const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export async function requireAdminOrManager(context: any): Promise<string[]> {
  const { supabase, userId } = context;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const roles = ((data ?? []) as Array<{ role: string }>).map((row) => row.role);
  if (!roles.some((role) => role === "admin" || role === "manager")) {
    throw new Error("Forbidden");
  }
  return roles;
}