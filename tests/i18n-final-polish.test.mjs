import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  localeSource,
  copySource,
  canarySource,
  ambientSource,
  correctionSource,
  directDropSource,
  dragGhostSource,
  localeLayoutSource,
  rootIdentitySource,
  touchNavigationSource,
  guideSource,
  layoutSource,
  polishCss,
  providerSource,
  greekSource,
  networkNavSource,
] = await Promise.all([
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/lib/i18n/networkCanaryInteractionCopy.ts', 'utf8'),
  readFile('src/components/AppNetworkCanaryV65.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV67.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV68.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV72.tsx', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/app/layout.tsx', 'utf8'),
  readFile('src/app/localization-final-polish.css', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/lib/i18n/greekFinalPolish.ts', 'utf8'),
  readFile('src/lib/i18n/networkNavigationCopyPolish.ts', 'utf8'),
]);

const supportedLocales = [
  ...localeSource.matchAll(/\{ locale: '([^']+)'[^\n]+direction:/g),
].map((match) => match[1]);

function localeObjectPattern(locale) {
  const key = locale.includes('-') ? `'${locale}'` : locale;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*\\{`, 'm');
}

test('Network interaction feedback has explicit copy for every supported locale', () => {
  assert.equal(supportedLocales.length, 28);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);

  for (const locale of supportedLocales) {
    assert.match(
      copySource,
      localeObjectPattern(locale),
      `Network interaction copy is missing for ${locale}`,
    );
  }
});

test('Network interaction localization covers every legacy feedback source string', () => {
  for (const source of [
    'Already in ',
    'Release to move to ',
    'Release to add to ',
    '✓ Moved',
    '✓ Added',
    'Couldn’t save this position.',
    'Couldn’t confirm the group move.',
  ]) {
    assert.ok(canarySource.includes(source), `missing Network localization bridge for: ${source}`);
  }

  assert.match(copySource, /\\u2068/);
  assert.match(copySource, /\\u2069/);
});

test('the final localization layer is loaded after the base typography layer', () => {
  const baseIndex = layoutSource.indexOf("./localized-typography.css");
  const finalIndex = layoutSource.indexOf("./localization-final-polish.css");
  assert.ok(baseIndex >= 0);
  assert.ok(finalIndex > baseIndex);
});

test('final layout polish covers Network, RTL, CJK, Korean and tall-script metrics', () => {
  assert.match(polishCss, /\.productionNetworkCanaryV45/);
  assert.match(polishCss, /\.publicExplorePage/);
  assert.match(polishCss, /html\[dir='rtl'\]/);
  assert.match(polishCss, /html\[lang='ko'\]/);
  assert.match(polishCss, /\[lang='zh'\]/);
  assert.match(polishCss, /data-locale-typography='arabic'/);
  assert.match(polishCss, /data-locale-typography='indic'/);
  assert.match(polishCss, /html\[lang='ur'\]/);
  assert.match(polishCss, /font-variant-numeric:\s*tabular-nums/);
  assert.match(polishCss, /unicode-bidi:\s*isolate/);
});

test('the special Network canary keeps V72 touch navigation over V71 root identity and the mature localized chain', () => {
  assert.match(guideSource, /AppNetworkCanaryV72/);
  assert.match(touchNavigationSource, /AppNetworkCanaryV71/);
  assert.match(touchNavigationSource, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV70/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV69/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV68/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV67/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV66/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV65/);
  assert.match(rootIdentitySource, /AppNetworkCanaryV70/);
  assert.match(rootIdentitySource, /<AppNetworkCanaryV70 locale=\{locale\} \/>/);
  assert.match(localeLayoutSource, /AppNetworkCanaryV69/);
  assert.match(localeLayoutSource, /<AppNetworkCanaryV69 locale=\{locale\} \/>/);
  assert.match(dragGhostSource, /AppNetworkCanaryV68/);
  assert.match(dragGhostSource, /<AppNetworkCanaryV68 locale=\{locale\} \/>/);
  assert.match(directDropSource, /AppNetworkCanaryV67/);
  assert.match(directDropSource, /<AppNetworkCanaryV67 locale=\{locale\} \/>/);
  assert.match(correctionSource, /AppNetworkCanaryV66/);
  assert.match(correctionSource, /<AppNetworkCanaryV66 locale=\{locale\} \/>/);
  assert.match(ambientSource, /AppNetworkCanaryV65/);
  assert.match(ambientSource, /<AppNetworkCanaryV65 locale=\{locale\} \/>/);
  assert.match(canarySource, /const resolvedLocale = resolveLocale\(locale\)/);
  assert.match(canarySource, /NETWORK_CANARY_UI_COPY\[resolvedLocale\]/);
  assert.match(canarySource, /getNetworkCanaryInteractionCopy\(resolvedLocale\)/);
});

test('user-facing Network navigation has an explicit label in all locales', () => {
  for (const locale of supportedLocales) {
    const key = locale.includes('-') ? `'${locale}'` : locale;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      networkNavSource,
      new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*'[^']+'`, 'm'),
      `Network navigation label is missing for ${locale}`,
    );
  }
  assert.match(networkNavSource, /NAV_COPY\[locale\]\.guide = label/);
});

test('Greek final product polish runs after shared i18n hardening', () => {
  const sharedIndex = providerSource.indexOf("@/lib/i18n/guideRewardClaimHardening");
  const greekIndex = providerSource.indexOf("@/lib/i18n/greekFinalPolish");
  const networkNavIndex = providerSource.indexOf("@/lib/i18n/networkNavigationCopyPolish");
  assert.ok(sharedIndex >= 0);
  assert.ok(greekIndex > sharedIndex);
  assert.ok(networkNavIndex > greekIndex);
});

test('Greek final polish fills the former English product fallback groups', () => {
  for (const assignment of [
    'Object.assign(HOME_COPY.el',
    'Object.assign(INVITE_LANDING_COPY.el',
    'Object.assign(INVITEE_COPY.el',
    'Object.assign(LEADERBOARD_COPY.el',
    'Object.assign(NOTIFICATION_COPY.el',
    'Object.assign(SETTINGS_COPY.el',
  ]) {
    assert.ok(greekSource.includes(assignment), `missing Greek final patch: ${assignment}`);
  }

  for (const requiredKey of [
    'reviewBadge:',
    'cancelTitleWaiting:',
    'rewardClaimDescription:',
    'demoResult:',
    'checkingLink:',
    'newSuccessDescription:',
    'reportingSince:',
    'walletDetails:',
    'progressTitle:',
    'walletNote:',
    'disconnectConfirmBody:',
  ]) {
    assert.ok(greekSource.includes(requiredKey), `Greek final patch is missing ${requiredKey}`);
  }
});