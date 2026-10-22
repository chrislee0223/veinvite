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
- `VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY=author` — author-only public timeline reads, based on verified OAuth X IDs. This avoids domain-wide first-page misses and should be the only strategy for a new URL-less cohort.
- `VEINVITE_X_PROMOTION_DAILY_READ_CALLS` — **unset by default**. Mandatory positive integer 1–20 before author discovery can read X. The shared atomic rate limiter caps paid user-timeline calls per 24-hour limiter window across Vercel functions; every author is also limited to one scan per hour. Each call reads at most 10 Posts (a one-time HTTP 400 field fallback may issue a second HTTP request). This is a call/results cap, **not a guaranteed monetary billing cap**. Verify external provider prices and credit balance.
- `VEINVITE_X_PROMOTION_URLLESS_START_AT` — **unset by default**. Explicit ISO-8601 start timestamp for a new URL-less rollout cohort. The URL input is hidden **only when** discovery is `live`, strategy is `author`, a valid daily read cap is present, OAuth is configured, and the offer opened at or after the timestamp. Existing older receipts retain the manual URL submission fallback even after rollout.
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

## Author-timeline reliability notes (2026-10-22)

- The original 10-result domain search could miss real VeInvite posts when unrelated authors filled its most recent page. The author-timeline path GET `/2/users/{oauthAuthorId}/tweets` filters by the exact, separately attested author and starts from the associated opportunity opening time.
- Every candidate still undergoes an independent canonical X Post lookup plus the existing duplicate/24-hour verification process before any reward is paid. The author API never pays B3TR directly.
- If an author has over 10 eligible posts, pagination is incomplete; `truncated` is reported and the system must not promise 100% coverage. Provider index delays, rate limits and expired offers remain possible; keep older manual submission working.
- **Production must remain discovery `off` and URL-less start timestamp unset** until an operator separately approves recurring costs and validates an actual author timeline response with a bound X account. The previously authorized $1 one-off provider test is not authorization for recurring usage.

## $5 monthly operating limit (2026-10-22)

- Operator authorized a **$5/month** X API operating budget. The migration `20261022014231_add_x_promotion_monthly_api_budget_v1.sql` installs an atomic shared database counter with a fixed **$5 (5,000 milliUSD)** UTC-calendar-month ceiling; `TIMELINE` scans have their own **$3** sub-cap to reserve at least $2 capacity for author verification, wallet account linking and periodic readiness.
- Before issuing a chargeable X API request, VeInvite reserves a **worst-case** `TIMELINE=60 milliUSD` (ten Post resources plus one User expansion), `POST_LOOKUP=15 milliUSD` (a Post and possible author expansion), or `OAUTH_USER=10 milliUSD`. The reservation is conservative and is **not refunded** on failure, so it can only stop earlier than the cost limit. It also pessimistically reserves again for duplicate Post requests; it does not rely on provider deduplication.
- Readiness probes are reduced from every 15 minutes to once per **six hours**, to avoid budget exhaustion when no user is participating. Existing 15-minute lifecycle and B3TR worker frequency are unchanged.
- The app allowance covers X requests initiated through the budgeted VeInvite code paths; **it cannot guarantee the X account's entire monthly bill**, because external applications, one-off probes, billing-cycle dates, X price changes, and provider billing adjustments are outside this app. Set a second, provider-native **$5 spending limit in the X Developer Console** to enforce the account-wide monetary cap.
- At budget exhaustion, chargeable reads fail closed and the system must not create false verifications or payouts. Keep existing legacy link submissions available for historical opportunities; do not drop proof or historical payout records.
- The previous 1-shot provider probes were executed under the separately approved $1 one-time allowance. They expire with their UTC-day configuration and are not part of the recurring rollout.
