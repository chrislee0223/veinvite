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
  'AUTOMATIC_SAME_SUBJECT_REVIEW'::text as followup_mode
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
where a.state = 'WATCH'
  and i.reward_status = 'PAID'
  and exists (
    select 1
    from public.sybil_v2_assessment_events e
    where e.invite_code = a.invite_code
      and e.network = a.network
      and e.source = 'OPERATOR'
      and e.state = 'WATCH'
  )
  and not public.is_sybil_v2_referral_invalidated(
    a.invite_code,
    a.network
  );

revoke all on public.operator_sybil_v2_historical_watch_followups
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_historical_watch_followups
  to service_role;

comment on view public.operator_sybil_v2_historical_watch_followups is
  'Service-only historical paid WATCH follow-up list. A referral remains visible after same-subject SYSTEM reassessment when its assessment history contains an OPERATOR WATCH decision. Active historical BLACKLIST invalidations are excluded.';

commit;
