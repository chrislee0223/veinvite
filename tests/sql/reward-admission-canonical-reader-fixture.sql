-- VeInvite Production canonical reader function definitions, 2026-11-04.
-- No Production user, wallet, invite, transaction, secrets or balances are copied.
-- Only function source is captured; ALL DATA BELOW IS FAKE. CI PostgreSQL 17 ONLY.
-- NOT a migration. NEVER run against Production.
\set ON_ERROR_STOP on
ALTER TABLE public.vebetter_round_allocations
 ADD COLUMN rewards_allocation_amount_wei numeric(78,0) NOT NULL DEFAULT 0;
UPDATE public.vebetter_round_allocations
 SET rewards_allocation_amount_wei=100*power(10::numeric,18) WHERE id=1001;
CREATE TABLE public.reward_queue_entries (
 invite_code text PRIMARY KEY,network text NOT NULL,
 reserved_amount_wei numeric(78,0),status text NOT NULL);
CREATE TABLE public.reward_rounds (
 id bigint PRIMARY KEY,network text NOT NULL,app_id text NOT NULL);
CREATE TABLE public.reward_payouts (
 invite_code text NOT NULL,status text NOT NULL,
 amount_wei numeric(78,0) NOT NULL,round_id bigint NOT NULL);
CREATE TABLE public.invitations (
 invite_code text PRIMARY KEY,reward_funding_allocation_receipt_id bigint,
 reward_cohort_round_id bigint);
CREATE TABLE public.reward_recovery_settlements (
 id bigint PRIMARY KEY,invite_code text NOT NULL,
 network text NOT NULL,offset_amount_wei numeric(78,0) NOT NULL);
CREATE TABLE public.reward_recovery_obligations (
 id bigint PRIMARY KEY,source_settlement_id bigint,status text);
CREATE TABLE public.reward_x_promotion_splits (
 id bigint PRIMARY KEY,mode text NOT NULL);
CREATE TABLE public.reward_x_promotion_obligations (
 id bigint PRIMARY KEY,network text NOT NULL,split_id bigint NOT NULL,
 promotion_amount_wei numeric(78,0) NOT NULL,financial_state text NOT NULL,
 source_reward_cohort_round_id bigint NOT NULL,
 source_allocation_receipt_id bigint NOT NULL);
CREATE TABLE public.reward_cohort_funding_adjustments (
 id bigint PRIMARY KEY,network text NOT NULL,app_id text NOT NULL,
 reward_cohort_round_id bigint NOT NULL,
 allocation_receipt_id bigint NOT NULL,amount_wei numeric(78,0) NOT NULL);
-- Other independent authorities intentionally STUBBED for fake data only.
CREATE OR REPLACE FUNCTION public.is_sybil_v2_referral_invalidated(text,text)
 RETURNS boolean LANGUAGE sql STABLE AS $fn$ SELECT false $fn$;
CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_cohort_net_flow_wei(
 text,text,bigint,bigint)
 RETURNS numeric LANGUAGE sql STABLE AS $fn$ SELECT 0::numeric $fn$;
INSERT INTO public.reward_rounds VALUES
 (11,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e');
INSERT INTO public.invitations VALUES
 ('LAB-UNPAID',1001,123),('LAB-PAID',1001,123),('LAB-RECOVERY',1001,123);
INSERT INTO public.reward_queue_entries VALUES
 ('LAB-UNPAID','mainnet',5*power(10::numeric,18),'AWAITING_CLAIM'),
 ('LAB-PAID','mainnet',3*power(10::numeric,18),'ASSIGNED');
INSERT INTO public.reward_payouts VALUES
 ('LAB-PAID','PAID',3*power(10::numeric,18),11),
 ('LAB-OLD-UNPAID','PENDING',7*power(10::numeric,18),11);
INSERT INTO public.reward_recovery_settlements VALUES
 (99,'LAB-RECOVERY','mainnet',2*power(10::numeric,18));
INSERT INTO public.reward_x_promotion_splits VALUES (1,'LIVE'),(2,'SHADOW');
INSERT INTO public.reward_x_promotion_obligations VALUES
 (1,'mainnet',1,10*power(10::numeric,18),'HELD',123,1001),
 (2,'mainnet',1,10*power(10::numeric,18),'PAID',123,1001),
 (3,'mainnet',1,30*power(10::numeric,18),'RELEASED',123,1001),
 (4,'mainnet',2,200*power(10::numeric,18),'HELD',123,1001);
-- Original, exact real read authorities follow; no changed payout logic.
-- read_outstanding_reward_liability / md5 d4cc74ac3f93baa2bbccf23dc4596049
CREATE OR REPLACE FUNCTION public.read_outstanding_reward_liability(p_network text, p_app_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app_id text := lower(btrim(coalesce(p_app_id,'')));
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_post_base_promotion numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if v_app_id<>v_veinvite_app_id then
    raise exception 'reward liability can only target the VeInvite app';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code=q.invite_code
        and paid.status='PAID'
    );

  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network
    and rr.app_id=v_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code=rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_post_base_promotion :=
    public.read_reward_x_promotion_post_base_liability_wei(
      v_network,
      v_app_id
    );

  if v_post_base_promotion<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_POST_BASE_LIABILITY';
  end if;

  return (
    v_reserved_existing +
    v_legacy_reserved +
    v_post_base_promotion
  )::text;
end;
$function$;

-- read_reward_cohort_committed_wei / md5 23bbbfadd10f61ccf012366eccd9a975
CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
  v_x_promotion_committed numeric(78,0) := 0;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id<1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_queue_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      p_network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_x_promotion_committed
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state in ('RESERVED','HELD','PAID');

  if v_x_promotion_committed<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_COHORT_COMMITMENT';
  end if;

  return
    v_queue_committed +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;

-- read_reward_cohort_effective_budget_wei / md5 35a41aa258eb697932baba494534b381
CREATE OR REPLACE FUNCTION public.read_reward_cohort_effective_budget_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_adjustment numeric(78,0) := 0;
  v_net_flow numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id
    and a.network = p_network
    and a.app_id = p_app_id;

  if not found
     or v_receipt.vebetter_round_id + 1 <> p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network = p_network
    and a.app_id = p_app_id
    and a.reward_cohort_round_id = p_reward_cohort_round_id
    and a.allocation_receipt_id = p_allocation_receipt_id;

  v_net_flow := public.read_reward_boost_reserve_cohort_net_flow_wei(
    p_network,
    p_app_id,
    p_reward_cohort_round_id,
    p_allocation_receipt_id
  );

  v_budget :=
    v_receipt.rewards_allocation_amount_wei +
    v_adjustment +
    v_net_flow;

  if v_budget < 0 then
    raise exception 'REWARD_COHORT_EFFECTIVE_BUDGET_NEGATIVE';
  end if;

  return v_budget;
end;
$function$;

-- read_reward_x_promotion_post_base_liability_wei / md5 3077ed71c200eb828a2e3e0249057478
CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_post_base_liability_wei(p_network text, p_app_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_amount numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;
  if v_app_id<>v_veinvite_app_id then
    raise exception 'REWARD_X_PROMOTION_APP_MISMATCH';
  end if;

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_amount
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=v_network
    and o.financial_state in ('RESERVED','HELD');

  return v_amount;
end;
$function$;

DO $verify$ BEGIN
IF md5(pg_get_functiondef('public.read_outstanding_reward_liability(text,text)'::regprocedure)) <> 'd4cc74ac3f93baa2bbccf23dc4596049' THEN RAISE EXCEPTION 'Canonical reader source altered: read_outstanding_reward_liability'; END IF;
IF md5(pg_get_functiondef('public.read_reward_cohort_committed_wei(text,text,bigint,bigint)'::regprocedure)) <> '23bbbfadd10f61ccf012366eccd9a975' THEN RAISE EXCEPTION 'Canonical reader source altered: read_reward_cohort_committed_wei'; END IF;
IF md5(pg_get_functiondef('public.read_reward_cohort_effective_budget_wei(text,text,bigint,bigint)'::regprocedure)) <> '35a41aa258eb697932baba494534b381' THEN RAISE EXCEPTION 'Canonical reader source altered: read_reward_cohort_effective_budget_wei'; END IF;
IF md5(pg_get_functiondef('public.read_reward_x_promotion_post_base_liability_wei(text,text)'::regprocedure)) <> '3077ed71c200eb828a2e3e0249057478' THEN RAISE EXCEPTION 'Canonical reader source altered: read_reward_x_promotion_post_base_liability_wei'; END IF;
END $verify$;
