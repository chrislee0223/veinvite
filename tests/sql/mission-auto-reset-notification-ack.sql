\set ON_ERROR_STOP on
-- The only actual notification recipient is the INVITEE. Test both
-- acknowledgement shapes used by the existing /api/notifications/history API.
DO $$
DECLARE reset_id bigint;
  result jsonb;
  count_before bigint;
BEGIN
  SELECT id INTO reset_id
  FROM public.invite_notification_history
  WHERE invite_code='EDFW4Y7' AND kind='MISSION_PROGRESS_RESET'
  ORDER BY id LIMIT 1;
  IF reset_id IS NULL THEN RAISE EXCEPTION 'No reset notice fixture'; END IF;

  SELECT public.acknowledge_invite_notification_history(
    '0x2222222222222222222222222222222222222222',
    ARRAY[reset_id]::bigint[], NULL
  ) INTO result;
  IF result->>'acknowledged' <> '1' THEN
    RAISE EXCEPTION 'Invitee could not acknowledge reset notice: %', result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invite_notification_history_reads
    WHERE notification_id=reset_id
      AND inviter_wallet='0x2222222222222222222222222222222222222222'
  ) THEN
    RAISE EXCEPTION 'Invitee read receipt missing';
  END IF;
  -- A second read must not double-count or affect referral lifecycle.
  SELECT public.acknowledge_invite_notification_history(
    '0x2222222222222222222222222222222222222222',
    ARRAY[reset_id]::bigint[], NULL
  ) INTO result;
  IF result->>'acknowledged'<>'0' THEN
    RAISE EXCEPTION 'Reset read was not idempotent: %',result;
  END IF;

  -- The inviter owns the referral, but must not be marked as the recipient
  -- of the invitee's reset alert and cannot acknowledge that alert.
  SELECT public.acknowledge_invite_notification_history(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ARRAY[reset_id]::bigint[], NULL
  ) INTO result;
  IF result->>'acknowledged'<>'0' THEN
    RAISE EXCEPTION 'Reset notice leaked into inviter acknowledgement';
  END IF;

  SELECT count(*) INTO count_before
  FROM public.invite_notification_history_reads;
  SELECT public.acknowledge_invite_notification_history(
    '0x2222222222222222222222222222222222222222',
    NULL, 9223372036854775807
  ) INTO result;
  IF result->>'acknowledged'<>'1' OR
     (SELECT count(*) FROM public.invite_notification_history_reads)
         <> count_before+1 THEN
     RAISE EXCEPTION 'Through-id reset acknowledgement failed: %',result;
  END IF;
END $$;
SELECT 'mission-reset-invitee-ack-qa-pass' AS result;
