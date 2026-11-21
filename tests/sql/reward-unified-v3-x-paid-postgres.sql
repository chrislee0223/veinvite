-- Isolated sandbox: signed X payout is irrevocable after final verification.
-- Synthetic backdated proof events simulate 24h of elapsed wall time without
-- delaying CI. NO real X post, signer, payout, or Supabase database touched.
\set ON_ERROR_STOP on

-- Base paid at 140, X 10 must remain committed.
insert into reward_unified_v3.base_events(
  entitlement_id,network,event_type,amount_wei,reference
) select id,network,'PAYOUT_SIGNED',base_reward_wei,'sandbox-base-signed-B'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

insert into reward_unified_v3.base_events(
  entitlement_id,network,event_type,amount_wei,reference
) select id,network,'PAID',base_reward_wei,'sandbox-base-final-B'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

do $$
declare v_amount numeric;
begin
  select reward_unified_v3.read_outstanding_wei_v1(
    'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  ) into v_amount;
  if v_amount<>360000000000000000000 then
    raise exception 'TEST_FAILED_X_STILL_HELD_AFTER_BASE_PAID %',v_amount;
  end if;
end $$;

-- For this disposable CI database ONLY, insert historical verified events
-- with the event guard temporarily off so 24h can be simulated instantly.
-- Immutable history remains intact, no existing rows are updated/deleted.
alter table reward_unified_v3.x_events disable trigger unified_x_event_guard;

insert into reward_unified_v3.x_events(
  entitlement_id,network,event_type,amount_wei,event_reference,created_at
) select id,network,'OFFER_OPENED',x_hold_wei,'sandbox-X-offer-B',
  clock_timestamp() - interval '27 hours'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

insert into reward_unified_v3.x_events(
  entitlement_id,network,event_type,amount_wei,event_reference,
  created_at,x_post_created_at,x_submitted_at
) select id,network,'POST_VERIFIED',x_hold_wei,'sandbox-X-original-post-B',
  clock_timestamp() - interval '25 hours',
  clock_timestamp() - interval '26 hours',
  clock_timestamp() - interval '26 hours'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

alter table reward_unified_v3.x_events enable trigger unified_x_event_guard;

-- Post+submission were within the original 24h offer; proof has been
-- independently checked to persist 25h. Now final verification is allowed.
insert into reward_unified_v3.x_events(
  entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'FINAL_VERIFIED',x_hold_wei,'sandbox-X-final-proof-B'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

insert into reward_unified_v3.x_events(
  entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'PAYOUT_SIGNED',x_hold_wei,'sandbox-X-onchain-signature-B'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

-- A signed X cannot be given back to the pool on a late sweep.
do $$
declare v_rejected boolean:=false;
begin
  begin
    insert into reward_unified_v3.x_events(
      entitlement_id,network,event_type,amount_wei,event_reference
    ) select id,network,'RELEASED',x_hold_wei,'invalid-refund-after-sign'
    from reward_unified_v3.entitlements where invite_code='BCDEFGH';
  exception when others then
    if sqlerrm not like '%UNIFIED_V3_X_SIGNED_CANNOT_RELEASE%' then raise; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'TEST_FAILED_X_SIGNED_HOLD_CAN_RELEASE'; end if;
end $$;

do $$
declare v_amount numeric;
begin
  select reward_unified_v3.read_outstanding_wei_v1(
    'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  ) into v_amount;
  if v_amount<>360000000000000000000 then
    raise exception 'TEST_FAILED_SIGNED_X_HOLD_DISAPPEARED %',v_amount;
  end if;
end $$;

-- Only confirmed on-chain PAID can remove signed X liability.
insert into reward_unified_v3.x_events(
  entitlement_id,network,event_type,amount_wei,event_reference
) select id,network,'PAID',x_hold_wei,'sandbox-X-confirmed-B'
from reward_unified_v3.entitlements where invite_code='BCDEFGH';

do $$
declare v_amount numeric;
begin
  select reward_unified_v3.read_outstanding_wei_v1(
    'testnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  ) into v_amount;
  if v_amount<>350000000000000000000 then
    raise exception 'TEST_FAILED_X_PAID_NOT_SETTLED_ONCE %',v_amount;
  end if;
end $$;

do $$
declare v_rejected boolean:=false;
begin
  begin
    insert into reward_unified_v3.x_events(
      entitlement_id,network,event_type,amount_wei,event_reference
    ) select id,network,'PAID',x_hold_wei,'sandbox-X-confirmed-duplicate-B'
    from reward_unified_v3.entitlements where invite_code='BCDEFGH';
  exception when unique_violation then v_rejected:=true;
  end;
  if not v_rejected then raise exception 'TEST_FAILED_DUPLICATE_X_PAID'; end if;
end $$;

select 'UNIFIED_V3_SIGNED_X_ONCHAIN_RECONCILIATION_TEST_PASSED' as result;
