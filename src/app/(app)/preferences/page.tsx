"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  MALTA_LOCALITIES,
  isAllMaltaLocations,
  isMaltaLocalitySelected,
  selectAllMaltaLocations,
  toggleMaltaLocality,
} from "@/lib/malta-locations";
import type { EmploymentType, ExperienceLevel, WorkType } from "@/lib/types/database";

const WORK_TYPES: { value: WorkType | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function PreferencesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobTitles, setJobTitles] = useState("");
  // Defaults to All Malta until a saved preference (if any) loads.
  const [locations, setLocations] = useState<string[]>(selectAllMaltaLocations());
  const [workTypes, setWorkTypes] = useState<(WorkType | "any")[]>(["any"]);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [industries, setIndustries] = useState("");
  const [keywordsInclude, setKeywordsInclude] = useState("");
  const [keywordsExclude, setKeywordsExclude] = useState("");
  const [visaSponsorship, setVisaSponsorship] = useState(false);
  const [languages, setLanguages] = useState("");
  const [recentlyPosted, setRecentlyPosted] = useState(false);
  const [salaryDisclosed, setSalaryDisclosed] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prefs } = await supabase.from("job_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (prefs) {
        setJobTitles(prefs.job_titles?.join(", ") ?? "");
        // A saved unrestricted preference (explicit "any", or legacy empty
        // array) is shown as All Malta rather than an empty selection.
        setLocations(isAllMaltaLocations(prefs.locations) ? selectAllMaltaLocations() : prefs.locations);
        setWorkTypes(prefs.work_types ?? ["any"]);
        setEmploymentTypes(prefs.employment_types ?? []);
        setExperienceLevels(prefs.experience_levels ?? []);
        setSalaryMin(prefs.salary_min ? String(prefs.salary_min) : "");
        setSalaryMax(prefs.salary_max ? String(prefs.salary_max) : "");
        setCurrency(prefs.salary_currency ?? "EUR");
        setIndustries(prefs.industries?.join(", ") ?? "");
        setKeywordsInclude(prefs.keywords_include?.join(", ") ?? "");
        setKeywordsExclude(prefs.keywords_exclude?.join(", ") ?? "");
        setVisaSponsorship(prefs.visa_sponsorship_required ?? false);
        setLanguages(prefs.languages?.join(", ") ?? "");
        setRecentlyPosted(prefs.recently_posted_only ?? false);
        setSalaryDisclosed(prefs.salary_disclosed_only ?? false);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("job_preferences").upsert(
        {
          user_id: user.id,
          job_titles: jobTitles.split(",").map((v) => v.trim()).filter(Boolean),
          custom_titles: [],
          locations,
          work_types: workTypes.includes("any") ? ["any"] : workTypes,
          employment_types: employmentTypes,
          experience_levels: experienceLevels,
          salary_min: salaryMin ? Number(salaryMin) : null,
          salary_max: salaryMax ? Number(salaryMax) : null,
          salary_currency: currency,
          industries: industries.split(",").map((v) => v.trim()).filter(Boolean),
          keywords_include: keywordsInclude.split(",").map((v) => v.trim()).filter(Boolean),
          keywords_exclude: keywordsExclude.split(",").map((v) => v.trim()).filter(Boolean),
          visa_sponsorship_required: visaSponsorship,
          languages: languages.split(",").map((v) => v.trim()).filter(Boolean),
          recently_posted_only: recentlyPosted,
          salary_disclosed_only: salaryDisclosed,
        },
        { onConflict: "user_id" }
      );
      if (error) toast.error(error.message);
      else toast.success("Preferences saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Preferences</h1>
        <p className="text-sm text-slate-500">Update what kind of roles we should match you with.</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Job titles (comma separated)</label>
          <input
            value={jobTitles}
            onChange={(e) => setJobTitles(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Locations</label>
          <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isAllMaltaLocations(locations)}
              onChange={() => setLocations(selectAllMaltaLocations())}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            All Malta
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MALTA_LOCALITIES.map((locality) => (
                <label key={locality} className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={isMaltaLocalitySelected(locations, locality)}
                    onChange={() => setLocations((prev) => toggleMaltaLocality(prev, locality))}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {locality}
                </label>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            All Malta matches jobs in every locality — while it&apos;s active, every locality below shows as
            selected, but only the All Malta preference is saved. Pick any individual locality to switch off All
            Malta and match just that locality; you can then select as many specific localities as you like.
            Re-selecting All Malta clears them and matches everywhere again.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Work type</label>
          <div className="flex flex-wrap gap-2">
            {WORK_TYPES.map((wt) => (
              <Chip key={wt.value} active={workTypes.includes(wt.value)} onClick={() => setWorkTypes((prev) => toggle(prev, wt.value))}>
                {wt.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Employment type</label>
          <div className="flex flex-wrap gap-2">
            {EMPLOYMENT_TYPES.map((et) => (
              <Chip key={et.value} active={employmentTypes.includes(et.value)} onClick={() => setEmploymentTypes((prev) => toggle(prev, et.value))}>
                {et.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Experience level</label>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE_LEVELS.map((el) => (
              <Chip key={el.value} active={experienceLevels.includes(el.value)} onClick={() => setExperienceLevels((prev) => toggle(prev, el.value))}>
                {el.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Min salary</label>
            <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Max salary</label>
            <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Industries (comma separated)</label>
          <input value={industries} onChange={(e) => setIndustries(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Include keywords</label>
            <input value={keywordsInclude} onChange={(e) => setKeywordsInclude(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Exclude keywords</label>
            <input value={keywordsExclude} onChange={(e) => setKeywordsExclude(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Languages (comma separated)</label>
          <input value={languages} onChange={(e) => setLanguages(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>

        <div className="space-y-2">
          <ToggleRow label="Require visa sponsorship" checked={visaSponsorship} onChange={setVisaSponsorship} />
          <ToggleRow label="Recently posted only" checked={recentlyPosted} onChange={setRecentlyPosted} />
          <ToggleRow label="Salary disclosed only" checked={salaryDisclosed} onChange={setSalaryDisclosed} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:border-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
    </label>
  );
}
