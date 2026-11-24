\set ON_ERROR_STOP on
DO $retry_behavior$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM public.read_mission_retry_behavior_patterns_v1('mainnet')
 WHERE invite_code='EDFW4Y7' AND attempt_no=2;
 IF NOT FOUND OR cardinality(p.app_sequence)<>3 OR cardinality(p.reward_intervals_seconds)<>2
 THEN RAISE EXCEPTION 'Current retry missing from behavior analysis'; END IF;
 IF EXISTS(SELECT 1 FROM public.read_mission_retry_behavior_patterns_v1('testnet') WHERE invite_code='EDFW4Y7')
 THEN RAISE EXCEPTION 'Cross-network behavior leaked'; END IF;
 IF has_function_privilege('anon','public.read_mission_retry_behavior_patterns_v1(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.read_mission_retry_behavior_patterns_v1(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Behavior evidence RPC exposed to browser'; END IF;
END;
$retry_behavior$;
