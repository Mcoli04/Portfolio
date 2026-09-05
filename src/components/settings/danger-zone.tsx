"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function DangerZone() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not delete account.");
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Your account and all data have been deleted.");
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-100 bg-red-50/40 p-6">
      <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
      <p className="mt-1 text-xs text-red-600/80">
        Permanently delete your account, CVs, and application history. This cannot be undone.
      </p>
      {!confirming ? (
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirming(true)}>
          Delete my account
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Yes, permanently delete"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
