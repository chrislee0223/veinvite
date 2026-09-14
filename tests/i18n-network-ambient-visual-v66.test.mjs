import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [visualSource, guideSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
]);

test('V66 remains a presentation-only wrapper over V65', () => {
  assert.match(visualSource, /AppNetworkCanaryV65/);
  assert.match(visualSource, /<AppNetworkCanaryV65 locale=\{locale\} \/>/);

  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'MutationObserver',
    'requestAnimationFrame',
    'addEventListener(',
    '--v63-adjust-',
    '--v63-drag-',
    '--v50-adjust-',
    '--v52-adjust-',
    '--v42-group-d',
    "setProperty('--x'",
    "setProperty('--y'",
    "setProperty('--gx'",
    "setProperty('--gy'",
  ]) {
    assert.ok(!visualSource.includes(forbidden), `V66 visual layer must not own geometry/interaction: ${forbidden}`);
  }
});

test('ambient motion does not replace the mature transform stack', () => {
  assert.match(visualSource, /@supports \(translate: 1px 1px\)/);
  assert.match(visualSource, /@keyframes v66AmbientFloat/);
  assert.doesNotMatch(visualSource, /@keyframes v66AmbientFloat[\s\S]*?transform:/);
  assert.match(visualSource, /translate: var\(--v66-fx1\) var\(--v66-fy1\)/);
});

test('gesture and transition states pause ambience instead of fighting it', () => {
  for (const selector of [
    'veinviteInteracting',
    'v63PinchGuard',
    'v50NetworkTransition',
    'v52NetworkTransition',
    'stage.editMode',
    'v63DirectDragging',
    'v61DirectGroupDragging',
    'v61GroupTransfer',
    'v63TransferSettling',
    'v61GroupDragging',
  ]) {
    assert.ok(visualSource.includes(selector), `missing ambient pause guard: ${selector}`);
  }
  assert.match(visualSource, /animation-play-state:\s*paused\s*!important/);
});

test('edge softness is CSS-only and avoids expensive SVG filters', () => {
  assert.match(visualSource, /\.nodeCircle::before/);
  assert.match(visualSource, /radial-gradient/);
  assert.match(visualSource, /pointer-events:\s*none/);
  assert.doesNotMatch(visualSource, /<filter/);
  assert.doesNotMatch(visualSource, /filter:\s*(?:blur|drop-shadow)/);
  assert.doesNotMatch(visualSource, /backdrop-filter/);
});

test('motion respects accessibility, mobile limits and dense-network cost caps', () => {
  assert.match(visualSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(visualSource, /animation:\s*none\s*!important/);
  assert.match(visualSource, /@media \(max-width: 640px\)/);
  assert.match(visualSource, /\.personNode:nth-child\(n \+ 121\)/);
});

test('the special Network canary is wired to V66', () => {
  assert.match(guideSource, /AppNetworkCanaryV66/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV65/);
});
