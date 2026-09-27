begin;

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
  and i.reward_status = 'PAID'
  and not public.is_sybil_v2_referral_invalidated(
    a.invite_code,
    a.network
  );

revoke all on table public.operator_sybil_v2_historical_watch_followups
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_historical_watch_followups
  to service_role;

comment on view public.operator_sybil_v2_historical_watch_followups is
  'Service-only historical paid OPERATOR WATCH follow-up list. Active historical BLACKLIST invalidations are excluded. Follow-up remains scoped to the invitee wallet; inviter reward-recipient evidence must never be combined with this WATCH baseline.';

commit;
