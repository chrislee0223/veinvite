-- Historical migration marker for the production correction applied on
-- 2026-09-08 KST.
--
-- The managed database was restored to the repository's canonical reward
-- lifecycle immediately after the transient auto-queue migration:
--   verified eligibility -> fixed reservation in AWAITING_CLAIM
--   inviter Claim        -> QUEUED with claim_requested_* evidence
--   payout worker        -> transfer/finality handling
--
-- Earlier committed reward-reservation migrations already create this final
-- state on a clean database, so replaying the live corrective function bodies is
-- intentionally unnecessary here. This no-op keeps migration history aligned
-- without duplicating or weakening those functions.

do $$
begin
  null;
end
$$;
