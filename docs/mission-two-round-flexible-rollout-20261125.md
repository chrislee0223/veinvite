# Two-round flexible mission policy — staged, not authorized for production yet

## Approved product behavior
- An initial invitation's verified start (or a retry's verified N round start) begins the mission.
- Three distinct eligible external dApp rewards may occur in N or N+1, through the inclusive final block of N+1.
- Keep the existing verified VOT3 conversion after the first eligible dApp; the vote must follow that conversion and belong to N+1. A third dApp after the vote is valid. The last required chain event determines mission completion, ordered by block, transaction and clause.
- At N+2, protect a complete mission, including pending settlement or indexer catch-up. Only a provably incomplete finalized attempt expires. Repeat the same rule on retries.
- Keep the invitation, occupied slot, historical evidence, existing paid/reserved amounts and Sybil/funding requirements. No extra cron. No policy split exposed in UI.

## Implemented in this branch
An explicit, default-off proof verifier and bounded chain reader support the N+1 dApp window. Pure regression cases include vote before the third dApp, N+2 exclusion, duplicates, old evidence, wrong-round vote, VOT3 order and same-block completion position. Existing callers have not opted in. This is not the complete product implementation.

## Release blockers identified in the deployed source and live catalog
1. Initial legacy sync currently uses open-ended activity and vote scans. Introduce a verified original-round window for bound pending referrals without rewriting old immutable checkpoints or financial obligations. Unbound historical records need a separate review; no invented round.
2. Retry persistence: update the event validator, record_mission_auto_reset_progress_v1, display projection, forecast reader and checkpoint publisher to accept finalized dApp rewards through the verified vote-round end. Decide how to persist an independently valid vote before the third dApp without promoting eligibility or falsely displaying completion. Preserve exact transaction/clause order, replay protection and unique events.
3. Expiry: replace the prior-any-vote veto with complete finalized mission proof (positive evidence or complete verified absence). For original and retry attempts reconcile all valid activity and conversion/vote events before resetting. Unknown or incomplete scans must fail closed. A raw vote alone cannot indefinitely block a proven incomplete mission. Preserve legacy vote records.
4. Funding: bind_mission_retry_completion_v1 currently records the vote block as completion; publish and batch reservation functions compare this to vote_completed_block. Use the last required event for finality, Sybil cutoff and ordering, without pretending a dApp event was a vote. Keep the N+1 funding cohort and actual vote identity separate. Test both X policies, concurrent claims, equal cohort payout, returned X, old paid history and rollback. Update all dependent constraints and evidence freshness together; do not modify old applied migrations.
5. UI: show independent vote and dApp progress; final completion only when all requirements are satisfied. Verify language/notification behavior and expected reward inclusion for retries whose first qualifying dApp occurs in the vote round.
6. Rollout: compare current production function fingerprints, write a new migration and exercise isolated PostgreSQL with both original/retry scenarios (including late third dApp, no third dApp, delayed finalized scan, actual vote and distinct completion positions). Recheck production build, cron timing, API and UI. Only then merge, deploy and separately enable auto-reset.

No production DB mutation, payment, or auto-reset activation is part of this draft.
