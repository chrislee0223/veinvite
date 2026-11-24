-- Staged only: maintain original Sybil evidence and include every durable
-- retry's completed dApp pattern. Never replace the original forensic view.
CREATE OR REPLACE FUNCTION public.read_mission_retry_behavior_patterns_v1(
 p_network text
) RETURNS TABLE(invite_code text,inviter_wallet text,invitee_wallet text,
 activated_at timestamptz,app_sequence text[],reward_intervals_seconds bigint[],
 attempt_no integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $behavior$
 WITH ordered AS (
   SELECT a.id,a.invite_code,a.attempt_no,i.inviter_wallet,i.invitee_wallet,
          e.app_id,e.block_timestamp,
          lag(e.block_timestamp) OVER(
            PARTITION BY a.id ORDER BY e.block_number,e.tx_index,e.clause_index,e.id
          ) AS previous_reward_at,
          row_number() OVER(
            PARTITION BY a.id ORDER BY e.block_number,e.tx_index,e.clause_index,e.id
          ) AS reward_order
   FROM reward_admission_bridge.mission_retry_attempts_v1 a
   JOIN public.invitations i ON i.id=a.invitation_id AND i.invite_code=a.invite_code
     AND i.activation_network=a.network
   JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e ON e.attempt_id=a.id
   WHERE a.network=p_network AND e.event_type='DAPP_REWARD'
     AND e.block_number BETWEEN a.attempt_start_block AND a.round_end_block
     AND e.app_id IS NOT NULL
 )
 SELECT o.invite_code,o.inviter_wallet,o.invitee_wallet,min(o.block_timestamp),
   array_agg(o.app_id ORDER BY o.reward_order),
   array_agg(extract(epoch FROM(o.block_timestamp-o.previous_reward_at))::bigint
     ORDER BY o.reward_order) FILTER(WHERE o.previous_reward_at IS NOT NULL),
   o.attempt_no
 FROM ordered o WHERE o.reward_order<=3
 GROUP BY o.id,o.invite_code,o.inviter_wallet,o.invitee_wallet,o.attempt_no
 HAVING count(DISTINCT o.app_id)=3
 ORDER BY o.invite_code,o.attempt_no;
$behavior$;
REVOKE ALL ON FUNCTION public.read_mission_retry_behavior_patterns_v1(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_retry_behavior_patterns_v1(text)
 TO service_role;
