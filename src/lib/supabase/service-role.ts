import { createClient as createSupabaseJsClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * supabase-js always constructs an internal Realtime client, and that
 * construction eagerly resolves a WebSocket implementation — throwing
 * ("Node.js detected but native WebSocket not found") under plain Node 20,
 * which is what this project's standalone `tsx` workers run on — unless one
 * is supplied via the `realtime.transport` option. This service-role client
 * is only ever used for privileged REST/Postgrest operations (cron
 * ingestion, background workers, admin actions); it never opens a Realtime
 * channel. Rather than add a `ws` dependency this client doesn't need, this
 * stub satisfies the `transport` option's type so realtime-js skips its
 * WebSocket detection — it's referenced but never actually constructed
 * unless something calls .channel()/.connect() on this client, which
 * nothing here does.
 */
class UnsupportedRealtimeTransport {
  constructor() {
    throw new Error("Realtime is not supported on the service-role Supabase client.");
  }
}

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
    realtime: { transport: UnsupportedRealtimeTransport as unknown as WebSocketLikeConstructor },
  });
}
