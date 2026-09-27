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
    when x.status = 'ACTIVE' then 'BLOCKED'
    when a.state = 'RESTRICTED' then 'BLOCKED'
    when a.state in ('WATCH','HOLD','ANALYSIS_FAILED') then 'REVIEW'
    else i.sybil_status
  end::text as sybil_status,
  case
    when x.status = 'ACTIVE' then 'HIGH'
    when a.state in ('RESTRICTED','HOLD','ANALYSIS_FAILED') then 'HIGH'
    when a.state = 'WATCH' then 'MEDIUM'
    else i.sybil_risk_level
  end::text as sybil_risk_level,
  case
    when x.status = 'ACTIVE' then 100
    else coalesce(a.risk_score, i.sybil_risk_score)
  end::integer as sybil_risk_score,
  case
    when x.status = 'ACTIVE'
      then concat(
        'SYBIL_V2_HISTORICAL_BLACKLIST: ',
        coalesce(x.reason_codes::text, '[]')
      )
    when a.state in ('WATCH','HOLD','RESTRICTED','ANALYSIS_FAILED')
      then concat(
        'SYBIL_V2_',
        a.state,
        ': ',
        coalesce(a.reason_codes::text, '[]')
      )
    else i.sybil_reason
  end::text as sybil_reason,
  case
    when x.status = 'ACTIVE' then x.decided_at
    else coalesce(a.updated_at, i.sybil_checked_at)
  end as sybil_checked_at,
  greatest(
    i.updated_at,
    coalesce(a.updated_at, i.updated_at),
    coalesce(x.decided_at, i.updated_at)
  ) as updated_at
from public.invitations i
left join public.sybil_v2_referral_assessments a
  on a.invite_code = i.invite_code
 and a.network = i.activation_network
left join public.sybil_v2_referral_invalidations x
  on x.invite_code = i.invite_code
 and x.network = i.activation_network
 and x.status = 'ACTIVE'
where i.sybil_status in ('REVIEW','BLOCKED')
   or a.state in ('WATCH','HOLD','RESTRICTED','ANALYSIS_FAILED')
   or x.status = 'ACTIVE';

revoke all on table public.operator_sybil_watchlist
  from public, anon, authenticated;
grant select on table public.operator_sybil_watchlist
  to service_role;

comment on view public.operator_sybil_watchlist is
  'Service-only unified Sybil watchlist. Includes legacy REVIEW/BLOCKED, Sybil v2 WATCH/HOLD/RESTRICTED/ANALYSIS_FAILED, and active historical referral BLACKLIST invalidations. Historical invalidation takes precedence over assessment state.';

commit;
