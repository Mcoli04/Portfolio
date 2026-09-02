import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

export { createServiceRoleClient } from "./service-role";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server Component / Route Handler Supabase client, bound to the request's
 * auth cookies. Respects Row Level Security as the signed-in user.
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component with no writable cookie jar
          // (e.g. during static rendering). Session refresh will be
          // completed by middleware instead.
        }
      },
    },
  });
}
