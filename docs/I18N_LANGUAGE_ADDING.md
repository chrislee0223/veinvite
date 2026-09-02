# VeInvite language expansion guide

This is the reusable checklist for adding a language or regional language variant without leaving a partially translated or visually broken VeInvite experience.

## Definition of supported

A locale is supported only when an ordinary user can complete the same VeInvite flow in it from start to finish: language selection, invitation, eligibility, missions, rewards, leaderboard, settings, notifications, wallet verification, and legal pages.

Do not call a locale supported after translating only a landing page or the main screen.

## 1. Start from the single locale registry

Edit `src/lib/i18n/locales.ts` and add one `LOCALE_DEFINITIONS` entry with:

- locale code;
- native display name;
- app-owned flag SVG path;
- writing direction (`ltr` or `rtl`);
- typography group (`latin`, `cjk`, `arabic`, or `indic`).

The registry drives language pickers, flags, browser detection, wallet preference validation, document direction, and script-aware typography. Do not create a second locale list in a component.

Exact regional tags are resolved before base-language fallback. For example, a browser reporting `zh-TW` resolves to the reviewed `zh-tw` pack, while another unsupported `zh-*` tag can still fall back to `zh`.

## 2. Flags are a visual aid, not a language identity

Store flag SVGs under `public/flags/` and reference them from the registry. Do not use platform emoji flags.

The same country flag may intentionally appear beside more than one language. Current examples include:

- India: हिन्दी, मराठी, తెలుగు;
- Nigeria: Nigerian Pidgin, Hausa.

A language can also be represented by one major market even when it is spoken in several countries. The user-visible identity is always `flag + native language name`, not the flag alone.

## 3. Add one complete locale pack

Create `src/lib/i18n/localePacks/<locale>.ts` implementing `LocalePack`, then register it in `registerExpandedLocales.ts`.

The pack covers:

- rejection and eligibility copy;
- guide and mission flow;
- home and invite landing;
- invitee onboarding and errors;
- language selection;
- leaderboard;
- consent, privacy policy and terms;
- navigation and notifications;
- reward receipt;
- settings;
- wallet verification.

`LocalePack` is typed against the current copy shapes so new required fields cannot silently disappear from a new-style locale.

### Regional variants and formal registers

Do not mechanically convert a base language into a regional version.

Examples from the reviewed 27-locale baseline:

- `zh-tw` is Taiwan Traditional Chinese with Taiwan UI terminology such as `使用者`, `錢包`, and `隱私權政策`, not a Simplified Chinese character swap.
- `arz` uses natural Egyptian Arabic for day-to-day UI while formal legal/security copy deliberately uses Modern Standard Arabic, which is the appropriate formal register.
- `pcm` uses Nigerian Pidgin for ordinary product UI while formal legal/security copy deliberately stays in clear English to avoid ambiguity in a context where English is the normal formal register.

When formal-copy inheritance is intentional, document it in the locale pack. Never let an English or base-language fallback happen accidentally.

## 4. Standalone localized surfaces are centralized too

Do not keep hidden locale tables inside components.

Current standalone copy lives in:

- `src/lib/i18n/rewardForecastCopy.ts` — reward estimate card;
- `src/lib/i18n/legalNavigationCopy.ts` — legal-page navigation.

Both are exhaustive `Record<SupportedLocale, ...>` tables and are included in `test:i18n`. Adding a locale without these strings must fail CI.

If another standalone localized surface is introduced later, either move it into `LocalePack` or give it the same exhaustive `SupportedLocale` protection and add it to the completeness audit.

## 5. Product semantics must not drift

Keep these names intact unless the product itself changes:

- VeInvite
- VeBetterDAO
- VeChain
- VeWorld
- B3TR
- VOT3
- dApp
- Allocation Voting
- VeChain Explorer

Every locale must preserve these rules:

1. New user: no previous VeBetterDAO reward or Allocation Voting history is found.
2. Returning user: older activity may exist, but there has been no VeBetterDAO reward or Allocation Voting activity since the start of the oldest of the last 12 completed rounds.
3. Mission completion: B3TR rewards from 3 different VeBetterDAO dApps, the required B3TR-to-VOT3 conversion, and one Allocation Voting participation.
4. Public new/returning totals include only wallets that completed every mission.
5. A leaderboard referral appears after all missions are complete and the inviter receives the verified B3TR reward.
6. Eligible referral rewards are handled automatically; copy must not teach users that a manual claim is required.
7. Self-referrals and duplicate invite relationships remain disallowed.

Translate for natural local usage rather than word-for-word similarity. Established local Web3 loanwords are preferable to awkward invented translations when they are what real users expect.

## 6. Typography and layout are part of localization

`src/app/localized-typography.css` contains cross-language safeguards. The document receives `data-locale-typography` from the central registry so a future language can inherit script-level behavior instead of adding one-off pixel hacks.

Review phone and desktop widths for:

- clipped or overly tall buttons;
- awkward one-word headline rows;
- horizontal overflow in cards and dialogs;
- step labels and badges wrapping to two lines;
- bottom navigation truncation;
- language picker scrolling with a large language list;
- leaderboard column pressure;
- legal paragraph readability;
- wallet addresses, hashes, invite codes and token values remaining intact.

Script-specific rules in the reviewed baseline:

- CJK: strict line-breaking for Chinese (including `zh-tw`) and Japanese; Korean keeps word/phrase boundaries.
- Arabic-script: extra line-height and appropriate installed-font fallbacks; Urdu receives additional Nastaliq vertical room.
- Indic: extra line-height plus Devanagari, Bengali and Telugu system-font fallbacks.
- Latin/Cyrillic: normal word boundaries; do not split ordinary translated words in the middle just to avoid overflow.

## 7. RTL requires a separate review

Arabic, Egyptian Arabic and Urdu are currently RTL.

For any RTL locale:

1. set `direction: 'rtl'` in the registry;
2. `LocaleDocumentSync` sets `<html dir="rtl">` automatically;
3. inspect legacy physical `left/right` positioning;
4. keep wallet addresses, transaction hashes, invite codes and token amounts LTR with bidi isolation;
5. avoid bidi-sensitive arrow copy such as `B3TR → VOT3` when a natural written phrase is safer;
6. review menu placement, back arrows, dialogs and numeric values separately.

Never simulate RTL by reversing strings.

## 8. Persistence stays future-proof

The Production migration `20260902074759_future_proof_wallet_language_constraint.sql` already replaced the old hard-coded language allow-list with a locale-tag format constraint.

Ordinary future language additions therefore should not need a new database migration. The language preference endpoint uses `isLocale()` from the central registry as the authoritative supported-language check.

After adding a locale, verify browser detection, manual switching, refresh persistence, wallet preference restoration and cross-tab storage synchronization.

## 9. Automated checks

Run:

```bash
npm run typecheck
npm run test:i18n
npm run build
```

The i18n gate checks, among other things:

- the reviewed 27-locale baseline does not shrink;
- locale codes are unique and regional tags are supported;
- every flag asset exists;
- shared flags for India/Nigeria remain valid language choices;
- RTL and typography metadata are correct for Arabic, Urdu, Egyptian Arabic, Indic and CJK scripts;
- every non-core locale has a typed pack and registration;
- product terminology and the 12-completed-round rule remain present;
- Taiwan copy does not regress to obvious Simplified Chinese UI wording;
- Urdu/Egyptian token-conversion copy avoids bidi-sensitive arrows;
- intentional formal-register reuse for Egyptian Arabic and Nigerian Pidgin is explicitly documented;
- legal navigation and reward forecast copy cover every locale;
- wrapping, script font fallbacks and bidi isolation remain present;
- wallet-language persistence remains registry-gated instead of reverting to a database allow-list.

The GitHub CI workflow runs the i18n gate on pull requests.

## 10. Release checklist

Before merge:

1. typecheck passes;
2. i18n quality/completeness tests pass;
3. reward and existing app regression gates pass;
4. production build passes;
5. all new languages appear in Settings with the intended flag and native name;
6. the longest/newest scripts are reviewed for mobile and desktop wrapping;
7. all RTL locales are reviewed separately;
8. no accidental fallback language leaks remain;
9. existing 17-language behavior is regression-tested;
10. Production is deployed only after the reviewed branch is stable;
11. after Production is READY, perform live language switch/save/reload checks before announcing the update publicly.

The intended future workflow is therefore: add one registry entry, one flag (or intentionally reuse an existing one), one complete locale pack, register it, add the two centrally guarded standalone copy entries, then run automated and visual QA. A normal new language should not require editing the database allow-list or scattering locale metadata across unrelated components.
