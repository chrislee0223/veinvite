# VeInvite QA Studio

## Purpose

VeInvite QA Studio is a Preview/development-only harness for reproducing user-visible VeInvite states with the real application components.

It is deliberately not a second copy of the app. The Studio owns scenario selection, deterministic fixtures, viewport framing, comparison, inspection, and coverage metadata. User-facing UI remains owned by the production components themselves.

## Non-negotiable invariants

1. **Reuse production components.** Do not copy a production screen into a QA-only component just to make it easier to demo.
2. **Production is fail-closed.** `/qa` and `/qa/render` return 404 whenever `VERCEL_ENV=production`.
3. **No live mutations from scenario renders.** The initial renderer does not call VeInvite APIs, wallet providers, analytics, or Production data.
4. **QA does not boot the normal wallet/runtime tree.** `AppProviders` keeps Chakra/the production theme for visual parity, but `/qa` and `/qa/*` bypass VeChain, wallet recovery, reward recovery, and normal app lifecycle helpers.
5. **Stable scenario IDs.** Scenario IDs are reproducible URLs and test contracts. Rename them only as an intentional migration.
6. **Every scenario has an expected result.** A state without an expectation is a demo, not a useful QA contract.
7. **New user-facing domains stay visible in coverage.** New features must be added to the surface coverage catalog even before every advanced scenario is implemented.
8. **One registry drives the tools.** Scenario Lab, State Gallery, Coverage, and CI consume the same `scenarioRegistry.ts` data.

## Routes

- `/qa` — the interactive QA Studio.
- `/qa/render` — an isolated same-origin renderer used by the Studio's device frames and gallery thumbnails.
- `/ui-test` — legacy developer URL; Preview/development requests redirect to `/qa` so old bookmarks do not keep a second test experience alive.

The QA routes are server-gated by `src/qa/serverGate.ts` and are not available in Production.

## Why the Studio uses iframes

A visual card whose CSS width is merely reduced does not faithfully test responsive behavior. QA Studio gives each scenario renderer a real iframe viewport such as 320, 393, 412, 768, or 1280 CSS pixels wide. The production component's own media queries therefore execute against the selected viewport.

This also keeps the QA controls visually separate from the user-facing screen.

## Scenario registry

`src/qa/scenarioRegistry.ts` is the contract for reproducible UI states.

Each scenario defines:

- stable `id`
- title and description
- domain/category
- renderer adapter
- contract version
- risk level
- default locale and viewport
- searchable tags
- expected results
- deterministic fixture values

The initial foundation intentionally registers only states that can be represented safely without Production side effects. Areas not yet connected to deterministic adapters are marked `planned` rather than being represented by fake screenshots.

One legacy exception is the audited active-existing-user rejection parity component. It predates QA Studio and uses the same shared `INVITEE_COPY` rejection strings protected by the existing UI stability gate. It is registered under a stable QA scenario now so the old `/ui-test` route can be retired. The scenario is explicitly described as a parity baseline, not falsely labelled as a fully extracted Production state component; eligibility remains incomplete until the pure Production state is shared directly.

## Current foundation

The first foundation includes:

- Invite landing — ready
- Invite landing — actions disabled/pending
- Active-existing-user rejection parity baseline
- Invite guide
- Network coming-soon state
- all current VeInvite locales through the production locale registry
- mobile/tablet/desktop iframe viewports
- A/B language comparison
- shareable query-string state
- action timeline for safe simulated actions
- State Gallery
- explicit Coverage view
- CI checks for registry integrity, production-component reuse, Production blocking, root runtime-provider isolation, and legacy rejection parity

## Adding a user-facing feature

When a new feature or user-visible state is added:

1. Reuse or extract the actual production component so it can be rendered deterministically.
2. Add the domain to `QA_SURFACE_COVERAGE` if it does not already exist.
3. Add one or more stable scenarios to `QA_SCENARIOS`.
4. Add realistic fixture values without Production side effects.
5. Define the expected result for every scenario.
6. Add useful risk/tags/default viewport metadata.
7. Mark the surface `covered` only when its registered scenarios actually render the production UI.
8. Run `npm run test:qa`, `npm run typecheck`, and the normal CI suite.

A feature should not silently introduce a new user state that cannot be identified in the QA catalog.

## Data and security model

The current renderer is intentionally presentation-only. CTA actions emit a same-origin QA timeline event instead of invoking wallet, analytics, or backend mutation logic.

Isolation exists at two layers. First, the QA pages fail closed on Production. Second, even in Preview/development, `AppProviders` recognizes `/qa` and `/qa/*` before mounting the normal VeChain/wallet/runtime provider tree. QA still receives the real Chakra theme so production components retain visual parity, but wallet recovery, reward recovery, provider-ready signaling, and normal runtime helpers are not started inside the simulator.

Future simulators must preserve this rule by implementing explicit deterministic adapters for wallet/API/chain/time behavior. They must never fall back to Production data just because a fixture is missing.

Preview continues to use the project's dedicated Preview Supabase environment for genuine Preview E2E tests. QA scenario rendering and Preview E2E are complementary: scenario rendering is deterministic and safe; E2E validates the integrated Preview system.

## Planned next layers

The registry and renderer adapters are designed to expand without replacing the foundation. Planned layers include:

- wallet connect/sign/reject/switch/session simulator
- eligibility and invite conflict states, including extraction of the active-existing rejection into a pure shared Production state
- mission and reward state machines
- notification and leaderboard state galleries
- API latency/error/timeout fault injection
- on-chain pending/confirmed/reverted/eventual-consistency states
- time travel and old-session/version-migration states
- refresh/recovery and race-condition scenarios
- multi-user inviter/invitee simulation with a shared timeline
- invariant and state-transition checks
- Playwright browser journeys and device/browser matrix
- visual-regression baselines and before/after review
- one-click sanitized bug reproduction packages
- chaos testing and release candidate sign-off

The foundation should remain small enough to trust: advanced behavior is added through typed adapters and scenarios rather than by adding hidden one-off switches to the UI.
