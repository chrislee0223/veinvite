\set ON_ERROR_STOP on
DO $$ BEGIN
  IF (SELECT count(*) FROM public.cron_job_states WHERE job_name LIKE 'vote-reconcile:mission-%' AND last_succeeded_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'phase rows must have no fabricated success';
  END IF;
  IF has_table_privilege('anon','public.cron_job_states','SELECT') OR has_table_privilege('authenticated','public.cron_job_states','UPDATE') THEN
    RAISE EXCEPTION 'unexpected client access';
  END IF;
END $$;
SET ROLE service_role;
UPDATE public.cron_job_states SET mission_sweep_cursor='ABCDEFG' WHERE job_name='vote-reconcile:mission-progress';
UPDATE public.cron_job_states SET mission_sweep_cursor='BCDEFGH' WHERE job_name='vote-reconcile:mission-expiry';
DO $$ BEGIN
  IF (SELECT mission_sweep_cursor FROM public.cron_job_states WHERE job_name='vote-reconcile:mission-progress') <> 'ABCDEFG' THEN RAISE EXCEPTION 'progress cursor mismatch'; END IF;
  IF (SELECT mission_sweep_cursor FROM public.cron_job_states WHERE job_name='vote-reconcile:mission-expiry') <> 'BCDEFGH' THEN RAISE EXCEPTION 'expiry cursor mismatch'; END IF;
  BEGIN
    UPDATE public.cron_job_states SET mission_sweep_cursor='invalid' WHERE job_name='vote-reconcile:mission-progress';
    RAISE EXCEPTION 'invalid cursor allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.cron_job_states SET mission_sweep_cursor='ABCDEFG' WHERE job_name='vote-reconcile';
    RAISE EXCEPTION 'unrelated job cursor allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'mission-sweep-cursor-qa-pass';
