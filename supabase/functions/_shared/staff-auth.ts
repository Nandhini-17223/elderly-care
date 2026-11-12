import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";

export type StaffProfile = {
  user_id: string;
  full_name: string;
  role: "super_admin" | "manager" | "helper";
  helper_id: string | null;
  is_active: boolean;
};

export type StaffContext = {
  user: User;
  profile: StaffProfile;
  accessToken: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function authError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: corsHeaders,
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireStaff(
  req: Request,
  serviceClient: SupabaseClient,
  options?: { superAdminOnly?: boolean },
): Promise<StaffContext | { error: Response }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { error: authError("Server misconfigured", 500) };
  }

  const token = bearerToken(req);
  if (!token || token === anonKey) {
    return { error: authError("Unauthorized", 401) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return { error: authError("Unauthorized", 401) };
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("user_id, full_name, role, helper_id, is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return { error: authError("Unauthorized", 401) };
  }

  if (profile.role !== "super_admin" && profile.role !== "manager") {
    return { error: authError("Forbidden", 403) };
  }

  if (options?.superAdminOnly && profile.role !== "super_admin") {
    return { error: authError("Forbidden", 403) };
  }

  return {
    user: userData.user,
    profile: profile as StaffProfile,
    accessToken: token,
  };
}

export async function writeAudit(
  serviceClient: SupabaseClient,
  staff: StaffContext,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient.rpc("write_audit_log", {
    p_actor_user_id: staff.user.id,
    p_actor_role: staff.profile.role,
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId ?? null,
    p_details: details ?? {},
  });
  if (error) {
    console.error("write_audit_log failed", error);
  }
}

export async function loadAppSettings(
  serviceClient: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await serviceClient.from("app_settings").select("key, value");
  if (error) {
    console.error("loadAppSettings", error);
    return {};
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key] = String(row.value);
  }
  return map;
}

export function settingInt(
  settings: Record<string, string>,
  key: string,
  fallback: number,
): number {
  const raw = settings[key];
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
