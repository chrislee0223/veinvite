import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [guideSource, v71Source, releaseSource, qaSource] = await Promise.all([
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/AppNetworkReleaseCanvas.tsx', 'utf8'),
  readFile('src/qa/QaNetworkRadialPlaygroundV37.tsx', 'utf8'),
]);

test('production canary mounts the API-backed release canvas instead of the QA playground', () => {
  assert.match(guideSource, /AppNetworkCanaryV71/);
  assert.match(v71Source, /AppNetworkReleaseCanvas/);
  assert.match(v71Source, /<AppNetworkReleaseCanvas locale=\{locale\} \/>/);
  assert.doesNotMatch(v71Source, /AppNetworkHub|AppNetworkCanaryV70|QaNetworkRadialPlayground/);
});

test('release canvas data comes from the authenticated Network API', () => {
  assert.match(releaseSource, /fetch\(`\/api\/network\?\$\{params\.toString\(\)\}`/);
  assert.match(releaseSource, /credentials: 'include'/);
  assert.match(releaseSource, /cache: 'no-store'/);
});

test('large fake scenarios remain QA-only fixtures', () => {
  assert.match(qaSource, /fiveHundred/);
  assert.match(qaSource, /total: 500/);
  assert.doesNotMatch(releaseSource, /fiveHundred|balanced30|direct50|SCENARIOS|fakeAddress/);
  assert.doesNotMatch(v71Source, /fiveHundred|balanced30|direct50|SCENARIOS/);
});

test('release canvas keeps the mobile-first frame and localized root identity', () => {
  assert.match(releaseSource, /width:min\(100%,520px\)/);
  assert.match(releaseSource, /NETWORK_CANVAS_CONTROL_COPY/);
  assert.match(releaseSource, /<span className="releaseYou">\{c\.you\}<\/span>/);
});

test('release zoom stays inside the reviewed 32 to 250 percent range', () => {
  assert.match(releaseSource, /const MIN_ZOOM = 0\.32/);
  assert.match(releaseSource, /const MAX_ZOOM = 2\.5/);
  assert.match(releaseSource, /clamp\(resolved\.scale, MIN_ZOOM, MAX_ZOOM\)/);
});

test('crossing a zoom boundary in one gesture cannot navigate the Network', () => {
  assert.match(releaseSource, /startZoom:\s*viewRef\.current\.scale/);
  assert.match(releaseSource, /const startedAtMax = intent\.startZoom >= MAX_ZOOM - BOUNDARY_EPSILON/);
  assert.match(releaseSource, /const startedAtMin = intent\.startZoom <= MIN_ZOOM \+ BOUNDARY_EPSILON/);
  assert.match(releaseSource, /startedAtMax[\s\S]*?intent\.maxRatio >= ENTER_SECOND_PINCH_RATIO[\s\S]*?intent\.candidateWallet/);
  assert.match(releaseSource, /startedAtMin[\s\S]*?intent\.minRatio <= PARENT_SECOND_PINCH_RATIO[\s\S]*?data\.breadcrumb\.length > 1/);
});

test('blank-space pinch remains zoom-only while node entry needs a selected pinch candidate at max', () => {
  assert.match(releaseSource, /elementFromPoint\(center\.x, center\.y\)/);
  assert.match(releaseSource, /closest<HTMLElement>\('\[data-release-wallet\]'\)/);
  assert.match(releaseSource, /candidateWallet:\s*candidate/);
  assert.match(releaseSource, /target && target\.direct > 0/);
});

test('node tap selects a card first and explicit View Network performs navigation', () => {
  assert.match(releaseSource, /setSelectedWallet\(node\.wallet\)/);
  assert.match(releaseSource, /className="openNetwork" onClick=\{\(\) => openFocus\(selectedChild\.wallet\)\}/);
});

test('wheel and plus-minus controls only change zoom and never enter or leave a Network', () => {
  const wheelStart = releaseSource.indexOf('const onWheel =');
  const wheelEnd = releaseSource.indexOf('if (!wallet)', wheelStart);
  const wheelBlock = releaseSource.slice(wheelStart, wheelEnd);
  assert.match(wheelBlock, /setViewSafe/);
  assert.doesNotMatch(wheelBlock, /loadFocus|goParent|openFocus/);
  assert.match(releaseSource, /scale: current\.scale \+ 0\.12/);
  assert.match(releaseSource, /scale: current\.scale - 0\.12/);
});
