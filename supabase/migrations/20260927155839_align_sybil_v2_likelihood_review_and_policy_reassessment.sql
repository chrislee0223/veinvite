begin;

create or replace function public.enforce_same_security_client_block_policy()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.sybil_status = 'REVIEW'
     and new.sybil_source = 'SECURITY_CLIENT'
     and coalesce((new.identity_link_evidence ->> 'sameInviterClient')::boolean, false)
     and not coalesce((new.identity_link_evidence ->> 'operatorOverride')::boolean, false)
  then
    new.sybil_status := 'REVIEW';
    new.sybil_risk_level := 'HIGH';
    new.sybil_risk_score := greatest(coalesce(new.sybil_risk_score,0), 90);
    new.sybil_reason :=
      'Invitee and inviter were observed in the same VeInvite security client; additional review is required before restriction.';
    new.sybil_checked_at := clock_timestamp();
    new.sybil_source := 'SECURITY_CLIENT';
    if new.status <> 'CANCELLED' then
      new.status := 'UNDER_REVIEW';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_same_security_client_block_policy()
  from public, anon, authenticated;

create or replace view public.operator_sybil_v2_policy_reassessment_candidates
with (security_invoker = true)
as
select
  a.invite_code,
  a.network,
  a.policy_version,
  a.state,
  a.source,
  a.updated_at as priority_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
left join public.reward_queue_entries q
  on q.invite_code = a.invite_code
where a.source = 'SYSTEM'
  and a.state in ('CLEAR','WATCH')
  and i.status = 'COMPLETED'
  and i.reward_status = 'ELIGIBLE'
  and i.reward_eligible_at is not null
  and q.invite_code is null;

revoke all on table public.operator_sybil_v2_policy_reassessment_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_policy_reassessment_candidates
  to service_role;

comment on view public.operator_sybil_v2_policy_reassessment_candidates is
  'Service-only unreserved SYSTEM CLEAR/WATCH referrals eligible for policy-version reassessment. Runtime code compares policy_version with the current Sybil v2 policy version.';

commit;
