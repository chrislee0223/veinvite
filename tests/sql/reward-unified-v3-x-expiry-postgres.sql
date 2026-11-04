-- Isolated synthetic no-post X expiry (24h + existing 15m grace).
-- No real user, X post, payments, chain transactions or production DB.
\set ON_ERROR_STOP on

-- A new test-only round with an extra non-conflicting invite.
insert into reward_unified_v3.settlements (
 network,app_id,vebetter_round_id,cutoff_finalized_block,
 pool_snapshot_finalized_block,pool_balance_wei,existing_liability_wei,
 available_wei,recipient_count,base_total_wei,x_hold_total_wei,
 settled_total_wei,carry_forward_wei,calculation_policy,snapshot_digest
) values (
 'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 129,120,120,
 50000000000000000000,0,50000000000000000000,
 1,40000000000000000000,10000000000000000000,
 50000000000000000000,0,
 'unified-round-close-v3-shadow',repeat('c',64)
);

insert into reward_unified_v3.entitlements (
 settlement_id,network,app_id,invite_code,recipient_wallet,
 completion_finalized_block,sybil_assessment_revision,
 total_reward_wei,base_reward_wei,x_hold_wei
) select s.id,s.network,s.app_id,'JKLMNPQ','0x'||repeat('d',40),
 120,'9',50000000000000000000,
 40000000000000000000,10000000000000000000
from reward_unified_v3.settlements s where s.vebetter_round_id=129;

insert into reward_unified_v3.base_events (
 entitlement_id,network,event_type,amount_wei,reference
) select id,network,'PAYOUT_SIGNED',base_reward_wei,'sandbox-nopost-base-signed'
from reward_unified_v3.entitlements where invite_code='JKLMNPQ';
insert into reward_unified_v3.base_events (
 entitlement_id,network,event_type,amount_wei,reference
) select id,network,'PAID',base_reward_wei,'sandbox-nopost-base-paid'
from reward_unified_v3.entitlements where invite_code='JKLMNPQ';

-- Sandbox clock fixture: opened 24h+14m ago (too early for expiry sweep).
alter table reward_unified_v3.x_events disable trigger unified_x_event_guard;
insert into reward_unified_v3.x_events (
 entitlement_id,network,event_type,amount_wei,event_reference,created_at
) select id,network,'OFFER_OPENED',x_hold_wei,'sandbox-no-post-offer',
  clock_timestamp()-interval '24 hours 14 minutes'
from reward_unified_v3.entitlements where invite_code='JKLMNPQ';
alter table reward_unified_v3.x_events enable trigger unified_x_event_guard;

do $$
declare rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.x_events(
    entitlement_id,network,event_type,amount_wei,event_reference
  ) select id,network,'RELEASED',x_hold_wei,'too-soon-24h14m'
    from reward_unified_v3.entitlements where invite_code='JKLMNPQ';
 exception when others then
  if sqlerrm not like '%UNIFIED_V3_X_NOT_YET_RELEASABLE%' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'TEST_FAILED_NO_POST_RELEASED_BEFORE_GRACE'; end if;
end $$;

-- Another synthetic offer has reached 24h+16m. Changing an immutable event
-- is forbidden in production; this fixture is used ONLY in throwaway CI.
alter table reward_unified_v3.x_events disable trigger unified_x_event_immutable;
update reward_unified_v3.x_events
set created_at=clock_timestamp()-interval '24 hours 16 minutes'
where event_type='OFFER_OPENED'
  and entitlement_id=(
    select id from reward_unified_v3.entitlements where invite_code='JKLMNPQ'
  );
alter table reward_unified_v3.x_events enable trigger unified_x_event_immutable;

insert into reward_unified_v3.x_events (
 entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'RELEASED',x_hold_wei,'expired-24h16m'
from reward_unified_v3.entitlements where invite_code='JKLMNPQ';

do $$
declare v_count int;
begin
 select count(*) into v_count from reward_unified_v3.x_events x
 join reward_unified_v3.entitlements e on e.id=x.entitlement_id
 where e.invite_code='JKLMNPQ' and x.event_type='RELEASED';
 if v_count<>1 then raise exception 'TEST_FAILED_NO_POST_EXPIRY_NOT_RELEASED'; end if;
end $$;

-- After release, all future X payout signing and post re-open attempts fail.
do $$
declare rejected boolean:=false;
begin
 begin
  insert into reward_unified_v3.x_events (
    entitlement_id,network,event_type,amount_wei,event_reference
  ) select id,network,'PAYOUT_SIGNED',x_hold_wei,'invalid-after-expiry'
  from reward_unified_v3.entitlements where invite_code='JKLMNPQ';
 exception when others then
  if sqlerrm not like '%UNIFIED_V3_X_ALREADY_RELEASED%' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'TEST_FAILED_X_PAID_AFTER_EXPIRY'; end if;
end $$;

select 'UNIFIED_V3_NO_POST_EXPIRED_X_HOLD_TEST_PASSED' as result;
