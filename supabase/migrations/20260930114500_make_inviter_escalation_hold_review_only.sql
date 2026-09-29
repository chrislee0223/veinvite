begin;

create or replace view public.operator_sybil_v2_temporary_participation_holds
with (security_invoker = true)
as
select
  ('preclaim:' || a.invite_code || ':invitee')::text as id,
  a.network,
  lower(i.invitee_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.invitee_wallet is not null

union all

select
  ('postpayout:' || r.invite_code || ':recipient')::text as id,
  r.network,
  lower(r.subject_wallet) as wallet_address,
  'POST_PAYOUT_HOLD'::text as restriction_kind,
  r.reason_codes,
  r.evidence_summary,
  r.invite_code as related_invite_code,
  r.updated_at as imposed_at
from public.sybil_v2_post_payout_reviews r
where public.sybil_v2_enforcement_enabled()
  and r.state = 'HOLD';

revoke all on public.operator_sybil_v2_temporary_participation_holds
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds
  to service_role;

comment on view public.operator_sybil_v2_temporary_participation_holds is
  'Service-only temporary participation block list. PRE_CLAIM HOLD pauses only the invitee under review and POST_PAYOUT HOLD pauses only the already-paid reward recipient. Inviter escalation HOLD is review-only and does not block normal invitations; only an explicit inviter RESTRICT creates an active wallet restriction. Past rewards are never changed.';

commit;
