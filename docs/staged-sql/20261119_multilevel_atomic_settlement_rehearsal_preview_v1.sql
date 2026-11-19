-- VeInvite multilevel ATOMIC SETTLEMENT REHEARSAL, ISOLATED PREVIEW ONLY.
-- This function DOES NOT TRANSFER B3TR or create claim legs.
-- It must NEVER be installed to production or used as payout authority.
-- Requires earlier staged-sql scripts including 9 private tables.
BEGIN;

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.exact_wei_v1(
  p_value text, p_field text
) RETURNS numeric(78,0)
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog
AS $wei$
BEGIN
  IF p_value IS NULL OR p_value !~ '^(0|[1-9][0-9]*)$'
     OR length(p_value)>78 THEN
    RAISE EXCEPTION 'MULTILEVEL_BAD_WEI:%',p_field;
  END IF;
  RETURN p_value::numeric(78,0);
END;
$wei$;

CREATE UNIQUE INDEX IF NOT EXISTS multilevel_one_recipient_per_event_level
  ON veinvite_multilevel_staging.entitlements(
    network,policy_version,round_id,category,event_key,level_no
  );

-- The SQL transaction protects bookkeeping integrity, NOT upstream chain or
-- identity trust. The verified_events rows must be independently reviewed.
-- No payout signer, live wallet, claim leg or production API is connected.
CREATE OR REPLACE FUNCTION public.multilevel_preview_rehearse_settlement_v1(
  p_network text,
  p_round_id bigint,
  p_manifest jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $rehearsal$
DECLARE
  v_control text;
  v_book record;
  v_fingerprint text;
  v_participant numeric(78,0);
  v_prior_on numeric(78,0);
  v_prior_active numeric(78,0);
  v_prior_leader numeric(78,0);
  v_on numeric(78,0);
  v_active numeric(78,0);
  v_leader numeric(78,0);
  v_dust numeric(78,0);
  v_entitlement jsonb;
  v_return jsonb;
  v_event jsonb;
  v_category text;
  v_amount numeric(78,0);
  v_gross numeric(78,0);
  v_base numeric(78,0);
  v_x numeric(78,0);
  v_level integer;
  v_actor text;
  v_key text;
  v_carry numeric(78,0);
  v_total_claim numeric(78,0):=0;
  v_total_return numeric(78,0):=0;
  v_total_carry numeric(78,0):=0;
  v_count integer:=0;
  v_db_count integer:=0;
  v_expected_carry numeric(78,0);
BEGIN
  IF p_network NOT IN ('testnet','testnet-staging')
    OR p_round_id IS NULL OR p_round_id<2
    OR p_manifest IS NULL OR jsonb_typeof(p_manifest)<>'object'
    OR octet_length(p_manifest::text)>2000000 THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_PREVIEW_ONLY';
  END IF;
  IF (p_manifest->>'roundId') IS DISTINCT FROM p_round_id::text
    OR jsonb_typeof(p_manifest->'budgetByCategoryWei')<>'object'
    OR jsonb_typeof(p_manifest->'categoryCarryNextWei')<>'object'
    OR jsonb_typeof(p_manifest->'previousCategoryCarryWei')<>'object'
    OR jsonb_typeof(p_manifest->'qualifiedEvents')<>'array'
    OR jsonb_typeof(p_manifest->'entitlements')<>'array'
    OR jsonb_typeof(p_manifest->'generalReturnDetails')<>'array'
    OR jsonb_array_length(p_manifest->'qualifiedEvents')>10000
    OR jsonb_array_length(p_manifest->'entitlements')>10000
    OR jsonb_array_length(p_manifest->'generalReturnDetails')>30000 THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_BAD_MANIFEST_SHAPE';
  END IF;
  SELECT mode INTO v_control FROM veinvite_multilevel_staging.policy_control
    WHERE policy_version='multilevel-v1' FOR SHARE;
  IF v_control IS DISTINCT FROM 'STAGING_ONLY' THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_DISABLED';
  END IF;
  -- Prevent concurrent replays or double-inserts on the same round.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'multilevel-v1:' || p_network || ':' || p_round_id::text,0
  ));
  v_fingerprint:=encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex');
  SELECT lifecycle,input_fingerprint INTO v_book
  FROM veinvite_multilevel_staging.round_books
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_ROUND_NOT_CREATED';
  END IF;
  IF v_book.lifecycle='SEALED' THEN
    IF v_book.input_fingerprint=v_fingerprint THEN
      RETURN 'ALREADY_REHEARSED_NO_PAYOUT';
    END IF;
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_CONFLICTING_REPLAY';
  END IF;
  IF v_book.lifecycle<>'DRAFT' OR v_book.input_fingerprint IS NOT NULL THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_ROUND_NOT_DRAFT';
  END IF;

  v_participant:=veinvite_multilevel_staging.exact_wei_v1(
    p_manifest->>'participantPoolWei','participantPoolWei'
  );
  v_prior_on:=veinvite_multilevel_staging.exact_wei_v1(
    p_manifest->'previousCategoryCarryWei'->>'onboarding','priorOnboarding'
  );
  v_prior_active:=veinvite_multilevel_staging.exact_wei_v1(
    p_manifest->'previousCategoryCarryWei'->>'active','priorActive'
  );
  v_prior_leader:=veinvite_multilevel_staging.exact_wei_v1(
    p_manifest->'previousCategoryCarryWei'->>'leader','priorLeader'
  );
  -- A carry cannot be invented by the caller; it must exist in the old ledger.
  FOR v_category,v_carry IN
    SELECT x.category, x.amount FROM (VALUES
       ('onboarding',v_prior_on),('active',v_prior_active),('leader',v_prior_leader)
    ) AS x(category,amount)
  LOOP
    SELECT coalesce(sum(amount_wei),0) INTO v_expected_carry
      FROM veinvite_multilevel_staging.category_carry_forward
      WHERE network=p_network AND policy_version='multilevel-v1'
        AND destination_round_id=p_round_id AND category=v_category;
    IF v_expected_carry<>v_carry THEN
      RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_FABRICATED_CARRY:%',v_category;
    END IF;
  END LOOP;
  v_on:=floor(v_participant*60/100)+v_prior_on;
  v_active:=floor(v_participant*30/100)+v_prior_active;
  v_leader:=floor(v_participant*10/100)+v_prior_leader;
  v_dust:=v_participant-floor(v_participant*60/100)
                          -floor(v_participant*30/100)
                          -floor(v_participant*10/100);
  IF v_on<>veinvite_multilevel_staging.exact_wei_v1(
        p_manifest->'budgetByCategoryWei'->>'onboarding','onboardingBudget')
    OR v_active<>veinvite_multilevel_staging.exact_wei_v1(
        p_manifest->'budgetByCategoryWei'->>'active','activeBudget')
    OR v_leader<>veinvite_multilevel_staging.exact_wei_v1(
        p_manifest->'budgetByCategoryWei'->>'leader','leaderBudget') THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_BUDGET_SPLIT_MISMATCH';
  END IF;

  -- Require EXACT equality of the complete immutable verified event set.
  SELECT count(*) INTO v_db_count
    FROM veinvite_multilevel_staging.verified_events
    WHERE network=p_network AND policy_version='multilevel-v1'
      AND round_id=p_round_id;
  IF v_db_count<>jsonb_array_length(p_manifest->'qualifiedEvents') THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_EVENT_SET_COUNT_MISMATCH';
  END IF;
  FOR v_event IN SELECT value FROM jsonb_array_elements(
    p_manifest->'qualifiedEvents'
  )
  LOOP
    IF v_event->>'kind' NOT IN ('ONBOARDING','ACTIVE')
      OR (v_event->>'eventId') IS NULL
      OR (v_event->>'actorWallet') IS NULL
      OR (v_event->>'proofId') IS NULL THEN
      RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_EVENT_SHAPE';
    END IF;
    SELECT count(*) INTO v_count
      FROM veinvite_multilevel_staging.verified_events e
      WHERE e.network=p_network AND e.policy_version='multilevel-v1'
        AND e.round_id=p_round_id
        AND e.event_key=v_event->>'eventId'
        AND e.event_kind=v_event->>'kind'
        AND e.actor_wallet=v_event->>'actorWallet'
        AND e.identity_clearance_ref=v_event->>'proofId';
    IF v_count<>1 THEN RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_UNVERIFIED_EVENT'; END IF;
  END LOOP;

  UPDATE veinvite_multilevel_staging.round_books SET
    participant_pool_wei=v_participant,
    carry_onboarding_wei=v_prior_on,
    carry_active_wei=v_prior_active,
    carry_leader_wei=v_prior_leader,
    budget_onboarding_wei=v_on,
    budget_active_wei=v_active,
    budget_leader_wei=v_leader,
    budget_dust_wei=v_dust,
    input_fingerprint=v_fingerprint,
    lifecycle='FROZEN'
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id;

  FOR v_entitlement IN SELECT value FROM jsonb_array_elements(
    p_manifest->'entitlements'
  )
  LOOP
    v_gross:=veinvite_multilevel_staging.exact_wei_v1(
      v_entitlement->>'grossWei','entitlementGross'
    );
    v_base:=veinvite_multilevel_staging.exact_wei_v1(
      v_entitlement->>'baseClaimWei','entitlementBase'
    );
    v_x:=veinvite_multilevel_staging.exact_wei_v1(
      v_entitlement->>'xShareHeldWei','entitlementX'
    );
    v_level:=(v_entitlement->>'level')::integer;
    v_category:=v_entitlement->>'category';
    v_actor:=v_entitlement->>'recipientWallet';
    v_key:=v_entitlement->>'entitlementId';
    IF v_gross<=0 OR v_base+v_x<>v_gross OR v_x<>floor(v_gross/10)
      OR v_actor !~ '^0x[0-9a-f]{40}$'
      OR v_key IS DISTINCT FROM (
        p_round_id::text || ':' || v_category || ':' ||
        (v_entitlement->>'eventId') || ':' || v_level::text || ':' || v_actor
      ) THEN
      RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_ENTITLEMENT_INVALID';
    END IF;
    INSERT INTO veinvite_multilevel_staging.entitlements(
      entitlement_key,network,policy_version,round_id,event_key,category,
      recipient_wallet,level_no,gross_wei
    ) VALUES (
      v_key,p_network,'multilevel-v1',p_round_id,
      v_entitlement->>'eventId',v_category,v_actor,v_level,v_gross
    );
    v_total_claim:=v_total_claim+v_gross;
  END LOOP;

  FOR v_return IN SELECT value FROM jsonb_array_elements(
    p_manifest->'generalReturnDetails'
  )
  LOOP
    v_amount:=veinvite_multilevel_staging.exact_wei_v1(
      v_return->>'amountWei','returnAmount'
    );
    v_category:=v_return->>'category';
    v_level:=(v_return->>'level')::integer;
    v_key:=v_return->>'returnId';
    IF v_amount<=0 OR
       v_key IS DISTINCT FROM (
         p_round_id::text || ':' || v_category || ':' ||
         coalesce(v_return->>'eventId','round') || ':' ||
         v_level::text || ':' || (v_return->>'reason')
       ) THEN
      RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_RETURN_INVALID';
    END IF;
    INSERT INTO veinvite_multilevel_staging.return_ledger(
      return_key,network,policy_version,source_round_id,destination_round_id,
      reason,category,amount_wei,source_event_key,source_level_no
    ) VALUES (
      v_key,p_network,'multilevel-v1',p_round_id,p_round_id+1,
      v_return->>'reason',v_category,v_amount,
      v_return->>'eventId',
      CASE WHEN v_level>0 THEN v_level ELSE NULL END
    );
    v_total_return:=v_total_return+v_amount;
  END LOOP;

  FOR v_category IN SELECT unnest(ARRAY['onboarding','active','leader'])
  LOOP
    v_carry:=veinvite_multilevel_staging.exact_wei_v1(
      p_manifest->'categoryCarryNextWei'->>v_category,'carry:'||v_category
    );
    IF v_carry>0 THEN
      INSERT INTO veinvite_multilevel_staging.category_carry_forward(
        network,policy_version,source_round_id,destination_round_id,
        category,amount_wei
      ) VALUES(
        p_network,'multilevel-v1',p_round_id,p_round_id+1,
        v_category,v_carry
      );
    END IF;
    v_total_carry:=v_total_carry+v_carry;
  END LOOP;
  IF v_total_claim<>veinvite_multilevel_staging.exact_wei_v1(
        p_manifest->>'grossEntitlementsWei','grossEntitlementsWei')
    OR v_total_return<>veinvite_multilevel_staging.exact_wei_v1(
        p_manifest->>'generalReturnNextWei','generalReturnNextWei')
    OR v_total_claim+v_total_return+v_total_carry
        <>v_participant+v_prior_on+v_prior_active+v_prior_leader THEN
    RAISE EXCEPTION 'MULTILEVEL_REHEARSAL_TOTAL_RECONCILIATION_FAILED';
  END IF;
  -- Triggers independently check each 60/30/10 category conservation,
  -- not only the overall amount. Any error reverts ALL inserts/updates.
  UPDATE veinvite_multilevel_staging.round_books SET lifecycle='SEALED'
  WHERE network=p_network AND policy_version='multilevel-v1'
    AND round_id=p_round_id;

  -- Deliberately NO claim_legs, transfers, signing, reward funds or wallets.
  RETURN 'REHEARSAL_SEALED_NO_PAYOUT';
END;
$rehearsal$;

REVOKE ALL ON FUNCTION
  public.multilevel_preview_rehearse_settlement_v1(text,bigint,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.multilevel_preview_rehearse_settlement_v1(text,bigint,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION
  veinvite_multilevel_staging.exact_wei_v1(text,text)
  FROM PUBLIC,anon,authenticated;
COMMIT;
