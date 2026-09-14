-- ============================================================================
-- Atomic answer-save + requeue for manual_required applications.
--
-- Before this migration, POST /api/applications/[id]/answers persisted each
-- answered question with its own UPDATE, then updated the application's
-- status, then inserted an application_events row — three-plus independent,
-- non-transactional Supabase calls. A failure partway through could leave
-- an application with some answers saved but still manual_required, with no
-- way to tell from the data alone how far the previous attempt got.
--
-- This function performs the answer writes and the status transition inside
-- one Postgres transaction (the implicit transaction of a single function
-- call): either everything commits, or nothing does.
--
-- security invoker (the default — deliberately NOT security definer): this
-- function runs with the CALLING user's own privileges, so every statement
-- inside it is still governed by the same RLS policies that would apply to
-- a direct client call — applications_owner (0001_init.sql),
-- application_pending_questions_owner_update (0009_application_pending_questions.sql),
-- and application_events_owner_insert (0001_init.sql). No new privilege is
-- introduced anywhere. The explicit ownership/status checks below are
-- additional, self-documenting defense in depth — not a replacement for RLS.
--
-- This function is exposed over Supabase's auto-generated REST API to any
-- authenticated client, not only this app's own API route, so it must not
-- assume p_answers already passed the API route's validateApplicationAnswers()
-- checks (required-field enforcement, select-option membership, etc.). It is
-- deliberately "dumb": persist the given (field_id, answer_value) pairs and
-- transition status, nothing more. That is safe because the real safety
-- gate is the application engine re-resolving the form from scratch at
-- submission time (engine.ts resolveFormFields -> normalizeApplicationOnlyAnswer),
-- which re-validates every stored answer against the provider's CURRENT
-- declared field type/options before ever using it — a bogus or stale value
-- written here simply fails back to manual_required later, exactly as it
-- would today. Duplicating that TYPE/OPTION validation into SQL would only
-- be a second copy of the same rules to keep in sync, with no additional
-- safety, so it deliberately stays out of this function.
--
-- One structural invariant IS enforced here, though: a direct call to this
-- function (bypassing validateApplicationAnswers entirely) with an empty
-- p_answers, or with field_ids that don't match any real pending question,
-- would otherwise still requeue the application — the answer-update loop
-- below simply updates zero rows and nothing else stops the status
-- transition. That can't cause a false submission (the engine re-derives
-- unansweredRequired from scratch either way, per the paragraph above), but
-- it would let an application bounce manual_required -> queued -> back to
-- manual_required with real required questions never actually touched,
-- wasting a worker cycle and a real outbound call to the employer's form
-- API for nothing. The check below closes exactly that gap: it refuses to
-- requeue while any REQUIRED pending question still has no answer_value at
-- all, without re-validating the CONTENT of any answer already provided.
-- ============================================================================

create or replace function public.save_application_answers_and_requeue(
  p_application_id uuid,
  p_answers jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_answer jsonb;
begin
  -- Authoritative status check: only a genuinely manual_required
  -- application owned by the caller (or an admin) can be requeued here.
  -- FOR UPDATE serializes concurrent calls for the same application
  -- (e.g. a double-submit) so they can't both observe manual_required and
  -- both attempt to requeue.
  select status into v_status
  from public.applications
  where id = p_application_id
    and (user_id = auth.uid() or public.is_admin())
  for update;

  if v_status is null then
    raise exception 'application_not_found';
  end if;

  if v_status <> 'manual_required' then
    raise exception 'application_not_manual_required';
  end if;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    update public.application_pending_questions
    set answer_value = v_answer ->> 'answer_value',
        answer_source = 'application_only',
        source_answer_library_id = null
    where application_id = p_application_id
      and field_id = v_answer ->> 'field_id';
  end loop;

  -- Refuses to requeue while any required question for this application
  -- still has no answer — closes the gap where a direct call with an
  -- empty/irrelevant p_answers would otherwise requeue with real required
  -- questions untouched (see note above). This is a purely structural
  -- check (non-null/non-blank), not a content/type/option check — that
  -- remains the engine's job at resolution time, by design.
  if exists (
    select 1
    from public.application_pending_questions
    where application_id = p_application_id
      and required = true
      and (answer_value is null or btrim(answer_value) = '')
  ) then
    raise exception 'application_has_unanswered_required_questions';
  end if;

  update public.applications
  set status = 'queued',
      manual_required = false,
      error_message = null
  where id = p_application_id;

  -- Nested block = an implicit savepoint: a failure here rolls back only
  -- this insert, never the answer writes or status transition above.
  -- Non-fatal by design, consistent with the existing rule that a
  -- logging/audit failure must never turn a genuinely successful state
  -- change into a false failure (see commit 7a18b8c, which made this same
  -- event insert non-fatal at the API route before this function existed).
  begin
    insert into public.application_events (application_id, event_type, metadata)
    values (
      p_application_id,
      'APPLICATION_QUEUED',
      jsonb_build_object(
        'reason', 'user_answers_saved',
        'answeredFieldIds', (
          select coalesce(jsonb_agg(elem ->> 'field_id'), '[]'::jsonb)
          from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) elem
        )
      )
    );
  exception when others then
    raise warning 'save_application_answers_and_requeue: failed to log APPLICATION_QUEUED for application %: %', p_application_id, sqlerrm;
  end;
end;
$$;

revoke all on function public.save_application_answers_and_requeue(uuid, jsonb) from public;
grant execute on function public.save_application_answers_and_requeue(uuid, jsonb) to authenticated;
