-- Detect same-inviter invitee siblings that immediately switch wallets on one
-- VeInvite security client.
--
-- Safety rules:
-- 1. A generic shared client remains non-final evidence.
-- 2. Early REVIEW requires the same inviter plus an immediate <=10 minute
--    wallet switch near both activations.
-- 3. This migration never BLACKLISTs from client sharing alone.
-- 4. Operator/admin analytics-excluded wallets are ignored.
-- 5. Paid or already-assigned rewards remain immutable.

create or replace function public.invalidate_security_identity_on_new_wallet_mapping()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_current_invitation public.invitations%rowtype;
  v_peer record;
  v_switch_gap_seconds numeric;
  v_current_activation_gap_seconds numeric;
  v_peer_activation_gap_seconds numeric;
  v_now timestamptz := clock_timestamp();
  v_reason text :=
    'Two invitees from the same inviter were observed switching wallets on the same VeInvite security client near activation.';
begin
  -- Preserve the existing generic invalidation behavior first. A newly shared
  -- security client makes prior CLEAR identity evidence stale for unsettled
  -- invitations, but does not itself blacklist anything.
  update public.invitations i
  set
    identity_link_status = 'UNKNOWN',
    identity_link_evidence = jsonb_build_object(
      'staleBecause', 'NEW_SECURITY_CLIENT_WALLET_MAPPING',
      'observedAt', v_now
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

  if public.is_analytics_excluded_wallet(new.wallet_address) then
    return new;
  end if;

  select i.*
  into v_current_invitation
  from public.invitations i
  where i.invitee_wallet is not null
    and lower(btrim(i.invitee_wallet)) = lower(btrim(new.wallet_address))
    and i.eligibility_check_id is not null
    and i.ineligibility_check_id is null
    and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and i.sybil_status <> 'BLOCKED'
    and i.reward_status <> 'PAID'
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.status = 'ASSIGNED'
        and q.assigned_round_id is not null
    )
  order by i.activated_at desc nulls last, i.created_at desc
  limit 1;

  if not found
     or v_current_invitation.activated_at is null
     or public.is_analytics_excluded_wallet(v_current_invitation.inviter_wallet) then
    return new;
  end if;

  for v_peer in
    select
      i.invite_code,
      lower(btrim(i.invitee_wallet)) as invitee_wallet,
      i.activated_at,
      o.first_seen_at,
      o.last_seen_at
    from public.security_client_wallet_observations o
    join public.invitations i
      on lower(btrim(i.invitee_wallet)) = lower(btrim(o.wallet_address))
    where o.client_id = new.client_id
      and lower(btrim(o.wallet_address)) <> lower(btrim(new.wallet_address))
      and lower(btrim(i.inviter_wallet)) =
          lower(btrim(v_current_invitation.inviter_wallet))
      and i.eligibility_check_id is not null
      and i.ineligibility_check_id is null
      and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
      and i.sybil_status <> 'BLOCKED'
      and i.reward_status <> 'PAID'
      and i.activated_at is not null
      and not public.is_analytics_excluded_wallet(i.invitee_wallet)
      and not exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
          and q.status = 'ASSIGNED'
          and q.assigned_round_id is not null
      )
    order by o.first_seen_at asc
  loop
    if new.first_seen_at >= v_peer.last_seen_at then
      v_switch_gap_seconds :=
        extract(epoch from (new.first_seen_at - v_peer.last_seen_at));
    elsif v_peer.first_seen_at >= new.last_seen_at then
      v_switch_gap_seconds :=
        extract(epoch from (v_peer.first_seen_at - new.last_seen_at));
    else
      -- Overlapping observations on one pseudonymous client are no less
      -- suspicious than an immediate sequential wallet switch.
      v_switch_gap_seconds := 0;
    end if;

    v_current_activation_gap_seconds :=
      abs(extract(epoch from (
        v_current_invitation.activated_at - new.first_seen_at
      )));
    v_peer_activation_gap_seconds :=
      abs(extract(epoch from (
        v_peer.activated_at - v_peer.first_seen_at
      )));

    if v_switch_gap_seconds <= 600
       and v_current_activation_gap_seconds <= 600
       and v_peer_activation_gap_seconds <= 600 then
      update public.invitations i
      set
        identity_link_status = 'REVIEW',
        identity_link_risk_score = 100,
        identity_link_reason = v_reason,
        identity_link_checked_at = v_now,
        identity_link_policy_version = 'security_client_v2',
        identity_link_evidence = jsonb_build_object(
          'sameInviterSibling', true,
          'sharedClientId', new.client_id,
          'peerInviteCode', v_peer.invite_code,
          'peerWallet', v_peer.invitee_wallet,
          'inviterWallet', lower(btrim(v_current_invitation.inviter_wallet)),
          'immediateSwitch', true,
          'switchGapSeconds', v_switch_gap_seconds,
          'activationGapSeconds', v_current_activation_gap_seconds,
          'peerActivationGapSeconds', v_peer_activation_gap_seconds,
          'preVoteDetection', true,
          'signalFamily', 'SECURITY_CLIENT',
          'detectedAt', v_now
        )
      where i.invite_code = v_current_invitation.invite_code
        and i.reward_status <> 'PAID'
        and not exists (
          select 1
          from public.reward_queue_entries q
          where q.invite_code = i.invite_code
            and q.status = 'ASSIGNED'
            and q.assigned_round_id is not null
        );

      update public.invitations i
      set
        identity_link_status = 'REVIEW',
        identity_link_risk_score = 100,
        identity_link_reason = v_reason,
        identity_link_checked_at = v_now,
        identity_link_policy_version = 'security_client_v2',
        identity_link_evidence = jsonb_build_object(
          'sameInviterSibling', true,
          'sharedClientId', new.client_id,
          'peerInviteCode', v_current_invitation.invite_code,
          'peerWallet', lower(btrim(new.wallet_address)),
          'inviterWallet', lower(btrim(v_current_invitation.inviter_wallet)),
          'immediateSwitch', true,
          'switchGapSeconds', v_switch_gap_seconds,
          'activationGapSeconds', v_peer_activation_gap_seconds,
          'peerActivationGapSeconds', v_current_activation_gap_seconds,
          'preVoteDetection', true,
          'signalFamily', 'SECURITY_CLIENT',
          'detectedAt', v_now
        )
      where i.invite_code = v_peer.invite_code
        and i.reward_status <> 'PAID'
        and not exists (
          select 1
          from public.reward_queue_entries q
          where q.invite_code = i.invite_code
            and q.status = 'ASSIGNED'
            and q.assigned_round_id is not null
        );
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.invalidate_security_identity_on_new_wallet_mapping()
from public, anon, authenticated;
grant execute on function public.invalidate_security_identity_on_new_wallet_mapping()
to service_role;

-- Backfill already-observed unpaid sibling switches so the current production
-- pair is reviewed immediately instead of waiting for another wallet login.
with participant_observations as (
  select
    i.invite_code,
    lower(btrim(i.inviter_wallet)) as inviter_wallet,
    lower(btrim(i.invitee_wallet)) as invitee_wallet,
    i.activated_at,
    o.client_id,
    o.first_seen_at,
    o.last_seen_at
  from public.invitations i
  join public.security_client_wallet_observations o
    on lower(btrim(o.wallet_address)) = lower(btrim(i.invitee_wallet))
  where i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and i.ineligibility_check_id is null
    and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and i.sybil_status <> 'BLOCKED'
    and i.reward_status <> 'PAID'
    and i.activated_at is not null
    and not public.is_analytics_excluded_wallet(i.invitee_wallet)
    and not public.is_analytics_excluded_wallet(i.inviter_wallet)
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.status = 'ASSIGNED'
        and q.assigned_round_id is not null
    )
),
matched_pairs as (
  select
    a.invite_code as left_invite_code,
    a.invitee_wallet as left_wallet,
    b.invite_code as right_invite_code,
    b.invitee_wallet as right_wallet,
    a.inviter_wallet,
    a.client_id,
    case
      when b.first_seen_at >= a.last_seen_at
        then extract(epoch from (b.first_seen_at - a.last_seen_at))
      when a.first_seen_at >= b.last_seen_at
        then extract(epoch from (a.first_seen_at - b.last_seen_at))
      else 0
    end as switch_gap_seconds,
    abs(extract(epoch from (a.activated_at - a.first_seen_at)))
      as left_activation_gap_seconds,
    abs(extract(epoch from (b.activated_at - b.first_seen_at)))
      as right_activation_gap_seconds
  from participant_observations a
  join participant_observations b
    on b.client_id = a.client_id
   and b.inviter_wallet = a.inviter_wallet
   and b.invite_code > a.invite_code
  where (
    case
      when b.first_seen_at >= a.last_seen_at
        then extract(epoch from (b.first_seen_at - a.last_seen_at))
      when a.first_seen_at >= b.last_seen_at
        then extract(epoch from (a.first_seen_at - b.last_seen_at))
      else 0
    end
  ) <= 600
    and abs(extract(epoch from (a.activated_at - a.first_seen_at))) <= 600
    and abs(extract(epoch from (b.activated_at - b.first_seen_at))) <= 600
),
targets as (
  select
    left_invite_code as invite_code,
    right_invite_code as peer_invite_code,
    right_wallet as peer_wallet,
    inviter_wallet,
    client_id,
    switch_gap_seconds,
    left_activation_gap_seconds as activation_gap_seconds,
    right_activation_gap_seconds as peer_activation_gap_seconds
  from matched_pairs
  union all
  select
    right_invite_code,
    left_invite_code,
    left_wallet,
    inviter_wallet,
    client_id,
    switch_gap_seconds,
    right_activation_gap_seconds,
    left_activation_gap_seconds
  from matched_pairs
)
update public.invitations i
set
  identity_link_status = 'REVIEW',
  identity_link_risk_score = 100,
  identity_link_reason =
    'Two invitees from the same inviter were observed switching wallets on the same VeInvite security client near activation.',
  identity_link_checked_at = clock_timestamp(),
  identity_link_policy_version = 'security_client_v2',
  identity_link_evidence = jsonb_build_object(
    'sameInviterSibling', true,
    'sharedClientId', t.client_id,
    'peerInviteCode', t.peer_invite_code,
    'peerWallet', t.peer_wallet,
    'inviterWallet', t.inviter_wallet,
    'immediateSwitch', true,
    'switchGapSeconds', t.switch_gap_seconds,
    'activationGapSeconds', t.activation_gap_seconds,
    'peerActivationGapSeconds', t.peer_activation_gap_seconds,
    'preVoteDetection', true,
    'signalFamily', 'SECURITY_CLIENT',
    'detectedAt', clock_timestamp(),
    'backfill', true
  )
from targets t
where i.invite_code = t.invite_code
  and i.reward_status <> 'PAID'
  and not exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = i.invite_code
      and q.status = 'ASSIGNED'
      and q.assigned_round_id is not null
  );
