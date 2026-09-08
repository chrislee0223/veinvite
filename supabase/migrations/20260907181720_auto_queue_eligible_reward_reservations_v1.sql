-- Historical migration marker only.
--
-- This migration version was applied transiently to the managed databases while
-- the reward trigger was being reviewed on 2026-09-08 KST. That transient
-- implementation queued newly eligible rewards without an inviter Claim and was
-- immediately superseded by 20260907184131_restore_explicit_claim_before_reward_queue.
--
-- The repository intentionally does NOT replay that transient behavior. Earlier
-- canonical migrations already implement the desired contract:
--   eligibility/finality verification -> AWAITING_CLAIM
--   explicit inviter Claim             -> QUEUED
--   payout worker                       -> on-chain transfer
--
-- Keeping this no-op marker preserves migration-version parity with the managed
-- database without reintroducing automatic pre-Claim queueing on fresh installs.

do $$
begin
  null;
end
$$;
