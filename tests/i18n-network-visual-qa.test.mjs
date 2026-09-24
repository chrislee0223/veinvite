import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  harness,
  registry,
  directCoverage,
  renderer,
  visual,
] = await Promise.all([
  readFile('src/qa/QaNetworkI18nStateHarness.tsx', 'utf8'),
  readFile('src/qa/stateRegistry.ts', 'utf8'),
  readFile('src/qa/directStateCoverage.ts', 'utf8'),
  readFile('src/qa/QaKnownStateRenderer.tsx', 'utf8'),
  readFile('tests/playwright/visual-i18n.spec.ts', 'utf8'),
]);

const NETWORK_I18N_STATES = [
  'NETWORK-I18N-MY',
  'NETWORK-I18N-GROUPS',
  'NETWORK-I18N-PUBLIC',
];

test('Production Network multilingual surfaces have direct QA states', () => {
  for (const stateId of NETWORK_I18N_STATES) {
    assert.ok(registry.includes(stateId), `registry missing ${stateId}`);
    assert.ok(directCoverage.includes(stateId), `direct renderer missing ${stateId}`);
    assert.ok(harness.includes(stateId), `Network i18n harness missing ${stateId}`);
    assert.ok(visual.includes(stateId), `visual matrix missing ${stateId}`);
  }

  assert.match(renderer, /renderer\.renderer === 'network-i18n'/u);
  assert.match(renderer, /QaNetworkI18nStateHarness/u);
});

test('Network i18n QA mirrors critical Production geometry without runtime dependencies', () => {
  assert.match(harness, /width:min\(100%,520px\)/u);
  assert.match(harness, /width:min\(232px,calc\(100vw - 28px\)\)/u);
  assert.match(harness, /width:92px/u);
  assert.match(harness, /inset-inline-start:8px/u);
  assert.match(harness, /inset-inline-end:0/u);
  assert.match(harness, /NETWORK_EXPERIENCE_COPY/u);
  assert.match(harness, /NETWORK_CANARY_UI_COPY/u);
  assert.match(harness, /NETWORK_EXPLORE_COPY/u);
  assert.match(harness, /networkNativeReview/u);

  assert.doesNotMatch(harness, /useWalletLauncher|fetch\(|supabase|reward|sybil/iu);
});
