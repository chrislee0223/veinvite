-- Reduce accidental mutation surface and expose operator-only forensic summaries
-- without changing reward eligibility, payout amounts, or automatic payout flow.

-- Invitation cancellation and lifecycle changes are UPDATE-based. The app
-- service role does not need DELETE; keeping deletion out of normal runtime
-- protects referral/audit history while postgres-level maintenance remains
-- available for exceptional legal/operational cases.
revoke delete on table public.invitations from service_role;

-- Trigger functions are invoked by their owning triggers, not directly by
-- clients. Remove PostgreSQL's default PUBLIC execute privilege to keep the
-- public schema least-privilege. Preview may intentionally lag production on
-- reward-runtime migrations, so guard these revokes by function existence.
do $$
begin
  if to_regprocedure('public.guard_mainnet_funded_rewards_one_way()') is not null then
    execute 'revoke all on function public.guard_mainnet_funded_rewards_one_way() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.guard_reward_emergency_pause_audit_metadata()') is not null then
    execute 'revoke all on function public.guard_reward_emergency_pause_audit_metadata() from public, anon, authenticated';
  end if;
end;
$$;

-- Operator views are read models. Some historical migrations left harmless but
-- unnecessary non-SELECT view privileges on service_role. Normalize every
-- operator_* view to SELECT-only.
do $$
declare
  v record;
begin
  for v in
    select schemaname, viewname
      from pg_views
     where schemaname = 'public'
       and viewname like 'operator\_%' escape '\'
  loop
    execute format(
      'revoke all privileges on table %I.%I from service_role',
      v.schemaname,
      v.viewname
    );
    execute format(
      'grant select on table %I.%I to service_role',
      v.schemaname,
      v.viewname
    );
  end loop;
end;
$$;

create or replace view public.operator_reward_recipient_forensics
with (security_invoker = true)
as
with latest_snapshot as (
  select distinct on (s.network, s.invite_code)
    s.network,
    s.invite_code,
    s.wallet_address,
    s.vet_funder_referral_count,
    s.vtho_funder_referral_count,
    s.indicators,
    s.checked_at
  from public.sybil_onchain_snapshots s
  order by s.network, s.invite_code, s.checked_at desc, s.id desc
), recipient_rollup as (
  select
    l.network,
    l.recipient_wallet as wallet_address,
    count(*)::bigint as reward_count,
    count(distinct l.invite_code)::bigint as paid_referral_count,
    sum(l.amount_wei) as total_reward_wei,
    count(*) filter (where s.invite_code is not null)::bigint as analyzed_referral_count,
    count(*) filter (
      where s.indicators @> '[{"code":"VERY_NEW_WALLET_ACTIVITY"}]'::jsonb
    )::bigint as very_new_wallet_count,
    count(*) filter (
      where s.indicators @> '[{"code":"NEW_WALLET_ACTIVITY"}]'::jsonb
    )::bigint as new_wallet_count,
    count(*) filter (
      where s.indicators @> '[{"code":"SAME_FUNDER_MULTI_ASSET"}]'::jsonb
    )::bigint as same_funder_multi_asset_count,
    count(*) filter (
      where coalesce(s.vet_funder_referral_count, 0) >= 3
    )::bigint as shared_vet_funder_count,
    count(*) filter (
      where coalesce(s.vtho_funder_referral_count, 0) >= 3
    )::bigint as shared_vtho_funder_count,
    max(coalesce(s.vet_funder_referral_count, 0))::integer as max_vet_funder_referral_count,
    max(coalesce(s.vtho_funder_referral_count, 0))::integer as max_vtho_funder_referral_count,
    max(s.checked_at) as latest_forensic_check_at
  from public.reward_recipient_audit_ledger l
  left join latest_snapshot s
    on s.network = l.network
   and s.invite_code = l.invite_code
  group by l.network, l.recipient_wallet
)
select
  dense_rank() over (
    partition by r.network
    order by r.total_reward_wei desc, r.wallet_address asc
  )::bigint as total_reward_rank,
  dense_rank() over (
    partition by r.network
    order by r.reward_count desc, r.total_reward_wei desc, r.wallet_address asc
  )::bigint as reward_count_rank,
  r.network,
  r.wallet_address,
  r.reward_count,
  r.paid_referral_count,
  r.total_reward_wei,
  r.analyzed_referral_count,
  greatest(r.paid_referral_count - r.analyzed_referral_count, 0)::bigint
    as unscanned_paid_referral_count,
  r.very_new_wallet_count,
  r.new_wallet_count,
  r.same_funder_multi_asset_count,
  r.shared_vet_funder_count,
  r.shared_vtho_funder_count,
  r.max_vet_funder_referral_count,
  r.max_vtho_funder_referral_count,
  r.latest_forensic_check_at,
  (
    r.very_new_wallet_count > 0
    or r.shared_vet_funder_count > 0
    or r.shared_vtho_funder_count > 0
  ) as has_observation_signals
from recipient_rollup r;

revoke all on table public.operator_reward_recipient_forensics
  from public, anon, authenticated, service_role;
grant select on table public.operator_reward_recipient_forensics
  to service_role;

comment on view public.operator_reward_recipient_forensics is
  'Operator-only observation summary joining finalized recipient payouts to the latest per-referral on-chain funding snapshot. Signals are forensic context only and never change reward eligibility or payout state.';
