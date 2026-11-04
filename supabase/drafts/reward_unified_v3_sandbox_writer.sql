-- PROPOSAL / NOT AN APPLIED MIGRATION.
-- Sandbox-only TESTNET settlement writer. INERT for mainnet and ordinary API.
-- This proves the atomic round commitment and old+v3 financial conservation.
-- Before production use: replace external pool snapshot arguments with
-- verifiable on-chain finalized-block proof and enforce shared Sybil locks,
-- existing legacy scheduler shutdown, and payout/claim integration.
begin;

create or replace function reward_unified_v3.sandbox_commit_round_v1(
  p_network text,
  p_app_id text,
  p_round bigint,
  p_cutoff_finalized_block bigint,
  p_pool_balance_wei numeric,
  p_expected_legacy_liability_wei numeric,
  p_expected_v3_liability_wei numeric
) returns jsonb
language plpgsql
set search_path = pg_catalog, public, reward_unified_v3
as $fn$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app text := lower(btrim(coalesce(p_app_id,'')));
  v_legacy numeric(78,0) := 0;
  v_existing_v3 numeric(78,0) := 0;
  v_free numeric(78,0) := 0;
  v_n bigint := 0;
  v_codes text[];
  v_locked_codes text[];
  v_recheck_codes text[];
  v_per numeric(78,0) := 0;
  v_rem numeric(78,0) := 0;
  v_total numeric(78,0);
  v_base numeric(78,0);
  v_x numeric(78,0);
  v_base_sum numeric(78,0) := 0;
  v_x_sum numeric(78,0) := 0;
  v_latest_round bigint;
  v_settlement_id bigint;
  v_candidate record;
  v_seen bigint;
  v_i integer := 0;
  v_digest text;
begin
  -- The prototype may NEVER execute against mainnet even if mistakenly
  -- included in a deployment. A genuine production writer requires
  -- independently audited chain/Sybil proof and a separate activation.
  if v_network <> 'testnet' then
    raise exception 'UNIFIED_V3_SANDBOX_TESTNET_ONLY';
  end if;
  if v_app <> '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
     or p_round is null or p_round < 1
     or p_cutoff_finalized_block is null or p_cutoff_finalized_block < 1 then
    raise exception 'UNIFIED_V3_INVALID_SETTLEMENT_SCOPE';
  end if;
  if p_pool_balance_wei is null or p_pool_balance_wei < 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei)
     or p_expected_legacy_liability_wei is null
     or p_expected_legacy_liability_wei < 0
     or p_expected_legacy_liability_wei <> trunc(p_expected_legacy_liability_wei)
     or p_expected_v3_liability_wei is null
     or p_expected_v3_liability_wei < 0
     or p_expected_v3_liability_wei <> trunc(p_expected_v3_liability_wei) then
    raise exception 'UNIFIED_V3_INVALID_POOL_SNAPSHOT';
  end if;

  -- The existing transaction lock order is: emergency gate -> reservation
  -- -> predictive cohort. Future v3 implementation must atomically retire
  -- the old writers under these same locks before any mainnet cutover.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_emergency_reward_pause',0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || v_network,0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_predictive_reward_' || v_network || '_' || v_app,0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_unified_v3_settlement_' || v_network,0)
  );

  select max(s.vebetter_round_id) into v_latest_round
  from reward_unified_v3.settlements s
  where s.network=v_network and s.app_id=v_app;
  if v_latest_round is not null and p_round<>v_latest_round+1 then
    raise exception 'UNIFIED_V3_ROUND_NOT_NEXT';
  end if;

  v_legacy:=public.read_outstanding_reward_liability(v_network,v_app)::numeric;
  v_existing_v3:=reward_unified_v3.read_outstanding_wei_v1(v_network,v_app);
  if v_legacy<>p_expected_legacy_liability_wei
     or v_existing_v3<>p_expected_v3_liability_wei then
    raise exception 'UNIFIED_V3_LIABILITY_SNAPSHOT_CHANGED';
  end if;
  if v_legacy+v_existing_v3>p_pool_balance_wei then
    raise exception 'UNIFIED_V3_LIABILITIES_EXCEED_POOL';
  end if;
  v_free:=p_pool_balance_wei-v_legacy-v_existing_v3;

  -- Lock every eligible invitation in canonical order; then recompute the
  -- full candidate set. Settled, previously paid or Sybil-invalidated
  -- referrals MUST NOT be opportunistically added after the cutoff snapshot.
  select array_agg(c.invite_code order by c.invite_code),count(*)
    into v_codes,v_n
  from reward_unified_v3.read_candidates_v1(
    v_network,p_cutoff_finalized_block
  ) c;
  select array_agg(i.invite_code order by i.invite_code)
    into v_locked_codes
  from public.invitations i
  where i.invite_code=any(v_codes)
  for update of i;
  select array_agg(c.invite_code order by c.invite_code)
    into v_recheck_codes
  from reward_unified_v3.read_candidates_v1(
    v_network,p_cutoff_finalized_block
  ) c;
  if coalesce(v_codes,'{}'::text[])<>coalesce(v_recheck_codes,'{}'::text[])
     or coalesce(v_codes,'{}'::text[])<>coalesce(v_locked_codes,'{}'::text[]) then
    raise exception 'UNIFIED_V3_CANDIDATES_CHANGED';
  end if;
  if v_n<>coalesce(cardinality(v_codes),0) or
     v_n<>coalesce((select count(distinct x) from unnest(v_codes) as x),0) then
    raise exception 'UNIFIED_V3_CANDIDATE_DUPLICATION';
  end if;
  if v_n>0 and v_free<v_n then
    raise exception 'UNIFIED_V3_INSUFFICIENT_ONE_WEI_PER_RECIPIENT';
  end if;
  if v_n>0 then
    v_per:=trunc(v_free/v_n);
    v_rem:=mod(v_free,v_n);
  end if;

  -- The digest binds testnet pool, pending liabilities, cutoff and ordered
  -- invite identities. Production must use a reviewed SHA-256 proof
  -- separately bound to chain-finalized pool/height before commit.
  v_digest:=md5(v_network||v_app||p_round::text||p_cutoff_finalized_block::text||
      p_pool_balance_wei::text||v_legacy::text||v_existing_v3::text||
      coalesce(array_to_string(v_codes,','),''))
    ||md5('unified-v3-sandbox-round-'||p_round::text||
      coalesce(array_to_string(v_codes,','),''));

  -- Calculate total commitments before inserting the immutable round row.
  v_base_sum:=0;
  v_x_sum:=0;
  for v_i in 1..v_n loop
    v_total:=v_per+case when v_i<=v_rem then 1 else 0 end;
    v_x:=case when v_total>10000000000000000000::numeric
      then 10000000000000000000::numeric else 0 end;
    v_base_sum:=v_base_sum+v_total-v_x;
    v_x_sum:=v_x_sum+v_x;
  end loop;
  if v_n>0 and v_base_sum+v_x_sum<>v_free then
    raise exception 'UNIFIED_V3_PRECOMMIT_CONSERVATION_FAILURE';
  end if;

  insert into reward_unified_v3.settlements(
    network,app_id,vebetter_round_id,cutoff_finalized_block,
    pool_snapshot_finalized_block,pool_balance_wei,existing_liability_wei,
    available_wei,recipient_count,base_total_wei,x_hold_total_wei,
    settled_total_wei,carry_forward_wei,calculation_policy,snapshot_digest
  ) values (
    v_network,v_app,p_round,p_cutoff_finalized_block,
    p_cutoff_finalized_block,p_pool_balance_wei,
    v_legacy+v_existing_v3,v_free,v_n::integer,
    v_base_sum,v_x_sum,v_base_sum+v_x_sum,
    v_free-v_base_sum-v_x_sum,
    'unified-round-close-v3-shadow',v_digest
  ) returning id into v_settlement_id;

  for v_i in 1..v_n loop
    select * into v_candidate
    from reward_unified_v3.read_candidates_v1(
      v_network,p_cutoff_finalized_block
    ) c where c.invite_code=v_codes[v_i];
    if not found then raise exception 'UNIFIED_V3_CANDIDATE_LOST'; end if;
    v_total:=v_per+case when v_i<=v_rem then 1 else 0 end;
    v_x:=case when v_total>10000000000000000000::numeric
      then 10000000000000000000::numeric else 0 end;
    v_base:=v_total-v_x;
    insert into reward_unified_v3.entitlements(
      settlement_id,network,app_id,invite_code,recipient_wallet,
      completion_finalized_block,sybil_assessment_revision,
      total_reward_wei,base_reward_wei,x_hold_wei
    ) values(
      v_settlement_id,v_network,v_app,v_candidate.invite_code,
      v_candidate.recipient_wallet,v_candidate.completion_finalized_block,
      v_candidate.assessment_revision::text,
      v_total,v_base,v_x
    );
  end loop;

  select count(*) into v_seen
  from reward_unified_v3.entitlements e
  where e.settlement_id=v_settlement_id;
  if v_seen<>v_n then
    raise exception 'UNIFIED_V3_COMMITTED_COUNT_MISMATCH';
  end if;

  return jsonb_build_object(
    'sandboxOnly',true,'settlementId',v_settlement_id,
    'network',v_network,'roundId',p_round,
    'recipients',v_n,'legacyLiabilityWei',v_legacy::text,
    'priorV3LiabilityWei',v_existing_v3::text,
    'baseWei',v_base_sum::text,'xHoldWei',v_x_sum::text,
    'settledWei',(v_base_sum+v_x_sum)::text,
    'carryForwardWei',(v_free-v_base_sum-v_x_sum)::text
  );
end;
$fn$;

revoke all on function reward_unified_v3.sandbox_commit_round_v1(
  text,text,bigint,bigint,numeric,numeric,numeric
) from public,anon,authenticated,service_role;

commit;
