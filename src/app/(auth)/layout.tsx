import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white px-4 py-10 sm:py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">S</span>
          Sqwer
        </Link>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </main>
  );
}
