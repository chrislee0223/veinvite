-- Isolated v3 Claim request regression, no on-chain signatures.
\set ON_ERROR_STOP on

-- New Sybil security judgment after round settlement. The claim endpoint
-- must reject a newly blocked invite before any payout is signed.
create or replace function public.reward_x_promotion_security_clear_v1(
  p_invite_code text,p_network text
) returns boolean language sql stable as $fn$
select p_invite_code <> 'DEFGHJK'
$fn$;

do $$
declare v jsonb; v_again jsonb;
begin
  v:=reward_unified_v3.sandbox_request_claim_v1(
    'testnet','BCDEFGH','0x'||repeat('c',40),'first-secure-server-request'
  );
  if (v->>'accepted')::boolean is distinct from true
     or (v->>'idempotent')::boolean is distinct from false
     or (v->>'baseWei')::numeric<>140000000000000000000
     or (v->>'xHoldWei')::numeric<>10000000000000000000 then
    raise exception 'TEST_FAILED_FIRST_CLAIM %',v;
  end if;
  v_again:=reward_unified_v3.sandbox_request_claim_v1(
    'testnet','BCDEFGH','0x'||repeat('c',40),'retry-same-wallet-request'
  );
  if (v_again->>'idempotent')::boolean is distinct from true
     or v_again->>'claimRequestId'<>v->>'claimRequestId' then
    raise exception 'TEST_FAILED_IDEMPOTENT_CLAIM %',v_again;
  end if;
end $$;

do $$
declare rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_request_claim_v1(
      'testnet','BCDEFGH','0x'||repeat('d',40),'foreign-wallet-forbidden'
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_CLAIM_WRONG_WALLET%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'TEST_FAILED_CLAIM_WRONG_WALLET'; end if;
end $$;

do $$
declare rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_request_claim_v1(
      'mainnet','BCDEFGH','0x'||repeat('c',40),'mainnet-should-never-work'
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_SANDBOX_TESTNET_ONLY%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'TEST_FAILED_CLAIM_MAINNET_FIREWALL'; end if;
end $$;

do $$
declare rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_request_claim_v1(
      'testnet','DEFGHJK','0x'||repeat('c',40),'post-cutoff-sybil-blocked'
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_CLAIM_SYBIL_NOT_CLEAR%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'TEST_FAILED_CLAIM_SYBIL_RECHECK'; end if;
end $$;

-- A legacy queue appearing after settlement must NOT be paid twice.
insert into public.reward_queue_entries values ('CDEFGHJ');
do $$
declare rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_request_claim_v1(
      'testnet','CDEFGHJ','0x'||repeat('c',40),'legacy-collision-closed'
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_CLAIM_LEGACY_COLLISION%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'TEST_FAILED_CLAIM_LEGACY_COLLISION'; end if;
end $$;

do $$
declare v_count int; v_liability numeric;
begin
  select count(*) into v_count from reward_unified_v3.claim_requests;
  if v_count<>1 then raise exception 'TEST_FAILED_CLAIM_COUNT %',v_count; end if;
  select reward_unified_v3.read_outstanding_wei_v1(
    'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  ) into v_liability;
  if v_liability<>500000000000000000000 then
    raise exception 'TEST_FAILED_CLAIM_LIABILITY_SHOULD_STAY_RESERVED %',v_liability;
  end if;
end $$;

select 'UNIFIED_V3_CLAIM_IDEMPOTENCY_TESTS_PASSED' as result;
