-- Isolated PostgreSQL 17 regression for the exact safe release-function
-- candidate sourced from the current live RPC. No real DB/wallet touched.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.invitations
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN inviter_wallet text NOT NULL DEFAULT '0x1111111111111111111111111111111111111111',
  ADD COLUMN invitee_wallet text,
  ADD COLUMN referral_link_id text,
  ADD COLUMN slot_released_at timestamptz,
  ADD COLUMN inviter_released_at timestamptz,
  ADD COLUMN eligibility_check_id bigint,
  ADD COLUMN reward_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN apps_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN vot3_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN vote_completed boolean NOT NULL DEFAULT false;
CREATE TABLE public.invite_impact_events (invite_code text, event_type text);
CREATE FUNCTION public.qa_fake_forfeit_on_cancel() RETURNS trigger
  LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.status='CANCELLED' THEN NEW.reward_status:='FORFEITED'; END IF;
  RETURN NEW;
END $t$;
CREATE TRIGGER qa_forfeit_on_cancel BEFORE UPDATE OF status ON public.invitations
 FOR EACH ROW EXECUTE FUNCTION public.qa_fake_forfeit_on_cancel();

INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status,invitee_wallet,referral_link_id,eligibility_check_id
) VALUES
 ('B2B2B2B',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',
  '0x2222222222222222222222222222222222222222','fake-referral',1),
 ('C3C3C3C',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',
  '0x3333333333333333333333333333333333333333','fake-referral',2),
 ('D4D4D4D',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',
  '0x4444444444444444444444444444444444444444','fake-referral',3),
 ('E5E5E5E',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',
  '0x5555555555555555555555555555555555555555','fake-referral',4);

INSERT INTO reward_admission_bridge.holds
 (network,invite_code,app_id,reward_cohort_round_id,
  funding_allocation_receipt_id,amount_wei,status)
VALUES
 ('mainnet','B2B2B2B','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  123,1001,6000000000000000000,'HELD'),
 ('mainnet','C3C3C3C','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  123,1001,6000000000000000000,'CONVERTED'),
 ('mainnet','D4D4D4D','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  123,1001,6000000000000000000,'RELEASED');

INSERT INTO public.reward_recovery_settlements (id,invite_code,network,offset_amount_wei)
 VALUES(9001,'E5E5E5E','mainnet',5000000000000000000);

DO $qa$
DECLARE
  wallet constant text:='0x1111111111111111111111111111111111111111';
  v text;
  v_before numeric;
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
  SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO v_before;
  SELECT public.release_incomplete_referral_by_inviter('B2B2B2B',wallet) INTO v;
  IF v<>'REWARD_LOCKED' THEN RAISE EXCEPTION 'HELD cancellation was allowed: %',v; END IF;
  SELECT public.release_incomplete_referral_by_inviter('C3C3C3C',wallet) INTO v;
  IF v<>'REWARD_LOCKED' THEN RAISE EXCEPTION 'CONVERTED without fixed proof was cancelled: %',v; END IF;
  SELECT public.release_incomplete_referral_by_inviter('E5E5E5E',wallet) INTO v;
  IF v<>'REWARD_LOCKED' THEN RAISE EXCEPTION 'Recovery obligation was orphaned: %',v; END IF;
  SELECT public.release_incomplete_referral_by_inviter('D4D4D4D',wallet) INTO v;
  IF v<>'RELEASED' THEN RAISE EXCEPTION 'Safe prior-released empty invitation could not cancel: %',v; END IF;
  IF EXISTS(
   SELECT 1 FROM public.invitations
   WHERE invite_code IN ('B2B2B2B','C3C3C3C','E5E5E5E') AND status <> 'ACTIVATING'
  ) OR NOT EXISTS(
   SELECT 1 FROM public.invitations WHERE invite_code='D4D4D4D'
   AND status='CANCELLED' AND reward_status='FORFEITED'
  ) THEN RAISE EXCEPTION 'Manual invite release postcondition failed'; END IF;
  IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>v_before
  THEN RAISE EXCEPTION 'Inviter cancellation mutated fixed financial liabilities'; END IF;
  SELECT public.release_incomplete_referral_by_inviter('D4D4D4D',wallet) INTO v;
  IF v<>'ALREADY_RELEASED' THEN RAISE EXCEPTION 'Safe cancel replay was not idempotent: %',v; END IF;
END $qa$;
ROLLBACK;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='B2B2B2B')
    OR EXISTS(SELECT 1 FROM public.invitations WHERE invite_code='B2B2B2B')
 THEN RAISE EXCEPTION 'Inviter release lab test was not rolled back'; END IF;
END $verify$;
SELECT 'PASS: inviter cancellation respects HELD/CONVERTED/recovery and safe prior RELEASED' result;
