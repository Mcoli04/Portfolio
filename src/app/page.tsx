import Link from "next/link";
import {
  Sparkles,
  UploadCloud,
  SlidersHorizontal,
  Heart,
  FileText,
  ListChecks,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const HOW_IT_WORKS = [
  {
    icon: UploadCloud,
    title: "Upload your CV",
    description: "Drop in your CV once. Our AI reads your skills, experience and history — you review and correct anything before it's used.",
  },
  {
    icon: SlidersHorizontal,
    title: "Set your preferences",
    description: "Tell us the roles, localities, salary range and work style you want across Malta and Gozo.",
  },
  {
    icon: Heart,
    title: "Swipe right to apply",
    description: "Browse matched roles one at a time. Swipe right and we handle the repetitive parts of applying.",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI job matching",
    description: "Every role is scored against your CV and preferences, with a plain-English explanation of why it fits.",
  },
  {
    icon: Heart,
    title: "Automatic applications",
    description: "Supported roles are submitted through real integrations — APIs, ATS platforms, or authorised email — never faked.",
  },
  {
    icon: FileText,
    title: "CV tailoring",
    description: "Your CV is reordered and re-emphasized for each role using only what's true in your original CV — nothing invented.",
  },
  {
    icon: ListChecks,
    title: "Application tracking",
    description: "See exactly what was submitted, when, and with which documents — from first interest to offer.",
  },
  {
    icon: MapPin,
    title: "Malta job coverage",
    description: "Built to pull from Jobsplus, EURES, employer feeds and major ATS platforms as each integration is authorised.",
  },
  {
    icon: SlidersHorizontal,
    title: "You're always in control",
    description: "Choose Auto, Hybrid or Review mode — nothing is ever submitted without your explicit authorization.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">S</span>
          Sqwer
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Log In
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-20 pt-16 text-center animate-fade-in">
        <span className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
          <Sparkles className="h-3.5 w-3.5" /> Built for Malta&apos;s job market
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Your CV. Malta&apos;s jobs.
          <br />
          <span className="text-brand-600">One swipe.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          Upload your CV, tell us what you&apos;re looking for, and discover jobs matched to your experience. Swipe right and let AI handle the repetitive application work.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup">
            <Button size="lg" className="w-full sm:w-auto">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Log In
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">No credit card required · Your CV is never public</p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-brand-600">How it works</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="animate-slide-up rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                {i + 1}. {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-brand-400">Everything you need</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Stop filling out the same form twice.</h2>
        <p className="mt-4 text-slate-600">
          Create your account, upload your CV once, and start swiping through Malta&apos;s job market today.
        </p>
        <Link href="/signup" className="mt-8 inline-block">
          <Button size="lg">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Sqwer. An independent product concept — not affiliated with any other job platform.
      </footer>
    </main>
  );
}
