-- ============================================================================
-- Salary range constraints (job_preferences). These enforce the same rules
-- as src/lib/validation/preferences.ts at the database level, so a negative
-- or inverted salary range can never be persisted even if a client bypasses
-- the browser input restrictions or the app's own Zod validation.
-- ============================================================================

alter table public.job_preferences
  add constraint job_preferences_salary_min_non_negative check (salary_min is null or salary_min >= 0);

alter table public.job_preferences
  add constraint job_preferences_salary_max_non_negative check (salary_max is null or salary_max >= 0);

alter table public.job_preferences
  add constraint job_preferences_salary_max_gte_min check (
    salary_min is null or salary_max is null or salary_max >= salary_min
  );
