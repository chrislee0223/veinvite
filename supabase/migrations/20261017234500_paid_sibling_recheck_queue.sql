-- Queue already-paid, previously CLEAR referrals for operator re-review when
-- a later confirmed same-inviter sibling is BLACKLISTED on the same client.
-- Observation only. Never mutate a paid receipt or automatically blacklist.
begin;

create table if not exists public.sybil_v2_paid_sibling_review_decisions (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  paid_invite_code text not null,
  blocked_invite_code text not null,
  restriction_id uuid not null references public.sybil_v2_wallet_restrictions(id),
  decision text not null check (decision in ('CLEAR','BLACKLIST')),
  operator_wallet text not null,
  reason text not null,
  shared_client_id text not null,
  decided_at timestamptz not null default clock_timestamp(),
  unique (network, paid_invite_code, restriction_id)
);

alter table public.sybil_v2_paid_sibling_review_decisions enable row level security;
revoke all on table public.sybil_v2_paid_sibling_review_decisions
  from public, anon, authenticated;
grant select on public.sybil_v2_paid_sibling_review_decisions to service_role;

-- A review can have several matching observations, but each paid/blocked
-- restriction pair gets exactly one operator candidate.
create or replace view public.operator_sybil_v2_paid_sibling_recheck_candidates
with (security_invoker = true) as
select
  p.activation_network as network,
  p.invite_code as paid_invite_code,
  b.invite_code as blocked_invite_code,
  lower(p.inviter_wallet) as inviter_wallet,
  lower(p.invitee_wallet) as paid_invitee_wallet,
  lower(b.invitee_wallet) as blocked_invitee_wallet,
  r.id as restriction_id,
  match.shared_client_id,
  p.reward_paid_at,
  r.imposed_at as blocked_at
from public.sybil_v2_wallet_restrictions r
join public.invitations b
  on b.invite_code = r.related_invite_code
 and b.activation_network = r.network
 and lower(b.invitee_wallet) = lower(r.wallet_address)
join public.invitations p
  on p.activation_network = b.activation_network
 and lower(p.inviter_wallet) = lower(b.inviter_wallet)
 and p.invite_code <> b.invite_code
join lateral (
  select min(a.client_id::text) as shared_client_id
  from public.security_client_wallet_observations a
  join public.security_client_wallet_observations c
    on c.client_id = a.client_id
   and c.wallet_address = lower(b.invitee_wallet)
  where a.wallet_address = lower(p.invitee_wallet)
) match on match.shared_client_id is not null
where r.status = 'ACTIVE'
  and r.resolved_at is null
  and r.source in ('OPERATOR','SYSTEM')
  and b.sybil_status = 'BLOCKED'
  and p.sybil_status = 'CLEAR'
  and p.reward_status = 'PAID'
  and p.reward_paid_at is not null
  and r.imposed_at > p.reward_paid_at
  and not exists (
    select 1 from public.sybil_v2_referral_invalidations x
    where x.network = p.activation_network
      and x.invite_code = p.invite_code
      and x.status = 'ACTIVE'
  )
  and not exists (
    select 1 from public.sybil_v2_paid_sibling_review_decisions d
    where d.network = p.activation_network
      and d.paid_invite_code = p.invite_code
      and d.restriction_id = r.id
  );

revoke all on public.operator_sybil_v2_paid_sibling_recheck_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_paid_sibling_recheck_candidates to service_role;

comment on view public.operator_sybil_v2_paid_sibling_recheck_candidates is
 'Operator-only, read-only paid-CLEAR sibling rechecks after a later BLACK. Shared client alone never causes an automatic verdict.';

create or replace function public.resolve_sybil_v2_paid_sibling_recheck(
  p_network text,
  p_paid_invite_code text,
  p_restriction_id uuid,
  p_decision text,
  p_reason text,
  p_operator_wallet text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_code text := upper(btrim(p_paid_invite_code));
  v_decision text := upper(btrim(p_decision));
  v_reason text := btrim(coalesce(p_reason,''));
  v_operator text := lower(btrim(p_operator_wallet));
  v_candidate record;
  v_existing public.sybil_v2_paid_sibling_review_decisions%rowtype;
  v_historical jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging')
     or v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
     or p_restriction_id is null
     or v_decision not in ('CLEAR','BLACKLIST')
     or length(v_reason) not between 25 and 500
     or v_operator !~ '^0x[0-9a-f]{40}$' then
    raise exception 'PAID_SIBLING_REVIEW_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_paid_sibling_review_' || v_network || ':' ||
      v_code || ':' || p_restriction_id::text,
      0
    )
  );

  select * into v_existing
  from public.sybil_v2_paid_sibling_review_decisions d
  where d.network = v_network
    and d.paid_invite_code = v_code
    and d.restriction_id = p_restriction_id;

  if found then
    if v_existing.decision = v_decision then
      return jsonb_build_object('changed',false,'decision',v_decision,'reason','ALREADY_REVIEWED');
    end if;
    raise exception 'PAID_SIBLING_REVIEW_STATE_CHANGED';
  end if;

  -- Prevent concurrent reinstatement of the source restriction between
  -- observation and a historical invalidation decision.
  perform 1
  from public.sybil_v2_wallet_restrictions r
  where r.id = p_restriction_id
    and r.network = v_network
    and r.status = 'ACTIVE'
    and r.resolved_at is null
  for share;
  if not found then
    raise exception 'PAID_SIBLING_REVIEW_STALE';
  end if;

  select * into v_candidate
  from public.operator_sybil_v2_paid_sibling_recheck_candidates c
  where c.network = v_network
    and c.paid_invite_code = v_code
    and c.restriction_id = p_restriction_id;

  if not found then
    raise exception 'PAID_SIBLING_REVIEW_STALE';
  end if;

  if v_decision = 'BLACKLIST' then
    -- One database transaction: historical invalidation will seed the
    -- existing immutable recovery obligation for the *inviter*. No payout
    -- or receipt is rewritten, and the referral/leaderboard views update
    -- through their existing invalidation path. Failure rolls everything back.
    select public.resolve_sybil_v2_historical_referral(
      v_code,
      'BLACKLIST',
      v_reason,
      v_operator,
      v_network,
      'paid-sibling-recheck:' || p_restriction_id::text,
      jsonb_build_array('PAID_SIBLING_OPERATOR_CONFIRMED'),
      jsonb_build_object(
        'reviewPath','PAID_SIBLING_RECHECK',
        'linkedBlockedInviteCode',v_candidate.blocked_invite_code,
        'restrictionId',p_restriction_id::text,
        'sharedClientId',v_candidate.shared_client_id,
        'rewardAlreadyPaid',true,
        'pastRewardChanged',false
      )
    ) into v_historical;

    if coalesce(v_historical->>'changed','false') <> 'true'
       and coalesce(v_historical->>'state','') <> 'INVALIDATED' then
      raise exception 'PAID_SIBLING_HISTORICAL_INVALIDATION_FAILED';
    end if;
  end if;

  insert into public.sybil_v2_paid_sibling_review_decisions(
    network,paid_invite_code,blocked_invite_code,restriction_id,
    decision,operator_wallet,reason,shared_client_id
  ) values (
    v_network,v_code,v_candidate.blocked_invite_code,p_restriction_id,
    v_decision,v_operator,v_reason,v_candidate.shared_client_id
  );

  return jsonb_build_object(
    'changed',true,
    'decision',v_decision,
    'paidInviteCode',v_code,
    'blockedInviteCode',v_candidate.blocked_invite_code,
    'pastRewardChanged',false,
    'historical',v_historical
  );
end;
$function$;

revoke all on function public.resolve_sybil_v2_paid_sibling_recheck(
  text,text,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.resolve_sybil_v2_paid_sibling_recheck(
  text,text,uuid,text,text,text
) to service_role;

comment on function public.resolve_sybil_v2_paid_sibling_recheck(text,text,uuid,text,text,text)
is 'Verified operator-only paid-sibling review disposition; CLEAR keeps prior reward, BLACKLIST invokes historical invalidation and recovery atomically.';

commit;
