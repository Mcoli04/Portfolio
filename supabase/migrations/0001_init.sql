-- ============================================================================
-- Malta AI Job Auto-Apply Platform — initial schema
-- ============================================================================
-- Conventions:
--   * All PKs are uuid default gen_random_uuid().
--   * "status"-like columns use CHECK constraints instead of native enums so
--     new values can be added later without a blocking type migration.
--   * RLS is enabled on every table that holds user- or employer-owned data.
--     Service-role requests (used by cron/workers) bypass RLS by design.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- profiles — one row per auth.users row
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  location text,
  headline text,
  years_experience numeric(4,1),
  skills text[] not null default '{}',
  job_titles text[] not null default '{}',
  employers text[] not null default '{}',
  education jsonb not null default '[]',
  certifications jsonb not null default '[]',
  languages text[] not null default '{}',
  industries text[] not null default '{}',
  default_resume_id uuid,
  role text not null default 'user' check (role in ('user', 'employer', 'admin')),
  onboarding_step text not null default 'create_account'
    check (onboarding_step in (
      'create_account', 'upload_cv', 'parse_cv', 'review_cv',
      'preferences', 'auto_apply_mode', 'consent', 'complete'
    )),
  onboarding_completed boolean not null default false,
  auto_apply_mode text not null default 'review' check (auto_apply_mode in ('auto', 'hybrid', 'review')),
  auto_apply_authorized boolean not null default false,
  auto_apply_authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- resumes / resume_versions — CV slots with multiple uploaded versions
-- ----------------------------------------------------------------------------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'General CV',
  is_default boolean not null default false,
  latest_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number int not null default 1,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  parsed_data jsonb,
  parse_error text,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_resume_fk
  foreign key (default_resume_id) references public.resumes(id) on delete set null;

-- ----------------------------------------------------------------------------
-- job_preferences — one row per user
-- ----------------------------------------------------------------------------
create table if not exists public.job_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  job_titles text[] not null default '{}',
  custom_titles text[] not null default '{}',
  locations text[] not null default '{}',
  work_types text[] not null default '{any}',
  employment_types text[] not null default '{}',
  experience_levels text[] not null default '{}',
  salary_min integer,
  salary_max integer,
  salary_currency text not null default 'EUR',
  industries text[] not null default '{}',
  keywords_include text[] not null default '{}',
  keywords_exclude text[] not null default '{}',
  visa_sponsorship_required boolean not null default false,
  languages text[] not null default '{}',
  recently_posted_only boolean not null default false,
  salary_disclosed_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- answer_library — verified answers reused across applications
-- ----------------------------------------------------------------------------
create table if not exists public.answer_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer_text text not null,
  answer_type text not null default 'text' check (answer_type in ('text', 'boolean', 'number', 'select')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_key)
);

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  website text,
  industry text,
  description text,
  location text,
  verified boolean not null default false,
  application_methods jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- job_sources — registry of ingestion adapters (JobsPlus, Greenhouse, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  kind text not null check (kind in (
    'government', 'eu_network', 'employer_feed', 'licensed_api', 'ats', 'email', 'internal'
  )),
  status text not null default 'NOT_CONFIGURED' check (status in ('LIVE', 'DEMO', 'NOT_CONFIGURED', 'DISABLED')),
  enabled boolean not null default true,
  config jsonb not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.job_sources(id) on delete set null,
  source text not null,
  source_job_id text not null,
  title text not null,
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  company_logo text,
  description text not null default '',
  responsibilities text,
  requirements text,
  skills text[] not null default '{}',
  salary_min integer,
  salary_max integer,
  salary_currency text default 'EUR',
  location text,
  locality text,
  country text not null default 'Malta',
  remote_type text check (remote_type in ('remote', 'hybrid', 'onsite')),
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship')),
  experience_level text check (experience_level in ('internship', 'entry', 'junior', 'mid', 'senior', 'lead', 'executive')),
  industry text,
  posted_at timestamptz not null default now(),
  expires_at timestamptz,
  application_url text,
  application_email text,
  application_method text not null default 'manual' check (application_method in (
    'api', 'ats', 'browser_automation', 'email', 'internal', 'manual'
  )),
  application_provider text,
  auto_apply_supported boolean not null default false,
  dedupe_hash text,
  canonical_job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'NEW' check (status in ('NEW', 'ACTIVE', 'UPDATED', 'EXPIRED', 'CLOSED', 'ARCHIVED')),
  active boolean not null default true,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_job_id)
);

create index if not exists jobs_active_idx on public.jobs (active);
create index if not exists jobs_expires_at_idx on public.jobs (expires_at);
create index if not exists jobs_location_idx on public.jobs (location);
create index if not exists jobs_locality_idx on public.jobs (locality);
create index if not exists jobs_posted_at_idx on public.jobs (posted_at desc);
create index if not exists jobs_dedupe_hash_idx on public.jobs (dedupe_hash);
create index if not exists jobs_title_trgm_idx on public.jobs using gin (title gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- job_interactions — swipe state (rejected / saved / viewed / dismissed)
-- ----------------------------------------------------------------------------
create table if not exists public.job_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  action text not null check (action in ('viewed', 'saved', 'rejected', 'dismissed', 'undone')),
  match_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists job_interactions_user_job_idx on public.job_interactions (user_id, job_id);

-- ----------------------------------------------------------------------------
-- applications
-- ----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  resume_id uuid references public.resumes(id) on delete set null,
  submitted_resume_id uuid,
  cover_letter_id uuid,
  match_score integer,
  application_method text not null default 'manual' check (application_method in (
    'api', 'ats', 'browser_automation', 'email', 'internal', 'manual'
  )),
  application_provider text,
  status text not null default 'interested' check (status in (
    'interested', 'queued', 'applying', 'submitted', 'failed',
    'manual_required', 'interview', 'offer', 'rejected', 'withdrawn'
  )),
  manual_required boolean not null default false,
  external_application_id text,
  submitted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists applications_user_job_idx on public.applications (user_id, job_id);
create index if not exists applications_status_idx on public.applications (status);

-- ----------------------------------------------------------------------------
-- submitted_documents — exact CV / cover letter text submitted for a job
-- ----------------------------------------------------------------------------
create table if not exists public.submitted_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in ('resume', 'cover_letter')),
  file_path text,
  content_text text,
  tailored boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.applications
  add constraint applications_submitted_resume_fk
  foreign key (submitted_resume_id) references public.submitted_documents(id) on delete set null;
alter table public.applications
  add constraint applications_cover_letter_fk
  foreign key (cover_letter_id) references public.submitted_documents(id) on delete set null;

-- ----------------------------------------------------------------------------
-- application_tasks — queue of work items processed by the automation engine
-- ----------------------------------------------------------------------------
create table if not exists public.application_tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  task_type text not null check (task_type in (
    'select_resume', 'tailor_resume', 'generate_cover_letter',
    'answer_questions', 'submit', 'verify'
  )),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  payload jsonb not null default '{}',
  attempts integer not null default 0,
  last_error text,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_tasks_status_idx on public.application_tasks (status, run_at);

-- ----------------------------------------------------------------------------
-- application_events — audit trail of the application lifecycle
-- ----------------------------------------------------------------------------
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  event_type text not null check (event_type in (
    'APPLICATION_CREATED', 'APPLICATION_QUEUED', 'CV_SELECTED', 'CV_TAILORED',
    'COVER_LETTER_CREATED', 'QUESTIONS_COMPLETED', 'APPLICATION_STARTED',
    'CV_UPLOADED', 'APPLICATION_SUBMITTED', 'APPLICATION_CONFIRMED',
    'APPLICATION_FAILED', 'MANUAL_ACTION_REQUIRED'
  )),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists application_events_application_idx on public.application_events (application_id, created_at);

-- ----------------------------------------------------------------------------
-- application_providers — registry of submission integrations
-- ----------------------------------------------------------------------------
create table if not exists public.application_providers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  kind text not null check (kind in ('ats', 'api', 'email', 'internal', 'browser_automation')),
  status text not null default 'NOT_CONFIGURED' check (status in ('LIVE', 'DEMO', 'NOT_CONFIGURED', 'DISABLED')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'application_submitted', 'application_failed', 'manual_action_required',
    'new_high_match_job', 'application_status_changed', 'interview', 'offer', 'job_expiring'
  )),
  title text not null,
  body text not null,
  read boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ----------------------------------------------------------------------------
-- employer_accounts
-- ----------------------------------------------------------------------------
create table if not exists public.employer_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  role text not null default 'member' check (role in ('owner', 'member')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'admin')),
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'resumes', 'job_preferences', 'answer_library', 'companies',
    'job_sources', 'jobs', 'job_interactions', 'applications',
    'application_tasks', 'application_providers', 'employer_accounts'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.resume_versions enable row level security;
alter table public.job_preferences enable row level security;
alter table public.answer_library enable row level security;
alter table public.companies enable row level security;
alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.job_interactions enable row level security;
alter table public.applications enable row level security;
alter table public.submitted_documents enable row level security;
alter table public.application_tasks enable row level security;
alter table public.application_events enable row level security;
alter table public.application_providers enable row level security;
alter table public.notifications enable row level security;
alter table public.employer_accounts enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

-- profiles: user reads/updates own row; admin reads all
create policy profiles_select_own on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);

-- resumes / resume_versions: owner only
create policy resumes_owner on public.resumes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy resume_versions_owner on public.resume_versions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- job_preferences: owner only
create policy job_preferences_owner on public.job_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- answer_library: owner only
create policy answer_library_owner on public.answer_library for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- companies: public read, admin/employer-owner write
create policy companies_select_all on public.companies for select using (true);
create policy companies_admin_write on public.companies for insert with check (public.is_admin());
create policy companies_admin_update on public.companies for update using (public.is_admin());

-- job_sources / application_providers: admin only
create policy job_sources_admin on public.job_sources for all using (public.is_admin()) with check (public.is_admin());
create policy application_providers_admin on public.application_providers for all using (public.is_admin()) with check (public.is_admin());

-- jobs: public read for active jobs, everyone authenticated can read all (needed for
-- users to see jobs they previously applied to even after they close); admin write
create policy jobs_select_all on public.jobs for select using (true);
create policy jobs_admin_write on public.jobs for insert with check (public.is_admin());
create policy jobs_admin_update on public.jobs for update using (public.is_admin());
create policy jobs_admin_delete on public.jobs for delete using (public.is_admin());

-- job_interactions: owner only
create policy job_interactions_owner on public.job_interactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- applications: owner + admin read
create policy applications_owner on public.applications for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

-- submitted_documents: owner only
create policy submitted_documents_owner on public.submitted_documents for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

-- application_tasks / application_events: the owning user can read+write rows
-- tied to their own application (the automation engine runs as the signed-in
-- user, not a privileged role, for the core swipe-to-apply loop); admin has
-- full access for the ops dashboard / retry tooling.
create policy application_tasks_owner_select on public.application_tasks for select using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
create policy application_tasks_owner_write on public.application_tasks for insert with check (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);
create policy application_tasks_owner_update on public.application_tasks for update using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
create policy application_tasks_admin_delete on public.application_tasks for delete using (public.is_admin());

create policy application_events_owner_select on public.application_events for select using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
create policy application_events_owner_insert on public.application_events for insert with check (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);

-- notifications: owner only
create policy notifications_owner on public.notifications for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

-- employer_accounts: owner + admin
create policy employer_accounts_owner on public.employer_accounts for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id);

-- audit_logs: admin read only, system (service role) inserts bypass RLS
create policy audit_logs_admin_read on public.audit_logs for select using (public.is_admin());

-- ============================================================================
-- Auto-create profile row on signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Seed job_sources / application_providers registry rows (status NOT_CONFIGURED
-- until real credentials are supplied via admin settings / env vars)
-- ============================================================================
insert into public.job_sources (key, name, kind, status, enabled) values
  ('jobsplus', 'Jobsplus (Malta public employment service)', 'government', 'NOT_CONFIGURED', true),
  ('eures', 'EURES (EU job mobility network)', 'eu_network', 'NOT_CONFIGURED', true),
  ('employer_feed', 'Employer-provided feeds', 'employer_feed', 'NOT_CONFIGURED', true),
  ('licensed_api', 'Licensed job board API', 'licensed_api', 'NOT_CONFIGURED', true),
  ('greenhouse', 'Greenhouse', 'ats', 'NOT_CONFIGURED', true),
  ('lever', 'Lever', 'ats', 'NOT_CONFIGURED', true),
  ('workable', 'Workable', 'ats', 'NOT_CONFIGURED', true),
  ('smartrecruiters', 'SmartRecruiters', 'ats', 'NOT_CONFIGURED', true),
  ('ashby', 'Ashby', 'ats', 'NOT_CONFIGURED', true),
  ('custom_employer', 'Direct employer integrations', 'employer_feed', 'NOT_CONFIGURED', true),
  ('demo', 'Demo Malta jobs (sample data)', 'internal', 'DEMO', true)
on conflict (key) do nothing;

insert into public.application_providers (key, name, kind, status) values
  ('greenhouse', 'Greenhouse', 'ats', 'NOT_CONFIGURED'),
  ('lever', 'Lever', 'ats', 'NOT_CONFIGURED'),
  ('workable', 'Workable', 'ats', 'NOT_CONFIGURED'),
  ('smartrecruiters', 'SmartRecruiters', 'ats', 'NOT_CONFIGURED'),
  ('ashby', 'Ashby', 'ats', 'NOT_CONFIGURED'),
  ('browser_automation', 'Permitted browser automation (Playwright)', 'browser_automation', 'NOT_CONFIGURED'),
  ('email', 'Authorised email application', 'email', 'NOT_CONFIGURED'),
  ('internal', 'Internal employer applications', 'internal', 'DEMO')
on conflict (key) do nothing;
