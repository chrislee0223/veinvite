import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  navigation,
  host,
  sheet,
  providers,
  tracker,
  settings,
  consentGate,
  privacyPage,
  termsPage,
  motion,
  layout,
  legalConsistency,
] = await Promise.all([
  read('src/components/LegalNavigationMemory.tsx'),
  read('src/components/LegalDocumentSheetHost.tsx'),
  read('src/components/LegalDocumentSheet.tsx'),
  read('src/components/AppProviders.tsx'),
  read('src/components/UsageAnalyticsTracker.tsx'),
  read('src/components/AppSettings.tsx'),
  read('src/components/LegalConsentGate.tsx'),
  read('src/app/privacy/page.tsx'),
  read('src/app/terms/page.tsx'),
  read('src/components/SoftFocusMotion.ts'),
  read('src/app/layout.tsx'),
  read('src/app/legal-ui-consistency.css'),
]);

test('legal links keep real URLs while normal in-app clicks open the sheet', () => {
  assert.match(settings, /href="\/privacy"/);
  assert.match(settings, /href="\/terms"/);
  assert.match(consentGate, /href="\/privacy"/);
  assert.match(consentGate, /href="\/terms"/);

  assert.match(navigation, /event\.metaKey/);
  assert.match(navigation, /event\.ctrlKey/);
  assert.match(navigation, /event\.shiftKey/);
  assert.match(navigation, /event\.altKey/);
  assert.match(navigation, /veinviteLegalSheetReady/);
  assert.match(navigation, /currentPath !== '\/privacy'/);
  assert.match(navigation, /currentPath !== '\/terms'/);
  assert.match(navigation, /LEGAL_DOCUMENT_SHEET_OPEN_EVENT/);
  assert.match(navigation, /event\.preventDefault\(\)/);
  assert.match(navigation, /readStoredLegalReturn/);
  assert.match(navigation, /writeStoredLegalReturn/);
});

test('sheet history preserves Next state and keeps the visible URL unchanged', () => {
  assert.match(host, /__veinviteLegalSheet/);
  assert.match(host, /current && typeof current === 'object'/);
  assert.match(host, /\{ \.\.\.current \}/);
  assert.match(host, /window\.history\.pushState/);
  assert.match(host, /window\.history\.replaceState/);
  assert.match(host, /window\.location\.href/);
  assert.match(host, /window\.history\.back\(\)/);
  assert.match(host, /window\.addEventListener\('popstate'/);
  assert.doesNotMatch(host, /window\.location\.(?:assign|replace)/);
});

test('legal sheet is lazy, accessible, scroll-safe and uses shared motion', () => {
  assert.match(host, /dynamic\(/);
  assert.match(host, /import\('\.\/LegalDocumentSheet'\)/);
  assert.match(providers, /<LegalDocumentSheetHost \/>/);

  assert.match(sheet, /createPortal/);
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /aria-labelledby=/);
  assert.match(sheet, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(sheet, /event\.key === 'Escape'/);
  assert.match(sheet, /event\.key !== 'Tab'/);
  assert.match(sheet, /safe-area-inset-top/);
  assert.match(sheet, /safe-area-inset-bottom/);
  assert.match(sheet, /SOFT_FOCUS_MOTION_CSS/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(sheet, /onMouseDown=/);
  assert.doesNotMatch(sheet, /onPointerDown=/);
});

test('in-app legal header follows the shared title-left close-right pattern', () => {
  assert.match(sheet, /const closeLabel = SETTINGS_COPY\[locale\]\?\.close/);
  assert.match(sheet, /className="veinviteLegalSheetClose"/);
  assert.match(sheet, /aria-label=\{closeLabel\}/);
  assert.match(sheet, /className="veinviteLegalSheetCloseMark"/);
  assert.doesNotMatch(sheet, />×</);
  assert.match(
    sheet,
    /\.veinviteLegalSheetCloseMark::before,[\s\S]*\.veinviteLegalSheetCloseMark::after/,
  );
  assert.match(sheet, /top: 50%/);
  assert.match(sheet, /left: 50%/);
  assert.match(
    sheet,
    /translate\(-50%, -50%\) rotate\(45deg\)/,
  );
  assert.match(
    sheet,
    /translate\(-50%, -50%\) rotate\(-45deg\)/,
  );
  assert.match(sheet, /text-align: start/);
  assert.match(sheet, /justify-content: space-between/);
  assert.doesNotMatch(sheet, /className="veinviteLegalSheetBack"/);
  assert.doesNotMatch(sheet, /veinviteLegalSheetHeaderSpacer/);
  assert.doesNotMatch(sheet, /LEGAL_BACK_LABEL/);
});

test('settings legal chevrons match the language affordance and mirror for RTL', () => {
  assert.match(layout, /import '\.\/legal-ui-consistency\.css'/);
  assert.match(legalConsistency, /padding-inline-end: 12px/);
  assert.match(legalConsistency, /width: 24px/);
  assert.match(legalConsistency, /color: #a49f94/);
  assert.match(legalConsistency, /font-size: 1\.45rem/);
  assert.match(
    legalConsistency,
    /html\[dir='rtl'\][\s\S]*transform: scaleX\(-1\)/,
  );
});

test('lazy-loaded legal sheet always gets a visible enter animation', () => {
  assert.match(motion, /@keyframes veinviteLegalSheetBackdropIn/);
  assert.match(motion, /@keyframes veinviteLegalSheetPanelIn/);
  assert.match(
    motion,
    /\.veinviteLegalSheetBackdrop\[data-open="true"\]\s*\{[^}]*animation:/s,
  );
  assert.match(
    motion,
    /\.veinviteLegalSheetBackdrop\[data-open="true"\]\s+\.veinviteLegalSheetPanel\s*\{[^}]*animation:/s,
  );
  assert.match(motion, /animation: none !important/);
});

test('sheet reuses the authoritative legal copy and does not record consent', () => {
  assert.match(sheet, /LEGAL_COPY\[kind\]\[locale\]/);
  assert.match(sheet, /PRIVACY_USAGE_ANALYTICS_COPY/);
  assert.match(sheet, /PRIVACY_PRODUCT_ANALYTICS_COPY/);
  assert.match(sheet, /PRIVACY_WALLET_LANGUAGE_COPY/);
  assert.doesNotMatch(sheet, /api\/legal\/consent/);
  assert.doesNotMatch(sheet, /recordConsent/);
});

test('direct privacy and terms routes remain public standalone documents', () => {
  assert.match(privacyPage, /LocalizedLegalPage kind="privacy"/);
  assert.match(termsPage, /LocalizedLegalPage kind="terms"/);
  assert.match(privacyPage, /canonical: '\/privacy'/);
  assert.match(termsPage, /canonical: '\/terms'/);
});

test('in-app legal views stay visible in anonymous usage analytics', () => {
  assert.match(host, /veinvite-analytics-view/);
  assert.match(tracker, /detail !== 'privacy'/);
  assert.match(tracker, /detail !== 'terms'/);
  assert.match(tracker, /detail !== 'invite_landing'/);
  assert.match(navigation, /return 'invite_landing'/);
  assert.match(tracker, /send\('pageview', nextView, delta\)/);
});
