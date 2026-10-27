begin;

-- Applying the DB migration before the frontend deploy MUST NOT cause an
-- existing background cron to open the immutable 24-hour bonus window early.
alter table public.reward_runtime_config
  add column if not exists reward_x_promotion_early_canonical_enabled boolean not null default false;

comment on column public.reward_runtime_config.reward_x_promotion_early_canonical_enabled is
  'Deployment interlock: default OFF. Open an early X opportunity only after the UI, recovery cron and verified DB guards are deployed and the operator explicitly enables it. Existing PAID receipt offers are unaffected.';

create or replace function public.reward_x_promotion_canonical_base_ready_v1(
  p_code text, p_network text, p_wallet text, p_base_wei numeric
) returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $canonical$
  select exists (
    select 1 from public.reward_runtime_config c
    where c.id=1
      and c.reward_x_promotion_early_canonical_enabled is true
  ) and exists (
    select 1
    from public.reward_payouts p
    join public.reward_rounds r
      on r.id=p.round_id and r.network=p_network
    join public.reward_payout_manifests m
      on m.round_id=r.id and m.network=r.network
    join public.reward_payout_transaction_submissions sub
      on sub.round_id=r.id and sub.manifest_id=m.id
    join public.reward_payout_signed_transactions sig
      on sig.round_id=r.id and sig.manifest_id=m.id
    where p.invite_code=p_code
      and p.recipient_wallet=lower(p_wallet)
      and p.amount_wei=p_base_wei
      and p.status='PENDING'
      and p.tx_id is null
      and r.status='CREATED'
      and r.broadcast_confirmed_at is not null
      and sub.network=p_network and sig.network=p_network
      and sub.manifest_hash=m.manifest_hash
      and sig.manifest_hash=m.manifest_hash
      and sub.tx_id=sig.tx_id
      and sub.operator_wallet=sig.operator_wallet
      and sig.operator_wallet=m.operator_wallet
  );
$canonical$;

revoke all on function public.reward_x_promotion_canonical_base_ready_v1(text,text,text,numeric)
  from public,anon,authenticated;
grant execute on function public.reward_x_promotion_canonical_base_ready_v1(text,text,text,numeric)
  to service_role;

commit;
