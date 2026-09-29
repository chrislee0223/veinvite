begin;

-- A COMPLETE chain checkpoint is only trustworthy for the analyzer version
-- that produced it. When detector logic changes, both live referrals and
-- already-paid historical referrals must return to the evidence queue instead
-- of being treated as fully scanned forever.

create or replace view public.operator_sybil_v2_scan_candidates
with (security_invoker = true)
as
select
  i.invite_code,
  i.activation_network as network,
  i.invitee_wallet,
  i.activation_block,
  i.activated_at,
  coalesce(s.historical_chain_status, 'PENDING'::text)
    as historical_chain_status,
  coalesce(s.funding_chain_status, 'PENDING'::text)
    as funding_chain_status,
  coalesce(s.updated_at, i.activated_at, i.created_at)
    as priority_at
from public.invitations i
left join public.sybil_v2_scan_checkpoints s
  on s.invite_code = i.invite_code
where i.invitee_wallet is not null
  and i.activation_network is not null
  and i.activation_block is not null
  and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
  and i.reward_status not in ('PAID','FORFEITED')
  and (
    s.invite_code is null
    or s.analyzer_version <> 'sybil-v2.1'
    or s.historical_chain_status <> 'COMPLETE'
    or s.funding_chain_status <> 'COMPLETE'
  );

revoke all on table public.operator_sybil_v2_scan_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_scan_candidates
  to service_role;

comment on view public.operator_sybil_v2_scan_candidates is
  'Service-only live Sybil v2 evidence backlog. COMPLETE checkpoints from an older analyzer version are intentionally requeued before any referral can CLEAR.';

create or replace view public.operator_sybil_v2_paid_backfill_candidates
with (security_invoker = true)
as
select
  i.invite_code,
  i.activation_network as network,
  i.invitee_wallet,
  i.activation_block,
  i.activated_at,
  i.reward_paid_at,
  coalesce(s.historical_chain_status, 'PENDING'::text)
    as historical_chain_status,
  coalesce(s.funding_chain_status, 'PENDING'::text)
    as funding_chain_status,
  coalesce(s.updated_at, i.reward_paid_at, i.activated_at, i.created_at)
    as priority_at
from public.invitations i
left join public.sybil_v2_scan_checkpoints s
  on s.invite_code = i.invite_code
where i.invitee_wallet is not null
  and i.activation_network is not null
  and i.activation_block is not null
  and i.status = 'COMPLETED'
  and i.reward_status = 'PAID'
  and (
    s.invite_code is null
    or s.analyzer_version <> 'sybil-v2.1'
    or s.historical_chain_status <> 'COMPLETE'
    or s.funding_chain_status <> 'COMPLETE'
  );

revoke all on table public.operator_sybil_v2_paid_backfill_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_paid_backfill_candidates
  to service_role;

comment on view public.operator_sybil_v2_paid_backfill_candidates is
  'Observation-only PAID Sybil v2 backfill. Analyzer upgrades deliberately requeue historical evidence while preserving every past payout and receipt.';

commit;
