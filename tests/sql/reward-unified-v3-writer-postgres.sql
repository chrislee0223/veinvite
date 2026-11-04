-- Isolated-only v3 atomic writer / replay checks.
\set ON_ERROR_STOP on
create table public.sandbox_legacy_liability_state (value_wei numeric not null);
insert into public.sandbox_legacy_liability_state values (0);
create or replace function public.read_outstanding_reward_liability(
  p_network text,p_app_id text
) returns text
language sql stable as $fn$
select value_wei::text from public.sandbox_legacy_liability_state limit 1
$fn$;

-- The preceding candidate fixture intentionally made the first candidate's
-- clearance stale. Restore matching revision to test two eligible recipients.
update public.sybil_v2_referral_assessments
set revision=7 where invite_code='BCDEFGH';

-- Stale/changed legacy or v3 outstanding snapshot must fail closed.
do $$
declare v_rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_commit_round_v1(
      'testnet',
      '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      125,100,300000000000000000000,10000000000000000000,0
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_LIABILITY_SNAPSHOT_CHANGED%' then
      raise;
    end if;
    v_rejected:=true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAILED_LEGACY_OUTSTANDING_SNAPSHOT_NOT_CHECKED';
  end if;
end $$;

-- Testnet only: using mainnet must be rejected even from postgres superuser.
do $$
declare v_rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_commit_round_v1(
      'mainnet',
      '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      125,100,300000000000000000000,0,0
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_SANDBOX_TESTNET_ONLY%' then
      raise;
    end if;
    v_rejected:=true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAILED_SANDBOX_MAINNET_FIREWALL';
  end if;
end $$;

-- Two newly cleared referrals share a 300 B3TR spendable budget.
do $$
declare v jsonb;
begin
  v:=reward_unified_v3.sandbox_commit_round_v1(
    'testnet',
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
    125,100,300000000000000000000,0,0
  );
  if (v->>'recipients')::int<>2
     or (v->>'settledWei')::numeric<>300000000000000000000
     or (v->>'xHoldWei')::numeric<>20000000000000000000
     or (v->>'baseWei')::numeric<>280000000000000000000 then
    raise exception 'TEST_FAILED_ATOMIC_TWO_RECIPIENT_SPLIT %',v;
  end if;
end $$;

-- Stored entitlements are immutable, deterministic, and never promise +10.
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from reward_unified_v3.entitlements e
  where e.invite_code in ('BCDEFGH','CDEFGHJ')
    and e.total_reward_wei=150000000000000000000
    and e.base_reward_wei=140000000000000000000
    and e.x_hold_wei=10000000000000000000;
  if v_count<>2 then
    raise exception 'TEST_FAILED_V3_IN_TOTAL_X_ENTITLEMENTS %',v_count;
  end if;
end $$;

-- A second call with the identical round may not reassign the same money.
do $$
declare v_rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_commit_round_v1(
      'testnet',
      '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      125,100,300000000000000000000,0,300000000000000000000
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_ROUND_NOT_NEXT%' then raise; end if;
    v_rejected:=true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAILED_DUPLICATE_V3_ROUND';
  end if;
end $$;

-- An empty new week still protects already confirmed unsettled rewards,
-- and carries any truly free cash forward.
do $$
declare v jsonb;
begin
  v:=reward_unified_v3.sandbox_commit_round_v1(
    'testnet',
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
    126,100,400000000000000000000,0,300000000000000000000
  );
  if (v->>'recipients')::int<>0
      or (v->>'carryForwardWei')::numeric<>100000000000000000000 then
    raise exception 'TEST_FAILED_UNPAID_PROTECTION_AND_CARRY %',v;
  end if;
end $$;

-- The next week (cutoff block 110) accepts a legitimate late completer.
do $$
declare v jsonb;
begin
  v:=reward_unified_v3.sandbox_commit_round_v1(
    'testnet',
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
    127,110,500000000000000000000,0,300000000000000000000
  );
  if (v->>'recipients')::int<>1
      or (v->>'settledWei')::numeric<>200000000000000000000
      or (v->>'baseWei')::numeric<>190000000000000000000
      or (v->>'xHoldWei')::numeric<>10000000000000000000 then
    raise exception 'TEST_FAILED_NEXT_WEEK_LATE_COMPLETER %',v;
  end if;
end $$;

-- Underfunded physical pool cannot create a new promise.
do $$
declare v_rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_commit_round_v1(
      'testnet',
      '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      128,110,100000000000000000000,0,500000000000000000000
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_LIABILITIES_EXCEED_POOL%' then raise; end if;
    v_rejected:=true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAILED_OVERSPEND';
  end if;
end $$;

-- Simulate a new legacy claim: the caller's stale reserved snapshot fails.
update public.sandbox_legacy_liability_state
set value_wei=25000000000000000000;
do $$
declare v_rejected boolean:=false;
begin
  begin
    perform reward_unified_v3.sandbox_commit_round_v1(
      'testnet',
      '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
      128,110,525000000000000000000,0,500000000000000000000
    );
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_LIABILITY_SNAPSHOT_CHANGED%' then raise; end if;
    v_rejected:=true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAILED_OLD_CLAIM_RACE';
  end if;
end $$;

select 'UNIFIED_V3_ATOMIC_WRITER_TESTS_PASSED' as result;
