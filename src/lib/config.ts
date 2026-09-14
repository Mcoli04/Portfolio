/**
 * Central place that decides whether an integration is really configured.
 * Nothing here fabricates credentials — every flag is a plain presence check
 * against environment variables. Missing env vars fall back to demo/manual
 * behaviour instead of throwing, per the platform's "never fake it" rule.
 */

function present(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  cronSecret: process.env.CRON_SECRET,
};

export const isSupabaseConfigured = present(env.supabaseUrl) && present(env.supabasePublishableKey);
export const isServiceRoleConfigured = present(env.supabaseServiceRoleKey);
export const isOpenAIConfigured = present(env.openaiApiKey);
export const isResendConfigured =
  present(env.resendApiKey) && present(env.resendFromEmail);
export const isCronSecretConfigured = present(env.cronSecret);

function csv(value: string | undefined): string[] {
  return present(value) ? value!.split(",").map((v) => v.trim()).filter(Boolean) : [];
}

export const integrationConfig = {
  jobsplus: present(process.env.JOBSPLUS_API_KEY),
  eures: present(process.env.EURES_API_KEY),
  greenhouseBoardTokens: csv(process.env.GREENHOUSE_BOARD_TOKENS),
  leverSiteIds: csv(process.env.LEVER_SITE_IDS),
  workableAccountSubdomains: csv(process.env.WORKABLE_ACCOUNT_SUBDOMAINS),
  smartrecruitersCompanyIds: csv(process.env.SMARTRECRUITERS_COMPANY_IDS),
  ashbyJobBoardNames: csv(process.env.ASHBY_JOB_BOARD_NAMES),
  /**
   * Domains explicitly reviewed and approved for permitted browser
   * automation (spec §18) — e.g. "boards.greenhouse.io" once someone has
   * actually verified that employer's application flow works safely with
   * the automation provider. Empty by default: with nothing allowlisted,
   * a job with no other configured submission channel resolves straight
   * to manual_required (via its real application_url) without ever
   * attempting to launch a browser.
   */
  browserAutomationAllowedDomains: csv(process.env.BROWSER_AUTOMATION_ALLOWED_DOMAINS).map((d) => d.toLowerCase()),
  /**
   * Greenhouse board tokens explicitly authorized for REAL Job Board Apply
   * API submission — distinct from GREENHOUSE_BOARD_TOKENS (read-only
   * ingestion, no authorization implied). Not a secret itself (a board
   * token is a public URL slug), but necessary and NOT sufficient on its
   * own: a token here with no matching GREENHOUSE_JOB_BOARD_API_KEY_<TOKEN>
   * (see getGreenhouseJobBoardApiKey below) still resolves to
   * manual_required. Empty by default — no employer is authorized until
   * this is deliberately set after that specific employer issues their own
   * credential.
   */
  greenhouseAuthorizedBoardTokens: csv(process.env.GREENHOUSE_AUTHORIZED_BOARD_TOKENS),
};

export type IntegrationStatus = "LIVE" | "DEMO" | "NOT_CONFIGURED" | "DISABLED";

function sanitizeGreenhouseBoardTokenForEnvVarName(boardToken: string): string {
  return boardToken.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * Reads the dedicated submission credential for ONE Greenhouse board —
 * never a shared/master key. Env var name pattern:
 * GREENHOUSE_JOB_BOARD_API_KEY_<BOARD_TOKEN_UPPERCASED_SANITIZED>, e.g.
 * board token "acmecorp" -> GREENHOUSE_JOB_BOARD_API_KEY_ACMECORP. Returns
 * undefined (never a fallback to any other var) when that exact board's
 * key isn't set, even if other boards' keys are.
 */
export function getGreenhouseJobBoardApiKey(boardToken: string): string | undefined {
  const value = process.env[`GREENHOUSE_JOB_BOARD_API_KEY_${sanitizeGreenhouseBoardTokenForEnvVarName(boardToken)}`];
  return present(value) ? value : undefined;
}
