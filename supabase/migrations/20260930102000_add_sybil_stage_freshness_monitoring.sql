begin;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_stage_freshness()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_activation_stale bigint := 0;
  v_mission_stale bigint := 0;
  v_identity_stale bigint := 0;
  v_vote_stale bigint := 0;
  v_invalid_prevote_finality bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select
    count(*) filter (
      where i.activated_at is not null
        and i.activated_at < v_now - interval '5 minutes'
        and a.invite_code is null
    )::bigint,
    count(*) filter (
      where coalesce(i.apps_completed,0) >= 3
        and i.apps_completed_at is not null
        and i.apps_completed_at < v_now - interval '5 minutes'
        and coalesce(a.source,'SYSTEM') = 'SYSTEM'
        and (
          a.invite_code is null
          or a.assessed_at < i.apps_completed_at
          or not coalesce(a.completed_checks,'[]'::jsonb) ? 'MISSION_BEHAVIOR'
        )
    )::bigint,
    count(*) filter (
      where i.identity_link_checked_at is not null
        and i.identity_link_checked_at < v_now - interval '5 minutes'
        and coalesce(a.source,'SYSTEM') = 'SYSTEM'
        and (
          a.invite_code is null
          or a.assessed_at < i.identity_link_checked_at
        )
    )::bigint,
    count(*) filter (
      where i.vote_completed is true
        and i.vote_completed_at is not null
        and i.vote_completed_at < v_now - interval '5 minutes'
        and coalesce(a.source,'SYSTEM') = 'SYSTEM'
        and (
          a.invite_code is null
          or a.assessed_at < i.vote_completed_at
        )
    )::bigint,
    count(*) filter (
      where coalesce(i.vote_completed,false) is false
        and coalesce(a.completed_checks,'[]'::jsonb) ? 'CHAIN_FINALITY'
    )::bigint
  into
    v_activation_stale,
    v_mission_stale,
    v_identity_stale,
    v_vote_stale,
    v_invalid_prevote_finality
  from public.invitations i
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
  where i.activation_network = new.network
    and i.invitee_wallet is not null
    and i.activation_block is not null
    and i.eligibility_check_id is not null
    and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and i.reward_status not in ('PAID','FORFEITED');

  new.metrics :=
    coalesce(new.metrics,'{}'::jsonb) ||
    jsonb_build_object(
      'sybilV2StageFreshness',
      jsonb_build_object(
        'activationAssessmentOver5m', v_activation_stale,
        'thirdAppAssessmentOver5m', v_mission_stale,
        'identityAssessmentOver5m', v_identity_stale,
        'voteAssessmentOver5m', v_vote_stale,
        'invalidPreVoteFinality', v_invalid_prevote_finality,
        'stageFreshnessThresholdMinutes', 5
      )
    );

  if v_activation_stale > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code','SYBIL_V2_ACTIVATION_ASSESSMENT_STALE',
        'severity','WARNING',
        'observed',v_activation_stale,
        'message','One or more accepted referrals have waited over five minutes for their first Sybil v2 assessment.'
      )
    );
  end if;

  if v_mission_stale > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code','SYBIL_V2_THIRD_APP_REASSESSMENT_STALE',
        'severity','WARNING',
        'observed',v_mission_stale,
        'message','One or more referrals completed the third dApp over five minutes ago without a fresh mission-behavior assessment.'
      )
    );
  end if;

  if v_identity_stale > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code','SYBIL_V2_IDENTITY_REASSESSMENT_STALE',
        'severity','WARNING',
        'observed',v_identity_stale,
        'message','One or more security-identity changes have waited over five minutes for Sybil v2 reassessment.'
      )
    );
  end if;

  if v_vote_stale > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code','SYBIL_V2_VOTE_REASSESSMENT_STALE',
        'severity','WARNING',
        'observed',v_vote_stale,
        'message','One or more completed votes have waited over five minutes for a fresh Sybil v2 assessment.'
      )
    );
  end if;

  if v_invalid_prevote_finality > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code','SYBIL_V2_INVALID_PREVOTE_FINALITY',
        'severity','WARNING',
        'observed',v_invalid_prevote_finality,
        'message','A live pre-vote referral is incorrectly marked with CHAIN_FINALITY and must be reassessed.'
      )
    );
  end if;

  new.alerts :=
    coalesce(new.alerts,'[]'::jsonb) ||
    v_extra_alerts;
  new.alert_count :=
    jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb
      then 'CRITICAL'
    when new.alert_count > 0
      then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$function$;

revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_stage_freshness()
from public, anon, authenticated;

drop trigger if exists af_operator_monitor_sybil_v2_stage_freshness
on public.operator_monitor_snapshots;

create trigger af_operator_monitor_sybil_v2_stage_freshness
before insert on public.operator_monitor_snapshots
for each row execute function public.enrich_operator_monitor_snapshot_sybil_v2_stage_freshness();

commit;
