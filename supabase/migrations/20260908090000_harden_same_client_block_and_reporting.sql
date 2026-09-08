-- Treat an inviter/invitee observed in the same VeInvite Security Client as a
-- terminal duplicate-participation signal unless an operator override is active.
-- Also record slot release for terminal blocked referrals and keep completed
-- onboarding reporting aligned with current valid reward eligibility.

create or replace function public.enforce_same_security_client_block_policy()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.sybil_status = 'REVIEW'
     and new.sybil_source = 'SECURITY_CLIENT'
     and coalesce((new.identity_link_evidence ->> 'sameInviterClient')::boolean, false)
     and not coalesce((new.identity_link_evidence ->> 'operatorOverride')::boolean, false) then
    new.sybil_status := 'BLOCKED';
    new.sybil_risk_level := 'HIGH';
    new.sybil_risk_score := 100;
    new.sybil_reason := 'Invitee and inviter were observed in the same VeInvite security client.';
    new.sybil_checked_at := clock_timestamp();
    new.sybil_source := 'SECURITY_CLIENT';
    if new.status <> 'CANCELLED' then
      new.status := 'UNDER_REVIEW';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_same_security_client_block_policy() from public, anon, authenticated;

drop trigger if exists ac_invitations_same_security_client_block on public.invitations;
create trigger ac_invitations_same_security_client_block
before insert or update on public.invitations
for each row execute function public.enforce_same_security_client_block_policy();

create or replace function public.release_blocked_invitation_slot()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.invitee_wallet is not null
     and new.invite_slot is not null
     and new.sybil_status = 'BLOCKED'
     and new.reward_status = 'FORFEITED'
     and new.slot_released_at is null
     and not exists (
       select 1
       from public.reward_queue_entries q
       where q.invite_code = new.invite_code
         and q.status = 'ASSIGNED'
         and q.assigned_round_id is not null
     )
     and not exists (
       select 1
       from public.reward_payouts rp
       where rp.invite_code = new.invite_code
         and rp.status in ('PENDING','SENDING','PAID')
     ) then
    new.slot_released_at := clock_timestamp();
  end if;

  return new;
end;
$function$;

revoke all on function public.release_blocked_invitation_slot() from public, anon, authenticated;

drop trigger if exists zyy_invitations_release_blocked_slot on public.invitations;
create trigger zyy_invitations_release_blocked_slot
before insert or update on public.invitations
for each row execute function public.release_blocked_invitation_slot();

create or replace function public.get_veinvite_vebetter_round_report(
  p_network text,
  p_app_id text,
  p_vebetter_round_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_report jsonb;
  v_allocation public.vebetter_round_allocations%rowtype;
  v_cfg public.operator_reporting_config%rowtype;
  v_period_start timestamptz;
  v_queued_candidates bigint := 0;
  v_sybil_blocked bigint := 0;
  v_completed_onboardings bigint := 0;
  v_cumulative_completed bigint := 0;
  v_round_status text := null;
  v_round_exists boolean := false;
  v_report_complete boolean := false;
begin
  v_report := public.get_veinvite_vebetter_round_report_v1_internal(
    v_network,
    v_app_id,
    p_vebetter_round_id
  );

  select * into v_allocation
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.vebetter_round_id = p_vebetter_round_id;

  if not found then
    raise exception 'VEBETTER_ALLOCATION_NOT_FOUND';
  end if;

  select * into v_cfg
  from public.operator_reporting_config c
  where c.id = 1;

  if not found
     or v_cfg.reporting_start_at is null
     or v_cfg.reporting_network <> v_network then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  v_period_start := (v_report->>'periodStart')::timestamptz;

  select count(*)
  into v_queued_candidates
  from public.reward_queue_entries q
  where q.network = v_network
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
    and q.eligible_at >= v_cfg.reporting_start_at
    and q.eligible_at < v_allocation.claim_block_timestamp;

  select count(distinct i.invite_code)
  into v_sybil_blocked
  from public.invitations i
  where i.activation_network = v_network
    and i.sybil_status = 'BLOCKED'
    and i.sybil_checked_at is not null
    and i.sybil_checked_at >= v_period_start
    and i.sybil_checked_at < v_allocation.claim_block_timestamp;

  select count(distinct q.invite_code)
  into v_completed_onboardings
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = v_network
    and q.eligible_at >= v_period_start
    and q.eligible_at < v_allocation.claim_block_timestamp
    and q.status <> 'CANCELLED'
    and i.status = 'COMPLETED'
    and i.sybil_status = 'CLEAR'
    and i.reward_status in ('ELIGIBLE','PAID');

  select count(distinct q.invite_code)
  into v_cumulative_completed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code = q.invite_code
  where q.network = v_network
    and q.eligible_at >= v_cfg.reporting_start_at
    and q.eligible_at < v_allocation.claim_block_timestamp
    and q.status <> 'CANCELLED'
    and i.status = 'COMPLETED'
    and i.sybil_status = 'CLEAR'
    and i.reward_status in ('ELIGIBLE','PAID');

  select rr.status
  into v_round_status
  from public.reward_rounds rr
  where rr.network = v_network
    and rr.app_id = v_app_id
    and rr.vebetter_round_id = p_vebetter_round_id
  order by rr.id desc
  limit 1;

  v_round_exists := found;

  if v_allocation.rewards_allocation_amount_wei = 0 then
    v_report_complete := true;
  elsif v_round_exists then
    v_report_complete := v_round_status = 'COMPLETED';
  else
    v_report_complete := v_queued_candidates = 0;
  end if;

  v_report := jsonb_set(
    v_report,
    '{participation,sybilBlocked}',
    to_jsonb(v_sybil_blocked),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{participation,completedOnboardings}',
    to_jsonb(v_completed_onboardings),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{cumulative,completedOnboardings}',
    to_jsonb(v_cumulative_completed),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{reportComplete}',
    to_jsonb(v_report_complete),
    false
  );

  return v_report || jsonb_build_object(
    'reportVersion', 'veinvite-vebetter-round-report-v2',
    'queuedCandidatesAwaitingReward', v_queued_candidates
  );
end;
$function$;
