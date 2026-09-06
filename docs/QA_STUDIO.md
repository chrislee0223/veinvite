# VeInvite QA Studio

## Purpose

VeInvite QA Studio is the long-lived operator/developer QA surface for reproducing user-visible states that are difficult, rare, or unsafe to reach in Production.

It is not a second copy of the app. Real VeInvite components should be reused whenever possible, while wallet, network, backend, time, and user state are simulated or isolated around them.

The operator goal is simple:

> After an app change, QA Studio should make it obvious what to check, let us reproduce it safely, record the result accurately, and eventually help block releases when important coverage is missing.

## Non-negotiable rules

1. Reuse real application components. Do not fork Production UI into QA-only copies.
2. Keep scenarios in the typed registry under `src/qa/scenarioRegistry.ts`.
3. Every scenario defines an expected-result contract and a short operator task.
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

## Default operator experience: guided review

`/qa` now defaults to a simple guided review instead of exposing every QA control at once.

The intended default flow is:

1. **점검 시작 / 이어서 점검**
2. Read **지금 확인할 상황**
3. Follow one **지금 할 일** instruction
4. Use the real/safe app preview
5. Compare with **이러면 정상**
6. Choose one result:
   - **이상 없음 · 다음**
   - **문제 있음**
   - **잘 모르겠어요**
   - **나중에 확인**
7. Continue automatically to the next core situation

The operator should not need to understand QA architecture, scenario IDs, filters, or environment details before starting the first check.

Guided progress is build-scoped and stored locally so a refresh can resume the same review. Deferred items are remembered separately and can be revisited at the end.

For cases that require a real click or interaction, QA Studio warns before accepting **이상 없음** when no preview action was recorded. The warning is intentionally soft: the operator can still override it when appropriate.

The guided result bar stays visible near the bottom while reviewing long screens so the operator does not need to hunt for the result controls.

## Explore mode

All of the more powerful QA controls still exist under **전체 상황 보기**.

Explore mode retains:

- **핵심 점검 / 모든 상황** browsing
- product-area filtering
- search by case ID, actor, trigger, current state, outcome, task, and tags
- stable case IDs such as `INV-01`, `MR-01`, and `ELG-01`
- exact viewport presets including width and height
- locale controls only when the scenario supports external locale override
- exact review identity by **scenario + viewport + locale**
- `정상 / 문제 있음 / 확인 불가`
- `미확인으로 되돌리기`
- issue category and short note capture
- build-scoped local review persistence
- reproducible URLs for scenario + viewport + locale
- explicit preview loading / slow / retry state
- app-screen focus mode
- optional advanced inspector

Explore mode is for targeted investigation. Guided mode is the default for normal operator review.

## Human case model

Every registered scenario carries a compact case description:

- `caseId`: short stable operator reference
- `actor`: who is in this situation
- `trigger`: what caused or opened the situation
- `state`: what state the user is currently in
- `outcome`: what the user should be able to do or understand next

Each scenario also carries guided review metadata:

- `guide.task`: one plain-language instruction describing what the operator should do now
- `guide.done`: one plain-language success cue describing what normal looks like
- `guide.requireAction`: optional flag for cases where an actual preview interaction should be recorded before passing

This metadata is typed and registry validation rejects missing guided instructions.

The case model describes **what situation is being reproduced**. The guide explains **what the operator should do**. The expected-result contract remains the detailed technical/product truth for deeper inspection and future automation.

## `/qa/render`

Each scenario is rendered through an isolated iframe route. Width and height are both controlled by the viewport preset so responsive CSS sees a real iframe viewport instead of a desktop component merely squeezed into a narrow container.

The renderer intercepts real InviteLanding callbacks and emits QA action events instead of performing wallet/network mutations.

The renderer also exposes existing safe preview components directly for:

- mission / reward states
- notifications
- eligibility rejection
- referral network canvas
- the legacy all-app preview hub

## Scenario Registry

`src/qa/scenarioRegistry.ts` is the source of truth for registered reproducible states.

Each scenario contains:

- stable technical ID
- stable human case ID
- human title and description
- case context (`actor`, `trigger`, `state`, `outcome`)
- guided task and success cue
- product group
- real screen / preview target
- risk level
- `core` flag for release-oriented guided coverage
- default locale and viewport
- whether the outer QA locale control is valid for that screen
- configurable state
- expected results
- supported action contracts

Case IDs must be unique. Registry validation should fail when a case is missing operator context or guided instructions.

Do not infer coverage only from raw scenario count. Coverage quality depends on whether important product states are directly reproducible and whether the scenario is current.

## Feature coverage map

`src/qa/featureCoverageMap.ts` is the machine-readable impact-map foundation.

It links:

- product surface
- watched source paths
- scenario IDs
- current coverage level (`direct` or `legacy`)

The registry answers **what can be reproduced**. The coverage map answers **which source changes may affect which QA surfaces**.

Automatic **이번 업데이트 확인** selection is still a future step. Until that automation exists, the UI must not pretend that recently affected screens were selected automatically.

## Review identity and trust

Manual review state remains configuration-specific.

For example:

- `invite-landing-ko-mobile + iPhone + ko`
- `invite-landing-ko-mobile + Desktop + en`

are different reviews.

Guided session progress is a separate convenience layer that answers “which core situations did the operator walk through in this build?” It must not erase or weaken the exact configuration-specific review record.

A manual pass must never be presented as automated evidence. Future automation should show its evidence separately, for example:

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

Every new scenario must explain who is affected, what triggered it, the current state, the intended next outcome, one operator task, and one success cue.

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

Add deterministic journeys such as:

`invite → wallet → eligibility → mission → reward`

Then add refresh, background/resume, external dApp return, session expiry, wallet switch, offline recovery, duplicate click, and concurrent-tab behavior.

### 3. Environment controls

Add safe controls for persona presets, fake wallet state, network delay/timeout/malformed responses, time travel/round boundaries, reduced motion, long-translation stress, and cache/chain/DB mismatch simulations.

These controls must never weaken Production isolation.

### 4. Changed-screen selection

Use `featureCoverageMap.ts` plus Git diff information to derive affected product surfaces, linked scenarios, uncovered changed surfaces, and a release review checklist.

Start as an informational warning/report. Convert it into a hard coverage gate only after mapping is broad enough to avoid noisy false failures.

### 5. Browser automation

Add Playwright or an equivalent real browser runner and consume the same registry for golden journeys, interaction assertions, browser/viewport matrix, accessibility checks, console/runtime error capture, screenshot baselines, visual regression, reduced-motion checks, and failure artifacts.

### 6. Bug package and release rehearsal

A future `문제 있음` flow should package case ID, context, viewport, locale, build SHA, simulated environment state, action history, expected result, operator note, reproducible URL, and browser evidence when available.

Release rehearsal should summarize checked, pass, issue, unable-to-verify, deferred, automation status, and missing coverage.

## Coverage principle

The long-term target remains:

> No realistic user-visible VeInvite state should exist without a safe way to reproduce it in QA Studio.

That does not mean brute-forcing infinite combinations. Known states are explicit, important combinations are deterministic, and later race/chaos automation should discover edge cases that were not anticipated manually.
