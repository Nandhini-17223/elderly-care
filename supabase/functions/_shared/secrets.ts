import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Prefer Deno env secrets; fall back to vault via get_app_secret RPC
 * so local/test deploys work before dashboard secrets are set.
 */
export async function resolveSecret(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  const fromEnv = Deno.env.get(name)?.trim() || "";
  if (fromEnv) return fromEnv;

  const { data, error } = await supabase.rpc("get_app_secret", {
    p_name: name,
  });
  if (error) {
    console.error(`get_app_secret(${name}) failed`, error);
    return null;
  }
  const value = typeof data === "string" ? data.trim() : "";
  return value || null;
}

/** Constant-time string compare (length-leaking only on mismatch length). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let mismatch = aa.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return mismatch === 0;
}
