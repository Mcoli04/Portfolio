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
  cronSecret: process.env.CRON_SECRET,
};

export const isSupabaseConfigured = present(env.supabaseUrl) && present(env.supabasePublishableKey);
export const isServiceRoleConfigured = present(env.supabaseServiceRoleKey);
export const isOpenAIConfigured = present(env.openaiApiKey);
export const isResendConfigured = present(env.resendApiKey);
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
};

export type IntegrationStatus = "LIVE" | "DEMO" | "NOT_CONFIGURED" | "DISABLED";
