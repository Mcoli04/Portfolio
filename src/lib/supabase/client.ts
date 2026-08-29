"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Browser-side Supabase client. Only ever uses the public URL + anon key —
 * the service role key must never reach client code.
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserClient(env.supabaseUrl!, env.supabaseAnonKey!);
}
