-- Promote a paid CLEAR / later BLOCKED same-client link to an operator task
-- only when fresh HIGH independent evidence implicates the original rewarded
-- invitee. Shared browser or later misuse remains observable in immutable
-- restriction, identity and evidence records; it is not a manual HOLD.
-- No verdict, payout, decision or recovery ledger writes in this migration.
begin;

create or replace view public.operator_sybil_v2_paid_sibling_recheck_candidates
with (security_invoker = true) as
select
  p.activation_network as network,
  p.invite_code as paid_invite_code,
  b.invite_code as blocked_invite_code,
  lower(p.inviter_wallet) as inviter_wallet,
  lower(p.invitee_wallet) as paid_invitee_wallet,
  lower(b.invitee_wallet) as blocked_invitee_wallet,
  r.id as restriction_id,
  match.shared_client_id,
  p.reward_paid_at,
  r.imposed_at as blocked_at,
  corroboration.signal_code as corroborating_signal_code,
  corroboration.evidence_created_at as corroborating_evidence_at
from public.sybil_v2_wallet_restrictions r
join public.invitations b
  on b.invite_code = r.related_invite_code
 and b.activation_network = r.network
 and lower(b.invitee_wallet) = lower(r.wallet_address)
join public.invitations p
  on p.activation_network = b.activation_network
 and lower(p.inviter_wallet) = lower(b.inviter_wallet)
 and p.invite_code <> b.invite_code
join lateral (
  select min(a.client_id::text) as shared_client_id
  from public.security_client_wallet_observations a
  join public.security_client_wallet_observations c
    on c.client_id = a.client_id
   and c.wallet_address = lower(b.invitee_wallet)
  where a.wallet_address = lower(p.invitee_wallet)
) match on match.shared_client_id is not null
join lateral (
  -- Late, independently corroborated evidence on the *original paid invitee*.
  -- A later shared browser or the BLOCKED sibling's own signals are insufficient.
  select e.signal_code, e.created_at as evidence_created_at
  from public.sybil_v2_evidence_records e
  where e.network = p.activation_network
    and e.invite_code = p.invite_code
    and lower(e.subject_wallet) = lower(p.invitee_wallet)
    and e.strength = 'HIGH'
    and e.evidence_family in (
      'HISTORICAL_CONSOLIDATION',
      'HISTORICAL_REWARD',
      'CLUSTER_LINK',
      'MISSION_BEHAVIOR'
    )
    and e.created_at > greatest(
      coalesce(p.sybil_checked_at, '-infinity'::timestamptz),
      coalesce((select max(d.decided_at)
        from public.sybil_v2_paid_sibling_review_decisions d
        where d.network = p.activation_network
          and d.paid_invite_code = p.invite_code
          and d.decision = 'CLEAR'), '-infinity'::timestamptz)
    )
  order by e.created_at desc, e.id desc
  limit 1
) corroboration on true
where r.status = 'ACTIVE'
  and r.resolved_at is null
  and r.source in ('OPERATOR','SYSTEM')
  and b.sybil_status = 'BLOCKED'
  and p.sybil_status = 'CLEAR'
  and p.reward_status = 'PAID'
  and p.reward_paid_at is not null
  and r.imposed_at > p.reward_paid_at
  and not exists (
    select 1 from public.sybil_v2_referral_invalidations x
    where x.network = p.activation_network
      and x.invite_code = p.invite_code
      and x.status = 'ACTIVE'
  )
  and not exists (
    select 1 from public.sybil_v2_paid_sibling_review_decisions d
    where d.network = p.activation_network
      and d.paid_invite_code = p.invite_code
      and d.restriction_id = r.id
  );


comment on view public.operator_sybil_v2_paid_sibling_recheck_candidates is
 'Operator-only actionable paid-CLEAR sibling reviews: same inviter+client and a new HIGH non-client Sybil signal against the originally paid invitee. Later wallet abuse by itself remains observation only.';

commit;
