-- A Sybil-v2 BLOCKED invite is terminal for reward eligibility even if
-- invitation.status is still ACTIVATING. Never treat a confirmed invalid
-- referral as an outstanding potential recipient or a source sweep blocker.
-- UNKNOWN/NOT_CHECKED/UNDER_REVIEW remain fully protected.
BEGIN;
DO $patch$
DECLARE
 f text;
 a text;
 b text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_reward_elastic_closed_cohort_v1';
 a:='count(*) FILTER (WHERE i.status <> ''CANCELLED'' AND NOT';
 b:='count(*) FILTER (WHERE i.status <> ''CANCELLED'' AND i.sybil_status <> ''BLOCKED'' AND NOT';
 IF f IS NULL OR strpos(f,a)=0 OR strpos(f,b)>0 THEN
   RAISE EXCEPTION 'ELASTIC_SYBIL_BLOCKED_WRITER_SOURCE_DRIFT'; END IF;
 EXECUTE replace(f,a,b);

 SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_reward_elastic_contingent_scope_liability_wei_v1';
 a:='AND i.status<>''CANCELLED''';
 b:='AND i.status<>''CANCELLED'' AND i.sybil_status<>''BLOCKED''';
 IF f IS NULL OR strpos(f,a)=0 OR strpos(f,b)>0 THEN
   RAISE EXCEPTION 'ELASTIC_SYBIL_BLOCKED_PHYSICAL_SOURCE_DRIFT'; END IF;
 EXECUTE replace(f,a,b);

 SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='reward_elastic_source_has_unsettled_slots_v1';
 a:='AND i.activated_at>=v_rollout AND i.status<>''CANCELLED''';
 b:='AND i.activated_at>=v_rollout AND i.status<>''CANCELLED'' AND i.sybil_status<>''BLOCKED''';
 IF f IS NULL OR strpos(f,a)=0 OR strpos(f,b)>0 THEN
   RAISE EXCEPTION 'ELASTIC_SYBIL_BLOCKED_SOURCE_SWEEP_DRIFT'; END IF;
 EXECUTE replace(f,a,b);

 SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_reward_elastic_closure_liveness_v1';
 a:='AND pending.status<>''CANCELLED''';
 b:='AND pending.status<>''CANCELLED'' AND pending.sybil_status<>''BLOCKED''';
 IF f IS NULL OR strpos(f,a)=0 OR strpos(f,b)>0 THEN
   RAISE EXCEPTION 'ELASTIC_SYBIL_BLOCKED_MONITOR_DRIFT'; END IF;
 EXECUTE replace(f,a,b);
END $patch$;
COMMIT;