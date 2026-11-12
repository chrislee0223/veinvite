-- STAGED OFF: equal settlement for verified final-vote completions in one VeBetterDAO round.
-- Review-only SQL in docs/staged-sql/. It is NOT in supabase/migrations and is NOT applied.
-- When final QA passes, create an official migration with the Supabase migration workflow.
-- Never activate before Preview database parity, full CI and pool/X/Claim regression.
-- Historical immutable reservations are NEVER recalculated.
CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_round_close_settings (
 id smallint PRIMARY KEY CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 first_vote_round_id bigint NOT NULL CHECK (first_vote_round_id>0),
 grace_hours integer NOT NULL DEFAULT 24 CHECK (grace_hours BETWEEN 1 AND 168),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 enabled_at timestamptz
);
INSERT INTO reward_admission_bridge.vote_round_close_settings(id,enabled,first_vote_round_id)
VALUES (1,false,125) ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON reward_admission_bridge.vote_round_close_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON reward_admission_bridge.vote_round_close_settings TO service_role;

CREATE OR REPLACE FUNCTION public.read_reward_vote_round_close_mode_v1(p_network text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $mode$
DECLARE v_cfg reward_admission_bridge.vote_round_close_settings%rowtype;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') THEN
   RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INVALID_NETWORK';
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_SETTINGS_MISSING'; END IF;
 RETURN jsonb_build_object('enabled',v_cfg.enabled,
   'firstVoteRoundId',v_cfg.first_vote_round_id,
   'graceHours',v_cfg.grace_hours,
   'policy','vote-round-close-equal-v1');
END;
$mode$;
REVOKE ALL ON FUNCTION public.read_reward_vote_round_close_mode_v1(text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_vote_round_close_mode_v1(text)
TO service_role;

-- Fail closed if an old worker attempts immediate single-recipient pricing
-- after new round-based mode is enabled. No historical rows are modified.
CREATE OR REPLACE FUNCTION public.guard_vote_round_close_single_reservation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $guard$
DECLARE v_cfg reward_admission_bridge.vote_round_close_settings%rowtype;
v_vote_round bigint;
BEGIN
 IF NEW.reservation_algorithm_version<>'shared-pool-v1'
    OR NEW.reserved_amount_wei IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN RETURN NEW; END IF;
 SELECT i.vote_round_id INTO v_vote_round FROM public.invitations i
  WHERE i.invite_code=NEW.invite_code AND i.activation_network=NEW.network;
 IF v_vote_round IS NULL OR v_vote_round<v_cfg.first_vote_round_id THEN
   RETURN NEW;
 END IF;
 IF coalesce(NEW.reservation_basis->>'roundClosePolicy','')<>'vote-round-close-equal-v1'
    OR coalesce(NEW.reservation_basis->>'voteRoundId','')<>v_vote_round::text THEN
   RAISE EXCEPTION 'VOTE_ROUND_CLOSE_LEGACY_SINGLE_WRITER_BLOCKED';
 END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.guard_vote_round_close_single_reservation_v1()
FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reward_queue_guard_vote_round_close_single_writer
BEFORE INSERT ON public.reward_queue_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_vote_round_close_single_reservation_v1();

-- Called by the existing reservation worker only after both code and DB gate
-- are enabled. The entire batch commits or rolls back as one transaction.
CREATE OR REPLACE FUNCTION public.commit_reward_vote_round_close_batch_v1(
 p_invite_code text,
 p_network text,
 p_observed_pool_balance_wei numeric,
 p_observed_at timestamptz,
 p_finalized_block bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','reward_admission_bridge'
AS $batch$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_cfg reward_admission_bridge.vote_round_close_settings%rowtype;
 v_xcfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_inv public.invitations%rowtype;
 v_vote_round bigint;
 v_allocation_close timestamptz;
 v_completed bigint;
 v_verified bigint;
 v_vote_proofs bigint;
 v_prior bigint;
 v_prior_own bigint;
 v_held_count bigint;
 v_fixed numeric(78,0);
 v_available numeric(78,0);
 v_quote numeric(78,0);
 v_before numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_out jsonb;
 v_count bigint:=0;
 v_row record;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1 THEN
   RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INVALID_INPUT';
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
     WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','SHARED_POOL_NOT_ACTIVE','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 IF EXISTS(SELECT 1 FROM public.reward_runtime_config r WHERE r.id=1
    AND (r.emergency_rewards_paused OR (p_network='mainnet' AND NOT r.mainnet_funded_rewards_enabled)))
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_PAUSED','reserved',false); END IF;

 SELECT * INTO v_inv FROM public.invitations i
  WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reason','INVITE_MISSING','reserved',false); END IF;
 v_vote_round:=v_inv.vote_round_id;
 IF v_vote_round IS NULL OR v_vote_round<v_cfg.first_vote_round_id THEN
   RETURN jsonb_build_object('mode','LEGACY','reserved',false);
 END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT','reserved',false);
 END IF;
 IF v_inv.vote_completed IS NOT TRUE THEN
   RETURN jsonb_build_object('mode','DEFER','reason','MISSION_NOT_FINISHED','reserved',false);
 END IF;

 -- An official allocation receipt for THIS COMPLETION round marks its end.
 -- No unobserved elapsed week is inferred from a wall-clock assumption.
 SELECT max(a.observed_at) INTO v_allocation_close
 FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=v_vote_round;
 IF v_allocation_close IS NULL OR
    clock_timestamp()<v_allocation_close+make_interval(hours=>v_cfg.grace_hours) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_OFFICIAL_ROUND_CLOSE',
     'voteRoundId',v_vote_round,'reserved',false);
 END IF;
 SELECT * INTO v_xcfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_xcfg.x_option_reserve_wei IS NULL
   OR v_xcfg.x_option_reserve_wei<0 THEN
   RAISE EXCEPTION 'VOTE_ROUND_X_RESERVE_UNAVAILABLE';
 END IF;

 -- Any existing reservation in this vote round must retain its original
 -- immutable amount: never mingle this new policy with legacy guarantees.
 SELECT count(*),count(*) FILTER (WHERE q.invite_code=v_code)
 INTO v_prior,v_prior_own
 FROM public.reward_queue_entries q
 JOIN public.invitations i ON i.invite_code=q.invite_code
 WHERE q.network=p_network AND i.vote_round_id=v_vote_round
   AND q.reserved_amount_wei IS NOT NULL AND q.status<>'CANCELLED';
 IF v_prior>0 THEN
   IF v_prior_own>0 THEN
     RETURN jsonb_build_object('mode','ALREADY_RESERVED','reason','IMMUTABLE_EXISTING',
       'reserved',true);
   END IF;
   RETURN jsonb_build_object('mode','BLOCKED','reason','MIXED_IMMUTABLE_ROUND',
     'reserved',false);
 END IF;

 -- Pending verified completions must never lose their equal share because
 -- Sybil/chain evidence sync lagged behind the first completed user.
 SELECT count(*) INTO v_completed FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED';
 IF v_completed=0 OR v_completed>=100 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','EMPTY_OR_UNBOUNDED_COMPLETIONS',
     'reserved',false);
 END IF;

 -- Vote completion must be proven on-chain IN the claimed final vote round,
 -- not only inferred from an app-side timestamp or original invite cohort.
 SELECT count(*) INTO v_vote_proofs FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED'
   AND EXISTS (
      SELECT 1 FROM public.invite_impact_events e
      WHERE e.invite_code=i.invite_code AND e.network=p_network
        AND e.event_type='ALLOCATION_VOTE' AND e.vote_round_id=v_vote_round
        AND e.block_number<=p_finalized_block);
 IF v_vote_proofs<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_FINAL_VOTE_PROOFS',
     'completed',v_completed,'proved',v_vote_proofs,'reserved',false);
 END IF;

 SELECT count(*) INTO v_verified
 FROM public.read_reward_reservation_candidates_v2(p_network,100) c
 JOIN public.invitations i ON i.invite_code=c.invite_code
 WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block;
 -- All entrants must have an unambiguous completion-round provenance.
 -- A pending Sybil or chain verification never gets silently priced as zero.
 IF v_verified<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_VERIFIED_COMPLETIONS',
     'completed',v_completed,'verified',v_verified,'reserved',false);
 END IF;

 v_fixed:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 IF v_fixed<0 OR v_fixed>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','FIXED_LIABILITY_UNDERFUNDED',
     'reserved',false);
 END IF;
 v_available:=p_observed_pool_balance_wei-v_fixed
   -v_verified*v_xcfg.x_option_reserve_wei;
 IF v_available<=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_SPENDABLE_POOL','reserved',false);
 END IF;
 v_quote:=floor(v_available/v_verified);
 IF v_quote<v_xcfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reason','REWARD_UNDER_MINIMUM','reserved',false);
 END IF;

 FOR v_row IN
   SELECT c.invite_code,i.reward_cohort_round_id,
          i.reward_funding_allocation_receipt_id
   FROM public.read_reward_reservation_candidates_v2(p_network,100) c
   JOIN public.invitations i ON i.invite_code=c.invite_code
   WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block
   ORDER BY c.completion_block,c.completion_tx_index,c.completion_clause_index,c.invite_code
 LOOP
   IF v_row.reward_cohort_round_id IS NULL OR
      v_row.reward_funding_allocation_receipt_id IS NULL THEN
     RAISE EXCEPTION 'VOTE_ROUND_COHORT_BINDING_MISSING';
   END IF;
   SELECT count(*) INTO v_held_count FROM reward_admission_bridge.holds h
   WHERE h.network=p_network AND h.invite_code=v_row.invite_code AND h.status='HELD';
   IF v_held_count>0 THEN RAISE EXCEPTION 'VOTE_ROUND_HELD_ENTRY_CONFLICT'; END IF;
   v_before:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
   v_cohort_reserved:=public.read_reward_cohort_committed_wei(p_network,v_app,
      v_row.reward_cohort_round_id,v_row.reward_funding_allocation_receipt_id);
   v_basis:=jsonb_build_object(
      'quoteKind','vote_round_close_equal_v1',
      'poolPolicy','shared-pool-v1',
      'roundClosePolicy','vote-round-close-equal-v1',
      'voteRoundId',v_vote_round::text,
      'batchVerifiedCount',v_verified,
      'quoteWei',v_quote::text,
      'cohortReservedWei',v_cohort_reserved::text,
      'fundingAllocationReceiptId',v_row.reward_funding_allocation_receipt_id::text,
      'rewardCohortRoundId',v_row.reward_cohort_round_id::text,
      'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
      'reservedBeforeWei',v_before::text,
      'xOptionReservedPerEligibleWei',v_xcfg.x_option_reserve_wei::text,
      'officialCloseObservedAt',v_allocation_close,
      'observationAt',p_observed_at);
   v_out:=public.commit_reward_reservation(
      v_row.invite_code,p_network,p_observed_pool_balance_wei,
      v_before,v_quote,'shared-pool-v1',null,p_finalized_block,v_basis);
   IF v_out IS NULL OR coalesce((v_out->>'reserved')::boolean,false) IS NOT TRUE THEN
     -- Transaction abort means no participant receives a partial quote.
     RAISE EXCEPTION 'VOTE_ROUND_CLOSE_ATOMIC_RESERVATION_FAILED:%',
       coalesce(v_out->>'reason','UNKNOWN');
   END IF;
   v_count:=v_count+1;
 END LOOP;
 IF v_count<>v_verified THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INCOMPLETE_BATCH'; END IF;
 RETURN jsonb_build_object('mode','ROUND_BATCH_RESERVED','reserved',true,
   'count',v_count,'voteRoundId',v_vote_round,'amountWei',v_quote::text);
END;
$batch$;
REVOKE ALL ON FUNCTION public.commit_reward_vote_round_close_batch_v1(
text,text,numeric,timestamptz,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reward_vote_round_close_batch_v1(
text,text,numeric,timestamptz,bigint) TO service_role;
