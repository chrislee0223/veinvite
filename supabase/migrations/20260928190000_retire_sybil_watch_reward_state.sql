begin;

-- Sybil v2.9 retires WATCH as a payable referral decision.
-- Historical WATCH assessment rows remain readable for audit/provenance, but
-- new reward authority must be backed by a current CLEAR assessment only.

alter table public.sybil_v2_reward_clearances
  drop constraint if exists sybil_v2_reward_clearances_clear_only_v29;

alter table public.sybil_v2_reward_clearances
  add constraint sybil_v2_reward_clearances_clear_only_v29
  check (verdict = 'CLEAR') not valid;

comment on constraint sybil_v2_reward_clearances_clear_only_v29
  on public.sybil_v2_reward_clearances is
  'Sybil v2.9: only CLEAR may create or update reward clearance. Historical WATCH rows remain unvalidated audit history.';

create or replace function public.enforce_sybil_v2_clear_only_queue_authority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status not in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
     or new.sybil_clearance_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.sybil_v2_reward_clearances c
    join public.sybil_v2_referral_assessments a
      on a.invite_code = c.invite_code
     and a.network = c.network
     and a.revision = c.assessment_revision
     and a.state = 'CLEAR'
    where c.id = new.sybil_clearance_id
      and c.invite_code = new.invite_code
      and c.network = new.network
      and c.verdict = 'CLEAR'
  ) then
    raise exception 'REWARD_QUEUE_SYBIL_V2_CLEAR_ONLY_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_sybil_v2_clear_only_queue_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists zzzz_reward_queue_sybil_v2_clear_only
  on public.reward_queue_entries;

create trigger zzzz_reward_queue_sybil_v2_clear_only
before insert or update of status, sybil_clearance_id
on public.reward_queue_entries
for each row
execute function public.enforce_sybil_v2_clear_only_queue_authority();

create or replace function public.read_reward_reservation_candidates_v2(
  p_network text,
  p_limit integer default 25
)
returns table(
  invite_code text,
  completion_block bigint,
  completion_tx_index integer,
  completion_clause_index integer,
  reward_cohort_round_id bigint,
  reward_funding_allocation_receipt_id bigint
)
language sql
stable
set search_path = pg_catalog, public
as $$
  with parameters as (
    select lower(btrim(p_network)) as network,
           greatest(1,least(coalesce(p_limit,25),100)) as row_limit
  )
  select i.invite_code, completion.block_number::bigint,
         completion.tx_index::integer, completion.clause_index::integer,
         i.reward_cohort_round_id, i.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = i.invite_code
   and c.network = p.network
   and c.verdict = 'CLEAR'
   and c.verdict = a.state
   and c.assessment_revision = a.revision
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code = i.invite_code and e.network = p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network = p.network
    and i.status = 'COMPLETED' and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null and i.sybil_status = 'CLEAR'
    and i.sybil_checked_at is not null and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (
        a.state = 'CLEAR'
        and c.id is not null
      )
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network = p.network
          and r.status = 'ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q where q.invite_code = i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x where x.invite_code = i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  limit (select row_limit from parameters);
$$;

create or replace function public.read_sybil_v2_cleared_unreserved_count(
  p_network text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
)
returns integer
language sql
stable security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from public.invitations i
  left join public.sybil_v2_referral_assessments a
    on a.invite_code = i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code = i.invite_code
   and c.network = lower(btrim(p_network))
   and c.assessment_revision = a.revision
   and c.verdict = 'CLEAR'
   and c.verdict = a.state
  where i.activation_network = lower(btrim(p_network))
    and i.reward_cohort_round_id = p_reward_cohort_round_id
    and i.reward_funding_allocation_receipt_id = p_allocation_receipt_id
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (
        a.state = 'CLEAR'
        and c.id is not null
      )
    )
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.reserved_amount_wei is not null
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network = i.activation_network
          and r.status = 'ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1
      from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    );
$$;

comment on function public.read_reward_reservation_candidates_v2(text,integer) is
  'Sybil v2.9 reward reservation candidates require a current CLEAR assessment and CLEAR clearance. WATCH is legacy audit-only.';

comment on function public.read_sybil_v2_cleared_unreserved_count(text,bigint,bigint) is
  'Sybil v2.9 forecast count includes only current CLEAR assessment/clearance referrals.';

commit;
