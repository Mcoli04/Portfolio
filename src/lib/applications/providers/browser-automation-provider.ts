import type { Job } from "@/lib/types/database";
import { integrationConfig } from "@/lib/config";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

const BLOCKING_SELECTORS = [
  "iframe[src*='captcha']",
  "iframe[src*='recaptcha']",
  "iframe[src*='hcaptcha']",
  "[class*='captcha']",
  "input[type='password']",
  "[data-testid*='mfa']",
  "[class*='two-factor']",
];

const FIELD_HINTS: { pattern: RegExp; key: keyof CandidateApplicationData | "answers" }[] = [
  { pattern: /first\s*name|full\s*name|your\s*name/i, key: "fullName" },
  { pattern: /e-?mail/i, key: "email" },
  { pattern: /phone|mobile/i, key: "phone" },
  { pattern: /cover\s*letter|why.*(role|position|interested)/i, key: "coverLetterText" },
];

/**
 * Generic Playwright-based application-form filler (spec §18). Opens the
 * employer's own official application page, tries to identify and fill
 * standard fields, uploads the résumé, and submits — but ONLY when no
 * CAPTCHA, login wall, or MFA prompt is present. Detecting any of those
 * aborts immediately with manualRequired=true rather than attempting to
 * defeat them. This is intentionally conservative: a page it doesn't
 * confidently understand also falls back to manual rather than guessing.
 */
export class BrowserAutomationApplicationProvider extends BaseApplicationProvider {
  readonly key = "browser_automation";
  readonly name = "Permitted browser automation";

  protected isConfigured(): boolean {
    // Coarse status for the admin dashboard: whether ANY employer/domain
    // has been explicitly reviewed and allowlisted at all. Whether THIS
    // job's specific domain is allowed is decided per-job by
    // isDomainAllowed(), called from selectProvider() in engine.ts BEFORE
    // this provider is ever selected — so a job whose domain hasn't been
    // reviewed never reaches submitLive() (and therefore never needs a
    // real Chromium install) in the first place.
    return integrationConfig.browserAutomationAllowedDomains.length > 0;
  }

  /**
   * Whether `applicationUrl`'s hostname has been explicitly reviewed and
   * allowlisted for automated form-filling (requirement: browser
   * automation only runs for an employer/domain someone has actually
   * vetted, never automatically for every job that happens to have a URL).
   * `allowedDomains` defaults to the real configured list and is only ever
   * overridden in tests, so callers never need to pass it.
   */
  static isDomainAllowed(
    applicationUrl: string,
    allowedDomains: string[] = integrationConfig.browserAutomationAllowedDomains
  ): boolean {
    try {
      const hostname = new URL(applicationUrl).hostname.toLowerCase();
      return allowedDomains.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
    } catch {
      return false;
    }
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    if (!job.application_url) {
      return { success: false, manualRequired: true, errorMessage: "Job has no application URL to automate." };
    }

    const { chromium } = await import("playwright");
    let browser: Awaited<ReturnType<typeof chromium.launch>>;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      // A missing/unavailable browser executable is an infrastructure gap,
      // not a per-job failure — this job still has a perfectly valid
      // manual fallback (its real application_url), so this must resolve
      // to manual_required, never a generic "failed". Anything that goes
      // wrong AFTER a real browser launches (below) is a genuine
      // unexpected processing error and correctly stays "failed" via the
      // catch-all in BaseApplicationProvider.submitApplication.
      console.error("[browser-automation] chromium launch failed", error instanceof Error ? error.message : error);
      return {
        success: false,
        manualRequired: true,
        errorMessage: "Automated browser submission isn't available in this environment right now — apply directly using the link above.",
      };
    }

    try {
      const page = await browser.newPage();
      await page.goto(job.application_url, { waitUntil: "domcontentloaded", timeout: 30000 });

      for (const selector of BLOCKING_SELECTORS) {
        if (await page.locator(selector).count() > 0) {
          return {
            success: false,
            manualRequired: true,
            errorMessage: "Application form requires human verification (CAPTCHA/login/MFA) — automation stopped.",
          };
        }
      }

      const textInputs = page.locator("input[type='text'], input[type='email'], input[type='tel'], input:not([type])");
      const inputCount = await textInputs.count();
      let filledAny = false;

      for (let i = 0; i < inputCount; i++) {
        const input = textInputs.nth(i);
        const label = await this.resolveLabel(input);
        const match = FIELD_HINTS.find((h) => h.pattern.test(label));
        if (!match) continue;
        const value =
          match.key === "fullName"
            ? candidate.fullName
            : match.key === "email"
            ? candidate.email
            : match.key === "phone"
            ? candidate.phone ?? ""
            : "";
        if (value) {
          await input.fill(value);
          filledAny = true;
        }
      }

      const fileInput = page.locator("input[type='file']").first();
      if ((await fileInput.count()) > 0 && candidate.resumeFileBuffer) {
        await fileInput.setInputFiles({
          name: candidate.resumeFileName ?? "cv.pdf",
          mimeType: "application/pdf",
          buffer: candidate.resumeFileBuffer,
        });
        filledAny = true;
      }

      if (!filledAny) {
        return {
          success: false,
          manualRequired: true,
          errorMessage: "Could not confidently identify standard application fields on this page.",
        };
      }

      // Submission of the live form (clicking the final submit control and
      // confirming a success page) is intentionally not auto-triggered
      // beyond this point without a per-employer review of that employer's
      // exact confirmation flow, so a reference number can be verified
      // rather than assumed. Flag for manual completion of the final step.
      return {
        success: false,
        manualRequired: true,
        errorMessage: "Form fields were pre-filled but final submission requires a verified per-employer flow.",
        confirmationDetails: { prefilled: true },
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Browser automation failed.",
      };
    } finally {
      await browser.close();
    }
  }

  private async resolveLabel(input: import("playwright").Locator): Promise<string> {
    const [placeholder, ariaLabel, name] = await Promise.all([
      input.getAttribute("placeholder").catch(() => null),
      input.getAttribute("aria-label").catch(() => null),
      input.getAttribute("name").catch(() => null),
    ]);
    return [placeholder, ariaLabel, name].filter(Boolean).join(" ");
  }
}
