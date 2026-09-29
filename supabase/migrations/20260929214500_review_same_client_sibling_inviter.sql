-- Escalate the inviter of an immediate same-client sibling pair to REVIEW.
--
-- This is review-first corroboration only:
-- - never auto-blacklists the inviter;
-- - never forfeits or mutates paid/assigned rewards;
-- - ignores analytics-excluded/operator wallets;
-- - requires same inviter + same client + <=10 minute wallet switch near both activations.

create or replace function public.review_security_client_sibling_inviter_cluster()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_current record;
  v_peer record;
  v_parent record;
  v_switch_gap_seconds numeric;
  v_current_activation_gap_seconds numeric;
  v_peer_activation_gap_seconds numeric;
  v_now timestamptz := clock_timestamp();
begin
  if public.is_analytics_excluded_wallet(new.wallet_address) then
    return new;
  end if;

  select
    i.invite_code,
    lower(btrim(i.inviter_wallet)) as inviter_wallet,
    lower(btrim(i.invitee_wallet)) as invitee_wallet,
    i.activated_at
  into v_current
  from public.invitations i
  where i.invitee_wallet is not null
    and lower(btrim(i.invitee_wallet)) = lower(btrim(new.wallet_address))
    and i.eligibility_check_id is not null
    and i.ineligibility_check_id is null
    and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and i.sybil_status <> 'BLOCKED'
    and i.reward_status <> 'PAID'
    and i.activated_at is not null
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
     or public.is_analytics_excluded_wallet(v_current.inviter_wallet) then
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
      and lower(btrim(i.inviter_wallet)) = v_current.inviter_wallet
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
      v_switch_gap_seconds := 0;
    end if;

    v_current_activation_gap_seconds :=
      abs(extract(epoch from (v_current.activated_at - new.first_seen_at)));
    v_peer_activation_gap_seconds :=
      abs(extract(epoch from (v_peer.activated_at - v_peer.first_seen_at)));

    if v_switch_gap_seconds <= 600
       and v_current_activation_gap_seconds <= 600
       and v_peer_activation_gap_seconds <= 600 then

      select
        p.invite_code,
        p.identity_link_status,
        p.identity_link_risk_score
      into v_parent
      from public.invitations p
      where p.invitee_wallet is not null
        and lower(btrim(p.invitee_wallet)) = v_current.inviter_wallet
        and p.eligibility_check_id is not null
        and p.ineligibility_check_id is null
        and p.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
        and p.sybil_status <> 'BLOCKED'
        and p.reward_status <> 'PAID'
        and not public.is_analytics_excluded_wallet(p.invitee_wallet)
        and not exists (
          select 1
          from public.reward_queue_entries q
          where q.invite_code = p.invite_code
            and q.status = 'ASSIGNED'
            and q.assigned_round_id is not null
        )
      order by p.activated_at desc nulls last, p.created_at desc
      limit 1;

      if found then
        update public.invitations p
        set
          identity_link_status = case
            when p.identity_link_status = 'LINKED_EXISTING'
              then p.identity_link_status
            else 'REVIEW'
          end,
          identity_link_risk_score =
            greatest(coalesce(p.identity_link_risk_score,0),70),
          identity_link_reason = case
            when p.identity_link_status = 'LINKED_EXISTING'
              then p.identity_link_reason
            else
              'Two downstream invitees from this wallet immediately switched wallets on the same VeInvite security client.'
          end,
          identity_link_checked_at = v_now,
          identity_link_policy_version = 'security_client_v2',
          identity_link_evidence =
            coalesce(p.identity_link_evidence,'{}'::jsonb)
            || jsonb_build_object(
              'downstreamSameClientSibling', true,
              'sharedClientId', new.client_id,
              'downstreamInviteCodes',
                jsonb_build_array(v_current.invite_code,v_peer.invite_code),
              'downstreamWallets',
                jsonb_build_array(v_current.invitee_wallet,v_peer.invitee_wallet),
              'immediateSwitch', true,
              'switchGapSeconds', v_switch_gap_seconds,
              'downstreamActivationGapSeconds',
                v_current_activation_gap_seconds,
              'peerActivationGapSeconds',
                v_peer_activation_gap_seconds,
              'preVoteDetection', true,
              'signalFamily', 'CLUSTER_LINK',
              'detectedAt', v_now
            )
        where p.invite_code = v_parent.invite_code;
      end if;

      exit;
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.review_security_client_sibling_inviter_cluster()
from public, anon, authenticated;
grant execute on function public.review_security_client_sibling_inviter_cluster()
to service_role;

drop trigger if exists security_client_sibling_inviter_review
on public.security_client_wallet_observations;

create trigger security_client_sibling_inviter_review
after insert on public.security_client_wallet_observations
for each row
execute function public.review_security_client_sibling_inviter_cluster();

-- Backfill the already-observed unpaid inviter cluster without changing
-- historical paid rewards.
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
    a.inviter_wallet,
    a.invite_code as left_invite_code,
    a.invitee_wallet as left_wallet,
    b.invite_code as right_invite_code,
    b.invitee_wallet as right_wallet,
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
    p.invite_code as parent_invite_code,
    m.*
  from matched_pairs m
  join public.invitations p
    on lower(btrim(p.invitee_wallet)) = m.inviter_wallet
  where p.eligibility_check_id is not null
    and p.ineligibility_check_id is null
    and p.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
    and p.sybil_status <> 'BLOCKED'
    and p.reward_status <> 'PAID'
    and not public.is_analytics_excluded_wallet(p.invitee_wallet)
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = p.invite_code
        and q.status = 'ASSIGNED'
        and q.assigned_round_id is not null
    )
)
update public.invitations p
set
  identity_link_status = case
    when p.identity_link_status = 'LINKED_EXISTING'
      then p.identity_link_status
    else 'REVIEW'
  end,
  identity_link_risk_score =
    greatest(coalesce(p.identity_link_risk_score,0),70),
  identity_link_reason = case
    when p.identity_link_status = 'LINKED_EXISTING'
      then p.identity_link_reason
    else
      'Two downstream invitees from this wallet immediately switched wallets on the same VeInvite security client.'
  end,
  identity_link_checked_at = clock_timestamp(),
  identity_link_policy_version = 'security_client_v2',
  identity_link_evidence =
    coalesce(p.identity_link_evidence,'{}'::jsonb)
    || jsonb_build_object(
      'downstreamSameClientSibling', true,
      'sharedClientId', t.client_id,
      'downstreamInviteCodes',
        jsonb_build_array(t.left_invite_code,t.right_invite_code),
      'downstreamWallets',
        jsonb_build_array(t.left_wallet,t.right_wallet),
      'immediateSwitch', true,
      'switchGapSeconds', t.switch_gap_seconds,
      'downstreamActivationGapSeconds',
        t.left_activation_gap_seconds,
      'peerActivationGapSeconds',
        t.right_activation_gap_seconds,
      'preVoteDetection', true,
      'signalFamily', 'CLUSTER_LINK',
      'detectedAt', clock_timestamp(),
      'backfill', true
    )
from targets t
where p.invite_code = t.parent_invite_code;
