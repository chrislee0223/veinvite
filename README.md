# VeInvite

VeInvite is a verified onboarding and reactivation dApp for the VeBetterDAO ecosystem.

The current repository includes a production-oriented VeChain Mainnet architecture with VeChain Kit / VeWorld wallet verification, Supabase-backed invitation state, NEW / RETURNING / ACTIVE EXISTING entry classification, on-chain mission evidence, B3TR → VOT3 conversion verification, allocation-vote verification, Sybil gating, reward eligibility constraints, and an automatic reward queue.

Key safety properties include one active invite per inviter, one VeInvite lifecycle per invitee wallet, self-referral rejection, fail-closed chain verification, immutable eligibility evidence, raw impact-event provenance, execution-order checks, and database-enforced reward eligibility.

The current working VeBetterDAO funding split is 20% team / operations and 80% user rewards.

**Automatic B3TR transfers are not enabled in Production yet.** Reward-round settlement, retry/idempotency behavior, Sybil controls, and a real post-v2 end-to-end Production case should be fully verified before payout automation is enabled.

See `README_KO.md` and the `docs/` directory for additional project notes.
