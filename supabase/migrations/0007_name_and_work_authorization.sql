-- ============================================================================
-- First/last name fields + explicit work authorization (spec: candidate-data
-- prerequisites for a future official Greenhouse Job Board Apply API
-- integration). Purely additive — safe to run once against an existing
-- database:
--   - first_name/last_name/work_authorization are new nullable columns with
--     no default, so every existing profile keeps working unchanged
--     (all three simply start out NULL, meaning "not yet provided").
--   - full_name is untouched and stays the source of truth wherever it's
--     already read; nothing here drops, renames, or narrows any existing
--     column.
--   - onboarding_step's allowed values are untouched — first/last name are
--     collected inside the existing "review_cv" step's UI and work
--     authorization inside the existing "goals" step's UI, so no profile's
--     in-progress onboarding_step is invalidated or reset by this migration.
-- ============================================================================

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;

alter table public.profiles add column if not exists work_authorization text;

alter table public.profiles drop constraint if exists profiles_work_authorization_check;
alter table public.profiles
  add constraint profiles_work_authorization_check
  check (work_authorization is null or work_authorization in (
    'eu_eea_swiss_citizen', 'malta_permit_holder', 'requires_sponsorship', 'prefer_not_to_say'
  ));
