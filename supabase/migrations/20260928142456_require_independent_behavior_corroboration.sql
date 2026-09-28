begin;

do $$
begin
  if to_regprocedure(
    'public.apply_sybil_v2_behavior_pattern_restriction_v1_internal(text,bigint,text,text)'
  ) is null then
    alter function public.apply_sybil_v2_behavior_pattern_restriction(
      text, bigint, text, text
    ) rename to apply_sybil_v2_behavior_pattern_restriction_v1_internal;
  end if;
end
$$;

revoke all on function public.apply_sybil_v2_behavior_pattern_restriction_v1_internal(
  text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_behavior_pattern_restriction_v1_internal(
  text, bigint, text, text
) to service_role;

create or replace function public.apply_sybil_v2_behavior_pattern_restriction(
  p_invite_code text,
  p_expected_revision bigint,
  p_hub_wallet text,
  p_network text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_sync boolean := false;
  v_mission boolean := false;
  v_funding boolean := false;
  v_identity boolean := false;
begin
  select *
  into v_assessment
  from public.sybil_v2_referral_assessments
  where invite_code = v_code;

  if not found then
    raise exception 'SYBIL_V2_ASSESSMENT_NOT_FOUND';
  end if;
  if v_assessment.network <> v_network then
    raise exception 'SYBIL_V2_NETWORK_MISMATCH';
  end if;
  if v_assessment.revision <> p_expected_revision then
    raise exception 'SYBIL_V2_REVIEW_STATE_CHANGED';
  end if;

  if v_assessment.state <> 'HOLD'
     or v_assessment.source <> 'SYSTEM' then
    return jsonb_build_object(
      'changed', false,
      'state', v_assessment.state,
      'revision', v_assessment.revision,
      'reason', 'NOT_CURRENT_SYSTEM_HOLD'
    );
  end if;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER'
      and e.strength = 'HIGH'
      and e.score > 0
  ) into v_sync;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'MISSION_PATTERN_CLUSTER'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
  ) into v_mission;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.evidence_family = 'FUNDING'
      and e.strength in ('MEDIUM','HIGH')
      and e.score > 0
  ) into v_funding;

  select exists (
    select 1
    from public.sybil_v2_evidence_records e
    where e.invite_code = v_code
      and e.network = v_network
      and e.signal_code = 'SECURITY_CLIENT_INVITER_LINK'
      and e.strength = 'HIGH'
      and e.score > 0
  ) into v_identity;

  if not (
    v_sync
    or (v_mission and v_funding)
    or v_identity
  ) then
    return jsonb_build_object(
      'changed', false,
      'state', 'HOLD',
      'revision', v_assessment.revision,
      'reason', 'INDEPENDENT_CORROBORATION_REQUIRED'
    );
  end if;

  return public.apply_sybil_v2_behavior_pattern_restriction_v1_internal(
    p_invite_code,
    p_expected_revision,
    p_hub_wallet,
    p_network
  );
end;
$$;

revoke all on function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) to service_role;

comment on function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) is
  'Requires the subject referral itself to have independent corroborating evidence before automatic restriction. Peer restrictions alone cannot recursively trigger another automatic restriction.';

commit;
