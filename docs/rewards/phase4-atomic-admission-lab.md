# Phase 4: isolated atomic reward guarantee laboratory

**DRAFT / no Production changes.** The PostgreSQL 17 lab uses fake cohort and invite identifiers. It is not a Supabase migration and does not touch the live payout or Claim path.

## Verified behavior
- Lock the global physical funding pool before cohort, invitation and guarantee. Two cohorts cannot spend the same last 5 B3TR.
- Repeated admission requests for the same invitation return `ALREADY_RESERVED`; no double counting.
- An invitation's reserve may be released only after trusted terminal `CANCELLED` / `SYBIL_BLOCKED` state; repeated release is idempotent.
- Stale pool observation, unverified receipt, missing eligibility proof, unresolved historical liabilities, and insufficient verified funds fail closed.
- Reserve both the global pool and cohort in one SQL transaction, with unique invitation identity.
- `anon` / `authenticated` have no schema, table or function access.

## Required before a real guarantee
This isolated prototype is not production-integrated. A real version needs the exact Production funding receipt, on-chain pool, historical unpaid obligations, protected older cohorts, X-promotion holds, existing reward payout reservation and immutable invite/cohort bindings reconciled *within the same accounting boundary*. Never trust public client inputs for amounts or eligibility. Never release reserved funds due to a timer alone; submitted payouts and post-payout claims require finality and replay protection. Existing active cohorts must not have their rights or expiry changed retroactively.

The existing 27 incomplete historic invites are protected using weighted estimates; hypothetical all-complete stress is **not** a proven payment deficit. No new promise should be made while this risk is unresolved.

## Release gate
- No changes to Production or its DB.
- No payout/Claim integration.
- Do not merge until full VeInvite CI (including existing npm audit security gate), integration with Production-schema QA, and payout reconciliation tests pass.
