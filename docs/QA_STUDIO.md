# VeInvite QA Studio

## Purpose

VeInvite QA Studio is the long-lived developer QA surface for reproducing user-visible states that are difficult or unsafe to reach in Production.

It is not a second copy of the app and must not become a collection of hand-recreated mock screens. The Studio should reuse real VeInvite components and only replace the external state, wallet, network, time, and backend conditions around them.

## Non-negotiable rules

1. Reuse real application components. Do not fork production UI into QA-only copies.
2. Keep scenarios in the central typed registry under `src/qa/scenarioRegistry.ts`.
3. Every scenario defines an expected-result contract.
4. QA routes are available only in local development and Vercel Preview. Production must return 404.
5. Isolated QA renderers must not issue Production writes, wallet mutations, reward actions, or live database mutations.
6. Test fixtures added later must use the same application/API types as the real feature.
7. New user-visible features or materially new states should ship with QA scenarios.
8. Existing `/ui-test` coverage is preserved while scenarios are migrated into the Studio; it should not be deleted merely because `/qa` exists.

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
