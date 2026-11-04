-- SECURITY REVIEW PROTOTYPE ONLY. DO NOT APPLY AS A PRODUCTION MIGRATION.
-- Captured from the actual public.release_incomplete_referral_by_inviter RPC
-- currently present in Production on 2026-11-05.
-- The ONLY functional addition is to reject HELD/CONVERTED admission money
-- and recorded recovery before manual inviter cancellation.
-- No auto-release or financial balance changes are performed by this function.
CREATE OR REPLACE FUNCTION public.release_incomplete_referral_by_inviter(p_invite_code text, p_inviter_wallet text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_wallet text := lower(btrim(coalesce(p_inviter_wallet, '')));
  v_code text := upper(btrim(coalesce(p_invite_code, '')));
BEGIN
  IF v_wallet !~ '^0x[0-9a-f]{40}$' OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$' THEN
    RETURN 'INVALID_INPUT';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('veinvite_referral_inviter_' || v_wallet, 0)
  );

  SELECT * INTO v_inv FROM public.invitations i
   WHERE i.invite_code = v_code AND i.inviter_wallet = v_wallet
   FOR UPDATE;

  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;

  IF v_inv.status = 'CANCELLED' AND v_inv.inviter_released_at IS NOT NULL THEN
    RETURN 'ALREADY_RELEASED';
  END IF;

  IF v_inv.referral_link_id IS NULL
     OR v_inv.status <> 'ACTIVATING'
     OR v_inv.invitee_wallet IS NULL
     OR v_inv.slot_released_at IS NOT NULL
     OR v_inv.eligibility_check_id IS NULL
     OR v_inv.activation_network IS NULL
     OR v_inv.sybil_status IN ('REVIEW', 'BLOCKED')
     OR v_inv.reward_status NOT IN ('NONE', 'PENDING')
     OR (v_inv.apps_completed >= 3
         AND v_inv.vot3_converted
         AND v_inv.vote_completed)
  THEN
    RETURN 'NOT_ALLOWED';
  END IF;

  -- An already recorded final vote is treated as a completion signal even
  -- when the cached invitation progress has not yet caught up.
  IF EXISTS (
    SELECT 1 FROM public.invite_impact_events e
    WHERE e.invite_code = v_code AND e.event_type = 'ALLOCATION_VOTE'
  ) THEN
    RETURN 'NOT_ALLOWED';
  END IF;

  -- Never touch reservations, X-promotion money, reward assignment or payout.
  IF EXISTS (
    SELECT 1 FROM public.reward_queue_entries q
    WHERE q.invite_code = v_code
  ) OR EXISTS (
    SELECT 1 FROM public.reward_payouts rp
    WHERE rp.invite_code = v_code
  ) THEN
    RETURN 'REWARD_LOCKED';
  END IF;

  -- Future admission financial authority: an active or consumed guarantee
  -- must not be orphaned by a separate invitation cancellation.
  -- The caller must first reconcile the HELD and fixed liabilities under
  -- the canonical financial lock. Never release money in this route.
  IF EXISTS (
    SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network = v_inv.activation_network
      AND h.invite_code = v_code
      AND h.status IN ('HELD','CONVERTED')
  ) OR EXISTS (
    SELECT 1 FROM public.reward_recovery_settlements rs
    WHERE rs.invite_code = v_code
  ) THEN
    RETURN 'REWARD_LOCKED';
  END IF;

  UPDATE public.invitations i
  SET status = 'CANCELLED',
      inviter_released_at = clock_timestamp(),
      slot_released_at = clock_timestamp()
  WHERE i.id = v_inv.id;

  IF NOT FOUND THEN RETURN 'NOT_ALLOWED'; END IF;

  -- Fail closed if any other trigger silently prevented cancellation.
  IF NOT EXISTS (
    SELECT 1 FROM public.invitations i
    WHERE i.id = v_inv.id AND i.status = 'CANCELLED'
      AND i.reward_status = 'FORFEITED'
      AND i.inviter_released_at IS NOT NULL
      AND i.slot_released_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'manual invitation release failed postcondition';
  END IF;

  RETURN 'RELEASED';
END;
$function$

