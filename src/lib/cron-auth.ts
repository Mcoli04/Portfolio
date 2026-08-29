import type { NextRequest } from "next/server";
import { env, isCronSecretConfigured } from "@/lib/config";

/** Verifies the `Authorization: Bearer <CRON_SECRET>` header on /api/cron/* routes. */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  if (!isCronSecretConfigured) return false;
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  return token === env.cronSecret;
}
