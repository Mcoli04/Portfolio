import type { ApplicationMethod } from "@/lib/types/database";
import { getApplicationProvider } from "./provider-registry";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import type { ApplicationProvider } from "./types";

export interface ChannelSelectionInput {
  isDemoSource: boolean;
  applicationMethod: ApplicationMethod;
  applicationProvider: string | null | undefined;
  applicationEmail: string | null | undefined;
  applicationUrl: string | null | undefined;
}

export interface ChannelSelectionOptions {
  /** Test-only override — defaults to the real provider registry lookup. */
  getProvider?: (key: string) => ApplicationProvider | null;
  /** Test-only override — defaults to the real, env-derived allowlist. */
  browserAutomationAllowedDomains?: string[];
}

/**
 * "provider": a genuine live submission channel (api/ats/internal/email) —
 * the only kind that should ever be reported as auto-apply-supported.
 * "browser_automation": Playwright pre-fills recognized fields but
 * (browser-automation-provider.ts) deliberately never performs final
 * submission itself — a real channel in the sense that engine.ts will use
 * it, but NOT a genuine automatic submission, so it must never count as
 * auto-apply-supported even when a live provider exists further down the
 * decision order (see the email-after-browser-automation note below).
 * "demo": the internal sandbox, used only for source="demo" jobs.
 * "none": no channel at all — resolves to manual_required.
 */
export type ChannelSelection =
  | { kind: "demo"; provider: ApplicationProvider }
  | { kind: "provider"; provider: ApplicationProvider }
  | { kind: "browser_automation"; provider: ApplicationProvider }
  | { kind: "none" };

/**
 * THE single authoritative implementation of the application-channel
 * decision tree (spec §16): demo -> API/ATS -> permitted internal employer
 * integration -> permitted browser automation -> authorised email -> none.
 * Order matters and is preserved exactly as engine.ts has always run it —
 * in particular, browser automation is checked BEFORE email, so a job that
 * would also qualify for a live email channel still resolves to
 * browser_automation if its application_url's domain is allowlisted.
 * Because browser automation never performs the final submission itself,
 * that precedence means a job can have a technically-live email provider
 * and still not be genuinely auto-apply-capable — this function's kind
 * discriminates exactly that case, rather than callers independently
 * OR-ing "is any channel live" and missing the ordering.
 *
 * engine.ts's selectProvider() and jobs/auto-apply-supported.ts's
 * computeAutoApplySupported() both call this one function, so the "which
 * channel would actually be used" rule is defined exactly once and cannot
 * drift between the two.
 */
export function selectChannel(job: ChannelSelectionInput, options: ChannelSelectionOptions = {}): ChannelSelection {
  const getProvider = options.getProvider ?? getApplicationProvider;

  if (job.isDemoSource) {
    const provider = getProvider("internal");
    return provider ? { kind: "demo", provider } : { kind: "none" };
  }

  if ((job.applicationMethod === "api" || job.applicationMethod === "ats") && job.applicationProvider) {
    const provider = getProvider(job.applicationProvider);
    if (provider && provider.getStatus() === "LIVE") return { kind: "provider", provider };
  }

  if (job.applicationMethod === "internal") {
    const provider = getProvider("employer_integration");
    if (provider && provider.getStatus() === "LIVE") return { kind: "provider", provider };
  }

  if (job.applicationUrl && BrowserAutomationApplicationProvider.isDomainAllowed(job.applicationUrl, options.browserAutomationAllowedDomains)) {
    // Stop here unconditionally once the domain matches — mirrors the
    // original selectProvider()'s unconditional `return
    // getApplicationProvider("browser_automation")`, which never fell
    // through to the email check even in the (production-unreachable)
    // case where that lookup came back empty. Falling through here would
    // let a live email provider silently win in that case, contradicting
    // the whole point of checking browser automation before email.
    const provider = getProvider("browser_automation");
    return provider ? { kind: "browser_automation", provider } : { kind: "none" };
  }

  if (job.applicationMethod === "email" && job.applicationEmail) {
    const provider = getProvider("email");
    if (provider && provider.getStatus() === "LIVE") return { kind: "provider", provider };
  }

  return { kind: "none" };
}
