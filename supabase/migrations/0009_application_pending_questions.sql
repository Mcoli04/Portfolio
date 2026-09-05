-- ============================================================================
-- Phase 1 of the manual-answer-and-retry design: stop discarding the
-- structured FormField metadata (id, label, type, declared select options,
-- required flag) the engine already computes when an application becomes
-- manual_required. Today that structure is thrown away — only a
-- concatenated error_message string and a fieldId/questionText/reason
-- summary in application_events.metadata survive, which is not enough to
-- ever render a correct answer input (a select needs its real
-- {label,value} options, not just the question text).
--
-- This migration only adds the persistence table. It does NOT add an
-- answering UI, a retry route, Answer Library promotion, or a new
-- application_events event type — those are later phases.
-- ============================================================================

create table if not exists public.application_pending_questions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  field_id text not null,
  question_text text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'select', 'file', 'boolean')),
  -- FormFieldOption[] ({label, value} pairs) for "select" fields, exactly
  -- as declared by the provider — never invented, never reduced to labels
  -- alone. Null for every other field type.
  options jsonb,
  required boolean not null default true,
  -- Deliberately nullable and untouched by Phase 1: no answering flow
  -- exists yet, so every row is created with these null and stays that
  -- way. When a future phase adds answering, these become the provider-
  -- ready value, its source, and (when reusable) which verified
  -- answer_library entry it came from.
  answer_value text,
  answer_source text check (answer_source is null or answer_source in ('application_only', 'answer_library')),
  source_answer_library_id uuid references public.answer_library(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, field_id)
);

create index if not exists application_pending_questions_application_idx
  on public.application_pending_questions (application_id);

-- Reuse the existing set_updated_at trigger function (defined earlier in
-- 0001_init.sql) so updated_at is maintained automatically, exactly like
-- every other table in that trigger loop.
drop trigger if exists set_updated_at on public.application_pending_questions;
create trigger set_updated_at before update on public.application_pending_questions
  for each row execute function public.set_updated_at();

alter table public.application_pending_questions enable row level security;

-- Owner can read/write/delete rows tied to their own application — unlike
-- application_tasks (a worker queue, where only admin may delete), this
-- table is reconciled by the engine running as the signed-in user during
-- the ordinary swipe-to-apply flow, and deleting a stale/no-longer-
-- blocking row is a normal, benign part of that reconciliation, not a
-- privileged operation. Admin retains full access for the ops dashboard.
create policy application_pending_questions_owner_select on public.application_pending_questions for select using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
create policy application_pending_questions_owner_insert on public.application_pending_questions for insert with check (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);
create policy application_pending_questions_owner_update on public.application_pending_questions for update using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
create policy application_pending_questions_owner_delete on public.application_pending_questions for delete using (
  exists (select 1 from public.applications a where a.id = application_id and (a.user_id = auth.uid() or public.is_admin()))
);
