-- Scheduler metadata only. No reward, invitation or eligibility authority.
BEGIN;
ALTER TABLE public.cron_job_states ADD COLUMN IF NOT EXISTS mission_sweep_cursor text;
ALTER TABLE public.cron_job_states ADD CONSTRAINT mission_sweep_cursor_valid_v1
  CHECK (mission_sweep_cursor IS NULL OR
    (job_name IN ('vote-reconcile:mission-progress','vote-reconcile:mission-expiry')
     AND mission_sweep_cursor ~ '^[A-HJ-NP-Z2-9]{7}$'));
INSERT INTO public.cron_job_states(job_name)
VALUES ('vote-reconcile:mission-progress'),('vote-reconcile:mission-expiry')
ON CONFLICT (job_name) DO NOTHING;
COMMIT;
