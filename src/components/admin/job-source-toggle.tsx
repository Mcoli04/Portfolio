"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function JobSourceToggle({ sourceKey, enabled }: { sourceKey: string; enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/job-sources/${sourceKey}/toggle`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not update source");
        return;
      }
      toast.success(`${sourceKey} ${data.enabled ? "enabled" : "disabled"}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        enabled ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-brand-600 text-white hover:bg-brand-700"
      }`}
    >
      {enabled ? "Disable" : "Enable"}
    </button>
  );
}
