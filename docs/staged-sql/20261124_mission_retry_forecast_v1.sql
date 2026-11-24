-- Staged: private forecast input only, no payout writes.
-- Include real retry activity in its two-round window; zero-progress
-- dormant resets do not count as newly accepted referrals.
CREATE OR REPLACE FUNCTION public.read_mission_retry_forecast_rows_v1(
 p_network text,p_round_id bigint
) RETURNS TABLE(invite_code text,created_at timestamptz,status text,sybil_status text,
 reward_status text,ineligible_at timestamptz,apps_completed integer,activated_at timestamptz,
 apps_completed_at timestamptz,vote_completed_at timestamptz,vote_round_id bigint,
 slot_released_at timestamptz,retry_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $forecast$
 SELECT i.invite_code,i.created_at,i.status,i.sybil_status,i.reward_status,i.ineligible_at,
   count(e.id)::integer,i.activated_at,max(e.block_timestamp),i.vote_completed_at,
   i.vote_round_id,i.slot_released_at,true
 FROM reward_admission_bridge.mission_retry_attempts_v1 a
 JOIN public.invitations i ON i.id=a.invitation_id AND i.activation_network=a.network
 JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e
   ON e.attempt_id=a.id AND e.event_type='DAPP_REWARD'
 WHERE a.network=p_network AND a.state='ACTIVE'
  AND p_round_id BETWEEN a.dapp_round_id AND a.vote_round_id
  AND i.status='ACTIVATING' AND i.reward_status='PENDING'
  AND i.sybil_status NOT IN ('BLOCKED','REVIEW')
  AND i.ineligible_at IS NULL AND i.slot_released_at IS NULL
  AND e.block_number BETWEEN a.attempt_start_block AND a.round_end_block
 GROUP BY i.id,i.invite_code,i.created_at,i.status,i.sybil_status,i.reward_status,i.ineligible_at,
  i.activated_at,i.vote_completed_at,i.vote_round_id,i.slot_released_at
 ORDER BY i.invite_code LIMIT 1000;
$forecast$;
REVOKE ALL ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) TO service_role;
