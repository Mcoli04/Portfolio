import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Service-role client for privileged operations: cron ingestion, background
 * workers, admin actions. Intentionally bypasses RLS. Has no dependency on
 * next/headers so it can run in standalone worker scripts (outside a Next.js
 * request) as well as inside API routes. Never import this from client
 * components — the key must never reach the browser bundle.
 */
export function createServiceRoleClient() {
  if (!isSupabaseConfigured || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Service role Supabase client requested but SUPABASE_SERVICE_ROLE_KEY is not configured."
    );
  }
  return createSupabaseJsClient(env.supabaseUrl!, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
