# VeInvite multilevel: 2026-11-19 policy HOLD and read-only production history audit

## Launch decision: POLICY HOLD — DO NOT USE FOR PAYOUTS

**DO NOT** merge draft PR #1350, apply preview SQL in production, enable or switch the current payout engine, or offer the new 30% active-network B3TR rewards to users.

The published VeBetterDAO **[RuleBook for Apps](https://docs.vebetterdao.org/developer-guides/rulebook-for-apps)** expressly restricts:
- Direct Double Dipping: dApp B3TR rewards for actions already directly rewarded under protocol Vote2Earn.
- Recursive Rewarding: paying for users interacting with other B3TR-incentivized dApps where compensation would be redundant.
- Social Amplification Loops: additional rewards for promotion/relaying of previously incentivized activity.

**Potential conflict:** VeInvite's designed 30% recurring active-network category is conditional on receiving B3TR from another app **and voting** in the same round. The initial new-onboarding category likewise uses other apps plus a subsequent vote as evidence of completion. Even though referral uplines—not the base user—receive the extra VeInvite reward, this still presents a **material incentive-layering compliance question**. This is a risk assessment, not an official noncompliance ruling.

**Public community discussion (not a binding official ruling):**
[October 2, 2026, Morb's integrity discussion](https://vechain.discourse.group/t/proposal-integrity-rule-for-in-app-automated-voting/759/40?u=morb) names VeInvite in a section alleging misuse of treasury-sourced allocations/grants for voting. The author explicitly notes his audit may contain inaccuracies and says current recursive-reward rules need further discussion. **Do not repeat that allegation as a proven fact**.

**Before any live new payout**, obtain a written interpretation from the VeBetterDAO governance/compliance team addressing:
1. Whether paying *inviter ancestors* for a new user's completion of rewarded third-party dApp activities + next-round vote is permitted (60% onboarding category).
2. Whether paying *inviter ancestors* **every round** for downstream B3TR-earning app activity plus allocation vote is permitted (30% active category).
3. Whether the largest direct successful onboarding inviter receiving a bonus (10% leader category) is permitted.
4. Whether the optional 10%-within-gross X share promotion is compliant when the public post describes a vote-related reward.
5. Which sources of treasury allocation may be distributed and what transparent activity/proof requirements apply.
6. If only some categories are allowed, whether the proposed 60:30:10 allocation needs redesign rather than silent redistribution.

**Do not silently change allocation percentages.** The operator makes that policy choice after guidance.

## Real production source audit (READ-ONLY; no wallet identifiers exported)

Repeatable SQL: `20261119_multilevel_production_readonly_evidence_audit.sql`. Queried production Supabase `upfjvkidaqtnbmmnhupz` strictly with SELECT and returned only aggregate counts.

| Diagnostic | Result |
|---|---:|
| Invitations marked COMPLETED | 48 |
| With ACTIVE historical Sybil invalidation | 27 |
| Wallets with active restrictions | 27 |
| CLEAR, not invalidated/restricted | 21 |
| Those with required 3 dApps, VOT3, vote and known block fields | 21 |
| Those with milestone **block order** activation ≤ apps completion ≤ vote completion | **20** |
| Sybil-CLEAR, noninvalidated, but apps completion **after vote** | **1** |
| That anomalous record's apps-completion-vs-vote distance | **16,121 blocks** |
| Qualified referral hierarchy: 1 / 2 / 3 / 4 / 5 levels | 21 / 4 / 0 / 0 / 0 |
| Detected graph cycles | 0 |

**Important:** 20 is an *offline historical first-pass* count. It does not prove actual net-new active eligibility in any particular later round, the true original onchain order at exact transaction/clause granularity, the complete canceled/re-invited parent graph, or final B3TR payment authorization.

A previously PAID and Sybil-CLEAR referral has a dApp completion block **16,121 blocks later than** its vote block. The production record has NOT been modified, not clawed back and no identity is printed. The proposed multilevel legacy predicate already requires correct ordering and excludes it pending an independent historical onchain case review. The anomaly could be stale or updated milestone materialization and must not be treated as proven abuse.

## Pre-payout technical STOPGAP

`src/lib/rewards/multilevelPromotionPreflight.ts` now checks a fresh, newly computed review against the earlier immutable stage snapshot, including exact chain fingerprint, round/wallet, Sybil/identity re-review, event-time ancestors and actual funds. It requires official rulebook clearance and manual independent security sign-off. The returned `payable` flag is **always false** and there is **no payout/financial promotion RPC wired to it**. These booleans are not authenticated attestations by themselves; that remains a separate launch blocker.

Regression: `tests/reward-multilevel-promotion-preflight.test.mjs` denies stale Sybil, reparenting, cross-network replay, missing B3TR funds and no RuleBook approval.

## Preview/production isolation

- New code remains in `feature/multilevel-rewards-staging-20261119`, Draft PR #1350.
- Existing production payout, original X +10 obligations, Claim, mission retry, wallets and UI unchanged.
- No user reward rights originate from preview tables. Synthetic verification rows from prior transactions were rolled back.
- Complete actual participant-by-participant mainnet E2E, source authentication, live payout and recovery tests have **not** been completed.

**Next safe step:** request explicit official VeBetterDAO compliance guidance; meanwhile continue only read-only verification, staged tests and independent funding-risk checks. Do not present the new reward model to users as an approved incentive until clarified.
