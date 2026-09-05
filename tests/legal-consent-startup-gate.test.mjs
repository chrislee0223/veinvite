import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('interactive legal consent pauses the startup watchdog instead of being covered by the error shield', async () => {
  const consentSource = await readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  );
  const shieldSource = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    consentSource,
    /data-veinvite-legal-consent-gate="interactive"/,
  );
  assert.match(
    shieldSource,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.match(
    shieldSource,
    /data-veinvite-legal-consent-gate="interactive"/,
  );
  assert.match(
    shieldSource,
    /function hasInteractiveStartupGate\(\)/,
  );
  assert.match(
    shieldSource,
    /if \(released \|\| interactiveGateVisible\) \{\s*return;/,
  );
  assert.match(
    shieldSource,
    /if \(interactiveGateVisible\) \{[\s\S]*clearFallbackTimer\(\);[\s\S]*setShieldVisible\(false\);/,
  );
});

test('legal consent checking keeps the brand loading surface while only required/error states become interactive', async () => {
  const source = await readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  );
  const checkingStart = source.indexOf("if (state === 'checking')");
  const interactiveStart = source.indexOf(
    'data-veinvite-legal-consent-gate="interactive"',
  );

  assert.ok(checkingStart >= 0);
  assert.ok(interactiveStart > checkingStart);
  assert.doesNotMatch(
    source.slice(checkingStart, interactiveStart),
    /data-veinvite-legal-consent-gate/,
  );
});
