import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [guideSource, v71Source, releasePresentationSource, appNetworkSource, qaSource] = await Promise.all([
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/NetworkReleasePresentation.tsx', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/qa/QaNetworkRadialPlaygroundV37.tsx', 'utf8'),
]);

test('production canary mounts the same API-backed Network hub instead of the QA playground', () => {
  assert.match(guideSource, /AppNetworkCanaryV71/);
  assert.match(v71Source, /AppNetworkHub/);
  assert.match(v71Source, /NetworkReleasePresentation/);
  assert.doesNotMatch(v71Source, /AppNetworkCanaryV70/);
  assert.doesNotMatch(v71Source, /QaNetworkRadialPlayground/);
});

test('release canary data comes from the authenticated Network API', () => {
  assert.match(appNetworkSource, /fetch\(`\/api\/network\?\$\{params\.toString\(\)\}`/);
  assert.match(appNetworkSource, /credentials: 'include'/);
  assert.match(appNetworkSource, /cache: 'no-store'/);
});

test('large fake scenarios remain QA-only fixtures', () => {
  assert.match(qaSource, /fiveHundred/);
  assert.match(qaSource, /total: 500/);
  assert.doesNotMatch(v71Source, /fiveHundred|balanced30|direct50|SCENARIOS/);
});

test('release presentation keeps desktop Network in the mobile-first frame and localizes YOU', () => {
  assert.match(releasePresentationSource, /max-width: 520px !important/);
  assert.match(releasePresentationSource, /NETWORK_CANVAS_CONTROL_COPY/);
  assert.match(releasePresentationSource, /data-release-root-copy|releaseRootCopy/);
  assert.match(releasePresentationSource, /\.personNode\.root \.identityLabel/);
});
