import type { Job } from "@/lib/types/database";
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
    // Playwright itself ships with the app; automation is "configured" as
    // soon as a job supplies a real application_url to open. Whether a
    // given site's form can actually be completed is decided at run time —
    // see the manualRequired outcomes in submitLive.
    return true;
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    if (!job.application_url) {
      return { success: false, manualRequired: true, errorMessage: "Job has no application URL to automate." };
    }

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
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
