import type { ApplicationStatus } from "@/lib/types/database";

/**
 * Truth source for whether a prepared application document was actually
 * delivered to the employer, vs merely generated. The applications table
 * has no separate "generated" vs "submitted" flag for
 * submitted_resume_id/cover_letter_id — both are set the moment a document
 * is generated, regardless of whether the submission that follows
 * succeeds — but `status` is only ever set to "submitted" by
 * ApplicationAutomationEngine.run() after a real provider confirmed
 * success (src/lib/applications/engine.ts). So `status === "submitted"` is
 * already the accurate, existing signal; this just names that check in one
 * place instead of repeating the string comparison at each call site.
 */
export function isDocumentConfirmedSubmitted(applicationStatus: ApplicationStatus): boolean {
  return applicationStatus === "submitted";
}

/** Label for the "Tailored CV ..." / "Cover letter ..." badges on the Applications page — never claims "submitted" without confirmed delivery. */
export function documentStatusLabel(kind: "resume" | "cover_letter", applicationStatus: ApplicationStatus): string {
  const confirmed = isDocumentConfirmedSubmitted(applicationStatus);
  if (kind === "resume") return confirmed ? "Tailored CV submitted" : "Tailored CV prepared";
  return confirmed ? "Cover letter submitted" : "Cover letter prepared";
}
