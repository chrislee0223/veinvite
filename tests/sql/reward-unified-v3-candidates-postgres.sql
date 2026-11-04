-- Isolated PostgreSQL candidate-replay fixtures. NO production data.
\set ON_ERROR_STOP on

create table public.invitations (
 invite_code text primary key,
 activation_network text,
 status text,
 reward_status text,
 reward_paid_at timestamptz,
 reward_eligible_at timestamptz,
 sybil_status text,
 sybil_checked_at timestamptz,
 impact_sync_complete_at timestamptz,
 eligibility_check_id bigint,
 inviter_wallet text,
 invitee_wallet text,
 vote_completed_block bigint
);
create table public.sybil_v2_referral_assessments (
 invite_code text,network text,state text,revision bigint
);
create table public.sybil_v2_reward_clearances (
 id uuid,invite_code text,network text,assessment_revision bigint,verdict text
);
create table public.invite_impact_events (
 invite_code text,network text,event_type text,
 block_number bigint,tx_index integer,clause_index integer
);
create table public.sybil_v2_wallet_restrictions (
 network text,status text,wallet_address text
);
create table public.reward_queue_entries (invite_code text);
create table public.reward_payouts (invite_code text);
create table public.reward_recovery_settlements (invite_code text);
create table public.reward_reservation_legacy_exclusions (invite_code text);

create or replace function public.is_sybil_v2_referral_invalidated(
 p_invite_code text,p_network text
) returns boolean language sql stable as $$select false$$;

-- BCDEFGH and CDEFGHJ are eligible, including the historical unbound invite.
-- Other invitations are excluded due to late completion, missing matching
-- clearance, existing queue/payout, or a restricted wallet.
insert into public.invitations(
 invite_code,activation_network,status,reward_status,reward_eligible_at,
 sybil_status,sybil_checked_at,impact_sync_complete_at,
 eligibility_check_id,inviter_wallet,invitee_wallet,vote_completed_block
) select code,'testnet','COMPLETED','ELIGIBLE',now(),
 'CLEAR',now(),now(),123,
 '0x'||repeat('a',40),'0x'||repeat('b',40),block
from (values
 ('BCDEFGH',90),('CDEFGHJ',90),('DEFGHJK',105),
 ('EFGHJKL',90),('FGHJKLM',90),('GHJKLMN',90),
 ('HJKLMNP',90)
) as v(code,block);

insert into public.sybil_v2_referral_assessments
select invite_code,'testnet','CLEAR',7 from public.invitations;
insert into public.sybil_v2_reward_clearances
select gen_random_uuid(),invite_code,'testnet',7,'CLEAR'
from public.invitations;
insert into public.invite_impact_events
select invite_code,'testnet','ALLOCATION_VOTE',vote_completed_block,1,1
from public.invitations;
insert into public.reward_queue_entries values ('EFGHJKL');
insert into public.reward_payouts values ('GHJKLMN');
insert into public.reward_reservation_legacy_exclusions values ('FGHJKLM');
insert into public.sybil_v2_wallet_restrictions
 values ('testnet','ACTIVE','0x'||repeat('a',40));

-- Use unique wallet for all except the intentionally restricted invitation.
update public.invitations
set inviter_wallet='0x'||repeat('c',40)
where invite_code<>'HJKLMNP';

-- An old settled entitlement must not be re-sampled by v3.
-- The first ledger smoke test created an entitlement for ABCDEFG already.
-- CDEFGHJ intentionally has no original cohort binding at all in this stub.

do $$
declare v_codes text[];
begin
 select array_agg(c.invite_code order by c.invite_code) into v_codes
 from reward_unified_v3.read_candidates_v1('testnet',100) c;
 if v_codes is distinct from array['BCDEFGH','CDEFGHJ']::text[] then
   raise exception 'TEST_FAILED_CURRENT_AND_LATE_COMPLETION %',v_codes;
 end if;
end $$;

-- A completion after the finalized cutoff cannot enter an earlier payment.
do $$
declare v_count int;
begin
 select count(*) into v_count
 from reward_unified_v3.read_candidates_v1('testnet',110) c
 where c.invite_code='DEFGHJK';
 if v_count<>1 then raise exception 'TEST_FAILED_LATE_COMPLETION_CUTOFF'; end if;
end $$;

-- Assessment revision mismatch makes an otherwise completed user ineligible.
update public.sybil_v2_referral_assessments
set revision=8 where invite_code='BCDEFGH';
do $$
declare v_count int;
begin
 select count(*) into v_count
 from reward_unified_v3.read_candidates_v1('testnet',100) c
 where c.invite_code='BCDEFGH';
 if v_count<>0 then raise exception 'TEST_FAILED_STALE_SYBIL_CLEARANCE'; end if;
end $$;

select 'UNIFIED_V3_CANDIDATE_CUTOFF_TESTS_PASSED' as result;
