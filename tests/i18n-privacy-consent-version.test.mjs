import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  legalConsent,
  consentRoute,
  consentGate,
  privacyCopy,
] = await Promise.all([
  read('src/lib/legalConsent.ts'),
  read('src/app/api/legal/consent/route.ts'),
  read('src/components/LegalConsentGate.tsx'),
  read('src/lib/i18n/privacyUsageAnalyticsCopy.ts'),
]);

test('September analytics disclosure advances privacy consent without changing Terms', () => {
  assert.match(
    legalConsent,
    /CURRENT_TERMS_VERSION\s*=\s*1/,
  );
  assert.match(
    legalConsent,
    /CURRENT_PRIVACY_VERSION\s*=\s*2/,
  );
  assert.match(
    privacyCopy,
    /Last updated: September 3, 2026/,
  );
  assert.match(
    privacyCopy,
    /Anonymous usage analytics/,
  );
});

test('server and gate both require the current privacy version', () => {
  assert.match(
    consentRoute,
    /\.eq\('privacy_version', CURRENT_PRIVACY_VERSION\)/,
  );
  assert.match(
    consentRoute,
    /privacy_version:\s*CURRENT_PRIVACY_VERSION/,
  );
  assert.match(
    consentGate,
    /CURRENT_PRIVACY_VERSION/,
  );
  assert.match(
    consentGate,
    /legacyAgreementMatches\([\s\S]*'\/privacy',[\s\S]*CURRENT_PRIVACY_VERSION/,
  );
});
