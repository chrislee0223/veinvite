begin;

-- Current automatic/manual RESTRICTED referrals must be treated as invalidated
-- by network and recognized-performance projections even when they were blocked
-- before payout and therefore never entered the historical operator invalidation
-- ledger. Paid historical rewards remain unchanged and continue to require the
-- explicit reversible historical invalidation ledger.

create or replace function public.is_sybil_v2_referral_invalidated(
  p_invite_code text,
  p_network text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_invite_code is null then false
    else
      exists (
        select 1
        from public.sybil_v2_referral_invalidations x
        where x.invite_code = upper(btrim(p_invite_code))
          and x.status = 'ACTIVE'
          and (
            p_network is null
            or x.network = lower(btrim(p_network))
          )
      )
      or exists (
        select 1
        from public.invitations i
        join public.sybil_v2_referral_assessments a
          on a.invite_code = i.invite_code
        join public.sybil_v2_wallet_restrictions r
          on r.network = a.network
         and r.wallet_address = lower(i.invitee_wallet)
         and r.related_invite_code = i.invite_code
         and r.status = 'ACTIVE'
         and r.resolved_at is null
        where i.invite_code = upper(btrim(p_invite_code))
          and a.state = 'RESTRICTED'
          and i.reward_status <> 'PAID'
          and not exists (
            select 1
            from public.reward_queue_entries q
            where q.invite_code = i.invite_code
              and q.status = 'ASSIGNED'
          )
          and (
            p_network is null
            or a.network = lower(btrim(p_network))
          )
      )
  end;
$$;

revoke all on function public.is_sybil_v2_referral_invalidated(text,text)
  from public, anon, authenticated;
grant execute on function public.is_sybil_v2_referral_invalidated(text,text)
  to service_role;

comment on function public.is_sybil_v2_referral_invalidated(text,text) is
  'Returns true for an explicit ACTIVE historical referral invalidation or for a current unpaid/unassigned referral whose Sybil v2 assessment is RESTRICTED and whose invitee has the matching ACTIVE wallet restriction. Paid historical rewards are never retroactively invalidated by the current-restriction branch.';

commit;
