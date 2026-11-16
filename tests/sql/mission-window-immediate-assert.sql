\set ON_ERROR_STOP on
-- This intentionally begins with the real config disabled. No Claim can be
-- reserved until a future reviewed operator explicitly enables it.
CREATE TRIGGER reward_queue_guard_vote_round_close_single_writer
 BEFORE INSERT OR UPDATE OF reserved_amount_wei,reservation_algorithm_version,reservation_basis,status
 ON public.reward_queue_entries
 FOR EACH ROW EXECUTE FUNCTION public.guard_vote_round_close_single_reservation_v1();
DO $tests$
DECLARE
 pool numeric:=7413807712268098494020;
 expected numeric:=2461269237422699498006;
 result jsonb;
 quote numeric;
BEGIN
 IF public.read_vote_window_immediate_mode_v1('mainnet')->>'enabled'<>'false'
 THEN RAISE EXCEPTION 'new mode accidentally live'; END IF;
 result:=public.commit_reward_vote_window_immediate_v1(
   'ACXKGKC','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'mode'<>'DISABLED' THEN RAISE EXCEPTION 'disabled cutover guard failed: %',result; END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.vote_window_fixed_quotes)
 THEN RAISE EXCEPTION 'disabled call wrote a quote'; END IF;

 -- The QA schema explicitly enables only round 125, as a future operator
 -- would do after separate code/financial review. This is NOT Production.
 UPDATE reward_admission_bridge.vote_window_immediate_settings SET enabled=true WHERE id=1;
 result:=public.commit_reward_vote_window_immediate_v1(
   'ACXKGKC','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'mode'<>'IMMEDIATE_RESERVED' OR (result->>'amountWei')::numeric<>expected
 THEN RAISE EXCEPTION 'first winner incorrect: %',result; END IF;
 SELECT quote_wei INTO quote FROM reward_admission_bridge.vote_window_fixed_quotes
 WHERE network='mainnet' AND vote_round_id=125;
 IF quote<>expected THEN RAISE EXCEPTION 'immutable quote drift'; END IF;

 result:=public.commit_reward_vote_window_immediate_v1(
   'R4LKDJM','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'mode'<>'IMMEDIATE_RESERVED' OR (result->>'amountWei')::numeric<>expected
 THEN RAISE EXCEPTION 'second winner not equal: %',result; END IF;

 result:=public.commit_reward_vote_window_immediate_v1(
   'ACXKGKC','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'mode'<>'ALREADY_RESERVED' THEN RAISE EXCEPTION 'duplicate reservation'; END IF;

 result:=public.commit_reward_vote_window_immediate_v1(
   'EDFW4Y7','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'reason'<>'OUTSIDE_CLOSED_ENTRY_COHORT'
 THEN RAISE EXCEPTION 'incomplete user wrote money: %',result; END IF;

 UPDATE public.invitations SET vote_round_id=125,status='COMPLETED',
   reward_status='ELIGIBLE',sybil_status='CLEAR' WHERE invite_code='EDFW4Y7';
 result:=public.commit_reward_vote_window_immediate_v1(
   'EDFW4Y7','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'mode'<>'IMMEDIATE_RESERVED' OR (result->>'amountWei')::numeric<>expected
 THEN RAISE EXCEPTION 'later completing winner missed fixed quote: %',result; END IF;

 IF (SELECT count(*) FROM public.reward_queue_entries WHERE network='mainnet')<>3
 THEN RAISE EXCEPTION 'not exactly three immutable reservations'; END IF;
 IF (SELECT sum(reserved_amount_wei) FROM public.reward_queue_entries)
     + 30000000000000000000 > pool
 THEN RAISE EXCEPTION 'base plus all X options exceeds pool'; END IF;
 IF (SELECT count(DISTINCT reserved_amount_wei) FROM public.reward_queue_entries)<>1
 THEN RAISE EXCEPTION 'payment amount changed by completion order'; END IF;

 -- A previously abandoned cohort must never join the new round's budget.
 UPDATE public.invitations SET vote_round_id=125,status='COMPLETED',
    reward_status='ELIGIBLE',sybil_status='CLEAR' WHERE invite_code='C5RV7QG';
 result:=public.commit_reward_vote_window_immediate_v1(
   'C5RV7QG','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'reason'<>'OUTSIDE_CLOSED_ENTRY_COHORT'
 THEN RAISE EXCEPTION 'old mission entered current cohort: %',result; END IF;

 -- A late newly qualified fourth participant must fail closed, never take
 -- a third person's backing or steal an existing immutable quote.
 INSERT INTO public.invitations VALUES
 ('QWERTY7','mainnet',125,124,11,
 '0x7777777777777777777777777777777777777777',7,'COMPLETED','ELIGIBLE','CLEAR',null);
 result:=public.commit_reward_vote_window_immediate_v1(
  'QWERTY7','mainnet',pool,clock_timestamp(),26429000);
 IF result->>'reason'<>'COHORT_MEMBER_COUNT_CHANGED'
 THEN RAISE EXCEPTION 'cohort expansion not blocked: %',result; END IF;

 -- Direct insertion with a forged quote must be rejected by the real guard.
 BEGIN
   INSERT INTO public.reward_queue_entries(
      invite_code,network,reserved_amount_wei,reservation_algorithm_version,reservation_basis)
   VALUES ('QWERTY7','mainnet',42,'shared-pool-v1',
      '{"quoteKind":"vote_window_immediate_v1","voteRoundId":"125","participantCount":"3"}'::jsonb);
   RAISE EXCEPTION 'FORGED_AMOUNT_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='FORGED_AMOUNT_ACCEPTED' THEN RAISE; END IF;
   IF SQLERRM<>'VOTE_WINDOW_UNVERIFIED_IMMEDIATE_QUOTE'
   THEN RAISE EXCEPTION 'unexpected guard error: %',SQLERRM; END IF;
 END;

 IF has_function_privilege('anon',
    'public.commit_reward_vote_window_immediate_v1(text,text,numeric,timestamptz,bigint)',
    'EXECUTE')
 THEN RAISE EXCEPTION 'public user can call privileged payout writer'; END IF;
 IF has_table_privilege('authenticated',
    'reward_admission_bridge.vote_window_fixed_quotes','INSERT')
 THEN RAISE EXCEPTION 'client can forge immutable quotes'; END IF;
 IF (SELECT count(*) FROM public.reward_queue_entries)<>3
 THEN RAISE EXCEPTION 'negative probes mutated payment ledger'; END IF;
END;
$tests$;
SELECT 'PASS isolated current-window equal Claim price / exactly-once / Sybil-scope / immutable authority' AS result;
