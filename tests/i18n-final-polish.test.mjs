import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  localeSource,
  canvasCopySource,
  networkSource,
  guideSource,
  layoutSource,
  polishCss,
  providerSource,
  greekSource,
  networkNavSource,
] = await Promise.all([
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/lib/i18n/networkCanvasControlCopy.ts', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
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

test('Network canvas controls have explicit copy for every supported locale', () => {
  assert.equal(supportedLocales.length, 29);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);

  for (const locale of supportedLocales) {
    assert.match(
      canvasCopySource,
      localeObjectPattern(locale),
      `Network canvas control copy is missing for ${locale}`,
    );
  }
});

test('the final localization layer is loaded after the base typography layer', () => {
  const baseIndex = layoutSource.indexOf("./localized-typography.css");
  const finalIndex = layoutSource.indexOf("./localization-final-polish.css");
  assert.ok(baseIndex >= 0);
  assert.ok(finalIndex > baseIndex);
});

test('final layout polish still covers public Network surfaces, RTL, CJK, Korean and tall-script metrics', () => {
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

test('Network routes every wallet through one production runtime', () => {
  assert.match(guideSource, /<AppNetworkHub locale=\{locale\} \/>/);
  assert.doesNotMatch(guideSource, /AppNetworkCanaryV\d+/);
  assert.doesNotMatch(guideSource, /NETWORK_CANARY_WALLET/);
  assert.doesNotMatch(guideSource, /NetworkPageZoomGuard/);
  assert.match(networkSource, /data-network-runtime="single"/);
  assert.doesNotMatch(networkSource, /MutationObserver/);
  assert.doesNotMatch(networkSource, /productionNetworkCanary/);
});

test('single Network runtime owns camera changes explicitly and restores parent views', () => {
  assert.match(networkSource, /returnViewByChildRef/);
  assert.match(networkSource, /viewByFocusRef/);
  assert.match(networkSource, /function centeredView/);
  assert.match(networkSource, /const returnToParent = useCallback/);
  assert.match(networkSource, /pinchReturnIntentRef/);
  assert.match(networkSource, /wheelReturnDistanceRef/);
  assert.match(networkSource, /touch-action:none/);
  assert.match(networkSource, /const observer = new ResizeObserver\(update\)/);
  assert.doesNotMatch(networkSource, /safeBottom/);
  assert.doesNotMatch(networkSource, /safeRight/);
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
