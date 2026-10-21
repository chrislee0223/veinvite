# VeInvite X share-bonus: guarded OAuth rollout

**Status (2026-10-21):** OAuth and disabled-by-default discovery code from PR #1189 are merged and deployed. Production OAuth configuration exists, but X search remains explicitly `off`; live search entitlement, account-link WebView handoff, and real 24-hour payout have not been tested. The existing manual X Post URL submission and B3TR payout path remain in operation.

## User flow

1. A wallet-authenticated recipient with an active promotion opportunity opens the reward receipt.
2. If X OAuth is configured, **Connect X account** redirects in the same browser to X OAuth2 authorization code with PKCE (read-only `tweet.read users.read`).
3. VeInvite verifies the CSRF state, signed one-time HTTP-only cookie, expiring code verifier, wallet session, original invite ownership, X identity returned by `GET /2/users/me`, and privacy status.
4. It adds an immutable wallet↔X author binding under the existing database unique constraints. Only one X author per wallet and one wallet per X author per network; conflicts cannot be silently replaced.
5. The separate discovery worker may use that binding to discover the promotion Post. It verifies the Post's author, posting window, original status and exact `xp` token, submits through the **existing** submission RPC, and allows the **existing** 24-hour verification and payout path to continue.

No user OAuth access token or refresh token is stored. The original Post remains visible only via X, and no automatic posting permission is requested.

## Environment (server-only; configure in Vercel after approved X Developer setup)

- `X_OAUTH_CLIENT_ID` — registered X OAuth 2.0 client ID.
- `X_OAUTH_CLIENT_SECRET` — only for a confidential X Web App client, configured as a sensitive secret. Omit if registered as an OAuth public client.
- `X_OAUTH_STATE_SECRET` — independent unpredictable secret of at least 32 characters for signed OAuth flow cookies.
- `X_OAUTH_REDIRECT_URI` — exact URL registered with X: `https://veinvite.vercel.app/api/rewards/x-promotion/x-connect/callback`.
- `VEINVITE_X_PROMOTION_DISCOVERY_MODE` — **`off` in production**. `probe` is read-only but can consume X API credits when offers exist; `live` may record discovered Posts into the existing verified submission pipeline.
- `VEINVITE_X_PROMOTION_URLLESS_START_AT` — **unset by default**. Explicit ISO-8601 start timestamp for a new URL-less rollout cohort. The URL input is hidden **only when both** discovery is `live`, valid OAuth settings exist, and the offer opened at or after this timestamp. Existing older receipts retain the manual URL submission fallback even after rollout.
- Do not set the timestamp or enable `live` until real matched-post coverage, 24-hour verification, and budget bounds are independently confirmed.
- Existing `X_API_BEARER_TOKEN` — currently production-scoped and provides only verified single-Post lookup readiness; **do not interpret single-Post readiness as a search entitlement**.

Do not paste or print secrets, OAuth codes, access tokens, or callback cookies. Ensure redirect host, scheme and path exactly match the application origin; production must be HTTPS. Test within VeWorld WebView and a normal browser, as the wallet session and OAuth state cookie must survive the full same-browser redirect round trip.

## Cost and correctness blockers

X officially bills by **resources returned**, not solely by calls. Post reads are currently listed at **$0.005 per Post** on https://docs.x.com/x-api/getting-started/pricing; verify the Developer Console before production. Discovery is currently capped at one page of 10 Posts per cron. Repeated searches can cost up to 10 × 96 × $0.005 = **$4.80/day**, excluding canonical post reads, if 10 Posts are returned at every 15-minute run. This is a theoretical **upper bound on returned results** for the broad search, not an approved budget or confirmed real bill. Per-resource daily deduplication may reduce actual charges, but must not be treated as a hard cost ceiling. Broad domain matching is incomplete and can miss eligible Posts.

**Before enabling `live`:**
1. Verify X recent-search permission (read-only probe on real Posts), exact-domain+query-token indexing and freshness; confirm an acceptable financial cap.
2. Prefer a wallet-author-targeted Post discovery or event-driven post-share check over repeated domain-wide 10-Post searches to reduce spend and missed claims.
3. Complete real OAuth handshake with an eligible wallet. Confirm a different wallet cannot link the same X author, signed state cannot be replayed or tampered with, and private accounts are blocked.
4. Confirm 24-hour revalidation, duplicate prevention, deletion/privacy reversal, X rate-limit/403 handling, and that the core B3TR claim ledger and forecast are unaffected.
5. Pass complete CI, browser/mobile QA and real on-chain finality on the existing payout path before withdrawing manual URL submission.

If the X API cannot meet price/coverage requirements, leave automatic discovery disabled and the manual option in place. A successful code build does not prove real X Post search entitlement.

## Schema deployment (2026-10-21)

- The additive OAuth-proof table was installed first in the preview Supabase project and then in production using the reviewed migration. Production observed version: `20261021041230` (`reward_x_promotion_oauth_proofs`).
- Verified production RLS ON; anonymous INSERT denied; authenticated SELECT denied; service-role INSERT allowed; immutable proof trigger exists; initial proof count 0.
- This schema change was followed by PR #1189 (merged and deployed). OAuth configuration was provided directly in Vercel by the account holder. Automatic X discovery is still `off`, and no existing user payout was changed.
- The independent OAuth-proof table is mandatory because a previously recorded X identity from a manually pasted public Post URL is **not account ownership proof**. Never use `reward_x_promotion_x_identities` alone to authorize automatic reward submission.
