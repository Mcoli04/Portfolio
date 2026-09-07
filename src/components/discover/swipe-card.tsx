"use client";

import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { JobCardContent } from "./job-card-content";
import type { JobWithMatch } from "@/lib/types/database";

const SWIPE_THRESHOLD = 120;
const SWIPE_UP_THRESHOLD = 100;

export function SwipeCard({
  job,
  isTop,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
}: {
  job: JobWithMatch;
  isTop: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);
  const detailsOpacity = useTransform(y, [-120, -20], [1, 0]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipeRight();
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipeLeft();
    } else if (info.offset.y < -SWIPE_UP_THRESHOLD) {
      onSwipeUp();
    }
  }

  return (
    <motion.div
      className="swipe-card-shadow absolute inset-0 cursor-grab overflow-hidden rounded-3xl bg-white active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <motion.div style={{ opacity: likeOpacity }} className="pointer-events-none absolute left-6 top-6 z-10 rotate-[-12deg] rounded-lg border-4 border-emerald-500 px-3 py-1 text-xl font-extrabold text-emerald-500">
        YES
      </motion.div>
      <motion.div style={{ opacity: nopeOpacity }} className="pointer-events-none absolute right-6 top-6 z-10 rotate-[12deg] rounded-lg border-4 border-red-500 px-3 py-1 text-xl font-extrabold text-red-500">
        NO
      </motion.div>
      <motion.div style={{ opacity: detailsOpacity }} className="pointer-events-none absolute inset-x-0 top-6 z-10 mx-auto w-fit rounded-lg border-4 border-brand-500 px-3 py-1 text-xl font-extrabold text-brand-500">
        DETAILS
      </motion.div>
      <JobCardContent job={job} />
    </motion.div>
  );
}
