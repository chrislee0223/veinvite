create or replace function public.security_identity_assessment_supported(
  p_status text,
  p_policy_version text,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select case
    when p_status = 'NO_KNOWN_LINK' then
      p_policy_version = 'security_client_v2'
      and coalesce(p_evidence ->> 'observedClientCount', '') ~ '^[1-9][0-9]*$'
    when p_status = 'OPERATOR_CLEARED' then
      p_policy_version = 'security_client_v2'
      and coalesce(p_evidence ->> 'operatorOverride', '') = 'true'
    else false
  end;
$$;

create or replace function public.security_identity_reward_gate_passes(
  p_status text,
  p_checked_at timestamptz,
  p_vote_completed_at timestamptz,
  p_policy_version text,
  p_evidence jsonb
)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select
    public.security_identity_assessment_supported(
      p_status,
      p_policy_version,
      p_evidence
    )
    and p_checked_at is not null
    and p_vote_completed_at is not null
    and p_checked_at >= p_vote_completed_at;
$$;

create or replace function public.enforce_security_client_identity_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_invitee text;
  v_inviter text;
  v_observed_client_count integer := 0;
  v_latest_observed_at timestamptz := null;
  v_related_wallet_count integer := 0;
  v_same_inviter_client boolean := false;
  v_related_participant boolean := false;
  v_related_rewarded boolean := false;
  v_status text := 'UNKNOWN';
  v_score integer := 0;
  v_reason text := 'No VeInvite Security Client observation is available for this wallet yet.';
  v_now timestamptz := clock_timestamp();
  v_evidence jsonb := '{}'::jsonb;
  v_new_operator_override boolean := false;
  v_preserved_operator_override boolean := false;
  v_operator_override boolean := false;
  v_vote_changed boolean := false;
  v_forced_new_evidence boolean := false;
begin
  if new.invitee_wallet is null
     or new.sybil_status <> 'CLEAR' then
    return new;
  end if;

  v_invitee := lower(btrim(new.invitee_wallet));
  v_inviter := lower(btrim(new.inviter_wallet));
  v_forced_new_evidence :=
    coalesce(new.identity_link_evidence ->> 'staleBecause', '') =
      'NEW_SECURITY_CLIENT_WALLET_MAPPING';

  if tg_op = 'UPDATE' then
    v_vote_changed :=
      new.vote_completed_at is distinct from old.vote_completed_at;

    v_new_operator_override :=
      new.sybil_source = 'OPERATOR'
      and (
        new.sybil_status is distinct from old.sybil_status
        or new.sybil_checked_at is distinct from old.sybil_checked_at
        or new.sybil_reason is distinct from old.sybil_reason
        or new.sybil_risk_level is distinct from old.sybil_risk_level
        or new.sybil_risk_score is distinct from old.sybil_risk_score
        or new.sybil_source is distinct from old.sybil_source
      );
  end if;

  with invitee_clients as (
    select distinct o.client_id
    from public.security_client_wallet_observations o
    where o.wallet_address = v_invitee
  ),
  all_client_observations as (
    select o.wallet_address, o.first_seen_at
    from public.security_client_wallet_observations o
    join invitee_clients c on c.client_id = o.client_id
  ),
  related_wallets as (
    select distinct o.wallet_address
    from public.security_client_wallet_observations o
    join invitee_clients c on c.client_id = o.client_id
    where o.wallet_address <> v_invitee
  )
  select
    (select count(*)::integer from invitee_clients),
    (select max(a.first_seen_at) from all_client_observations a),
    (select count(*)::integer from related_wallets),
    coalesce((select bool_or(r.wallet_address = v_inviter) from related_wallets r), false),
    coalesce((
      select bool_or(exists (
        select 1 from public.invitations i
        where lower(btrim(i.invitee_wallet)) = r.wallet_address
          and i.invite_code <> new.invite_code
          and i.eligibility_check_id is not null
          and i.ineligibility_check_id is null
          and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      )) from related_wallets r
    ), false),
    coalesce((
      select bool_or(exists (
        select 1 from public.invitations i
        where lower(btrim(i.invitee_wallet)) = r.wallet_address
          and i.invite_code <> new.invite_code
          and (i.reward_status in ('ELIGIBLE','PAID') or i.status = 'COMPLETED')
      )) from related_wallets r
    ), false)
  into
    v_observed_client_count,
    v_latest_observed_at,
    v_related_wallet_count,
    v_same_inviter_client,
    v_related_participant,
    v_related_rewarded;

  if tg_op = 'UPDATE' then
    v_preserved_operator_override :=
      old.identity_link_status = 'OPERATOR_CLEARED'
      and old.identity_link_checked_at is not null
      and not v_forced_new_evidence
      and (
        v_latest_observed_at is null
        or v_latest_observed_at <= old.identity_link_checked_at
      );
  end if;

  v_operator_override := v_new_operator_override or v_preserved_operator_override;

  if v_observed_client_count > 0 then
    v_status := 'NO_KNOWN_LINK';
    v_reason := null;
  end if;

  if v_same_inviter_client then
    v_status := 'REVIEW';
    v_score := 90;
    v_reason := 'Invitee and inviter were observed in the same VeInvite security client.';
  elsif v_related_rewarded then
    v_status := 'REVIEW';
    v_score := 80;
    v_reason := 'The invitee shares a VeInvite security client with another completed or rewarded participant wallet.';
  elsif v_related_participant then
    v_status := 'REVIEW';
    v_score := 60;
    v_reason := 'The invitee shares a VeInvite security client with another active participant wallet.';
  end if;

  v_evidence := jsonb_build_object(
    'observedClientCount', v_observed_client_count,
    'latestObservedAt', v_latest_observed_at,
    'relatedWalletCount', v_related_wallet_count,
    'sameInviterClient', v_same_inviter_client,
    'relatedActiveParticipant', v_related_participant,
    'relatedCompletedOrRewardedParticipant', v_related_rewarded,
    'operatorOverride', v_operator_override,
    'signalFamily', 'SECURITY_CLIENT'
  );

  if v_operator_override and v_status in ('UNKNOWN','REVIEW') then
    new.identity_link_status := 'OPERATOR_CLEARED';
  else
    new.identity_link_status := v_status;
  end if;

  new.identity_link_risk_score := v_score;
  new.identity_link_reason := case
    when new.identity_link_status = 'OPERATOR_CLEARED' and v_new_operator_override
      then 'Operator cleared a security-client identity gate: ' || coalesce(v_reason, 'manual review completed')
    when new.identity_link_status = 'OPERATOR_CLEARED' and v_preserved_operator_override
      then old.identity_link_reason
    else v_reason
  end;
  new.identity_link_checked_at := case
    when v_preserved_operator_override and not v_new_operator_override and not v_vote_changed
      then old.identity_link_checked_at
    else v_now
  end;
  new.identity_link_policy_version := 'security_client_v2';
  new.identity_link_evidence := v_evidence;

  if v_status = 'REVIEW' and not v_operator_override then
    new.sybil_status := 'REVIEW';
    new.sybil_risk_level := case when v_score >= 80 then 'HIGH' else 'MEDIUM' end;
    new.sybil_risk_score := greatest(coalesce(new.sybil_risk_score,0),v_score);
    new.sybil_reason := v_reason;
    new.sybil_checked_at := v_now;
    new.sybil_source := 'SECURITY_CLIENT';
    if new.status <> 'CANCELLED' then
      new.status := 'UNDER_REVIEW';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.invalidate_security_identity_on_new_wallet_mapping()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  update public.invitations i
  set
    identity_link_status = 'UNKNOWN',
    identity_link_evidence = jsonb_build_object(
      'staleBecause', 'NEW_SECURITY_CLIENT_WALLET_MAPPING',
      'observedAt', clock_timestamp()
    ),
    sybil_status = i.sybil_status
  where i.invitee_wallet is not null
    and i.sybil_status = 'CLEAR'
    and lower(btrim(i.invitee_wallet)) in (
      select o.wallet_address
      from public.security_client_wallet_observations o
      where o.client_id = new.client_id
    )
    and i.reward_status <> 'PAID'
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.status = 'ASSIGNED'
        and q.assigned_round_id is not null
    );

  return new;
end;
$$;

create or replace function public.enforce_invitation_identity_reward_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.reward_status = 'ELIGIBLE'
     and not public.security_identity_reward_gate_passes(
       new.identity_link_status,
       new.identity_link_checked_at,
       new.vote_completed_at,
       new.identity_link_policy_version,
       new.identity_link_evidence
     ) then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  elsif new.reward_status = 'PAID'
        and not public.security_identity_reward_gate_passes(
          new.identity_link_status,
          new.identity_link_checked_at,
          new.vote_completed_at,
          new.identity_link_policy_version,
          new.identity_link_evidence
        ) then
    raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
  end if;

  return new;
end;
$$;

drop trigger if exists zy_invitations_identity_reward_gate on public.invitations;
create trigger zy_invitations_identity_reward_gate
before insert or update on public.invitations
for each row execute function public.enforce_invitation_identity_reward_gate();

create or replace function public.enforce_reward_queue_identity_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_identity_link_status text;
  v_identity_link_checked_at timestamptz;
  v_vote_completed_at timestamptz;
  v_identity_link_policy_version text;
  v_identity_link_evidence jsonb;
begin
  if new.status not in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    return new;
  end if;

  select
    i.identity_link_status,
    i.identity_link_checked_at,
    i.vote_completed_at,
    i.identity_link_policy_version,
    i.identity_link_evidence
  into
    v_identity_link_status,
    v_identity_link_checked_at,
    v_vote_completed_at,
    v_identity_link_policy_version,
    v_identity_link_evidence
  from public.invitations i
  where i.invite_code = new.invite_code;

  if not found
     or not public.security_identity_reward_gate_passes(
       v_identity_link_status,
       v_identity_link_checked_at,
       v_vote_completed_at,
       v_identity_link_policy_version,
       v_identity_link_evidence
     ) then
    raise exception 'REWARD_QUEUE_IDENTITY_GATE_NOT_SATISFIED';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_reward_queue_identity_gate on public.reward_queue_entries;
create trigger zz_reward_queue_identity_gate
before insert or update on public.reward_queue_entries
for each row execute function public.enforce_reward_queue_identity_gate();

alter table public.invitations
  drop constraint if exists invitations_no_known_link_requires_observation_v2;
alter table public.invitations
  add constraint invitations_no_known_link_requires_observation_v2
  check (
    identity_link_status <> 'NO_KNOWN_LINK'
    or public.security_identity_assessment_supported(
      identity_link_status,
      identity_link_policy_version,
      identity_link_evidence
    )
  ) not valid;

alter table public.invitations
  drop constraint if exists invitations_reward_identity_gate_v2;
alter table public.invitations
  add constraint invitations_reward_identity_gate_v2
  check (
    reward_status not in ('ELIGIBLE','PAID')
    or public.security_identity_reward_gate_passes(
      identity_link_status,
      identity_link_checked_at,
      vote_completed_at,
      identity_link_policy_version,
      identity_link_evidence
    )
  ) not valid;

update public.invitations i
set sybil_status = i.sybil_status
where i.invitee_wallet is not null
  and i.sybil_status = 'CLEAR'
  and i.reward_status <> 'PAID'
  and not exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code = i.invite_code
      and q.status = 'ASSIGNED'
      and q.assigned_round_id is not null
  );

alter table public.invitations
  validate constraint invitations_no_known_link_requires_observation_v2;
alter table public.invitations
  validate constraint invitations_reward_identity_gate_v2;
