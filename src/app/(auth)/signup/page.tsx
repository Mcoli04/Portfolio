"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Briefcase, Mail, MapPin, Heart, ChevronLeft, Loader2 } from "lucide-react";
import { emailSchema, firstNameSchema, passwordSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";

type Step = "welcome" | "name" | "email" | "password" | "verify";

const STEP_ORDER: Step[] = ["name", "email", "password"];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);

  function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const result = firstNameSchema.safeParse(firstName);
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Enter your first name");
      return;
    }
    setFieldError(null);
    setFirstName(result.data);
    setStep("email");
  }

  function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setFieldError(null);
    setStep("password");
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Enter a valid password");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: firstName } },
      });
      if (signUpError) {
        toast.error(signUpError.message);
        return;
      }
      if (data.session && data.user) {
        // Belt-and-suspenders: the profile row's full_name is normally
        // backfilled from user_metadata on first onboarding load, but set
        // it immediately too when we already have a session. first_name is
        // exactly what this field collects, so it's set directly here too
        // — the onboarding review step still lets the user correct it, and
        // still needs to collect last_name.
        await supabase.from("profiles").update({ full_name: firstName, first_name: firstName }).eq("id", data.user.id);
        toast.success(`Welcome, ${firstName} — let's set up your profile.`);
        router.push("/onboarding");
        router.refresh();
      } else {
        setStep("verify");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
      if (resendError) toast.error(resendError.message);
      else toast.success("Confirmation email sent again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (step === "welcome") {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">
          Find your next job in Malta.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-slate-600">
          Tell us what you&apos;re looking for and we&apos;ll help you discover jobs that fit you.
        </p>

        <Button onClick={() => setStep("name")} size="lg" className="mt-8 w-full rounded-full">
          Get started <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="mt-4 text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-3">
          <TrustPoint icon={MapPin} label="Jobs across Malta" />
          <TrustPoint icon={Briefcase} label="Matched to your CV" />
          <TrustPoint icon={Heart} label="You choose where to apply" />
        </div>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          We sent a confirmation link to <span className="font-medium text-slate-900">{email}</span>. Click it to
          finish setting up your account.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button onClick={handleResend} variant="outline" className="w-full rounded-full">
            Resend email
          </Button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            Change email
          </button>
        </div>

        <Link href="/login" className="mt-8 inline-block text-sm text-slate-500 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(step === "name" ? "welcome" : step === "email" ? "name" : "email")}
          aria-label="Go back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>
      <div className="mb-6">
        <OnboardingProgress phaseIndex={stepIndex} progress={1} phases={["Name", "Email", "Password"]} />
      </div>

      {step === "name" && (
        <form onSubmit={handleNameSubmit}>
          <h1 className="text-center text-2xl font-bold text-slate-900">First, what should we call you?</h1>
          <div className="mt-6">
            <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-slate-700">
              First name
            </label>
            <input
              id="firstName"
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Maria"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {fieldError && <p className="mt-1.5 text-xs text-red-600">{fieldError}</p>}
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full rounded-full">
            Continue
          </Button>
        </form>
      )}

      {step === "email" && (
        <form onSubmit={handleEmailSubmit}>
          <h1 className="text-center text-2xl font-bold text-slate-900">Where should we send job updates?</h1>
          <div className="mt-6">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {fieldError && <p className="mt-1.5 text-xs text-red-600">{fieldError}</p>}
            <p className="mt-2 text-xs text-slate-500">We&apos;ll also use this to keep your account secure.</p>
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full rounded-full">
            Continue
          </Button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePasswordSubmit}>
          <h1 className="text-center text-2xl font-bold text-slate-900">Create your password</h1>
          <div className="mt-6">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <PasswordField
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
              showRequirements
              error={fieldError ?? undefined}
            />
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full rounded-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating your account...
              </>
            ) : (
              "Create my account"
            )}
          </Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
            By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </form>
      )}
    </div>
  );
}

function TrustPoint({ icon: Icon, label }: { icon: typeof MapPin; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );
}
