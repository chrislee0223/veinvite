-- Isolated PostgreSQL smoke tests. No production Supabase credentials/data.
-- Run only AFTER the three reward_unified_v3 draft SQL files are loaded.
\set ON_ERROR_STOP on

create or replace function public.reward_x_promotion_security_clear_v1(
  p_invite_code text,p_network text
) returns boolean language sql stable as $$select true$$;

insert into reward_unified_v3.settlements (
 network,app_id,vebetter_round_id,cutoff_finalized_block,
 pool_snapshot_finalized_block,pool_balance_wei,existing_liability_wei,
 available_wei,recipient_count,base_total_wei,x_hold_total_wei,
 settled_total_wei,carry_forward_wei,calculation_policy,snapshot_digest
) values (
 'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,100,100,
 1000000000000000000000,0,1000000000000000000000,
 1,990000000000000000000,10000000000000000000,
 1000000000000000000000,0,
 'unified-round-close-v3-shadow',repeat('a',64)
);

insert into reward_unified_v3.entitlements (
 settlement_id,network,app_id,invite_code,recipient_wallet,
 completion_finalized_block,sybil_assessment_revision,
 total_reward_wei,base_reward_wei,x_hold_wei
)
select s.id,s.network,s.app_id,'ABCDEFG','0x'||repeat('b',40),
 100,'7',1000000000000000000000,990000000000000000000,
 10000000000000000000
from reward_unified_v3.settlements s where s.vebetter_round_id=123;

do $$
declare v numeric;
begin
 select reward_unified_v3.read_outstanding_wei_v1(
  'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
 ) into v;
 if v<>1000000000000000000000 then
   raise exception 'TEST_FAILED_OPENING_LIABILITY %',v;
 end if;
end $$;

-- A transfer without prior signed proof must fail closed.
do $$
declare v_rejected boolean:=false;
begin
  begin
    insert into reward_unified_v3.base_events(
      entitlement_id,network,event_type,amount_wei,reference
    ) select id,network,'PAID',base_reward_wei,'bad-paid-without-signature'
      from reward_unified_v3.entitlements where invite_code='ABCDEFG';
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_BASE_PAID_WITHOUT_SIGNING%' then raise; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'TEST_FAILED_UNSIGNED_BASE_PAID'; end if;
end $$;

insert into reward_unified_v3.base_events(
 entitlement_id,network,event_type,amount_wei,reference
) select id,network,'PAYOUT_SIGNED',base_reward_wei,'fake-testnet-base-signed'
  from reward_unified_v3.entitlements where invite_code='ABCDEFG';

-- Caller supplied timestamps must be ignored in financial event journal.
do $$
declare v_created timestamptz;
begin
 insert into reward_unified_v3.base_events(
   entitlement_id,network,event_type,amount_wei,reference,created_at
 ) select id,network,'PAID',base_reward_wei,'fake-testnet-base-paid',
   '2000-01-01'::timestamptz
   from reward_unified_v3.entitlements where invite_code='ABCDEFG';
 select b.created_at into v_created from reward_unified_v3.base_events b
   where b.event_type='PAID';
 if v_created < '2026-01-01'::timestamptz then
   raise exception 'TEST_FAILED_CLIENT_BACKDATED_PAYMENT';
 end if;
end $$;

do $$
declare v numeric;
begin
 select reward_unified_v3.read_outstanding_wei_v1(
   'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
 ) into v;
 if v<>10000000000000000000 then
    raise exception 'TEST_FAILED_X_HOLD_NOT_RETAINED_AFTER_BASE_PAID %',v;
 end if;
end $$;

insert into reward_unified_v3.x_events(
 entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'OFFER_OPENED',x_hold_wei,'test-offer'
  from reward_unified_v3.entitlements where invite_code='ABCDEFG';

insert into reward_unified_v3.x_events(
 entitlement_id,network,event_type,amount_wei,event_reference,
 x_post_created_at,x_submitted_at
) select e.id,e.network,'POST_VERIFIED',e.x_hold_wei,'test-valid-post',
   o.created_at,o.created_at
  from reward_unified_v3.entitlements e
  join reward_unified_v3.x_events o on o.entitlement_id=e.id
    and o.event_type='OFFER_OPENED'
 where e.invite_code='ABCDEFG';

do $$
declare v_rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.x_events(
   entitlement_id,network,event_type,amount_wei,event_reference
  ) select id,network,'FINAL_VERIFIED',x_hold_wei,'too-early-final-proof'
    from reward_unified_v3.entitlements where invite_code='ABCDEFG';
 exception when others then
  if sqlerrm not like '%UNIFIED_V3_X_24H_RETENTION_NOT_PROVEN%' then raise; end if;
  v_rejected:=true;
 end;
 if not v_rejected then raise exception 'TEST_FAILED_EARLY_X_FINAL_PROOF'; end if;
end $$;

-- Even if a user cancels immediately, no unverified early release.
do $$
declare v_rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.x_events(
    entitlement_id,network,event_type,amount_wei,event_reference
  ) select id,network,'RELEASED',x_hold_wei,'too-early-with-live-post'
    from reward_unified_v3.entitlements where invite_code='ABCDEFG';
 exception when others then
  if sqlerrm not like '%UNIFIED_V3_X_NOT_YET_RELEASABLE%' then raise; end if;
  v_rejected:=true;
 end;
 if not v_rejected then raise exception 'TEST_FAILED_X_PREMATURE_RELEASE'; end if;
end $$;

-- Certified deleted/invalid X proof is a genuine terminal failure.
insert into reward_unified_v3.x_events(
 entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'PROOF_REJECTED',x_hold_wei,'verified-delete-proof'
  from reward_unified_v3.entitlements where invite_code='ABCDEFG';

-- A post failing retention may now release once, never after signing.
insert into reward_unified_v3.x_events(
 entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'RELEASED',x_hold_wei,'expired-deleted-test'
  from reward_unified_v3.entitlements where invite_code='ABCDEFG';

do $$
declare v numeric;
begin
 select reward_unified_v3.read_outstanding_wei_v1(
  'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
 ) into v;
 if v<>0 then raise exception 'TEST_FAILED_RELEASE_NOT_REUSABLE %',v; end if;
end $$;

do $$
declare v_rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.x_events(
   entitlement_id,network,event_type,amount_wei,event_reference
  ) select id,network,'PAYOUT_SIGNED',x_hold_wei,'bad-post-release-sign'
    from reward_unified_v3.entitlements where invite_code='ABCDEFG';
 exception when others then
  if sqlerrm not like '%UNIFIED_V3_X_ALREADY_RELEASED%' then raise; end if;
  v_rejected:=true;
 end;
 if not v_rejected then raise exception 'TEST_FAILED_SIGN_AFTER_RELEASE'; end if;
end $$;

do $$
declare v_rejected boolean:=false;
begin
 begin
  update reward_unified_v3.entitlements set base_reward_wei=0
   where invite_code='ABCDEFG';
 exception when others then
  if sqlerrm not like '%UNIFIED_REWARD_V3_APPEND_ONLY%' then raise; end if;
  v_rejected:=true;
 end;
 if not v_rejected then raise exception 'TEST_FAILED_ENTITLEMENT_MUTATION'; end if;
end $$;

-- Existing 123 commitment cannot be reallocated by a second 123 settlement.
do $$
declare v_rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.settlements(
    network,app_id,vebetter_round_id,cutoff_finalized_block,
    pool_snapshot_finalized_block,pool_balance_wei,
    existing_liability_wei,available_wei,recipient_count,
    base_total_wei,x_hold_total_wei,settled_total_wei,
    carry_forward_wei,calculation_policy,snapshot_digest
  ) select network,app_id,vebetter_round_id,cutoff_finalized_block,
    pool_snapshot_finalized_block,pool_balance_wei,
    existing_liability_wei,available_wei,recipient_count,
    base_total_wei,x_hold_total_wei,settled_total_wei,
    carry_forward_wei,calculation_policy,snapshot_digest
    from reward_unified_v3.settlements where vebetter_round_id=123;
 exception when unique_violation then v_rejected:=true;
 end;
 if not v_rejected then raise exception 'TEST_FAILED_DUPLICATE_ROUND'; end if;
end $$;

-- A zero-recipient week preserves entire available balance.
insert into reward_unified_v3.settlements (
 network,app_id,vebetter_round_id,cutoff_finalized_block,
 pool_snapshot_finalized_block,pool_balance_wei,existing_liability_wei,
 available_wei,recipient_count,base_total_wei,x_hold_total_wei,
 settled_total_wei,carry_forward_wei,calculation_policy,snapshot_digest
) values (
 'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 124,101,101,
 10000000000000000000,0,10000000000000000000,
 0,0,0,0,10000000000000000000,
 'unified-round-close-v3-shadow',repeat('b',64)
);

do $$
begin
 if has_schema_privilege('anon','reward_unified_v3','USAGE')
    or has_table_privilege('authenticated','reward_unified_v3.entitlements','SELECT')
    or has_table_privilege('service_role','reward_unified_v3.x_events','INSERT') then
    raise exception 'TEST_FAILED_UNAUTHORIZED_LEDGER_ACCESS';
 end if;
end $$;

select 'UNIFIED_V3_POSTGRES_ISOLATED_TESTS_PASSED' as result;
