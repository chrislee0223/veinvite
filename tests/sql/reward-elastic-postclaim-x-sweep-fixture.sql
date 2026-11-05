-- Fake-DB X opportunity evidence to mimic Production schema only.
\set ON_ERROR_STOP on
ALTER TABLE public.reward_payouts
 ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.reward_x_promotion_obligations
 ADD COLUMN IF NOT EXISTS invite_code text;
CREATE TABLE IF NOT EXISTS public.reward_x_promotion_post_submissions(
 invite_code text,network text,invalidated_at timestamptz,submission_state text);
