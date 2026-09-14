import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application } from "@/lib/types/database";

/**
 * Statuses an application may be atomically claimed FROM. "applying" is
 * deliberately excluded here — an actively-processing row must never be
 * claimed a second time. Stale "applying" recovery (a process that died
 * mid-submission) is a SEPARATE, explicit opt-in below, never folded into
 * this base set.
 */
const CLAIMABLE_STATUSES = ["queued", "manual_required", "failed"] as const;

export interface ClaimOptions {
  /**
   * Also claim a currently-"applying" row, but ONLY if it's been stuck
   * past this many milliseconds — crash recovery for a process that died
   * mid-submission. An actively-processing "applying" row (updated
   * recently) never matches this and can never be claimed a second time.
   * Omit entirely for callers that must never recover a stuck row (e.g. a
   * fresh swipe-right should never "steal" someone else's stuck run).
   */
  allowStaleApplyingOlderThanMs?: number;
}

/**
 * Atomically transitions ONE application to "applying" and returns the
 * claimed row — or null if it was already claimed by someone else, or its
 * current status isn't eligible. This is a single conditional UPDATE
 * statement per attempt, never a read-then-update sequence: Postgres's
 * row-level locking on UPDATE guarantees that if two callers race, the
 * second one's WHERE clause is re-evaluated against the first's
 * already-committed change (status now "applying", no longer matching),
 * so it affects zero rows and this returns null — it can never also
 * "succeed" a second time for the same row.
 *
 * Every real call site that can invoke engine.run() — the swipe-apply
 * route, the standalone worker, the admin retry route — MUST call this
 * first and MUST NOT call engine.run() when it returns null. This is the
 * one mechanism preventing the same application from being processed by
 * two concurrent callers (overlapping worker poll ticks, a double-click
 * retry racing the worker, etc.).
 */
export async function claimApplicationForProcessing(
  supabase: SupabaseClient,
  applicationId: string,
  options: ClaimOptions = {}
): Promise<Application | null> {
  const { data: claimed, error: claimError } = await supabase
    .from("applications")
    .update({ status: "applying" })
    .eq("id", applicationId)
    .in("status", [...CLAIMABLE_STATUSES])
    .select()
    .maybeSingle();

  if (claimError) {
    console.error(`[claim] failed to claim application ${applicationId}`, claimError.message);
    return null;
  }
  if (claimed) return claimed as Application;

  if (options.allowStaleApplyingOlderThanMs === undefined) return null;

  const staleCutoffIso = new Date(Date.now() - options.allowStaleApplyingOlderThanMs).toISOString();
  const { data: recovered, error: recoverError } = await supabase
    .from("applications")
    .update({ status: "applying" })
    .eq("id", applicationId)
    .eq("status", "applying")
    .lt("updated_at", staleCutoffIso)
    .select()
    .maybeSingle();

  if (recoverError) {
    console.error(`[claim] failed to recover stale application ${applicationId}`, recoverError.message);
    return null;
  }
  return (recovered as Application) ?? null;
}
