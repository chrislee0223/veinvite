-- Unified operator timeline for wallet-specific investigations.
-- Supports exact assistant/operator queries without scanning unrelated rows.
-- Applied and tested on Preview first.

begin;

create index if not exists invitations_inviter_created_idx
  on public.invitations(inviter_wallet,created_at desc);
create index if not exists invitations_invitee_created_idx
  on public.invitations(invitee_wallet,created_at desc)
  where invitee_wallet is not null;

create or replace view public.operator_wallet_timeline as
select
  i.inviter_wallet as wallet_address,
  i.created_at as event_at,
  'INVITE_CREATED'::text as event_type,
  i.invite_code,
  i.activation_network as network,
  null::text as tx_id,
  null::numeric as amount_wei,
  i.status::text as status,
  jsonb_build_object(
    'role','INVITER',
    'invitee_wallet',i.invitee_wallet,
    'reward_status',i.reward_status,
    'sybil_status',i.sybil_status
  ) as details
from public.invitations i

union all

select
  i.invitee_wallet as wallet_address,
  i.activated_at as event_at,
  'INVITE_ACCEPTED'::text as event_type,
  i.invite_code,
  i.activation_network as network,
  null::text as tx_id,
  null::numeric as amount_wei,
  i.status::text as status,
  jsonb_build_object(
    'role','INVITEE',
    'inviter_wallet',i.inviter_wallet,
    'activation_block',i.activation_block,
    'eligibility_check_id',i.eligibility_check_id,
    'reward_status',i.reward_status
  ) as details
from public.invitations i
where i.invitee_wallet is not null and i.activated_at is not null

union all

select
  e.wallet_address,
  e.created_at as event_at,
  'ENTRY_ELIGIBILITY_CHECK'::text as event_type,
  e.invite_code,
  e.network,
  coalesce(e.prior_reward_tx_id,e.prior_vote_tx_id) as tx_id,
  null::numeric as amount_wei,
  e.outcome::text as status,
  jsonb_build_object(
    'checked_block',e.checked_block,
    'prior_reward_tx_id',e.prior_reward_tx_id,
    'prior_vote_tx_id',e.prior_vote_tx_id,
    'details',e.details
  ) as details
from public.eligibility_check_events e

union all

select
  e.wallet_address,
  e.block_timestamp as event_at,
  e.event_type::text,
  e.invite_code,
  e.network,
  e.tx_id,
  null::numeric as amount_wei,
  'VERIFIED'::text as status,
  jsonb_build_object(
    'block_number',e.block_number,
    'app_id',e.app_id,
    'vote_round_id',e.vote_round_id,
    'detected_at',e.detected_at
  ) as details
from public.invite_impact_events e

union all

select
  s.wallet_address,
  s.created_at as event_at,
  'SYBIL_DECISION'::text as event_type,
  s.invite_code,
  i.activation_network as network,
  null::text as tx_id,
  null::numeric as amount_wei,
  s.resulting_status::text as status,
  jsonb_build_object(
    'risk_level',s.risk_level,
    'risk_score',s.risk_score,
    'source',s.source,
    'signal_code',s.signal_code,
    'summary',s.summary,
    'details',s.details
  ) as details
from public.sybil_review_events s
left join public.invitations i on i.invite_code=s.invite_code

union all

select
  rp.recipient_wallet as wallet_address,
  coalesce(rp.paid_at,rp.updated_at,rp.created_at) as event_at,
  'REWARD_PAYOUT'::text as event_type,
  rp.invite_code,
  rr.network,
  rp.tx_id,
  rp.amount_wei,
  rp.status::text as status,
  jsonb_build_object(
    'round_id',rp.round_id,
    'app_id',rr.app_id,
    'paid_at',rp.paid_at,
    'created_at',rp.created_at,
    'updated_at',rp.updated_at
  ) as details
from public.reward_payouts rp
join public.reward_rounds rr on rr.id=rp.round_id;

revoke all on public.operator_wallet_timeline from public,anon,authenticated;
grant select on public.operator_wallet_timeline to service_role;

commit;
