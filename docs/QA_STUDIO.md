# VeInvite QA Studio

## Purpose

VeInvite QA Studio is the long-lived operator/developer QA surface for reproducing user-visible states that are difficult, rare, or unsafe to reach in Production.

It is not a second copy of the app. Real VeInvite components should be reused whenever possible, while wallet, network, backend, time, and user state are simulated or isolated around them.

The operator goal is simple:

> After an app change, QA Studio should tell us what to inspect, let us reproduce it safely, record the result accurately, and eventually block releases when important coverage is missing.

## Non-negotiable rules

1. Reuse real application components. Do not fork Production UI into QA-only copies.
2. Keep scenarios in the typed registry under `src/qa/scenarioRegistry.ts`.
3. Every scenario defines an expected-result contract.
4. The public VeInvite Production host must never expose QA Studio.
5. The dedicated QA project must remain protected by Vercel Authentication / Deployment Protection.
6. Isolated QA renderers must not issue Production writes, wallet mutations, reward actions, or live database mutations.
7. Dedicated QA traffic must fail closed on normal application `/api/*` mutation routes unless a future QA-only endpoint is explicitly designed and allowlisted.
8. Test fixtures added later must use the same application/API types as the real feature.
9. New user-visible features or materially new states should ship with QA coverage by default.
10. Existing `/ui-test` coverage stays available while useful states are migrated into first-class QA scenarios.

## Current operating model

The dedicated `veinvite-qa` Vercel project tracks repository `main` as a protected Preview deployment. Its Production branch is intentionally parked away from `main`.

Current QA Preview safeguards include:

- `VEINVITE_QA_STUDIO=true` only in the isolated QA Preview environment
- protected access through Vercel Authentication
- dedicated non-Production Supabase public environment
- no QA server database secret
- fail-closed server database access
- normal application `/api/*` routes blocked for the dedicated QA project
- noindex / noarchive headers on QA routes

The exact-host guard remains in code as a fail-closed safeguard for any future fixed QA Production-host model, but the current operator path is the protected Preview alias.

## Current operator UI

`/qa` now defaults to an operator-friendly test center rather than a developer console.

The default view provides:

- **핵심 점검 / 모든 상황** browsing modes
- search by actual registered scenario content
- scenario groups using human-readable product areas
- exact viewport presets including width and height
- locale controls only when the scenario actually supports external locale override
- exact review identity by **scenario + viewport + locale**
- `정상 / 문제 있음 / 확인 불가`
- `미확인으로 되돌리기`
- lightweight issue category and note capture
- build-scoped local review persistence
- reproducible URLs for scenario + viewport + locale
- explicit preview loading / slow / retry state
- true app-screen focus mode
- optional advanced inspector instead of developer details by default

A manual `정상` result means only that the operator inspected that exact configuration. It must not be presented as an automated test result.

## `/qa/render`

Each scenario is rendered through an isolated iframe route. Width and height are both controlled by the viewport preset so responsive CSS sees a real iframe viewport instead of a desktop component merely squeezed into a narrow container.

The renderer currently intercepts real InviteLanding callbacks and emits QA action events instead of performing wallet/network mutations.

The renderer also exposes existing safe preview components directly for:

- mission / reward states
- notifications
- eligibility rejection
- referral network canvas
- the legacy all-app preview hub

## Scenario Registry

`src/qa/scenarioRegistry.ts` is the source of truth for registered reproducible states.

Each scenario contains:

- stable ID
- human title and description
- product group
- real screen / preview target
- risk level
- `core` flag for release-oriented smoke coverage
- default locale and viewport
- whether the outer QA locale control is valid for that screen
- configurable state
- expected results
- supported action contracts

Do not infer “coverage” only from raw scenario count. Coverage quality depends on whether important product states are directly reproducible and whether the scenario is current.

## Feature coverage map

`src/qa/featureCoverageMap.ts` is the first machine-readable impact map.

It links:

- product surface
- watched source paths
- scenario IDs
- current coverage level (`direct` or `legacy`)

This map is deliberately separate from the scenario registry. The registry answers **what can be reproduced**; the coverage map answers **which source changes may affect which QA surfaces**.

The next automation step should use Git changed files plus this map to produce a real **이번 업데이트 확인** list. Until that automation exists, the UI must not pretend that recently affected screens were selected automatically.

## Review identity and trust

QA review state is intentionally configuration-specific.

For example:

- `invite-landing-ko-mobile + iPhone + ko`
- `invite-landing-ko-mobile + Desktop + en`

are different reviews.

This prevents a mobile Korean pass from incorrectly making the desktop English configuration appear verified.

Review status currently represents **manual operator evidence** only. Future automation must display automated evidence separately, for example:

- 직접 확인
- 자동 브라우저 통과
- visual baseline 통과
- 오래돼서 재확인 필요

## Adding a new feature

A feature is not considered well represented when only its happy path is visible.

Add the smallest useful risk-based state pack, normally including some combination of:

- default / happy path
- empty
- loading
- error / retry
- disabled / pending
- completed
- eligibility / permission variants
- relevant mobile / desktop risk
- relevant localization risk
- refresh / recovery behavior

Avoid a full Cartesian product of every locale, viewport, and state. Important combinations should be explicit; broad stress combinations belong in automated jobs later.

When adding a meaningful user-facing surface, also update the feature coverage map so future changed-screen selection can find it.

## Planned capability layers

### 1. Coverage expansion

Priority scenario packs:

1. permanent-referral invalid / full / re-entry states
2. wallet connect / signature / cancel / switch / session-expiry states
3. new / returning / existing-user eligibility states
4. mission progress / reconciliation / return-from-dApp states
5. reward forecast / pending / confirmed / paid / error states
6. notification empty / unread / read / history states
7. leaderboard rank movement / country aggregation / wallet detail states
8. settings / legal / first-time consent states

### 2. Journey and recovery

Add deterministic operator journeys such as:

`invite → wallet → eligibility → mission → reward`

Then add:

- refresh at every important step
- background / resume
- external dApp return
- session expiry
- wallet switch
- offline → online recovery
- duplicate click / concurrent tab behavior

### 3. Environment controls

Add safe controls for:

- persona presets (new / returning / existing / partial mission / paid)
- fake wallet state
- network delay / timeout / malformed response
- time travel / round boundaries
- reduced motion
- long-translation stress
- cache / chain / DB mismatch simulations

These controls must never weaken Production isolation.

### 4. Changed-screen selection

Use `featureCoverageMap.ts` plus Git diff information to derive:

- affected product surfaces
- linked scenarios
- uncovered changed surfaces
- release review checklist

Start as an informational warning/report. Convert it into a hard coverage gate only after mapping is broad enough to avoid noisy false failures.

### 5. Browser automation

Add Playwright (or an equivalent real browser runner) and consume the same registry for:

- golden journeys
- interaction assertions
- browser / viewport matrix
- accessibility checks
- console/runtime error capture
- screenshot baselines and visual regression
- performance budgets
- reduced-motion checks
- failure artifacts

Visual baseline updates must be reviewable and explicit.

### 6. Bug package and release rehearsal

A future `문제 있음` flow should be able to package:

- scenario ID
- viewport and locale
- build SHA
- simulated environment state
- action history
- expected result
- operator category / note
- reproducible URL
- screenshot / browser evidence when automation exists

Release rehearsal should then build a guided checklist from changed surfaces + core journeys and report:

- checked
- pass
- issue
- unable to verify
- automation status
- missing coverage

## Longer-term quality ideas

Useful later layers include:

- State Map / dead-end detection
- Race Condition Lab
- Refresh / Recovery Lab
- Old User Simulator
- API Contract Guard
- Analytics Inspector (show intended events without sending Production analytics)
- Deep Link Lab
- real browser/device matrix
- Animation Lab
- accessibility stress presets
- Chaos Mode in Preview only
- QA history by commit / PR
- performance regression budgets
- stale-scenario warnings
- direct-vs-legacy coverage score
- Production-vs-Preview comparison when it can be done safely

## Coverage principle

The long-term target remains:

> No realistic user-visible VeInvite state should exist without a safe way to reproduce it in QA Studio.

That does not mean brute-forcing infinite combinations. Known states are explicit, important combinations are deterministic, and later race/chaos automation should discover edge cases that were not anticipated manually.
