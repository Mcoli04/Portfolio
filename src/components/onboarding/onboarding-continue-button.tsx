"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The single shared "Continue" action used at the bottom of every onboarding question. */
export function OnboardingContinueButton({
  onClick,
  disabled = false,
  loading = false,
  label = "Continue",
  loadingLabel = "Saving...",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
}) {
  return (
    <Button onClick={onClick} disabled={disabled || loading} size="lg" className="mt-8 w-full rounded-full">
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> {loadingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
