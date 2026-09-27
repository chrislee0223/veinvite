begin;

alter table public.sybil_v2_watch_followup_observations
  add column if not exists assessment_revision bigint;

update public.sybil_v2_watch_followup_observations o
set assessment_revision = a.revision
from public.sybil_v2_referral_assessments a
where a.invite_code = o.invite_code
  and o.assessment_revision is null;

alter table public.sybil_v2_watch_followup_observations
  alter column assessment_revision set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'sybil_v2_watch_followup_observations'
      and c.conname = 'sybil_v2_watch_followup_observations_assessment_revision_check'
  ) then
    alter table public.sybil_v2_watch_followup_observations
      add constraint sybil_v2_watch_followup_observations_assessment_revision_check
      check (assessment_revision >= 1);
  end if;
end;
$$;

alter table public.sybil_v2_watch_followup_observations
  drop constraint if exists
    sybil_v2_watch_followup_observations_invite_code_horizon_hours_key;

alter table public.sybil_v2_watch_followup_observations
  drop constraint if exists
    sybil_v2_watch_followup_observations_revision_horizon_key;

alter table public.sybil_v2_watch_followup_observations
  add constraint sybil_v2_watch_followup_observations_revision_horizon_key
  unique(invite_code, assessment_revision, horizon_hours);

create or replace view public.operator_sybil_v2_watch_followup_due
with (security_invoker = true)
as
select
  a.invite_code,
  a.network,
  lower(i.inviter_wallet) as inviter_wallet,
  lower(i.invitee_wallet) as subject_wallet,
  a.updated_at as watch_started_at,
  h.horizon_hours,
  a.updated_at + make_interval(hours => h.horizon_hours) as due_at,
  greatest(
    coalesce(
      last_observation.last_scan_to_block + 1,
      greatest(
        coalesce(
          a.evidence_cutoff_block,
          i.vote_completed_block,
          i.activation_block,
          0
        ) + 1,
        0
      )
    ),
    0
  )::bigint as scan_from_block,
  a.revision as assessment_revision
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
left join lateral (
  select max(o.scan_to_block)::bigint as last_scan_to_block
  from public.sybil_v2_watch_followup_observations o
  where o.invite_code = a.invite_code
    and o.network = a.network
    and o.assessment_revision = a.revision
) last_observation on true
cross join lateral (
  select v.horizon_hours
  from (values (24),(168),(720)) as v(horizon_hours)
  where a.updated_at + make_interval(hours => v.horizon_hours) <= clock_timestamp()
    and not exists (
      select 1
      from public.sybil_v2_watch_followup_observations o
      where o.invite_code = a.invite_code
        and o.network = a.network
        and o.assessment_revision = a.revision
        and o.horizon_hours = v.horizon_hours
    )
  order by v.horizon_hours
  limit 1
) h
where public.sybil_v2_enforcement_enabled()
  and a.state = 'WATCH'
  and i.invitee_wallet is not null
  and i.inviter_wallet is not null
  and not public.is_sybil_v2_referral_invalidated(
    a.invite_code,
    a.network
  );

revoke all on public.operator_sybil_v2_watch_followup_due
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_watch_followup_due
  to service_role;

comment on view public.operator_sybil_v2_watch_followup_due is
  'Service-only scheduler for same-subject WATCH follow-up at 24h, 7d, and 30d, versioned by the current Sybil v2 assessment revision so a later WATCH revision receives a fresh follow-up schedule. Active historical BLACKLIST invalidations are excluded.';

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
  and a.source = 'OPERATOR'
  and i.reward_status = 'PAID'
  and not public.is_sybil_v2_referral_invalidated(
    a.invite_code,
    a.network
  );

revoke all on public.operator_sybil_v2_historical_watch_followups
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_historical_watch_followups
  to service_role;

comment on view public.operator_sybil_v2_historical_watch_followups is
  'Service-only historical paid OPERATOR WATCH follow-up list. Follow-up is automatic and remains scoped to the invitee wallet; inviter reward-recipient behavior is kept separate, and active historical BLACKLIST invalidations are excluded.';

commit;
