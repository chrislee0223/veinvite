# VeInvite language expansion guide

This guide is the checklist for adding any future language to VeInvite without leaving a partially translated or visually broken experience.

## Goal

A locale is considered supported only when an ordinary user can use the same VeInvite flow in that language from start to finish: language selection, invitation, eligibility, missions, rewards, leaderboard, settings, notifications, wallet verification, and legal pages.

Do not mark a language as supported after translating only the home screen.

## Single source of truth

Start in `src/lib/i18n/locales.ts`.

Add one `LOCALE_DEFINITIONS` entry containing:

- ISO-style locale code used by VeInvite
- native language name shown to the user
- app-owned flag SVG path
- writing direction (`ltr` or `rtl`)
- `cjk: true` only when CJK line-breaking behavior is required

The registry drives the Settings picker, invite-flow picker, browser-language detection, flag rendering, persisted wallet language preference validation, and document direction.

`LanguageFlag` must not maintain a second locale-to-flag table. The registry is the source of truth.

## Add the flag

Place an app-owned SVG under `public/flags/` and reference it from the registry.

Flags are a visual aid for the language picker, not a claim that a language belongs to only one country. Use a representative market consistently. VeInvite currently uses, for example, US for English, Brazil for Portuguese, and UAE for Arabic.

Do not fall back to platform emoji flags; their appearance differs by OS and browser.

## Add one complete locale pack

Create `src/lib/i18n/localePacks/<locale>.ts` and implement the `LocalePack` type.

A locale pack intentionally groups every user-facing copy surface for one language in a single file:

- entry rejection
- guide labels, flow, eligibility, mission and reward explanations
- home
- invite landing
- invitee onboarding and errors
- initial language selection
- leaderboard
- consent dialog
- privacy policy and terms of use
- navigation
- notifications
- reward receipt
- settings
- wallet verification

Then register the pack in `src/lib/i18n/localePacks/registerExpandedLocales.ts`.

`LocalePack` is typed against the current English copy shapes. If a product update adds a required field, TypeScript should force every new-style locale pack to be updated instead of silently leaving a missing string.

### Standalone typed copy surfaces

A small number of UI surfaces can live outside the shared copy modules for implementation reasons. They must still be exhaustive over `SupportedLocale` rather than silently falling back to English.

Currently `src/components/PublicRewardForecastPortal.tsx` owns the compact reward-estimate card copy as `Record<SupportedLocale, ForecastCopy>`. Add the new locale there as well. TypeScript and `test:i18n` both guard this surface, so a newly registered locale cannot be merged while its forecast copy is missing.

When another standalone localized surface is introduced, either move it into `LocalePack` or give it the same exhaustive `SupportedLocale` protection and add it to the i18n completeness audit. Do not create an unguarded 11-language-only table inside a component.

## Translation rules that must not drift

Keep these product and ecosystem names intact unless the product decision changes:

- VeInvite
- VeBetterDAO
- VeChain
- VeWorld
- B3TR
- VOT3
- dApp
- Allocation Voting
- VeChain Explorer

Preserve these VeInvite meanings in every language:

1. **New user**: no previous VeBetterDAO reward or Allocation Voting history is found.
2. **Returning user**: older activity may exist, but there has been no VeBetterDAO reward or Allocation Voting activity since the start of the oldest of the last 12 completed rounds.
3. **Mission completion**: the invitee receives B3TR rewards from 3 different VeBetterDAO dApps, makes the required B3TR → VOT3 conversion, and participates once in Allocation Voting.
4. **Public new/returning totals**: only wallets that completed every mission are included.
5. **Leaderboard referral**: appears after all missions are complete and the inviter receives the verified B3TR reward.
6. **Reward UX**: eligible referral rewards are handled automatically; user-facing text must not incorrectly teach users that a manual claim is required.
7. **Self-referrals and duplicate invite relationships** remain disallowed.

Translate for natural local usage, not word-for-word similarity. Shorten UI copy when needed while preserving the product meaning.

## Layout and typography review

Every newly added language must be checked at phone and desktop widths.

Review at least:

- buttons: no clipped labels or accidental fixed-height overflow
- headings: no bad one-word orphan rows when avoidable
- cards and dialogs: no horizontal overflow
- progress steps and badges: two-line text remains vertically aligned
- bottom navigation: short labels remain identifiable at narrow widths
- language picker: native name and flag remain visible
- leaderboard columns/cards: long labels do not push values off-screen
- wallet addresses and transaction hashes: remain readable and unmodified
- legal pages: paragraphs retain comfortable line-height

`src/app/localized-typography.css` owns cross-language wrapping and script-specific safeguards. Prefer logical layout behavior over language-specific pixel hacks.

## RTL languages

For Arabic, Hebrew, Persian, Urdu, or any future RTL locale:

1. mark the locale `direction: 'rtl'` in the registry;
2. `LocaleDocumentSync` will set `<html dir="rtl">` automatically;
3. review any legacy component using physical `left`, `right`, `text-align:left`, or absolute positioning;
4. keep wallet addresses, transaction hashes, invite codes, B3TR/VOT3 values, and similar technical identifiers LTR with bidi isolation;
5. verify flag/menu placement and dialog actions visually.

Do not simulate RTL by reversing strings.

## Persistence and browser detection

No new API allow-list should be created elsewhere. The wallet language preference endpoint validates through `isLocale()`, which reads the central registry. Browser language detection also resolves through the same list.

After adding a locale, verify:

- first visit with a matching browser language
- manual language change
- page refresh
- reconnecting a wallet with a saved preference
- cross-tab storage synchronization

## Automated checks

Run:

```bash
npm run typecheck
npm run test:i18n
npm run build
```

`test:i18n` derives the supported locale set from `LOCALE_DEFINITIONS` and checks that:

- the original core locales have not disappeared and the registry has no duplicates;
- each locale points to an existing app-owned flag;
- generic RTL handling remains wired and Arabic remains marked RTL;
- every non-core locale has a registered typed locale pack with all required copy sections;
- required VeInvite protocol terminology has not disappeared from a locale pack;
- legal navigation covers every registered locale;
- the standalone reward forecast card covers every registered locale;
- new localization boundaries use the strict `SupportedLocale` type instead of the legacy string-key compatibility type.

Do not maintain a second hard-coded list of expansion locales in the test. A future locale added to `LOCALE_DEFINITIONS` is discovered automatically and must have its flag, locale pack, registration, legal navigation, and guarded standalone copy completed before `test:i18n` can pass.

The GitHub CI workflow runs `test:i18n` on pull requests, so incomplete locale integration should be blocked before merge.

## Release checklist

Before merging a language expansion:

1. typecheck passes;
2. i18n completeness tests pass;
3. production build passes;
4. every new locale can be selected in Settings;
5. its flag and native name are correct;
6. refresh preserves selection;
7. main app, direct invite flow, legal pages, and standalone localized cards all use the locale;
8. no untranslated English UI leaks remain except intentional product names and established Web3 terminology;
9. mobile widths are reviewed for clipping, wrapping, overlap, and modal overflow;
10. RTL locale is reviewed separately when applicable;
11. existing Korean, English, Chinese, Hindi, Spanish, Japanese, Italian, Turkish, Dutch, German, and French flows are smoke-tested for regressions.

This process is deliberately reusable: adding the next language should mean adding registry metadata, one flag asset, one typed locale pack, registering it, completing any explicitly guarded standalone copy, and performing the visual review. The automated audit discovers the new locale from the registry; it should not require editing every existing translation module or maintaining a duplicate expansion-locale list.
