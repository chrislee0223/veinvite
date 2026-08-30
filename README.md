# VeInvite

VeInvite is a verified referral-onboarding and reactivation dApp for the VeBetterDAO ecosystem.

The repository includes a production-oriented VeChain Mainnet architecture with VeChain Kit / VeWorld wallet verification, Supabase-backed invitation state, NEW / RETURNING / ACTIVE EXISTING entry classification, positive-B3TR dApp reward evidence, B3TR → VOT3 conversion verification, Allocation Voting verification, Sybil gating, reward eligibility constraints, an automatic referral-reward queue, immutable payout manifests, finalized transaction verification, and VeBetterDAO round/allocation accounting.

Key safety properties include one active invite per inviter, one VeInvite lifecycle per invitee wallet, self-referral rejection, fail-closed chain verification, immutable eligibility evidence, raw impact-event provenance, execution-order checks, database-enforced reward eligibility, one payout per successful referral, and reward rounds that must be bound to an actual on-chain VeBetterDAO allocation receipt.

The current on-chain funding split is 20% team / operations and 80% VeInvite user reward pool. VeInvite's intended funded reward recipient is the **inviter** for successful verified onboarding; the invitee does not receive an additional VeInvite B3TR payout for the dApp, B3TR-to-VOT3, or Allocation Voting actions used as onboarding evidence.

**Mainnet funded referral payouts are not enabled yet.** When enabled, VeInvite will not hold an unattended server private key: the operator must approve the immutable multi-clause payout transaction in VeWorld, register the transaction ID, and complete finalized chain verification before settlement can be marked PAID.

Public round reporting is designed to reconcile the actual VeBetterDAO round, immutable allocation receipt, team/reward-pool split, carry-over, verified referral counts, and settled B3TR payouts. The public reporting baseline remains disabled until explicitly set at launch.

Language selectors use app-owned country SVG assets and intentionally avoid artificial white background tiles around flags.

See `README_KO.md` and the `docs/` directory for additional project notes.