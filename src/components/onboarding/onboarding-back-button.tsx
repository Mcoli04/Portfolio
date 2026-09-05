"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * The single "Back" control shown top-left on every onboarding screen
 * except the very first (CV upload). Pass `onClick` for a same-page step
 * back (e.g. Goals question 2 -> 1, handled entirely in local state); pass
 * `href` for a cross-page back computed by getPreviousPageHref. Omit both
 * (or pass neither) on the first stage — callers should just not render it.
 */
export function OnboardingBackButton({ onClick, href }: { onClick?: () => void; href?: string }) {
  const router = useRouter();

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    if (href) router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="-ml-1.5 inline-flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:text-base"
    >
      <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" />
      Back
    </button>
  );
}
