"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function EmployerRegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleRegister() {
    if (!name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          name,
          website: website || null,
          industry: industry || null,
          location: location || null,
          description: description || null,
          verified: false,
        })
        .select()
        .single();
      if (companyError || !company) {
        toast.error(companyError?.message ?? "Could not create company");
        return;
      }

      const { error: accountError } = await supabase
        .from("employer_accounts")
        .insert({ user_id: user.id, company_id: company.id, role: "owner", verified: false });
      if (accountError) {
        toast.error(accountError.message);
        return;
      }

      toast.success("Company registered — pending verification.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-100 bg-white p-8 shadow-card">
      <h1 className="text-xl font-bold text-slate-900">Register your company</h1>
      <p className="mt-1 text-sm text-slate-600">
        Post jobs directly and receive applications through Sqwer. Your company will show as unverified until an
        admin reviews it.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Company name" value={name} onChange={setName} required />
        <Field label="Website" value={website} onChange={setWebsite} />
        <Field label="Industry" value={industry} onChange={setIndustry} />
        <Field label="Location" value={location} onChange={setLocation} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
          />
        </div>
      </div>

      <Button onClick={handleRegister} disabled={saving} className="mt-6 w-full">
        {saving ? "Registering..." : "Register company"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
      />
    </div>
  );
}
