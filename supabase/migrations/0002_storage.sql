-- ============================================================================
-- Private storage buckets: CVs and generated documents are NEVER public.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-documents', 'generated-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

-- Users may only read/write objects inside a folder named after their own
-- user id: resumes/<user_id>/<file>.
create policy resumes_owner_select on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy resumes_owner_insert on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy resumes_owner_delete on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy generated_documents_owner_select on storage.objects for select
  using (bucket_id = 'generated-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy generated_documents_owner_insert on storage.objects for insert
  with check (bucket_id = 'generated-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Company logos are public assets shown on job cards.
create policy company_logos_public_read on storage.objects for select
  using (bucket_id = 'company-logos');
