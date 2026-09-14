-- ============================================================================
-- Adds a "goals" onboarding step (between review_cv and preferences) plus the
-- handful of new fields the redesigned question-by-question onboarding
-- collects: a few human job-search questions on profiles, and a remote-work
-- geographic scope on job_preferences (asked only when the user says they
-- want remote work). Purely additive — existing rows and values are
-- untouched, and every new column is nullable or has a safe default so no
-- existing profile is broken.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_onboarding_step_check;

alter table public.profiles
  add constraint profiles_onboarding_step_check
  check (onboarding_step in (
    'create_account', 'upload_cv', 'parse_cv', 'review_cv', 'goals',
    'preferences', 'salary', 'auto_apply_mode', 'consent', 'complete'
  ));

alter table public.profiles
  add column if not exists work_situation text
    check (work_situation in ('employed', 'self_employed', 'unemployed', 'student'));

alter table public.profiles
  add column if not exists move_timeline text
    check (move_timeline in ('asap', 'within_1_3_months', 'within_3_6_months', 'exploring'));

alter table public.profiles
  add column if not exists career_goals text[] not null default '{}';

alter table public.job_preferences
  add column if not exists remote_scope text
    check (remote_scope in ('malta_only', 'eu_eea', 'europe', 'worldwide'));
