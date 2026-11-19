-- Private PREVIEW ONLY: cross-table conservation, immutable round evidence.
-- DO NOT execute in production. Apply AFTER ledger/integrity/carry previews.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS multilevel_first_onboarding_once_idx
  ON veinvite_multilevel_staging.verified_events(network,actor_wallet)
  WHERE event_kind='ONBOARDING';
CREATE UNIQUE INDEX IF NOT EXISTS multilevel_proof_fingerprint_unique_idx
  ON veinvite_multilevel_staging.verified_events(network,chain_proof_fingerprint);

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_new_verified_event_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_lifecycle text;
BEGIN
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books b
  WHERE b.network=NEW.network AND b.policy_version=NEW.policy_version
    AND b.round_id=NEW.round_id
  FOR SHARE;
  IF NOT FOUND OR v_lifecycle<>'DRAFT' THEN
    RAISE EXCEPTION 'MULTILEVEL_EVENT_ROUND_NOT_DRAFT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_event_round_gate
  BEFORE INSERT ON veinvite_multilevel_staging.verified_events
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_new_verified_event_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_new_entitlement_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_lifecycle text;
BEGIN
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books b
  WHERE b.network=NEW.network AND b.policy_version=NEW.policy_version
    AND b.round_id=NEW.round_id FOR SHARE;
  IF NOT FOUND OR v_lifecycle<>'FROZEN' THEN
    RAISE EXCEPTION 'MULTILEVEL_ENTITLEMENT_ROUND_NOT_FROZEN';
  END IF;
  IF NEW.category='leader' THEN
    IF NEW.event_key<>'direct-onboarding-leader' OR NEW.level_no<>0 THEN
      RAISE EXCEPTION 'MULTILEVEL_INVALID_LEADER_EVENT';
    END IF;
  ELSIF NOT EXISTS(
    SELECT 1 FROM veinvite_multilevel_staging.verified_events e
    WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
      AND e.round_id=NEW.round_id AND e.event_key=NEW.event_key
      AND e.event_kind=upper(NEW.category)
  ) THEN
    RAISE EXCEPTION 'MULTILEVEL_MISSING_VERIFIED_EVENT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_entitlement_round_gate
  BEFORE INSERT ON veinvite_multilevel_staging.entitlements
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_new_entitlement_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_new_carry_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_lifecycle text;
BEGIN
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books b
  WHERE b.network=NEW.network AND b.policy_version=NEW.policy_version
    AND b.round_id=NEW.source_round_id FOR SHARE;
  IF NOT FOUND OR v_lifecycle<>'FROZEN' THEN
    RAISE EXCEPTION 'MULTILEVEL_CARRY_ROUND_NOT_FROZEN';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_carry_round_gate
  BEFORE INSERT ON veinvite_multilevel_staging.category_carry_forward
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_new_carry_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_new_return_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_lifecycle text;
DECLARE v_category text;
BEGIN
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books b
  WHERE b.network=NEW.network AND b.policy_version=NEW.policy_version
    AND b.round_id=NEW.source_round_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MULTILEVEL_RETURN_ROUND_MISSING'; END IF;
  IF NEW.reason IN ('CLAIM_EXPIRED','X_EXPIRED') THEN
    IF v_lifecycle<>'SEALED' THEN
      RAISE EXCEPTION 'MULTILEVEL_LATE_RETURN_BEFORE_SEAL';
    END IF;
    SELECT category INTO v_category
    FROM veinvite_multilevel_staging.entitlements e
    WHERE e.entitlement_key=NEW.source_entitlement_key
      AND e.network=NEW.network AND e.policy_version=NEW.policy_version
      AND e.round_id=NEW.source_round_id;
    IF NOT FOUND OR v_category<>NEW.category THEN
      RAISE EXCEPTION 'MULTILEVEL_LATE_RETURN_ENTITLEMENT_MISMATCH';
    END IF;
  ELSIF v_lifecycle<>'FROZEN' THEN
    RAISE EXCEPTION 'MULTILEVEL_SETTLEMENT_RETURN_NOT_FROZEN';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_return_round_gate
  BEFORE INSERT ON veinvite_multilevel_staging.return_ledger
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_new_return_v1();

-- A round may only be SEALED if every Wei is accounted for in:
-- original gross entitlements + initial general returns + carry forward.
-- Claim/X expiries come AFTER seal and move existing liabilities to general,
-- so they are excluded from this initial conservation check.
CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_seal_conservation_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_category text;
DECLARE v_budget numeric(78,0);
DECLARE v_awarded numeric(78,0);
DECLARE v_returned numeric(78,0);
DECLARE v_carried numeric(78,0);
DECLARE v_general_dust numeric(78,0);
BEGIN
  IF NEW.lifecycle<>'SEALED' OR OLD.lifecycle='SEALED' THEN
    RETURN NEW;
  END IF;
  IF OLD.lifecycle<>'FROZEN' THEN
    RAISE EXCEPTION 'MULTILEVEL_ROUND_MUST_FREEZE_BEFORE_SEAL';
  END IF;
  FOR v_category IN SELECT unnest(ARRAY['onboarding','active','leader']) LOOP
    v_budget:=CASE v_category
      WHEN 'onboarding' THEN NEW.budget_onboarding_wei
      WHEN 'active' THEN NEW.budget_active_wei
      ELSE NEW.budget_leader_wei END;
    SELECT coalesce(sum(gross_wei),0) INTO v_awarded
      FROM veinvite_multilevel_staging.entitlements e
      WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
        AND e.round_id=NEW.round_id AND e.category=v_category;
    SELECT coalesce(sum(amount_wei),0) INTO v_returned
      FROM veinvite_multilevel_staging.return_ledger r
      WHERE r.network=NEW.network AND r.policy_version=NEW.policy_version
        AND r.source_round_id=NEW.round_id AND r.category=v_category
        AND r.reason NOT IN ('CLAIM_EXPIRED','X_EXPIRED');
    SELECT coalesce(sum(amount_wei),0) INTO v_carried
      FROM veinvite_multilevel_staging.category_carry_forward c
      WHERE c.network=NEW.network AND c.policy_version=NEW.policy_version
        AND c.source_round_id=NEW.round_id AND c.category=v_category;
    IF v_budget<>v_awarded+v_returned+v_carried THEN
      RAISE EXCEPTION 'MULTILEVEL_CATEGORY_BUDGET_MISMATCH:%',v_category;
    END IF;
  END LOOP;
  SELECT coalesce(sum(amount_wei),0) INTO v_general_dust
  FROM veinvite_multilevel_staging.return_ledger r
  WHERE r.network=NEW.network AND r.policy_version=NEW.policy_version
    AND r.source_round_id=NEW.round_id
    AND r.category='general' AND r.reason='ROUNDING_DUST';
  IF v_general_dust<>NEW.budget_dust_wei THEN
    RAISE EXCEPTION 'MULTILEVEL_INITIAL_BUDGET_DUST_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_round_seal_conservation
  BEFORE UPDATE ON veinvite_multilevel_staging.round_books
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_seal_conservation_v1();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA veinvite_multilevel_staging FROM PUBLIC,anon,authenticated;
COMMIT;
