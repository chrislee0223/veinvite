-- An accepted v2 invitation may be ended by its inviter only while unfinished.
-- This is NOT a Sybil verdict, deletion of referral history or payout cancellation.
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS inviter_released_at timestamptz;

COMMENT ON COLUMN public.invitations.inviter_released_at IS
  'Inviter voluntarily ended an unfinished referral; distinct from a Sybil block.';

-- Keep legacy unused-link cancellation and the pre-existing Sybil exception.
-- A manually ended accepted invitation requires an explicit terminal marker.
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

CREATE OR REPLACE FUNCTION public.protect_inviter_released_invitation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF old.inviter_released_at IS NOT NULL AND (
     new.inviter_released_at IS DISTINCT FROM old.inviter_released_at
     OR new.slot_released_at IS DISTINCT FROM old.slot_released_at
     OR new.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'inviter-released invitation is terminal';
  END IF;
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS invitations_protect_inviter_release ON public.invitations;
CREATE TRIGGER invitations_protect_inviter_release
BEFORE UPDATE OF inviter_released_at, slot_released_at, status
ON public.invitations FOR EACH ROW
EXECUTE FUNCTION public.protect_inviter_released_invitation();

-- Only callable by the trusted server with service_role (never from browser).
-- Lock the inviter to serialize with the permanent referral claim RPC and lock
-- this invitation to serialize with background progress/reward updates.
CREATE OR REPLACE FUNCTION public.release_incomplete_referral_by_inviter(
  p_invite_code text,
  p_inviter_wallet text
)
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
$function$;

REVOKE ALL ON FUNCTION public.release_incomplete_referral_by_inviter(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_incomplete_referral_by_inviter(text, text)
  TO service_role;
