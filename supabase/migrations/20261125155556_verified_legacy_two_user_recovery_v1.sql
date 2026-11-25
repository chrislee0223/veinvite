-- Operator-authorized one-time legacy correction. No change to general cancellation policy.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='25s';
CREATE TABLE reward_admission_bridge.legacy_invitation_recovery_audit_v1(
 invitation_id uuid PRIMARY KEY,invite_code text UNIQUE NOT NULL,
 decision text NOT NULL CHECK(decision IN('EXISTING_USER_CLOSED','VERIFIED_NEW_WINDOW_RESTART')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 invitation_before jsonb NOT NULL,exclusion_before jsonb NOT NULL,evidence jsonb NOT NULL
);
ALTER TABLE reward_admission_bridge.legacy_invitation_recovery_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reward_admission_bridge.legacy_invitation_recovery_audit_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.prevent_consumed_invitation_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF old.status <> 'CANCELLED'
     AND new.status = 'CANCELLED'
     AND old.invitee_wallet IS NOT NULL THEN
    IF NOT (
      -- Pre-existing reviewed Sybil-block cancellation pathway.
      (
        new.sybil_status = 'BLOCKED'
        AND new.sybil_checked_at IS NOT NULL
        AND nullif(btrim(new.sybil_reason), '') IS NOT NULL
        AND old.reward_status <> 'PAID'
        AND new.reward_status <> 'PAID'
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_payouts rp
          WHERE rp.invite_code = new.invite_code AND rp.status = 'PAID'
        )
      )
      OR
      -- One-off verified historical existing-user closure; restored before commit.
      (old.invite_code='NP5U8PX' AND old.status='ACTIVATING' AND old.reward_status='PENDING'
       AND old.referral_link_id IS NULL AND old.activation_block IS NULL
       AND old.activation_network IS NULL AND old.activated_at IS NULL AND old.eligibility_check_id IS NULL
       AND old.slot_released_at IS NOT NULL AND new.slot_released_at IS NOT DISTINCT FROM old.slot_released_at
       AND new.reward_status='FORFEITED' AND new.sybil_status=old.sybil_status
       AND EXISTS(SELECT 1 FROM public.eligibility_check_events e WHERE e.id=15 AND e.invite_code=old.invite_code
          AND e.wallet_address=lower(old.invitee_wallet) AND e.network='mainnet'
          AND e.outcome='EXISTING_VEBETTER_USER' AND e.entry_class='ACTIVE_EXISTING')
       AND EXISTS(SELECT 1 FROM public.reward_reservation_legacy_exclusions e WHERE e.invite_code=old.invite_code
          AND e.reason='pre_reservation_rollout_completed')
       AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=old.invite_code)
       AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=old.invite_code))
      OR
      -- New owner-authorized, unfinished v2 invitation release pathway.
      (
        old.referral_link_id IS NOT NULL
        AND old.status = 'ACTIVATING'
        AND new.inviter_released_at IS NOT NULL
        AND old.inviter_released_at IS NULL
        AND new.slot_released_at IS NOT NULL
        AND old.sybil_status NOT IN ('REVIEW', 'BLOCKED')
        AND new.sybil_status = old.sybil_status
        AND old.reward_status IN ('NONE','PENDING')
        AND (
          old.apps_completed < 3 OR NOT old.vot3_converted
          OR NOT old.vote_completed
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_queue_entries q
          WHERE q.invite_code = new.invite_code
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_payouts rp
          WHERE rp.invite_code = new.invite_code
        )
      )
    ) THEN
      RAISE EXCEPTION 'accepted invitation cannot be cancelled';
    END IF;
  END IF;
  RETURN new;
END;
$function$;
DO $repair$
DECLARE i public.invitations%rowtype; x public.reward_reservation_legacy_exclusions%rowtype;
 c text; owner text; newcheck bigint; n integer; paid0 bigint; total0 bigint; active0 bigint;
 restart_block constant bigint:=26508420; restart_at constant timestamptz:=to_timestamp(1795617030);
 receipt bigint; relationship_id uuid;
BEGIN
 SELECT count(*) INTO paid0 FROM public.invitations WHERE reward_status='PAID';
 SELECT count(*) INTO total0 FROM public.invitations;
 SELECT count(*) INTO active0 FROM reward_admission_bridge.mission_retry_attempts_v1 WHERE state='ACTIVE';
 IF (SELECT max(vebetter_round_id) FROM public.vebetter_round_allocations WHERE network='mainnet' AND app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e') IS DISTINCT FROM 125::bigint
 OR NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled AND two_round_policy_enabled)
 THEN RAISE EXCEPTION 'ROUND_OR_POLICY_CHANGED'; END IF;
 SELECT id INTO receipt FROM public.vebetter_round_allocations WHERE network='mainnet' AND vebetter_round_id=125 AND app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e' ORDER BY id DESC LIMIT 1;
 IF receipt IS NULL OR restart_block NOT BETWEEN 26488613 AND 26549092 OR restart_at>clock_timestamp() THEN RAISE EXCEPTION 'INVALID_RESTART_ANCHOR'; END IF;
 FOREACH c IN ARRAY ARRAY['NP5U8PX','5HXW4VP'] LOOP
  owner:=gen_random_uuid()::text;
  IF NOT public.try_acquire_operator_lock('invite_evidence_sync:'||c,owner,360) THEN RAISE EXCEPTION '% locked',c; END IF;
  SELECT * INTO i FROM public.invitations WHERE invite_code=c FOR UPDATE;
  IF NOT FOUND OR i.status<>'ACTIVATING' OR i.reward_status<>'PENDING' OR i.sybil_status<>'NOT_CHECKED' OR i.identity_link_status<>'UNKNOWN'
   OR i.referral_link_id IS NOT NULL OR i.invitee_wallet IS NULL OR i.activation_network IS NOT NULL OR i.activation_block IS NOT NULL OR i.activated_at IS NOT NULL
   OR i.eligibility_check_id IS NOT NULL OR i.ineligibility_check_id IS NOT NULL OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NULL OR i.inviter_released_at IS NOT NULL
   OR i.reward_cohort_round_id IS NOT NULL OR i.reward_funding_allocation_receipt_id IS NOT NULL OR i.apps_completed<>3 OR i.rewards_received<>3
   OR i.apps_completed_at IS NOT NULL OR i.apps_completed_block IS NOT NULL OR i.vote_completed OR i.vot3_converted OR i.impact_sync_complete_at IS NOT NULL OR i.impact_last_synced_block IS NOT NULL
  THEN RAISE EXCEPTION '% unexpected source',c; END IF;
  SELECT * INTO x FROM public.reward_reservation_legacy_exclusions WHERE invite_code=c FOR UPDATE;
  IF NOT FOUND OR x.reason<>'pre_reservation_rollout_completed' OR x.snapshot->>'status'<>'COMPLETED' THEN RAISE EXCEPTION '% exclusion changed',c; END IF;
  IF EXISTS(SELECT 1 FROM public.reward_payouts q WHERE q.invite_code=c)
   OR EXISTS(SELECT 1 FROM public.reward_receipts q WHERE q.invite_code=c)
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=c)
   OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements q WHERE q.invite_code=c)
   OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds q WHERE q.invite_code=c)
   OR EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a WHERE a.invitation_id=i.id)
   OR EXISTS(SELECT 1 FROM public.invite_impact_events e WHERE e.invite_code=c)
   OR EXISTS(SELECT 1 FROM public.sybil_v2_wallet_restrictions q WHERE q.network='mainnet' AND q.status='ACTIVE' AND q.wallet_address IN(lower(i.inviter_wallet),lower(i.invitee_wallet)))
   OR EXISTS(SELECT 1 FROM public.sybil_v2_referral_assessments q WHERE q.invite_code=c AND q.state IN('RESTRICTED','HOLD','WATCH','ANALYSIS_FAILED'))
   OR EXISTS(SELECT 1 FROM public.invitations j WHERE j.id<>i.id AND lower(j.invitee_wallet)=lower(i.invitee_wallet))
   THEN RAISE EXCEPTION '% protected financial or security evidence',c; END IF;
  IF c='NP5U8PX' THEN
   IF NOT EXISTS(SELECT 1 FROM public.eligibility_check_events e WHERE e.id=15 AND e.invite_code=c AND e.wallet_address=lower(i.invitee_wallet) AND e.network='mainnet' AND e.checked_block=25411118 AND e.outcome='EXISTING_VEBETTER_USER' AND e.entry_class='ACTIVE_EXISTING')
   OR EXISTS(SELECT 1 FROM public.qualified_referral_relationships q WHERE q.source_invitation_id=i.id) THEN RAISE EXCEPTION 'EXISTING_USER_EVIDENCE_MISSING'; END IF;
   INSERT INTO reward_admission_bridge.legacy_invitation_recovery_audit_v1(invitation_id,invite_code,decision,invitation_before,exclusion_before,evidence)
   VALUES(i.id,c,'EXISTING_USER_CLOSED',to_jsonb(i),to_jsonb(x),jsonb_build_object('eligibilityCheckId',15,'checkedBlock',25411118,'reason','ACTIVE_EXISTING','slotAlreadyReleased',true));
   UPDATE public.invitations SET status='CANCELLED',reward_status='FORFEITED' WHERE id=i.id RETURNING * INTO i;
   IF i.status<>'CANCELLED' OR i.reward_status<>'FORFEITED' OR i.sybil_status<>'NOT_CHECKED' OR i.slot_released_at IS NULL THEN RAISE EXCEPTION 'CLOSURE_POSTCONDITION'; END IF;
  ELSE
   IF i.id<>'3ee9725c-b264-4d99-8a67-62a3ffe11997'::uuid OR EXISTS(SELECT 1 FROM public.eligibility_check_events e WHERE e.invite_code=c)
   OR NOT EXISTS(SELECT 1 FROM public.qualified_referral_relationships q WHERE q.source_invitation_id=i.id AND q.resolved_entry_class='NEW' AND q.resolved_outcome='ELIGIBLE' AND q.relationship_effective_block=25411118 AND q.relationship_time_source='LEGACY_BOUNDED_CHECKPOINT' AND q.resolved_network='mainnet')
   OR EXISTS(SELECT 1 FROM public.invitations j WHERE j.id<>i.id AND lower(j.inviter_wallet)=lower(i.inviter_wallet) AND j.invite_slot=i.invite_slot AND (j.created_at>=i.slot_released_at OR j.status='PENDING_ACCEPTANCE' OR (j.status IN('ACTIVATING','UNDER_REVIEW','COMPLETED') AND j.eligibility_check_id IS NOT NULL AND j.activation_network IS NOT NULL AND j.sybil_status<>'BLOCKED' AND (j.status<>'COMPLETED' OR j.slot_released_at IS NULL))))
   THEN RAISE EXCEPTION 'RESTART_IDENTITY_OR_SLOT_CHANGED'; END IF;
   IF EXISTS(SELECT 1 FROM public.security_client_wallet_observations o JOIN public.security_client_wallet_observations b ON b.client_id=o.client_id JOIN public.invitations j ON lower(j.invitee_wallet)=o.wallet_address WHERE b.wallet_address=lower(i.invitee_wallet) AND j.id<>i.id AND j.reward_status<>'PAID' AND j.sybil_status='CLEAR')
   THEN RAISE EXCEPTION 'RELATED_IDENTITY_REVIEW_REQUIRED'; END IF;
   SELECT id INTO relationship_id FROM public.qualified_referral_relationships WHERE source_invitation_id=i.id;
   INSERT INTO reward_admission_bridge.legacy_invitation_recovery_audit_v1(invitation_id,invite_code,decision,invitation_before,exclusion_before,evidence)
   VALUES(i.id,c,'VERIFIED_NEW_WINDOW_RESTART',to_jsonb(i),to_jsonb(x),jsonb_build_object('legacyBoundedCheckpoint',25411118,'restartBlock',restart_block,'restartAt',restart_at,'scanFrom',25762841,'scanThrough',restart_block,'priorPositiveRewards',0,'priorVotes',0,'round',126,'originalActivationUnknown',true));
   INSERT INTO public.eligibility_check_events(invite_code,wallet_address,network,checked_block,outcome,entry_class,details)
   VALUES(c,lower(i.invitee_wallet),'mainnet',restart_block,'ELIGIBLE','NEW',jsonb_build_object('ruleVersion','entry-history-v3-positive-rewards-12-completed-rounds','entryClass','NEW','currentRoundId',126,'completedRoundIds',to_jsonb(array(select generate_series(114,125))),'dormancyRoundCount',12,'oldestCompletedRoundId',114,'newestCompletedRoundId',125,'dormancyStartBlock',25762841,'newestCompletedRoundEndBlock',26488611,'checkedThroughBlock',restart_block,'historyScanThroughBlock',restart_block,'priorPositiveRewardCount',0,'priorAllocationVoteCount',0,'ongoingRoundGuard',true,'legacyRecoveryKind','FINALIZED_NEW_WINDOW_RESTART_V1','originalActivationUnknown',true,'legacyBoundedCheckpoint',25411118)) RETURNING id INTO newcheck;
   UPDATE public.invitations SET activated_at=restart_at,activation_block=restart_block,activation_network='mainnet',eligibility_check_id=newcheck,slot_released_at=NULL,apps_completed=0,rewards_received=0 WHERE id=i.id RETURNING * INTO i;
   IF i.status<>'ACTIVATING' OR i.reward_status<>'PENDING' OR i.sybil_status<>'NOT_CHECKED' OR i.identity_link_status<>'UNKNOWN' OR i.slot_released_at IS NOT NULL OR i.apps_completed<>0 OR i.rewards_received<>0 OR i.reward_cohort_round_id IS DISTINCT FROM 126::bigint OR i.reward_funding_allocation_receipt_id IS DISTINCT FROM receipt OR i.eligibility_check_id IS DISTINCT FROM newcheck OR i.activation_block IS DISTINCT FROM restart_block THEN RAISE EXCEPTION 'RESTART_POSTCONDITION'; END IF;
   -- Archive the historical exclusion in the private audit before retiring only
   -- the obsolete active exclusion for this newly funded, uncompleted window.
   DELETE FROM public.reward_reservation_legacy_exclusions WHERE invite_code=c AND reason='pre_reservation_rollout_completed';
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>1 OR (SELECT count(*) FROM public.qualified_referral_relationships q WHERE q.source_invitation_id=i.id AND q.id=relationship_id)<>1
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=c) OR EXISTS(SELECT 1 FROM public.reward_payouts q WHERE q.invite_code=c)
   THEN RAISE EXCEPTION 'RECOVERY_LEDGER_OR_REWARD_POSTCONDITION'; END IF;
  END IF;
  PERFORM public.release_operator_lock('invite_evidence_sync:'||c,owner);
 END LOOP;
 IF (SELECT count(*) FROM public.invitations WHERE reward_status='PAID')<>paid0
 OR (SELECT count(*) FROM public.invitations)<>total0
 OR (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1 WHERE state='ACTIVE')<>active0
 THEN RAISE EXCEPTION 'UNRELATED_TOTAL_CHANGED'; END IF;
END
$repair$;
CREATE OR REPLACE FUNCTION public.prevent_consumed_invitation_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF old.status <> 'CANCELLED'
     AND new.status = 'CANCELLED'
     AND old.invitee_wallet IS NOT NULL THEN
    IF NOT (
      -- Pre-existing reviewed Sybil-block cancellation pathway.
      (
        new.sybil_status = 'BLOCKED'
        AND new.sybil_checked_at IS NOT NULL
        AND nullif(btrim(new.sybil_reason), '') IS NOT NULL
        AND old.reward_status <> 'PAID'
        AND new.reward_status <> 'PAID'
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_payouts rp
          WHERE rp.invite_code = new.invite_code AND rp.status = 'PAID'
        )
      )
      OR
      -- New owner-authorized, unfinished v2 invitation release pathway.
      (
        old.referral_link_id IS NOT NULL
        AND old.status = 'ACTIVATING'
        AND new.inviter_released_at IS NOT NULL
        AND old.inviter_released_at IS NULL
        AND new.slot_released_at IS NOT NULL
        AND old.sybil_status NOT IN ('REVIEW', 'BLOCKED')
        AND new.sybil_status = old.sybil_status
        AND old.reward_status IN ('NONE','PENDING')
        AND (
          old.apps_completed < 3 OR NOT old.vot3_converted
          OR NOT old.vote_completed
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_queue_entries q
          WHERE q.invite_code = new.invite_code
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.reward_payouts rp
          WHERE rp.invite_code = new.invite_code
        )
      )
    ) THEN
      RAISE EXCEPTION 'accepted invitation cannot be cancelled';
    END IF;
  END IF;
  RETURN new;
END;
$function$;
