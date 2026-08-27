# VeInvite staging E2E readiness — 2026-08-28

## Scope

This note records the final staging E2E investigation so the same wallet and chain checks do not need to be repeated from scratch.

## Environment verified

- Preview database is isolated from Production.
- VeInvite Preview health returned `database=ready` and `network=testnet-staging`.
- The reviewed VeBetterDAO staging profile matches the official public testnet-staging contracts used by VeInvite.
- Fresh invite `MQJWLUX` remained `PENDING_ACCEPTANCE` with no invitee or eligibility proof at the time of this review, so it was not consumed merely for diagnostics.

## Reward activity observed on official staging X2EarnRewardsPool

A temporary Preview-only diagnostic branch scanned `RewardDistributed` events from the official staging X2EarnRewardsPool. The diagnostic was never merged to `main`; Production returned 404 for its route.

Recent 100,000-block scan:

- 3 reward events total.
- All 3 came from one app: Green Utility Log.

1,000,000-block scan:

- 134 reward events.
- 5 distinct app IDs.
- 25 distinct receiver wallets.
- No receiver wallet had rewards from two or more distinct apps in the scanned period.

Identified historical reward apps included Green Utility Log, ReCircle, B3TR Beach, and EVearn. Current public product state indicates that several of those historical test flows have moved to mainnet, changed product flow, or require real-world proof, so they cannot be treated as three reliable immediate staging reward sources.

## E2E conclusion

A new-wallet claim, eligibility classification, mission UI, database proof linkage, reward queue accounting, payout manifest, transaction verification, and settlement logic have already been covered through the existing Preview/DB tests and hardening work.

The remaining literal live-wallet scenario — one fresh staging wallet earning qualifying B3TR from three distinct external staging dApps, then converting B3TR to VOT3 and voting — cannot currently be completed reliably because the external staging ecosystem does not expose three actively rewarding dApps for one tester.

This is an external test-environment limitation, not evidence of a VeInvite defect. Do not weaken the production mission rule or count repeated rewards from the same app merely to make staging E2E pass.

## When to rerun the live 3-app test

Rerun only when at least three distinct apps are confirmed to emit `RewardDistributed` events on the official staging X2EarnRewardsPool and are practically usable by the same fresh tester wallet. At that point:

1. Claim a fresh VeInvite staging invitation with a wallet never previously used as a Preview invitee.
2. Verify `entry_class=NEW`, `outcome=ELIGIBLE`, and `activation_network=testnet-staging`.
3. Earn qualifying rewards from three distinct staging apps.
4. After the first qualifying dApp reward, convert at least 1 B3TR to VOT3.
5. After that conversion, cast one Allocation Voting vote.
6. Confirm mission completion, Sybil CLEAR, reward queue entry, and round eligibility.
7. Stop before any real payout transfer unless a deliberate payout test is explicitly approved.

## Safety note

The temporary staging-reward scanner remains isolated on an unmerged test branch and is explicitly blocked in Production. It must not be merged into `main`.
