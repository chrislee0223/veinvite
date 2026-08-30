# VeInvite Security Notes

## Environment isolation

Production and Preview databases are intentionally separated. Server-side Supabase access fails closed when a non-production deployment is configured with the Production project, or when Production is configured with an unreviewed project.

Production also refuses to silently verify VeBetter activity against a non-mainnet network.

## Wallet authentication

Wallet authentication is bound to the VeInvite origin, network, wallet address, nonce, and expiration time. Challenges are single-use. The reviewed rollout serializes session issuance per wallet and atomically consumes the verified challenge while revoking the prior session and creating its replacement.

The Production rollout uses a compatibility RPC migration before the application deploy, then applies uniqueness constraints after the compatible challenge route is live.

Wallet disconnect events clear the VeInvite server session rather than leaving the authentication cookie active until natural expiration.

## API abuse controls

Public and authenticated high-cost endpoints use database-backed rate limiting. Operator endpoints authenticate before starting expensive VeChain reward-pool reads.

Raw client IP values are not persisted as rate-limit subjects; the server derives a hashed subject.

## Browser response policy

VeInvite sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy` for camera, microphone, and geolocation.

A broad Content Security Policy, `Cross-Origin-Opener-Policy`, or blanket frame denial is not added without an explicit wallet/embed compatibility test because wallet SDK and VeBetter/VeWorld integration flows may depend on cross-origin communication.

## Reward safety

Reward accounting is evidence-based and fail-closed. Mainnet funded reward preparation remains behind explicit runtime safety controls. Ordinary UI updates, migrations, or deployment changes must not enable funded reward preparation or transfer B3TR.

Reward transaction registration and finalization preserve immutable manifest and settlement evidence, and reconciliation may continue for already-submitted transactions even when new preparation is paused.
