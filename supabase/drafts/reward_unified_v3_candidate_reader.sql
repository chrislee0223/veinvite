-- PROPOSAL / NOT AN APPLIED MIGRATION.
-- READ-ONLY v3 settlement candidate reader for sandbox/preview validation only.
-- This private function grants NO execution to app or public roles.
-- Caller MUST run against one finalized cutoff, then transactionally lock,
-- recount and commit all candidates in a separate authenticated writer.
-- Do not use old original-cohort binding: a previously incomplete legitimate
-- referral is eligible at the round when it finally completes and clears Sybil.
--
-- This deliberately tracks the canonical old reward reservation eligibility
-- evidence but does NOT use its 100-recipient limit and refuses to silently
-- include any old queue, old settled or on-chain funded referral.
begin;

create or replace function reward_unified_v3.read_candidates_v1(
  p_network text,
  p_cutoff_finalized_block bigint
) returns table (
  invite_code text,
  recipient_wallet text,
  completion_finalized_block bigint,
  assessment_revision bigint,
  clearance_id uuid
)
language plpgsql
stable
set search_path = pg_catalog, public, reward_unified_v3
as $fn$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
begin
  if v_network not in ('mainnet','testnet','testnet-staging') or
     p_cutoff_finalized_block is null or p_cutoff_finalized_block < 1 then
    raise exception 'UNIFIED_V3_INVALID_CUTOFF';
  end if;
  return query
  select
    i.invite_code,
    lower(i.inviter_wallet) as recipient_wallet,
    completion.block_number::bigint as completion_finalized_block,
    a.revision::bigint as assessment_revision,
    c.id as clearance_id
  from public.invitations i
  inner join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
   and a.network=v_network
   and a.state='CLEAR'
  inner join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=v_network
   and c.assessment_revision=a.revision
   and c.verdict='CLEAR'
   and c.verdict=a.state
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code=i.invite_code
      and e.network=v_network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network=v_network
    and i.status='COMPLETED'
    and i.reward_status='ELIGIBLE'
    and i.reward_paid_at is null
    and i.reward_eligible_at is not null
    and i.sybil_status='CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.eligibility_check_id is not null
    and i.inviter_wallet ~ '^0x[0-9a-fA-F]{40}$'
    and i.invitee_wallet ~ '^0x[0-9a-fA-F]{40}$'
    and completion.block_number <= p_cutoff_finalized_block
    and coalesce(i.vote_completed_block,0) <= p_cutoff_finalized_block
    and not public.is_sybil_v2_referral_invalidated(
      i.invite_code,v_network
    )
    and not exists (
      select 1 from public.sybil_v2_wallet_restrictions r
      where r.network=v_network and r.status='ACTIVE'
        and r.wallet_address in (
          lower(i.inviter_wallet),lower(i.invitee_wallet)
        )
    )
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_payouts p
      where p.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code=i.invite_code
    )
    and not exists (
      select 1 from reward_unified_v3.entitlements e
      where e.network=v_network and e.invite_code=i.invite_code
    )
  order by completion.block_number,
           completion.tx_index,completion.clause_index,i.invite_code;
end;
$fn$;

revoke all on function reward_unified_v3.read_candidates_v1(text,bigint)
 from public,anon,authenticated,service_role;
commit;
