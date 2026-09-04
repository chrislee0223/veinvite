# Startup performance review — 2026-09-04

## Finding

VeInvite's first Home reveal was coupled to both wallet bootstrap and completion of the wallet-scoped invitation/referral API hydration. In VeWorld, a disconnected browser without any persisted VeWorld account could also inherit the full 3.5 second wallet-restore settle window. Non-critical reward-recovery and leaderboard-forecast work started during the same startup window.

## Change

- The first document load may reveal Home once the wallet identity is settled and Home has published state for that same wallet, while referral/link data continues in safe disabled placeholders.
- Wallet changes after the first reveal remain strict and still wait for the new wallet's data before revealing Home.
- VeWorld only uses the 3.5 second restore settle window when a persisted VeWorld account actually exists; a genuinely fresh/disconnected visitor uses the normal short 350 ms settle window.
- Reward finality recovery and the leaderboard reward forecast are deferred until after app-ready and an idle browser slice.
- Existing wallet-session renewal semantics, referral/reward rules, and server authority are unchanged.

## Safety

No wallet-session expiry policy, reward accounting, referral eligibility, slot release, Sybil, or database behavior is changed by this performance work.
