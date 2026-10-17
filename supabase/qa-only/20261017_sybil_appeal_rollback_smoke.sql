-- QA ONLY: synthetic owner appeal smoke test. Never apply this as a migration.
-- All synthetic cases are guaranteed rolled back via an exception subtransaction.
-- No PII, real wallets or paid rewards are involved.
DO $test$
DECLARE
  v_error text;
  v_result record;
BEGIN
  BEGIN
    INSERT INTO public.invitations
      (invite_code, inviter_wallet, invitee_wallet, status, activation_network)
    VALUES
      ('QA7TEST','0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','ACTIVATING','testnet'),
      ('QA7BLAK','0x3333333333333333333333333333333333333333','0x4444444444444444444444444444444444444444','CANCELLED','testnet');
    INSERT INTO public.sybil_v2_referral_assessments
      (invite_code,network,state,revision,policy_version,analyzer_version,
       reason_codes,evidence_summary,source)
    VALUES
      ('QA7TEST','testnet','HOLD',1,'qa-smoke','qa-smoke','["SYNTHETIC"]'::jsonb,'{}'::jsonb,'SYSTEM'),
      ('QA7BLAK','testnet','RESTRICTED',2,'qa-smoke','qa-smoke','["SYNTHETIC"]'::jsonb,'{}'::jsonb,'OPERATOR');
    INSERT INTO public.sybil_v2_wallet_restrictions
      (wallet_address,network,status,source,related_invite_code,reason_codes,evidence_summary)
    VALUES
      ('0x4444444444444444444444444444444444444444','testnet','ACTIVE','OPERATOR','QA7BLAK','["SYNTHETIC"]'::jsonb,'{}'::jsonb);

    IF NOT EXISTS (
      SELECT 1 FROM public.operator_sybil_v2_temporary_participation_holds
      WHERE related_invite_code='QA7TEST' AND restriction_kind='PRE_CLAIM_HOLD'
    ) THEN RAISE EXCEPTION 'HOLD_NOT_PRESENT'; END IF;

    SELECT * INTO v_result FROM public.submit_sybil_v2_appeal(
      'QA7TEST','testnet','0x2222222222222222222222222222222222222222',
      1,'OTHER','Valid QA test appeal, does not alter any rewards or a review verdict.'
    );
    IF NOT v_result.submitted OR v_result.already_submitted THEN
      RAISE EXCEPTION 'HOLD_FIRST_REQUEST_NOT_ACCEPTED';
    END IF;

    SELECT * INTO v_result FROM public.submit_sybil_v2_appeal(
      'QA7TEST','testnet','0x2222222222222222222222222222222222222222',
      1,'OTHER','Duplicate QA test appeal must be ignored by the unique key.'
    );
    IF v_result.submitted OR NOT v_result.already_submitted THEN
      RAISE EXCEPTION 'HOLD_DUPLICATE_NOT_REJECTED';
    END IF;

    SELECT * INTO v_result FROM public.submit_sybil_v2_appeal(
      'QA7BLAK','testnet','0x4444444444444444444444444444444444444444',
      2,'INCORRECT_IDENTITY_LINK','Valid synthetic restricted owner asks for another review.'
    );
    IF NOT v_result.submitted THEN RAISE EXCEPTION 'BLACKLIST_APPEAL_NOT_ACCEPTED'; END IF;

    BEGIN
      PERFORM * FROM public.submit_sybil_v2_appeal(
        'QA7BLAK','testnet','0x4444444444444444444444444444444444444444',
        1,'OTHER','Outdated revision must not create a review request.'
      );
      RAISE EXCEPTION 'STALE_REVISION_ACCEPTED';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
      IF v_error <> 'SYBIL_APPEAL_CASE_CHANGED' THEN RAISE EXCEPTION 'STALE_TEST_FAILED: %',v_error; END IF;
    END;
    BEGIN
      PERFORM * FROM public.submit_sybil_v2_appeal(
        'QA7BLAK','testnet','0x5555555555555555555555555555555555555555',
        2,'OTHER','Unrelated wallet must be unable to submit an appeal.'
      );
      RAISE EXCEPTION 'FOREIGN_WALLET_ACCEPTED';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
      IF v_error <> 'SYBIL_APPEAL_CASE_CHANGED' THEN RAISE EXCEPTION 'OWNER_TEST_FAILED: %',v_error; END IF;
    END;

    IF (SELECT COUNT(*) FROM public.sybil_v2_appeal_requests
        WHERE invite_code IN ('QA7TEST','QA7BLAK')) <> 2 THEN
      RAISE EXCEPTION 'APPEAL_COUNT_NOT_TWO';
    END IF;

    -- A rollback sentinel intentionally aborts all synthetic mutations.
    RAISE EXCEPTION 'ROLLBACK_ALL_SYNTHETIC_DATA';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF v_error <> 'ROLLBACK_ALL_SYNTHETIC_DATA' THEN
      RAISE EXCEPTION 'QA_APPEAL_E2E_FAILED: %',v_error;
    END IF;
  END;
END
$test$;
-- A clean result is 0/0 on an unused synthetic fixture.
SELECT
  (SELECT COUNT(*) FROM public.invitations WHERE invite_code IN ('QA7TEST','QA7BLAK')) AS synthetic_invitations_left,
  (SELECT COUNT(*) FROM public.sybil_v2_appeal_requests WHERE invite_code IN ('QA7TEST','QA7BLAK')) AS synthetic_appeals_left;
