import type { AutoApplyMode } from "@/lib/types/database";

export type SwipeRightAction = "auto_submit" | "confirm_then_submit" | "add_to_review_queue";

const HYBRID_AUTO_THRESHOLD = 90;
const HYBRID_CONFIRM_THRESHOLD = 70;

/**
 * Decides what a right-swipe does under the user's chosen Auto Apply mode
 * (spec §30):
 *   - auto: always submit immediately
 *   - hybrid: 90%+ auto-submits, 70-89% asks for confirmation, below 70% no automatic application
 *   - review: every swipe goes to a review queue for the user to confirm
 */
export function decideSwipeRightAction(mode: AutoApplyMode, matchScore: number): SwipeRightAction {
  if (mode === "review") return "add_to_review_queue";
  if (mode === "auto") return "auto_submit";
  if (matchScore >= HYBRID_AUTO_THRESHOLD) return "auto_submit";
  if (matchScore >= HYBRID_CONFIRM_THRESHOLD) return "confirm_then_submit";
  return "add_to_review_queue";
}
