-- ============================================================================
-- Enforce at most one default resume per user, and repair any existing
-- duplicate-default rows first so the new constraint can be added safely.
--
-- Bug: nothing stopped more than one public.resumes row per user from
-- having is_default = true (e.g. /api/cv/upload inserted a new default
-- without ever clearing a user's existing one), so the Profile page's
-- "Your CVs" list could render the Default badge on more than one CV.
--
-- Repair (UPDATE-only — no resume, resume_version, or storage file is ever
-- deleted or touched): for every user who currently has more than one
-- is_default = true resume, pick exactly one winner to remain the default:
--   1. the duplicate resume that profiles.default_resume_id already points
--      at, if any — application submission and the background worker both
--      key off profiles.default_resume_id, not resumes.is_default, so this
--      preserves whatever is actually driving behavior today;
--   2. otherwise, the most recently updated of the duplicate resumes.
-- Every other duplicate resume for that user is set to is_default = false.
-- profiles.default_resume_id is then (re)synced to the winner so both
-- signals agree for every affected user. Users who already have zero or
-- one default resume are left untouched entirely.
-- ============================================================================

create temporary table _resume_default_winners on commit drop as
with duplicate_users as (
  select user_id
  from public.resumes
  where is_default = true
  group by user_id
  having count(*) > 1
),
ranked as (
  select
    r.id,
    r.user_id,
    row_number() over (
      partition by r.user_id
      order by (r.id = p.default_resume_id) desc, r.updated_at desc, r.id
    ) as rn
  from public.resumes r
  join public.profiles p on p.id = r.user_id
  where r.is_default = true
    and r.user_id in (select user_id from duplicate_users)
)
select id, user_id, rn from ranked;

-- Clear is_default on every duplicate resume except the chosen winner.
update public.resumes
set is_default = false
where id in (select id from _resume_default_winners where rn > 1);

-- Keep profiles.default_resume_id consistent with the chosen winner.
update public.profiles p
set default_resume_id = w.id
from _resume_default_winners w
where w.rn = 1
  and p.id = w.user_id
  and p.default_resume_id is distinct from w.id;

-- Enforce the invariant going forward: at most one default resume per user.
create unique index if not exists resumes_one_default_per_user
  on public.resumes (user_id)
  where is_default = true;
