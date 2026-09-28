begin;

create or replace function public.reopen_unpaid_reward_on_sybil_v2_clearance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.sybil_v2_enforcement_enabled()
     or not exists (
       select 1
       from public.sybil_v2_referral_assessments a
       where a.invite_code=new.invite_code
         and a.network=new.network
         and a.revision=new.assessment_revision
         and a.state=new.verdict
         and a.state in ('CLEAR','WATCH')
     )
  then
    return new;
  end if;

  update public.reward_queue_entries q
  set
    sybil_clearance_id=new.id,
    status=case
      when q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold'
        then 'AWAITING_CLAIM'
      else q.status
    end,
    cancelled_at=case
      when q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold'
        then null
      else q.cancelled_at
    end,
    cancel_reason=case
      when q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold'
        then null
      else q.cancel_reason
    end,
    claim_requested_at=case
      when q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold'
        then null
      else q.claim_requested_at
    end,
    claim_requested_by_wallet=case
      when q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold'
        then null
      else q.claim_requested_by_wallet
    end
  where q.invite_code=new.invite_code
    and q.assigned_round_id is null
    and (
      q.status in ('AWAITING_CLAIM','QUEUED')
      or (q.status='CANCELLED' and q.cancel_reason='sybil_v2_review_hold')
    )
    and not exists (
      select 1 from public.reward_payouts p
      where p.invite_code=q.invite_code
    );

  return new;
end;
$$;

revoke all on function public.reopen_unpaid_reward_on_sybil_v2_clearance()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_clearance_reopen_unpaid_reward
  on public.sybil_v2_reward_clearances;
create trigger sybil_v2_clearance_reopen_unpaid_reward
after insert on public.sybil_v2_reward_clearances
for each row execute function public.reopen_unpaid_reward_on_sybil_v2_clearance();

commit;
