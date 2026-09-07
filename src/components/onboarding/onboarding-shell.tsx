import Link from "next/link";

/**
 * Shared outer chrome for every onboarding screen: brand mark plus a narrow
 * centered column. Deliberately has no card border and no progress bar of
 * its own — each page renders its own <OnboardingProgress> so it can show
 * live progress through that page's own questions, and content sits
 * directly on the page instead of inside a big bordered card.
 */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="mx-auto w-full max-w-md px-5 pb-4 pt-6 lg:max-w-3xl lg:px-8 lg:pt-8">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 text-sm font-bold tracking-tight text-slate-900 lg:text-base"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-xs text-white lg:h-7 lg:w-7">S</span>
          Sqwer
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-12 lg:max-w-3xl lg:justify-center lg:px-8 lg:pb-16">
        {children}
      </div>
    </main>
  );
}
