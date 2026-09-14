import type { ChannelSelectionOptions } from "@/lib/applications/channel-selection";
import { selectChannel } from "@/lib/applications/channel-selection";
import type { ApplicationMethod } from "@/lib/types/database";

export interface AutoApplySupportedInput {
  applicationMethod: ApplicationMethod;
  applicationProvider?: string | null;
  applicationEmail?: string | null;
  applicationUrl?: string | null;
}

/**
 * Whether a job genuinely has a live, authorised, automatic submission
 * channel — computed via the exact same selectChannel() decision tree
 * engine.ts's selectProvider() uses at actual application time, so this
 * can never claim "supported" for a channel the engine wouldn't really use
 * (an adapter guessing autoApplySupported: true for a not-yet-authorised
 * ATS/employer-integration/email provider), and can never claim
 * "supported" for a job that would actually resolve to browser automation
 * — Playwright pre-fills fields but deliberately never performs final
 * submission (browser-automation-provider.ts), so kind==="browser_automation"
 * is treated the same as kind==="none" here even when a live provider
 * (e.g. email) exists further down the decision order.
 *
 * isDemoSource is always false here: resolveAutoApplySupported() below
 * never calls this for a demo-source job.
 *
 * This value is a snapshot as of the job's most recent ingestion, not a
 * live guarantee — if a provider's configuration changes after a job was
 * ingested, this field only catches up on that job's next ingestion cycle
 * (every adapter re-fetches and re-upserts its full current listing on
 * every run, so staleness is bounded by the ingestion interval, not
 * indefinite). This can never cause a false submission either way: engine.ts
 * always re-derives the real channel fresh, at the moment of an actual
 * application, independent of whatever this field currently says.
 */
export function computeAutoApplySupported(job: AutoApplySupportedInput, options: ChannelSelectionOptions = {}): boolean {
  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: job.applicationMethod,
      applicationProvider: job.applicationProvider,
      applicationEmail: job.applicationEmail,
      applicationUrl: job.applicationUrl,
    },
    options
  );
  return selection.kind === "provider";
}

/**
 * Ingestion-time entry point: demo jobs keep whatever autoApplySupported
 * value their own fixture data declares (DemoJobSourceAdapter's dataset
 * intentionally mixes true/false to exercise both UI states in the demo —
 * every demo job actually resolves through the internal sandbox provider
 * regardless of its declared method, per selectChannel()'s isDemoSource
 * branch, so recomputing this from the decision tree would collapse that
 * intentional variety to always-true). Every other source's adapter-claimed
 * value is ignored in favor of the real computation, so an adapter can
 * never persist an inaccurate auto_apply_supported by guessing.
 */
export function resolveAutoApplySupported(
  sourceKey: string,
  normalized: AutoApplySupportedInput & { autoApplySupported: boolean },
  options: ChannelSelectionOptions = {}
): boolean {
  if (sourceKey === "demo") return normalized.autoApplySupported;
  return computeAutoApplySupported(normalized, options);
}
