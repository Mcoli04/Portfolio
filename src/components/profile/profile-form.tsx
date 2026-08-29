"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types/database";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
          phone: phone || null,
          location: location || null,
          headline: headline || null,
          skills: skills.split(",").map((v) => v.trim()).filter(Boolean),
        })
        .eq("id", profile.id);
      if (error) toast.error(error.message);
      else toast.success("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Personal details</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Headline</label>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Skills (comma separated)</label>
        <textarea value={skills} onChange={(e) => setSkills(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
      </div>
      <Button onClick={handleSave} disabled={saving} className="mt-4">
        {saving ? "Saving..." : "Save changes"}
      </Button>
    </section>
  );
}
