import crypto from "crypto";
import type { NormalizedJob } from "@/lib/job-sources/types";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic hash used as a first-pass duplicate key: same employer,
 * same normalized title, same locality. Cheap to index and compare before
 * falling back to text similarity for near-duplicates that differ slightly
 * in wording (spec §12).
 */
export function computeDedupeHash(job: Pick<NormalizedJob, "companyName" | "title" | "locality" | "location">): string {
  const key = [
    normalizeText(job.companyName),
    normalizeText(job.title),
    normalizeText(job.locality ?? job.location ?? ""),
  ].join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Token-set Jaccard similarity, 0..1 — cheap stand-in for embedding similarity. */
export function textSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  company_name: string;
  locality: string | null;
  location: string | null;
  description: string;
  application_url: string | null;
  source: string;
  source_job_id: string;
}

/**
 * Decide whether an incoming normalized job is the same underlying vacancy
 * as an already-ingested job. Matches on (in order of confidence):
 *   1. Identical application URL (same external ID posted under a new source)
 *   2. Identical dedupe hash (company + title + locality)
 *   3. High description similarity for the same company + locality
 */
export function findDuplicate(
  incoming: NormalizedJob,
  incomingSource: string,
  candidates: DuplicateCandidate[]
): DuplicateCandidate | null {
  if (incoming.applicationUrl) {
    const urlMatch = candidates.find(
      (c) => c.application_url && c.application_url === incoming.applicationUrl && c.source !== incomingSource
    );
    if (urlMatch) return urlMatch;
  }

  const incomingHash = computeDedupeHash(incoming);
  const hashMatch = candidates.find((c) => computeDedupeHash({
    companyName: c.company_name,
    title: c.title,
    locality: c.locality ?? undefined,
    location: c.location ?? undefined,
  }) === incomingHash);
  if (hashMatch) return hashMatch;

  const sameEmployerLocality = candidates.filter(
    (c) =>
      normalizeText(c.company_name) === normalizeText(incoming.companyName) &&
      normalizeText(c.locality ?? c.location ?? "") === normalizeText(incoming.locality ?? incoming.location ?? "")
  );
  for (const candidate of sameEmployerLocality) {
    const titleSim = textSimilarity(candidate.title, incoming.title);
    const descSim = textSimilarity(candidate.description, incoming.description);
    if (titleSim > 0.6 && descSim > 0.4) return candidate;
  }

  return null;
}
