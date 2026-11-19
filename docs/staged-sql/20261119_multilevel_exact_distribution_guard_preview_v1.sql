-- VeInvite EXACT-DISTRIBUTION GUARD. Preview-only; NEVER production.
-- Independent SQL verification of 70/15/8/5/2, direct onboarding exception,
-- qualified uplines, leader ties, individual event dust and empty-category 50:50.
-- This is accounting validation of a trusted review snapshot, not proof that
-- the upstream wallet graph or onchain identity verification is authentic.
BEGIN;

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_upline_snapshot_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE v_ancestor jsonb; v_wallet text; v_seen text[]; v_n int:=0;
BEGIN
  IF jsonb_typeof(NEW.evidence->'uplines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.evidence->'uplines')>5 THEN
    RAISE EXCEPTION 'MULTILEVEL_MISSING_REVIEWED_UPLINE_SNAPSHOT';
  END IF;
  v_seen:=ARRAY[NEW.actor_wallet];
  FOR v_ancestor IN SELECT value
    FROM jsonb_array_elements(NEW.evidence->'uplines')
  LOOP
    v_n:=v_n+1;
    v_wallet:=v_ancestor->>'wallet';
    IF jsonb_typeof(v_ancestor) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_ancestor->'active') IS DISTINCT FROM 'boolean'
      OR (v_wallet IS NOT NULL AND v_wallet !~ '^0x[0-9a-f]{40}$')
      OR (v_wallet IS NULL AND v_ancestor->>'active'<>'false')
      OR (v_wallet IS NOT NULL AND v_wallet=ANY(v_seen)) THEN
      RAISE EXCEPTION 'MULTILEVEL_INVALID_UPLINE_SNAPSHOT';
    END IF;
    IF v_wallet IS NOT NULL THEN v_seen:=array_append(v_seen,v_wallet); END IF;
  END LOOP;
  IF NEW.event_kind='ONBOARDING' AND
    (v_n=0 OR NEW.evidence#>>'{uplines,0,wallet}' IS NULL) THEN
    RAISE EXCEPTION 'MULTILEVEL_MISSING_DIRECT_INVITER';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER multilevel_upline_snapshot_guard
  BEFORE INSERT ON veinvite_multilevel_staging.verified_events
  FOR EACH ROW EXECUTE FUNCTION
    veinvite_multilevel_staging.guard_upline_snapshot_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_exact_settlement_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE v_cat text; v_kind text; v_budget numeric(78,0);
DECLARE v_n integer; v_per numeric(78,0); v_split numeric(78,0);
DECLARE v_expected numeric(78,0); v_remainder numeric(78,0);
DECLARE v_level integer; v_weights integer[]:=ARRAY[70,15,8,5,2];
DECLARE v_ev record; v_item jsonb; v_wallet text; v_active boolean;
DECLARE v_eligible boolean; v_expected_reason text;
DECLARE v_payout_n integer; v_payout_sum numeric(78,0); v_payout_wallet text;
DECLARE v_return_n integer; v_return_sum numeric(78,0); v_return_reason text;
DECLARE v_carry_sum numeric(78,0); v_empty numeric(78,0);
DECLARE v_high integer; v_winners integer; v_each numeric(78,0);
DECLARE v_winner record; v_leader_count integer; v_global_dust numeric(78,0);
BEGIN
  IF NEW.lifecycle<>'SEALED' OR OLD.lifecycle='SEALED' THEN RETURN NEW; END IF;
  IF OLD.lifecycle<>'FROZEN' THEN
    RAISE EXCEPTION 'MULTILEVEL_EXACT_GUARD_REQUIRES_FROZEN';
  END IF;

  FOR v_cat IN SELECT unnest(ARRAY['onboarding','active']) LOOP
    v_kind:=upper(v_cat);
    v_budget:=CASE WHEN v_cat='onboarding' THEN NEW.budget_onboarding_wei
       ELSE NEW.budget_active_wei END;
    SELECT count(*) INTO v_n
      FROM veinvite_multilevel_staging.verified_events
      WHERE network=NEW.network AND policy_version=NEW.policy_version
        AND round_id=NEW.round_id AND event_kind=v_kind;
    SELECT coalesce(sum(amount_wei),0) INTO v_carry_sum
      FROM veinvite_multilevel_staging.category_carry_forward
      WHERE network=NEW.network AND policy_version=NEW.policy_version
        AND source_round_id=NEW.round_id AND category=v_cat;
    SELECT count(*),coalesce(sum(amount_wei),0) INTO v_return_n,v_return_sum
      FROM veinvite_multilevel_staging.return_ledger
      WHERE network=NEW.network AND policy_version=NEW.policy_version
        AND source_round_id=NEW.round_id AND category=v_cat
        AND reason='EMPTY_CATEGORY_GENERAL';
    IF v_n=0 THEN
      v_empty:=floor(v_budget/2);
      IF v_carry_sum<>v_empty OR
        v_return_sum<>v_budget-v_empty OR
        v_return_n<>(CASE WHEN v_budget-v_empty>0 THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION 'MULTILEVEL_EXACT_EMPTY_CATEGORY_MISMATCH:%',v_cat;
      END IF;
    ELSE
      IF v_carry_sum<>0 OR v_return_n<>0 THEN
        RAISE EXCEPTION 'MULTILEVEL_EXACT_NONEMPTY_CARRY_MISMATCH:%',v_cat;
      END IF;
      v_per:=floor(v_budget/v_n);
      FOR v_ev IN SELECT event_key,evidence
        FROM veinvite_multilevel_staging.verified_events
        WHERE network=NEW.network AND policy_version=NEW.policy_version
          AND round_id=NEW.round_id AND event_kind=v_kind
      LOOP
        v_split:=0;
        FOR v_level IN 1..5 LOOP
          v_expected:=floor(v_per*v_weights[v_level]/100);
          v_split:=v_split+v_expected;
          v_item:=v_ev.evidence->'uplines'->(v_level-1);
          v_wallet:=v_item->>'wallet';
          v_active:=(v_item->>'active')::boolean;
          v_eligible:=v_wallet IS NOT NULL
            AND ((v_cat='onboarding' AND v_level=1) OR v_active IS TRUE);
          SELECT count(*),coalesce(sum(gross_wei),0),min(recipient_wallet)
            INTO v_payout_n,v_payout_sum,v_payout_wallet
          FROM veinvite_multilevel_staging.entitlements
          WHERE network=NEW.network AND policy_version=NEW.policy_version
            AND round_id=NEW.round_id AND category=v_cat
            AND event_key=v_ev.event_key AND level_no=v_level;
          SELECT count(*),coalesce(sum(amount_wei),0),min(reason)
            INTO v_return_n,v_return_sum,v_return_reason
          FROM veinvite_multilevel_staging.return_ledger
          WHERE network=NEW.network AND policy_version=NEW.policy_version
            AND source_round_id=NEW.round_id AND category=v_cat
            AND source_event_key=v_ev.event_key AND source_level_no=v_level
            AND reason IN ('MISSING_UPLINE','INACTIVE_UPLINE');
          IF v_expected=0 THEN
            IF v_payout_n<>0 OR v_return_n<>0 THEN
              RAISE EXCEPTION 'MULTILEVEL_EXACT_ZERO_SHARE_LEAK';
            END IF;
          ELSIF v_eligible THEN
            IF v_payout_n<>1 OR v_payout_sum<>v_expected
              OR v_payout_wallet<>v_wallet OR v_return_n<>0 THEN
              RAISE EXCEPTION 'MULTILEVEL_EXACT_RECIPIENT_OR_WEIGHT_MISMATCH:%:%',
                v_cat,v_level;
            END IF;
          ELSE
            v_expected_reason:=CASE WHEN v_wallet IS NULL
              THEN 'MISSING_UPLINE' ELSE 'INACTIVE_UPLINE' END;
            IF v_payout_n<>0 OR v_return_n<>1
              OR v_return_sum<>v_expected
              OR v_return_reason<>v_expected_reason THEN
              RAISE EXCEPTION 'MULTILEVEL_EXACT_MISSING_LEVEL_RETURN:%:%',
                v_cat,v_level;
            END IF;
          END IF;
        END LOOP;
        SELECT count(*),coalesce(sum(amount_wei),0)
          INTO v_return_n,v_return_sum
        FROM veinvite_multilevel_staging.return_ledger
        WHERE network=NEW.network AND policy_version=NEW.policy_version
          AND source_round_id=NEW.round_id AND category=v_cat
          AND source_event_key=v_ev.event_key AND source_level_no IS NULL
          AND reason='ROUNDING_DUST';
        IF v_return_n<>(CASE WHEN v_per-v_split>0 THEN 1 ELSE 0 END)
          OR v_return_sum<>v_per-v_split THEN
          RAISE EXCEPTION 'MULTILEVEL_EXACT_EVENT_DUST:%',v_cat;
        END IF;
      END LOOP;
      v_remainder:=v_budget-v_per*v_n;
      SELECT count(*),coalesce(sum(amount_wei),0)
        INTO v_return_n,v_return_sum
      FROM veinvite_multilevel_staging.return_ledger
      WHERE network=NEW.network AND policy_version=NEW.policy_version
        AND source_round_id=NEW.round_id AND category=v_cat
        AND source_event_key IS NULL AND source_level_no IS NULL
        AND reason='ROUNDING_DUST';
      IF v_return_n<>(CASE WHEN v_remainder>0 THEN 1 ELSE 0 END)
        OR v_return_sum<>v_remainder THEN
        RAISE EXCEPTION 'MULTILEVEL_EXACT_CATEGORY_DUST:%',v_cat;
      END IF;
    END IF;
  END LOOP;

  v_budget:=NEW.budget_leader_wei;
  SELECT count(*) INTO v_n
  FROM veinvite_multilevel_staging.verified_events
  WHERE network=NEW.network AND policy_version=NEW.policy_version
    AND round_id=NEW.round_id AND event_kind='ONBOARDING';
  SELECT coalesce(sum(amount_wei),0) INTO v_carry_sum
  FROM veinvite_multilevel_staging.category_carry_forward
  WHERE network=NEW.network AND policy_version=NEW.policy_version
    AND source_round_id=NEW.round_id AND category='leader';
  SELECT count(*),coalesce(sum(amount_wei),0) INTO v_return_n,v_return_sum
  FROM veinvite_multilevel_staging.return_ledger
  WHERE network=NEW.network AND policy_version=NEW.policy_version
    AND source_round_id=NEW.round_id AND category='leader'
    AND reason='EMPTY_CATEGORY_GENERAL';
  IF v_n=0 THEN
    v_empty:=floor(v_budget/2);
    IF v_carry_sum<>v_empty
      OR v_return_sum<>v_budget-v_empty
      OR v_return_n<>(CASE WHEN v_budget-v_empty>0 THEN 1 ELSE 0 END) THEN
      RAISE EXCEPTION 'MULTILEVEL_EXACT_EMPTY_LEADER';
    END IF;
  ELSE
    IF v_carry_sum<>0 OR v_return_n<>0 THEN
      RAISE EXCEPTION 'MULTILEVEL_EXACT_LEADER_CARRY';
    END IF;
    SELECT coalesce(max(n),0) INTO v_high FROM (
      SELECT count(*) AS n
      FROM veinvite_multilevel_staging.verified_events e
      WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
        AND e.round_id=NEW.round_id AND e.event_kind='ONBOARDING'
      GROUP BY e.evidence#>>'{uplines,0,wallet}'
    ) winners;
    SELECT count(*) INTO v_winners FROM (
      SELECT e.evidence#>>'{uplines,0,wallet}' AS w,count(*) AS n
      FROM veinvite_multilevel_staging.verified_events e
      WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
        AND e.round_id=NEW.round_id AND e.event_kind='ONBOARDING'
      GROUP BY 1
    ) grouped WHERE grouped.n=v_high;
    IF v_winners<1 THEN RAISE EXCEPTION 'MULTILEVEL_EXACT_NO_LEADER'; END IF;
    v_each:=floor(v_budget/v_winners);
    FOR v_winner IN
      SELECT wallet FROM (
        SELECT e.evidence#>>'{uplines,0,wallet}' AS wallet,
          count(*) AS n
        FROM veinvite_multilevel_staging.verified_events e
        WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
          AND e.round_id=NEW.round_id AND e.event_kind='ONBOARDING'
        GROUP BY 1
      ) winners WHERE n=v_high
    LOOP
      SELECT count(*),coalesce(sum(gross_wei),0) INTO v_payout_n,v_payout_sum
      FROM veinvite_multilevel_staging.entitlements
      WHERE network=NEW.network AND policy_version=NEW.policy_version
        AND round_id=NEW.round_id AND category='leader'
        AND event_key='direct-onboarding-leader' AND level_no=0
        AND recipient_wallet=v_winner.wallet;
      IF v_payout_n<>(CASE WHEN v_each>0 THEN 1 ELSE 0 END)
        OR v_payout_sum<>v_each THEN
        RAISE EXCEPTION 'MULTILEVEL_EXACT_LEADER_RECIPIENT_OR_AMOUNT';
      END IF;
    END LOOP;
    SELECT count(*) INTO v_leader_count
    FROM veinvite_multilevel_staging.entitlements
    WHERE network=NEW.network AND policy_version=NEW.policy_version
      AND round_id=NEW.round_id AND category='leader';
    IF v_leader_count<>(CASE WHEN v_each>0 THEN v_winners ELSE 0 END) THEN
      RAISE EXCEPTION 'MULTILEVEL_EXACT_EXTRA_LEADER_ENTITLEMENT';
    END IF;
    v_remainder:=v_budget-v_winners*v_each;
    SELECT count(*),coalesce(sum(amount_wei),0) INTO v_return_n,v_return_sum
    FROM veinvite_multilevel_staging.return_ledger
    WHERE network=NEW.network AND policy_version=NEW.policy_version
      AND source_round_id=NEW.round_id AND category='leader'
      AND reason='ROUNDING_DUST' AND source_event_key IS NULL;
    IF v_return_n<>(CASE WHEN v_remainder>0 THEN 1 ELSE 0 END)
      OR v_return_sum<>v_remainder THEN
      RAISE EXCEPTION 'MULTILEVEL_EXACT_LEADER_DUST';
    END IF;
  END IF;

  v_global_dust:=NEW.budget_dust_wei;
  SELECT count(*),coalesce(sum(amount_wei),0)
    INTO v_return_n,v_return_sum
  FROM veinvite_multilevel_staging.return_ledger
  WHERE network=NEW.network AND policy_version=NEW.policy_version
    AND source_round_id=NEW.round_id AND category='general';
  IF v_return_n<>(CASE WHEN v_global_dust>0 THEN 1 ELSE 0 END)
    OR v_return_sum<>v_global_dust THEN
    RAISE EXCEPTION 'MULTILEVEL_EXACT_GLOBAL_DUST';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER multilevel_round_seal_exact_distribution
  BEFORE UPDATE ON veinvite_multilevel_staging.round_books
  FOR EACH ROW EXECUTE FUNCTION
    veinvite_multilevel_staging.guard_exact_settlement_v1();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA veinvite_multilevel_staging
  FROM PUBLIC,anon,authenticated;
COMMIT;
