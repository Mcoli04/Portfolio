-- ============================================================================
-- Adds a dedicated "salary" onboarding step between "preferences" and
-- "auto_apply_mode", so the redesigned onboarding wizard can present salary
-- expectations as its own screen (spec: Step 4 — Salary) instead of bundling
-- it into the job-preferences step. Purely additive: existing rows/values
-- remain valid, nothing is renamed or removed.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_onboarding_step_check;

alter table public.profiles
  add constraint profiles_onboarding_step_check
  check (onboarding_step in (
    'create_account', 'upload_cv', 'parse_cv', 'review_cv',
    'preferences', 'salary', 'auto_apply_mode', 'consent', 'complete'
  ));
