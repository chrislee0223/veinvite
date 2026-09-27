begin;

create or replace view public.operator_sybil_watchlist
with (security_invoker = true)
as
select
  i.invite_code,
  i.inviter_wallet,
  i.invitee_wallet as wallet_address,
  i.status as invite_status,
  i.reward_status,
  case
    when a.state = 'RESTRICTED' then 'BLOCKED'
    when a.state in ('WATCH','HOLD','ANALYSIS_FAILED') then 'REVIEW'
    else i.sybil_status
  end::text as sybil_status,
  case
    when a.state in ('RESTRICTED','HOLD','ANALYSIS_FAILED') then 'HIGH'
    when a.state = 'WATCH' then 'MEDIUM'
    else i.sybil_risk_level
  end::text as sybil_risk_level,
  coalesce(a.risk_score, i.sybil_risk_score) as sybil_risk_score,
  case
    when a.state in ('WATCH','HOLD','RESTRICTED','ANALYSIS_FAILED')
      then concat(
        'SYBIL_V2_',
        a.state,
        ': ',
        coalesce(a.reason_codes::text, '[]')
      )
    else i.sybil_reason
  end::text as sybil_reason,
  coalesce(a.updated_at, i.sybil_checked_at) as sybil_checked_at,
  greatest(
    i.updated_at,
    coalesce(a.updated_at, i.updated_at)
  ) as updated_at
from public.invitations i
left join public.sybil_v2_referral_assessments a
  on a.invite_code = i.invite_code
 and a.network = i.activation_network
where i.sybil_status in ('REVIEW','BLOCKED')
   or a.state in ('WATCH','HOLD','RESTRICTED','ANALYSIS_FAILED');

revoke all on table public.operator_sybil_watchlist
  from public, anon, authenticated;
grant select on table public.operator_sybil_watchlist
  to service_role;

comment on view public.operator_sybil_watchlist is
  'Service-only unified Sybil watchlist. Preserves legacy REVIEW/BLOCKED rows and surfaces Sybil v2 WATCH/HOLD/RESTRICTED/ANALYSIS_FAILED assessments, including operator-reviewed historical paid referrals.';

create or replace view public.operator_sybil_v2_historical_watch_followups
with (security_invoker = true)
as
select
  a.invite_code,
  a.network,
  lower(i.inviter_wallet) as inviter_wallet,
  lower(i.invitee_wallet) as wallet_address,
  i.status as invite_status,
  i.reward_status,
  a.state,
  a.risk_score,
  a.reason_codes,
  a.evidence_summary,
  a.policy_version,
  a.analyzer_version,
  a.updated_at as watch_updated_at,
  (
    coalesce(
      a.evidence_summary ->> 'postPayoutObservationEnabled',
      'false'
    ) = 'true'
  ) as legacy_reward_recipient_observation_enabled,
  'MANUAL_SAME_SUBJECT_REVIEW'::text as followup_mode
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
where a.state = 'WATCH'
  and a.source = 'OPERATOR'
  and i.reward_status = 'PAID';

revoke all on table public.operator_sybil_v2_historical_watch_followups
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_historical_watch_followups
  to service_role;

comment on view public.operator_sybil_v2_historical_watch_followups is
  'Service-only historical paid OPERATOR WATCH follow-up list. Follow-up must remain scoped to the invitee wallet. Reward-recipient post-payout behavior belongs to the inviter and must never be combined with this WATCH baseline.';

commit;
