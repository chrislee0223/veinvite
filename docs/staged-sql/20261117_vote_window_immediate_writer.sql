-- STAGED ONLY. Run after the schema file; do NOT enable settings in a migration.
-- Uses the existing on-chain funding read, Sybil authority, canonical reward
-- liability reader, exactly-once queue and Claim transmitter.
CREATE OR REPLACE FUNCTION public.commit_reward_vote_window_immediate_v1(
 p_invite_code text,
 p_network text,
 p_observed_pool_balance_wei numeric,
 p_observed_at timestamptz,
 p_finalized_block bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $immediate$
DECLARE
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  code text:=upper(btrim(coalesce(p_invite_code,'')));
  cfg reward_admission_bridge.vote_round_close_settings%rowtype;
  mode reward_admission_bridge.vote_window_immediate_settings%rowtype;
  q reward_admission_bridge.vote_window_fixed_quotes%rowtype;
  xcfg reward_admission_bridge.elastic_settlement_settings%rowtype;
  inv public.invitations%rowtype;
  eligible_potential bigint;
  existing_legacy bigint;
  fixed numeric(78,0);
  amount numeric(78,0);
  before_wei numeric(78,0);
  cohort_reserved numeric(78,0);
  basis jsonb;
  result jsonb;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR code !~ '^[A-HJ-NP-Z2-9]{7}$'
   OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
   OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
   OR p_observed_at IS NULL OR
      p_observed_at<clock_timestamp()-interval '120 seconds' OR
      p_observed_at>clock_timestamp()+interval '10 seconds'
   OR p_finalized_block IS NULL OR p_finalized_block<1
 THEN RAISE EXCEPTION 'IMMEDIATE_WINDOW_INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 SELECT * INTO cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1 FOR SHARE;
 SELECT * INTO mode FROM reward_admission_bridge.vote_window_immediate_settings WHERE id=1 FOR SHARE;
 IF cfg.id IS NULL OR mode.id IS NULL OR NOT cfg.enabled OR cfg.paused OR NOT mode.enabled THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
   WHERE s.id=1 AND s.enabled)
   OR EXISTS(SELECT 1 FROM public.reward_runtime_config r WHERE r.id=1
    AND (r.emergency_rewards_paused OR (p_network='mainnet' AND NOT r.mainnet_funded_rewards_enabled)))
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_CLOSED','reserved',false); END IF;

 SELECT * INTO inv FROM public.invitations i
   WHERE i.invite_code=code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reason','INVITATION_MISSING','reserved',false); END IF;
 IF inv.vote_round_id IS NULL OR inv.vote_round_id<mode.first_vote_round_id
   OR inv.vote_round_id>mode.last_vote_round_id
   OR inv.reward_cohort_round_id IS NULL
   OR inv.reward_cohort_round_id<>inv.vote_round_id-1
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','OUTSIDE_CLOSED_ENTRY_COHORT','reserved',false); END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries qe
    WHERE qe.network=p_network AND qe.invite_code=code
      AND qe.reserved_amount_wei IS NOT NULL)
 THEN RETURN jsonb_build_object('mode','ALREADY_RESERVED','count',0,'reserved',true); END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.read_reward_vote_round_candidates_v1(p_network,inv.vote_round_id) c
  WHERE c.invite_code=code AND c.completion_block<=p_finalized_block)
 THEN RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_CANONICAL_FINAL_EVIDENCE','reserved',false); END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
   WHERE h.network=p_network AND h.invite_code=code AND h.status='HELD')
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT','reserved',false); END IF;

 -- The complete *previous* invite cohort is known when the next vote
 -- round starts. Do not count older idle missions, unopened slots or
 -- future participants; include eligible, not-yet-finished participants.
 SELECT count(*) INTO eligible_potential FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=inv.vote_round_id-1
   AND i.invitee_wallet IS NOT NULL AND i.eligibility_check_id IS NOT NULL
   AND i.status IN ('ACTIVATING','UNDER_REVIEW','COMPLETED')
   AND i.reward_status IN ('PENDING','ELIGIBLE')
   AND i.sybil_status<>'BLOCKED' AND i.ineligible_at IS NULL;
 IF eligible_potential<1 OR eligible_potential>5000 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','UNBOUNDED_ACTIVE_COHORT','reserved',false);
 END IF;
 SELECT count(*) INTO existing_legacy
 FROM public.reward_queue_entries qe
 JOIN public.invitations i ON i.invite_code=qe.invite_code
 WHERE qe.network=p_network AND i.vote_round_id=inv.vote_round_id
   AND qe.reserved_amount_wei IS NOT NULL AND qe.status<>'CANCELLED'
   AND coalesce(qe.reservation_basis->>'quoteKind','')<>'vote_window_immediate_v1';
 IF existing_legacy>0 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','MIXED_IMMUTABLE_QUOTE','reserved',false);
 END IF;
 SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
  WHERE x.network=p_network AND x.vote_round_id=inv.vote_round_id FOR UPDATE;
 IF NOT FOUND THEN
   SELECT * INTO xcfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
   IF xcfg.id IS NULL OR xcfg.x_option_reserve_wei IS NULL
      OR xcfg.x_option_reserve_wei<0 OR xcfg.min_real_reward_wei IS NULL
   THEN RAISE EXCEPTION 'IMMEDIATE_WINDOW_X_POLICY_MISSING'; END IF;
   fixed:=public.read_outstanding_reward_liability(p_network,app)::numeric;
   IF fixed<0 OR fixed>p_observed_pool_balance_wei THEN
     RETURN jsonb_build_object('mode','DEFER','reason','POOL_UNDERFUNDED','reserved',false);
   END IF;
   amount:=div(p_observed_pool_balance_wei-fixed
     -eligible_potential*xcfg.x_option_reserve_wei,
     eligible_potential::numeric);
   IF amount<xcfg.min_real_reward_wei THEN
     RETURN jsonb_build_object('mode','DEFER','reason','POOL_INSUFFICIENT','reserved',false);
   END IF;
   INSERT INTO reward_admission_bridge.vote_window_fixed_quotes(
     network,vote_round_id,source_cohort_round_id,participant_count,quote_wei,
     x_reserve_per_participant_wei,observed_pool_wei,fixed_outstanding_wei
   ) VALUES(p_network,inv.vote_round_id,inv.reward_cohort_round_id,
     eligible_potential,amount,xcfg.x_option_reserve_wei,
     p_observed_pool_balance_wei,fixed);
   SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
     WHERE x.network=p_network AND x.vote_round_id=inv.vote_round_id FOR UPDATE;
 END IF;
 IF q.source_cohort_round_id<>inv.reward_cohort_round_id
   OR eligible_potential>q.participant_count THEN
   RETURN jsonb_build_object('mode','DEFER','reason','COHORT_MEMBER_COUNT_CHANGED','reserved',false);
 END IF;

 before_wei:=public.read_outstanding_reward_liability(p_network,app)::numeric;
 cohort_reserved:=public.read_reward_cohort_committed_wei(p_network,app,
   inv.reward_cohort_round_id,inv.reward_funding_allocation_receipt_id);
 basis:=jsonb_build_object(
   'quoteKind','vote_window_immediate_v1',
   'poolPolicy','shared-pool-v1',
   'voteRoundId',inv.vote_round_id::text,
   'participantCount',q.participant_count::text,
   'rewardCohortRoundId',inv.reward_cohort_round_id::text,
   'fundingAllocationReceiptId',inv.reward_funding_allocation_receipt_id::text,
   'cohortReservedWei',cohort_reserved::text,
   'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
   'reservedBeforeWei',before_wei::text,
   'xOptionReservedPerEligibleWei',q.x_reserve_per_participant_wei::text,
   'quoteWei',q.quote_wei::text,
   'observationAt',p_observed_at);
 result:=public.commit_reward_reservation(code,p_network,p_observed_pool_balance_wei,
   before_wei,q.quote_wei,'shared-pool-v1',null,p_finalized_block,basis);
 IF result IS NULL OR coalesce((result->>'reserved')::boolean,false) IS NOT TRUE THEN
   RAISE EXCEPTION 'IMMEDIATE_WINDOW_ATOMIC_COMMIT_FAILED:%',
     coalesce(result->>'reason','UNKNOWN');
 END IF;
 RETURN jsonb_build_object('mode','IMMEDIATE_RESERVED','reserved',true,
   'count',1,'voteRoundId',inv.vote_round_id,'amountWei',q.quote_wei::text);
END;
$immediate$;
REVOKE ALL ON FUNCTION public.commit_reward_vote_window_immediate_v1(text,text,numeric,timestamptz,bigint)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reward_vote_window_immediate_v1(text,text,numeric,timestamptz,bigint)
TO service_role;
