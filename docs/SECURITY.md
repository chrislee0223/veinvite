# VeInvite Security Plan

## Core controls

1. One active invitation per inviter.
2. One inviter per invitee wallet.
3. The first eligible claimant atomically owns the invitation link.
4. Existing VeBetterDAO participants are excluded from referral eligibility.
5. Self-referrals and duplicate/refarmed wallets are rejected.
6. A cancelled invite permanently forfeits the corresponding referral reward.
7. Rewards are settled weekly after verification, not paid immediately.
8. Suspicious cases are held for review rather than silently rewarded.
9. Queued reward candidates are re-checked against VePassport Signal Admin / blacklist state before reward-round reservation.
10. Sensitive API paths use server-side per-wallet and/or hashed-IP rate limits.
11. Either the official VeBetterDAO distribution pause or VeInvite's operator emergency pause blocks new reward preparation and signing.

## Emergency reward pause

VeInvite maintains a second, operator-controlled runtime pause in addition to VeBetterDAO's on-chain distribution pause. The effective reward gate is fail-closed: either pause blocks new reward rounds, new payout manifests, and payout preflight/signing.

Pause and resume changes require a reason and are stored in an append-only operator audit trail. Already-broadcast payout transactions may still be registered and finalized during a pause so accounting evidence remains accurate and duplicate replacement payments are avoided.

The bilingual incident and recovery runbook is documented in `docs/EMERGENCY_REWARD_PAUSE_KO_EN.md`.

## API security

- Signed wallet session/certificate verification
- Server-side schema validation
- Per-IP and per-wallet rate limits
- CAPTCHA or equivalent bot mitigation on high-risk actions
- Restricted CORS and secure headers
- Audit logging without private keys or seed phrases

## Key management

The application must never request or store user private keys. Reward distributor keys must be stored in a managed secret store and only accessed by a restricted server-side reward worker.

## Device data

Device identification is optional and must be used only as a supporting risk signal. Raw fingerprint data should be minimized, salted/hashed where possible, retained for a defined period, and disclosed in the privacy policy.
