import type { Application } from "@/lib/types/database";

/** Friendly names for a real, specific submission channel — proper nouns (vendor names) stay as-is; internal/technical keys get a plain-English label. */
const PROVIDER_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  ashby: "Ashby",
  internal: "Sqwer",
  employer_integration: "Employer",
  email: "Email",
  browser_automation: "Automated",
};

/** Fallback when there's no application_provider — a plain-English name for the method category itself. */
const METHOD_LABELS: Record<string, string> = {
  api: "Company website",
  ats: "Company website",
  browser_automation: "Automated",
  email: "Email",
  internal: "Direct",
  manual: "Manual",
};

/**
 * User-facing "how this application is being handled" label — never a raw
 * enum/provider key (no underscores, no internal identifiers like
 * "browser_automation" or "employer_integration").
 *
 * Whenever status is manual_required, this always returns "Manual",
 * regardless of application_provider: manual_required means no automatic
 * channel actually succeeded, so showing a specific provider name next to
 * that badge would claim an automated attempt that didn't (or couldn't)
 * happen. This also makes the label correct even for a row carrying a
 * stale application_provider left over from an earlier attempt (e.g. one
 * made before browser automation was gated behind an explicit domain
 * allowlist) — the label is derived from the authoritative `status`
 * first, not from that possibly-stale field.
 */
export function applicationChannelLabel(
  app: Pick<Application, "status" | "application_method" | "application_provider">
): string {
  if (app.status === "manual_required") {
    return "Manual";
  }
  if (app.application_provider && PROVIDER_LABELS[app.application_provider]) {
    return PROVIDER_LABELS[app.application_provider];
  }
  return METHOD_LABELS[app.application_method] ?? "Manual";
}
