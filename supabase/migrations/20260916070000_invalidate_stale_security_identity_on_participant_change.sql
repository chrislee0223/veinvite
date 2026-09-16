-- Re-evaluate previously CLEAR security-client assessments when a wallet that
-- already shares the same Security Client later becomes a real VeInvite
-- participant. This closes the time-shift gap where no new wallet mapping is
-- inserted, so the existing mapping invalidation trigger has nothing to fire on.
--
-- The invalidation is intentionally narrow:
--   * a mere extra wallet on the same client is not enough;
--   * the related wallet must enter the same participant states already used by
--     enforce_security_client_identity_gate();
--   * PAID and round-ASSIGNED rewards remain immutable;
--   * existing reward eligibility/queue triggers revoke unsettled claims after
--     the refreshed identity assessment moves the invitation out of CLEAR.

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
    coalesce(new.identity_link_evidence ->> 'staleBecause', '') in (
      'NEW_SECURITY_CLIENT_WALLET_MAPPING',
      'RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED'
    );

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

create or replace function public.invalidate_security_identity_on_related_participant_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_wallet text;
  v_new_relevant boolean := false;
  v_old_relevant boolean := false;
begin
  if new.invitee_wallet is null then
    return new;
  end if;

  v_wallet := lower(btrim(new.invitee_wallet));
  v_new_relevant :=
    new.status = 'COMPLETED'
    or new.reward_status in ('ELIGIBLE','PAID')
    or (
      new.eligibility_check_id is not null
      and new.ineligibility_check_id is null
      and new.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    );

  if not v_new_relevant then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_relevant :=
      old.status = 'COMPLETED'
      or old.reward_status in ('ELIGIBLE','PAID')
      or (
        old.eligibility_check_id is not null
        and old.ineligibility_check_id is null
        and old.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      );

    if v_old_relevant
       and old.invitee_wallet is not null
       and lower(btrim(old.invitee_wallet)) = v_wallet then
      return new;
    end if;
  end if;

  update public.invitations i
  set
    identity_link_status = 'UNKNOWN',
    identity_link_evidence = jsonb_build_object(
      'staleBecause', 'RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED',
      'observedAt', clock_timestamp()
    ),
    sybil_status = i.sybil_status
  where i.invite_code <> new.invite_code
    and i.invitee_wallet is not null
    and i.sybil_status = 'CLEAR'
    and i.reward_status <> 'PAID'
    and exists (
      select 1
      from public.security_client_wallet_observations existing_observation
      join public.security_client_wallet_observations changed_observation
        on changed_observation.client_id = existing_observation.client_id
      where existing_observation.wallet_address = lower(btrim(i.invitee_wallet))
        and changed_observation.wallet_address = v_wallet
    )
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

revoke all on function public.invalidate_security_identity_on_related_participant_change()
from public, anon, authenticated;

drop trigger if exists invitations_invalidate_related_security_identity
on public.invitations;
create trigger invitations_invalidate_related_security_identity
after insert or update on public.invitations
for each row execute function public.invalidate_security_identity_on_related_participant_change();

-- Close any race between the last pre-migration assessment and installation of
-- the trigger above. Only currently unsettled CLEAR invitations that already
-- share a client with an actual VeInvite participant are touched.
update public.invitations i
set
  identity_link_status = 'UNKNOWN',
  identity_link_evidence = jsonb_build_object(
    'staleBecause', 'RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED',
    'observedAt', clock_timestamp()
  ),
  sybil_status = i.sybil_status
where i.invitee_wallet is not null
  and i.sybil_status = 'CLEAR'
  and i.reward_status <> 'PAID'
  and exists (
    select 1
    from public.security_client_wallet_observations existing_observation
    join public.security_client_wallet_observations related_observation
      on related_observation.client_id = existing_observation.client_id
    join public.invitations related_invitation
      on lower(btrim(related_invitation.invitee_wallet)) = related_observation.wallet_address
    where existing_observation.wallet_address = lower(btrim(i.invitee_wallet))
      and related_observation.wallet_address <> lower(btrim(i.invitee_wallet))
      and related_invitation.invite_code <> i.invite_code
      and (
        related_invitation.status = 'COMPLETED'
        or related_invitation.reward_status in ('ELIGIBLE','PAID')
        or (
          related_invitation.eligibility_check_id is not null
          and related_invitation.ineligibility_check_id is null
          and related_invitation.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
        )
      )
  )
  and not exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = i.invite_code
      and q.status = 'ASSIGNED'
      and q.assigned_round_id is not null
  );
