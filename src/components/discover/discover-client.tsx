"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Undo2, Heart, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SwipeCard } from "./swipe-card";
import { ApplyProgressOverlay } from "./apply-progress";
import { ApplyResultOverlay, type ApplyResultKind } from "./apply-result";
import { DetailsSheet } from "./details-sheet";
import type { AutoApplyMode, JobWithMatch, Profile } from "@/lib/types/database";

interface UndoState {
  job: JobWithMatch;
  action: "rejected";
}

export function DiscoverClient({ initialJobs, profile }: { initialJobs: JobWithMatch[]; profile: Profile }) {
  const [queue, setQueue] = useState<JobWithMatch[]>(initialJobs);
  const [detailsJob, setDetailsJob] = useState<JobWithMatch | null>(null);
  const [overlay, setOverlay] = useState<{ kind: "progress" | ApplyResultKind; job: JobWithMatch; message?: string } | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [lastUndo, setLastUndo] = useState<UndoState | null>(null);
  const seenIds = useRef(new Set(initialJobs.map((j) => j.id)));
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const topJob = queue[0] ?? null;

  const refillQueue = useCallback(async () => {
    const res = await fetch(`/api/discover/feed?excludeIds=${Array.from(seenIds.current).join(",")}`);
    if (!res.ok) return;
    const data = await res.json();
    const newJobs: JobWithMatch[] = data.jobs ?? [];
    newJobs.forEach((j) => seenIds.current.add(j.id));
    if (newJobs.length) setQueue((prev) => [...prev, ...newJobs]);
  }, []);

  useEffect(() => {
    if (queue.length <= 3) refillQueue();
  }, [queue.length, refillQueue]);

  // Realtime: drop jobs from the queue the moment they're deactivated/expired elsewhere.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("jobs-discover-feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        (payload) => {
          const updated = payload.new as { id: string; active: boolean };
          if (!updated.active) {
            setQueue((prev) => prev.filter((j) => j.id !== updated.id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function advanceQueue() {
    setQueue((prev) => prev.slice(1));
    setOverlay(null);
    setProgressStep(0);
  }

  async function handleSwipeLeft(job: JobWithMatch) {
    const supabase = createClient();
    await supabase.from("job_interactions").upsert(
      { user_id: profile.id, job_id: job.id, action: "rejected", match_score: job.match_score },
      { onConflict: "user_id,job_id" }
    );
    setLastUndo({ job, action: "rejected" });
    setQueue((prev) => prev.slice(1));
  }

  async function handleUndo() {
    if (!lastUndo) return;
    const supabase = createClient();
    await supabase.from("job_interactions").delete().eq("user_id", profile.id).eq("job_id", lastUndo.job.id);
    setQueue((prev) => [lastUndo.job, ...prev]);
    setLastUndo(null);
  }

  function startProgressAnimation() {
    setProgressStep(1);
    let step = 1;
    progressTimer.current = setInterval(() => {
      step += 1;
      if (step <= 5) setProgressStep(step);
      if (step >= 5 && progressTimer.current) {
        clearInterval(progressTimer.current);
      }
    }, 500);
  }

  function stopProgressAnimation() {
    if (progressTimer.current) clearInterval(progressTimer.current);
  }

  async function submitApplication(job: JobWithMatch, force = false) {
    setOverlay({ kind: "progress", job });
    startProgressAnimation();

    try {
      const res = await fetch("/api/applications/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, matchScore: job.match_score, force }),
      });
      const data = await res.json();
      stopProgressAnimation();

      if (res.status === 409) {
        toast.info("You've already applied to this job.");
        advanceQueue();
        return;
      }

      if (data.status === "confirmation_required") {
        setOverlay({ kind: "confirm", job });
        return;
      }

      if (data.status === "queued") {
        toast.success("Added to your review queue.");
        advanceQueue();
        return;
      }

      if (data.status === "submitted") {
        setOverlay({ kind: "submitted", job });
        setTimeout(advanceQueue, 1800);
        return;
      }

      if (data.status === "manual_required") {
        setOverlay({ kind: "manual_required", job, message: data.outcome?.reason });
        return;
      }

      setOverlay({ kind: "failed", job, message: data.outcome?.reason ?? data.error });
    } catch (err) {
      stopProgressAnimation();
      setOverlay({ kind: "failed", job, message: err instanceof Error ? err.message : "Network error" });
    }
  }

  async function handleSwipeRight(job: JobWithMatch) {
    await submitApplication(job, false);
  }

  async function markManualApplied(job: JobWithMatch) {
    const supabase = createClient();
    await supabase
      .from("applications")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), manual_required: false })
      .eq("user_id", profile.id)
      .eq("job_id", job.id);
    toast.success("Marked as applied.");
    advanceQueue();
  }

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (!topJob || overlay) return;
      if (e.key === "ArrowLeft") handleSwipeLeft(topJob);
      if (e.key === "ArrowRight") handleSwipeRight(topJob);
      if (e.key === "ArrowUp") setDetailsJob(topJob);
      if (e.key.toLowerCase() === "z") handleUndo();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topJob, overlay]);

  if (!topJob && !overlay) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold text-slate-900">You&apos;re all caught up</p>
        <p className="mt-1 text-sm text-slate-500">Check back soon — new Malta roles are added regularly.</p>
      </div>
    );
  }

  const displayJob = overlay?.job ?? topJob!;

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <div className="relative h-[560px] w-full max-w-sm">
        <AnimatePresence>
          {queue.slice(0, 2).reverse().map((job, i, arr) => (
            <SwipeCard
              key={job.id}
              job={job}
              isTop={i === arr.length - 1 && !overlay}
              onSwipeLeft={() => handleSwipeLeft(job)}
              onSwipeRight={() => handleSwipeRight(job)}
              onSwipeUp={() => setDetailsJob(job)}
            />
          ))}
        </AnimatePresence>

        {overlay?.kind === "progress" && <ApplyProgressOverlay stepsShown={progressStep} />}
        {overlay && overlay.kind !== "progress" && (
          <ApplyResultOverlay
            kind={overlay.kind}
            job={displayJob}
            message={overlay.message}
            onRetry={() => submitApplication(displayJob, true)}
            onManual={() => markManualApplied(displayJob)}
            onPass={() => {
              handleSwipeLeft(displayJob);
              setOverlay(null);
            }}
            onConfirm={() => submitApplication(displayJob, true)}
            onCancel={() => {
              setOverlay(null);
            }}
            onDismiss={() => advanceQueue()}
          />
        )}
      </div>

      {!overlay && (
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={() => topJob && handleSwipeLeft(topJob)}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-red-500 shadow-card transition hover:scale-105"
            aria-label="No"
          >
            <X className="h-6 w-6" />
          </button>
          <button
            onClick={handleUndo}
            disabled={!lastUndo}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-card transition hover:scale-105 disabled:opacity-40"
            aria-label="Undo"
          >
            <Undo2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => topJob && setDetailsJob(topJob)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-card transition hover:scale-105"
            aria-label="Details"
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            onClick={() => topJob && handleSwipeRight(topJob)}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-emerald-500 shadow-card transition hover:scale-105"
            aria-label="Yes / Apply"
          >
            <Heart className="h-6 w-6" />
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">
        Auto Apply mode: <span className="font-medium text-slate-600">{modeLabel(profile.auto_apply_mode)}</span>
      </p>

      <DetailsSheet job={detailsJob} onClose={() => setDetailsJob(null)} />
    </div>
  );
}

function modeLabel(mode: AutoApplyMode): string {
  if (mode === "auto") return "Auto";
  if (mode === "hybrid") return "Hybrid";
  return "Review";
}
