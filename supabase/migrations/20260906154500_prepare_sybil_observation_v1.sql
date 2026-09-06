begin;

-- Observation data is deliberately separate from invitations.sybil_status.
-- These rows are evidence for operator review only and must never become payout
-- authority without a later, explicit policy migration.
alter table public.sybil_onchain_snapshots
  add column if not exists rule_version text not null default 'observation-v1',
  add column if not exists analyzer_version text not null default 'onchain-funding-v1';

alter table public.reward_recipient_b3tr_flow_snapshots
  add column if not exists rule_version text not null default 'observation-v1',
  add column if not exists analyzer_version text not null default 'recipient-b3tr-v1';

create unique index if not exists sybil_onchain_snapshots_invite_analyzer_unique
  on public.sybil_onchain_snapshots(invite_code, analyzer_version);

create index if not exists sybil_onchain_snapshots_vet_funder_idx
  on public.sybil_onchain_snapshots(network, first_inbound_vet_sender)
  where first_inbound_vet_sender is not null;

create index if not exists sybil_onchain_snapshots_vtho_funder_idx
  on public.sybil_onchain_snapshots(network, first_inbound_vtho_sender)
  where first_inbound_vtho_sender is not null;

create or replace view public.operator_sybil_observation_candidates
with (security_invoker = true)
as
select
  s.id as snapshot_id,
  s.invite_code,
  i.inviter_wallet,
  s.wallet_address as invitee_wallet,
  s.network,
  i.referral_link_id,
  i.activated_at,
  s.activation_block,
  s.first_observed_activity_block,
  s.age_blocks_at_activation,
  s.approximate_age_seconds_at_activation,
  s.first_inbound_vet_sender,
  s.first_inbound_vtho_sender,
  s.vet_funder_referral_count,
  s.vtho_funder_referral_count,
  coalesce(signals.signal_count, 0)::integer as signal_count,
  coalesce(signals.max_signal_score, 0)::integer as max_signal_score,
  coalesce(signals.indicator_codes, '[]'::jsonb) as indicator_codes,
  count(*) over (partition by i.inviter_wallet)::integer as observed_inviter_cohort_size,
  s.rule_version,
  s.analyzer_version,
  s.checked_at
from public.sybil_onchain_snapshots s
join public.invitations i
  on i.invite_code = s.invite_code
left join lateral (
  select
    count(*)::integer as signal_count,
    max(
      case
        when indicator ->> 'score' ~ '^[0-9]+$'
          then (indicator ->> 'score')::integer
        else 0
      end
    )::integer as max_signal_score,
    jsonb_agg(indicator ->> 'code' order by indicator ->> 'code')
      filter (where nullif(indicator ->> 'code', '') is not null) as indicator_codes
  from jsonb_array_elements(s.indicators) indicator
) signals on true
where s.observation_only is true
  and jsonb_array_length(s.indicators) > 0;

comment on view public.operator_sybil_observation_candidates is
  'Observation-only Sybil evidence. This view does not mutate invitation Sybil status, reward eligibility, queue state, or payout authority.';

revoke all on public.operator_sybil_observation_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_observation_candidates
  to service_role;

commit;
