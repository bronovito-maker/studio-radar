-- Persist Scoring V2 without adding columns: operational fields stay materialized,
-- while offer scores, evidence and next action remain in the versioned snapshot.

create or replace function public.save_deterministic_score(
  p_lead_id uuid,
  p_score integer,
  p_grade public.score_grade,
  p_reasoning text,
  p_positive_signals text[],
  p_negative_signals text[],
  p_confidence numeric,
  p_version text,
  p_input_snapshot jsonb,
  p_recommended_service_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_service_id uuid;
  v_score_id uuid;
  v_threshold integer;
  v_next_action text := p_input_snapshot #>> '{scoringV2,recommendation,nextAction}';
  v_qualified boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_score not between 0 and 100
    or p_confidence not between 0 and 1
    or length(trim(p_reasoning)) = 0
    or length(trim(p_version)) = 0
    or v_next_action not in ('contact_now', 'manual_verify', 'enrich_data', 'ignore') then
    raise exception 'Invalid score payload' using errcode = '22023';
  end if;

  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  select id
  into v_service_id
  from public.services
  where slug = nullif(trim(coalesce(p_recommended_service_slug, '')), '')
    and is_active = true
  limit 1;

  if nullif(trim(coalesce(p_recommended_service_slug, '')), '') is not null
    and v_service_id is null then
    raise exception 'Recommended service not found' using errcode = '22023';
  end if;

  select default_score_threshold
  into v_threshold
  from public.settings
  where id = 1;

  insert into public.lead_scores (
    lead_id,
    score,
    grade,
    recommended_service_id,
    reasoning,
    positive_signals,
    negative_signals,
    deterministic_score,
    ai_score,
    confidence,
    provider,
    model,
    prompt_version,
    input_snapshot,
    created_by
  )
  values (
    p_lead_id,
    p_score,
    p_grade,
    v_service_id,
    trim(p_reasoning),
    coalesce(p_positive_signals, '{}'),
    coalesce(p_negative_signals, '{}'),
    p_score,
    null,
    p_confidence,
    'deterministic',
    null,
    trim(p_version),
    coalesce(p_input_snapshot, '{}'::jsonb),
    v_actor_id
  )
  returning id into v_score_id;

  update public.leads
  set
    recommended_service_id = v_service_id,
    status = case
      when status = 'new'
        and p_score >= coalesce(v_threshold, 65)
        and v_next_action = 'contact_now'
      then 'qualified'::public.lead_status
      else status
    end
  where id = p_lead_id
  returning status = 'qualified' into v_qualified;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'deterministic_score_created',
    jsonb_build_object(
      'score_id', v_score_id,
      'score', p_score,
      'grade', p_grade,
      'version', p_version,
      'next_action', v_next_action,
      'qualified', v_qualified,
      'recommended_service_slug', nullif(trim(coalesce(p_recommended_service_slug, '')), '')
    )
  );

  return v_score_id;
end;
$$;

revoke execute on function public.save_deterministic_score(
  uuid, integer, public.score_grade, text, text[], text[], numeric, text, jsonb, text
) from public, anon;

grant execute on function public.save_deterministic_score(
  uuid, integer, public.score_grade, text, text[], text[], numeric, text, jsonb, text
) to authenticated;
