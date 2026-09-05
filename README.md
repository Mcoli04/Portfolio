# Sqwer — Malta AI Job Auto-Apply Platform

An AI-powered job discovery and automatic-application platform focused on Malta. Upload a CV, set preferences, and swipe through matched roles — swiping right triggers the automatic application pipeline wherever a real, authorised submission channel exists.

This is an original product concept and implementation, not affiliated with or copied from any existing job-application platform.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Storage, Realtime) · Framer Motion · React Hook Form + Zod · Playwright · OpenAI (optional) · Resend (optional)

## Getting started

1. Copy `.env.example` to `.env.local` and fill in your own Supabase project's keys. Never commit real keys.
2. Create a Supabase project and run the SQL migrations in `supabase/migrations/` in order (via the Supabase SQL editor or `supabase db push`).
3. `npm install`
4. `npm run dev`

Without `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the app cannot authenticate or read/write any data — Supabase is required infrastructure, not an optional integration.

### Optional integrations

Every one of these is genuinely optional. Missing it does not crash the app — the relevant feature runs in a clearly labelled fallback mode instead of faking success:

| Env var | Powers | Without it |
|---|---|---|
| `OPENAI_API_KEY` | CV parsing, match explanations, CV tailoring, cover letters | Deterministic keyword-based CV parsing; templated match explanations and cover letters — still truthful, just less polished |
| `RESEND_API_KEY` | Sending authorised email applications | Email applications report `NOT_CONFIGURED` and fall back to manual |
| `SUPABASE_SERVICE_ROLE_KEY` | Job ingestion cron, background workers, admin account deletion | Cron/worker endpoints return a clear "not configured" error; the core swipe-to-apply loop still works fully on the signed-in user's own RLS-scoped session |
| `CRON_SECRET` | Authorizes `/api/cron/*` | Cron endpoints refuse all requests |
| `GREENHOUSE_BOARD_TOKENS`, `LEVER_SITE_IDS`, `WORKABLE_ACCOUNT_SUBDOMAINS`, `SMARTRECRUITERS_COMPANY_IDS`, `ASHBY_JOB_BOARD_NAMES` | Reading each ATS's public job board for Malta postings | That adapter contributes zero jobs (`NOT_CONFIGURED`) |
| `JOBSPLUS_API_KEY`, `EURES_API_KEY` | Government/EU job feeds | `NOT_CONFIGURED` — these require a formal data-sharing agreement that doesn't exist yet |

With none of the above set (besides Supabase), the platform runs entirely on the bundled **demo Malta jobs dataset** (`src/lib/demo/jobs.ts`), clearly labelled `DEMO` everywhere in the UI and admin dashboard, so nothing is ever presented as a real employer application when it isn't.

## Architecture

- **Job sources** (`src/lib/job-sources/`): a `JobSourceAdapter` interface with one implementation per source (Jobsplus, EURES, employer feeds, a licensed API, Greenhouse/Lever/Workable/SmartRecruiters/Ashby, direct employer integrations, and the demo dataset). Each adapter self-reports `LIVE`/`DEMO`/`NOT_CONFIGURED` — nothing is hardcoded to always succeed.
- **Deduplication** (`src/lib/dedupe.ts`): merges the same vacancy posted across multiple sources by company+title+locality hash, application URL, and description similarity.
- **AI matching** (`src/lib/ai/matching.ts`): a deterministic 0–100 scoring function (skills, title, location, work type, salary, keywords) plus a natural-language "why this matches you" explanation.
- **Application automation** (`src/lib/applications/`): an `ApplicationProvider` interface (Greenhouse/Lever/Workable/SmartRecruiters/Ashby/direct employer/internal-demo/email/browser-automation), selected by `ApplicationAutomationEngine` following API → ATS → browser automation → authorised email → manual, in that order. A provider that isn't genuinely configured is skipped rather than used.
- **Browser automation** (`src/lib/applications/providers/browser-automation-provider.ts`): Playwright opens the employer's own application page and fills recognisable fields, but refuses outright the moment it detects a CAPTCHA, login wall, or MFA prompt, and always leaves final submission for manual confirmation until a specific employer's confirmation flow has been reviewed and verified.
- **Ingestion** (`src/lib/jobs/ingest.ts`, `src/app/api/cron/*`, `src/workers/job-ingest-worker.ts`): the same ingestion function is reachable both via a cron-secret-protected API route (for platform schedulers) and a standalone long-running worker script, so either deployment shape works.
- **Database** (`supabase/migrations/`): full schema with Row Level Security on every user/employer-owned table — see `0001_init.sql`, storage bucket policies in `0002_storage.sql`, and employer-portal policies in `0003_employer_portal.sql`.

## Scripts

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint`, `npm run typecheck`
- `npm run worker:ingest` — standalone job ingestion worker (alternative to cron)
- `npm run worker:apply` — crash-recovery worker that resubmits applications stuck mid-flight
