-- ============================================================================
-- Employer portal support (spec §38): direct job postings, RLS so an
-- employer can manage their own company/jobs and see applications received
-- for them, without gaining access to any other employer's or candidate's
-- data.
-- ============================================================================

insert into public.job_sources (key, name, kind, status, enabled) values
  ('employer_portal', 'Employer portal (direct postings)', 'internal', 'LIVE', true)
on conflict (key) do nothing;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.employer_accounts
    where user_id = auth.uid() and company_id = target_company_id
  );
$$ language sql stable security definer set search_path = public;

-- companies: any authenticated user may register a new company (verification
-- happens later, by an admin); updates are restricted to admin or a member
-- of that company.
create policy companies_authenticated_insert on public.companies for insert
  with check (auth.uid() is not null);

create policy companies_member_update on public.companies for update
  using (public.is_admin() or public.is_company_member(id));

-- jobs: an employer-portal member may create/update/deactivate postings for
-- their own company. All other sources remain admin/service-role only.
create policy jobs_employer_write on public.jobs for insert
  with check (source = 'employer_portal' and company_id is not null and public.is_company_member(company_id));

create policy jobs_employer_update on public.jobs for update
  using (source = 'employer_portal' and company_id is not null and public.is_company_member(company_id));

-- applications: an employer may view (and update the status/notes of)
-- applications submitted to their own company's jobs — never another
-- company's, and never a candidate's documents beyond what's tied to their job.
create policy applications_employer_select on public.applications for select
  using (company_id is not null and public.is_company_member(company_id));

create policy applications_employer_update on public.applications for update
  using (company_id is not null and public.is_company_member(company_id));

create policy submitted_documents_employer_select on public.submitted_documents for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = submitted_documents.application_id
        and a.company_id is not null
        and public.is_company_member(a.company_id)
    )
  );

-- profiles: an employer may view the basic profile of a candidate who
-- applied to one of their own jobs — never any other user's profile.
create policy profiles_employer_view_applicants on public.profiles for select
  using (
    exists (
      select 1 from public.applications a
      where a.user_id = profiles.id
        and a.company_id is not null
        and public.is_company_member(a.company_id)
    )
  );
