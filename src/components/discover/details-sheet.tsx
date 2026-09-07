"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Euro } from "lucide-react";
import type { JobWithMatch } from "@/lib/types/database";

export function DetailsSheet({ job, onClose }: { job: JobWithMatch | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {job && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{job.title}</h2>
                <p className="text-sm font-medium text-slate-600">{job.company_name}</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {job.locality ?? job.location ?? "Malta"}
              </span>
              {job.salary_min && job.salary_max && (
                <span className="flex items-center gap-1">
                  <Euro className="h-3.5 w-3.5" />
                  {job.salary_min.toLocaleString()} – {job.salary_max.toLocaleString()} {job.salary_currency}
                </span>
              )}
            </div>

            {job.match_reasons?.length > 0 && (
              <div className="mt-4 rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold text-brand-700">Why this matches you</p>
                <ul className="mt-1 list-inside list-disc text-xs text-brand-900/80">
                  {job.match_reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <section className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Description</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{job.description}</p>
            </section>

            {job.requirements && (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">Requirements</h3>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{job.requirements}</p>
              </section>
            )}

            {job.skills?.length > 0 && (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">Skills</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
