# VeInvite QA Studio

## Purpose

VeInvite QA Studio is the long-lived developer QA surface for reproducing user-visible states that are difficult or unsafe to reach in Production.

It is not a second copy of the app and must not become a collection of hand-recreated mock screens. The Studio should reuse real VeInvite components and only replace the external state, wallet, network, time, and backend conditions around them.

## Non-negotiable rules

1. Reuse real application components. Do not fork production UI into QA-only copies.
2. Keep scenarios in the central typed registry under `src/qa/scenarioRegistry.ts`.
3. Every scenario defines an expected-result contract.
4. The public VeInvite Production host must never expose QA Studio. Local development and ordinary Vercel Preview may expose it; a fixed dedicated QA project may expose it only when both `VEINVITE_QA_STUDIO=true` and an exact `VEINVITE_QA_HOST` match are present.
5. The fixed QA project must use Vercel Deployment Protection / Vercel Authentication so knowing the URL alone is not sufficient for access.
6. Isolated QA renderers must not issue Production writes, wallet mutations, reward actions, or live database mutations.
7. A dedicated QA host fails closed on normal `/api/*` routes. Any future backend-backed QA API must be separately designed and explicitly allowlisted instead of reusing application mutation routes by accident.
8. Test fixtures added later must use the same application/API types as the real feature.
9. New user-visible features or materially new states should ship with QA scenarios.
10. Existing `/ui-test` coverage is preserved while scenarios are migrated into the Studio; it should not be deleted merely because `/qa` exists.

## Current foundation

### `/qa`

The Studio shell provides:

- State Gallery grouped by feature
- risk labels
- viewport controls
- locale controls backed by the real locale list
- isolated browser viewport rendering
- expected-result inspector
- action contracts
- action timeline
- visible Preview/simulation safety status

### `/qa/render`

Each scenario is rendered in an iframe through a separate route. This is deliberate: changing the iframe width changes the actual CSS viewport seen by the application component, so responsive media queries behave like a browser at that width rather than a desktop component squeezed inside a narrow div.

### Scenario Registry

`src/qa/scenarioRegistry.ts` is the source of truth for the first scenario pack. Each scenario has:

- stable ID
- title and description
- feature group
- real screen/component target
- risk level
- default locale and viewport
- configurable state
- expected results
- supported action contracts

Future Gallery, Journey Runner, browser automation, visual regression, coverage reporting, and release sign-off should consume this same registry instead of maintaining separate scenario lists.

## Dedicated QA project

The preferred long-lived operator setup is a second Vercel project connected to the same repository and `main` branch, with its own fixed QA domain. It is a deployment shell for QA Studio, not a second VeInvite product.

Required safeguards:

- enable Vercel Deployment Protection / Vercel Authentication on the entire QA project
- set `VEINVITE_QA_STUDIO=true`
- set `VEINVITE_QA_HOST` to the exact fixed QA hostname
- never copy Production database credentials, reward secrets, cron secrets, or other Production mutation credentials into the QA project
- use only the isolated Preview/non-production Supabase project if a later scenario pack genuinely needs backend state
- keep `NEXT_PUBLIC_NETWORK_TYPE` visibly non-production for QA builds

The host match is intentional. If the QA enable flag is accidentally added to the real VeInvite project but `VEINVITE_QA_HOST` points to the QA hostname, requests to the real Production hostname still receive 404 for `/qa`.

The dedicated QA host also rejects all normal `/api/*` requests in `src/proxy.ts`. This prevents the second Vercel project from inheriting a working application mutation surface or executing the repository's normal cron route merely because it shares the same codebase.

## Safety boundary

The first renderer intentionally turns real component callbacks into local QA events. It does not call wallet APIs, referral mutation APIs, Supabase, or reward endpoints.

This allows the operator to click the actual UI without contaminating invite counts, analytics, referral relationships, rewards, or Production user data.

Preview already has a dedicated Supabase environment for later end-to-end scenario packs. Any future Preview-backed scenario must preserve the existing fail-closed Preview/Production database guard.

## Adding a new feature

A feature is not considered fully represented in QA when only its happy path is visible. Add the smallest meaningful state pack covering the feature's real risk surface, normally including some combination of:

- default/happy path
- empty state
- loading state
- error/retry state
- disabled or pending state
- completed state
- permission/eligibility variants
- relevant mobile/desktop risk
- relevant localization risk

Avoid a full Cartesian product of every locale, viewport, and state. Use risk-based coverage and reserve exhaustive combinations for automated stress jobs where they add value.

## Planned scenario packs

The architecture is intentionally ready for incremental packs rather than one giant rewrite:

1. permanent-referral entry and invalid/full/re-entry states
2. wallet connect/signature/cancel/switch/session-expiry states
3. new/returning/existing-user eligibility states
4. mission progress, reconciliation, and return-from-dApp states
5. reward forecast/pending/confirmed/paid/error states
6. notification empty/unread/read/history states
7. leaderboard/rank movement/country aggregation states
8. referral network and future two-slot/infinite-canvas states
9. loading, timeout, malformed-response, offline, and race-condition states
10. multi-user, chain/DB/cache mismatch, and time-travel scenarios

## Automation roadmap

The next automation layer should add a real browser runner such as Playwright, then consume the same registry for:

- golden journeys
- interaction assertions
- viewport/browser matrix checks
- screenshot baselines and visual regression
- accessibility checks
- console/runtime error capture
- performance budgets
- changed-screen selection
- one-click reproducible bug packages
- release-candidate reports

Baseline changes must be reviewable and explicitly approved so intentional design updates do not become permanent false failures.

## Coverage principle

The long-term target is:

> No realistic user-visible VeInvite state should exist without a way to reproduce it in QA Studio.

This does not mean brute-forcing mathematically infinite combinations. Known states are registered explicitly, important combinations are generated deterministically, and race/chaos testing is used later to discover states that were not anticipated manually.
