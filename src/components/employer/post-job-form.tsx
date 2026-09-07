"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MALTA_LOCALITIES } from "@/lib/malta-locations";
import type { EmploymentType, ExperienceLevel, WorkType } from "@/lib/types/database";

export function PostJobForm({
  companyId,
  companyName,
  onPosted,
}: {
  companyId: string;
  companyName: string;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [skills, setSkills] = useState("");
  const [locality, setLocality] = useState<string>(MALTA_LOCALITIES[0]);
  const [remoteType, setRemoteType] = useState<WorkType>("onsite");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("full_time");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setPosting(true);
    try {
      const supabase = createClient();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error } = await supabase.from("jobs").insert({
        source: "employer_portal",
        source_job_id: crypto.randomUUID(),
        title,
        company_id: companyId,
        company_name: companyName,
        description,
        requirements: requirements || null,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        location: `${locality}, Malta`,
        locality,
        country: "Malta",
        remote_type: remoteType,
        employment_type: employmentType,
        experience_level: experienceLevel,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        salary_currency: "EUR",
        posted_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        application_method: "internal",
        application_provider: "internal",
        auto_apply_supported: true,
        status: "ACTIVE",
        active: true,
      });

      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Job posted.");
      onPosted();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Post a new job</h2>
      <div className="mt-4 space-y-4">
        <Field label="Job title" value={title} onChange={setTitle} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Requirements</label>
          <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
        <Field label="Skills (comma separated)" value={skills} onChange={setSkills} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Locality</label>
            <select value={locality} onChange={(e) => setLocality(e.target.value)} className="w-full rounded-xl border border-slate-300 px-2 py-2.5 text-sm">
              {MALTA_LOCALITIES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Work type</label>
            <select value={remoteType} onChange={(e) => setRemoteType(e.target.value as WorkType)} className="w-full rounded-xl border border-slate-300 px-2 py-2.5 text-sm">
              <option value="onsite">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Employment</label>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)} className="w-full rounded-xl border border-slate-300 px-2 py-2.5 text-sm">
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="temporary">Temporary</option>
              <option value="internship">Internship</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Experience</label>
            <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)} className="w-full rounded-xl border border-slate-300 px-2 py-2.5 text-sm">
              {(["internship", "entry", "junior", "mid", "senior", "lead", "executive"] as ExperienceLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min salary (EUR)" value={salaryMin} onChange={setSalaryMin} type="number" />
          <Field label="Max salary (EUR)" value={salaryMax} onChange={setSalaryMax} type="number" />
        </div>
      </div>

      <Button onClick={handlePost} disabled={posting} className="mt-6 w-full">
        {posting ? "Posting..." : "Post job"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
    </div>
  );
}
