import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [visualSource, correctionSource, guideSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV67.tsx', 'utf8'),
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

test('V67 is also presentation-only and wraps V66 without owning geometry', () => {
  assert.match(correctionSource, /AppNetworkCanaryV66/);
  assert.match(correctionSource, /<AppNetworkCanaryV66 locale=\{locale\} \/>/);

  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'MutationObserver',
    'requestAnimationFrame',
    'addEventListener(',
    "setProperty('--x'",
    "setProperty('--y'",
    "setProperty('--gx'",
    "setProperty('--gy'",
  ]) {
    assert.ok(!correctionSource.includes(forbidden), `V67 correction must remain paint-only: ${forbidden}`);
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

test('V67 retires the oversized endpoint halos and restores avatar-safe circles', () => {
  assert.match(correctionSource, /\.nodeCircle::before[\s\S]*?content:\s*none\s*!important/);
  assert.match(correctionSource, /\.nodeCircle[\s\S]*?overflow:\s*hidden\s*!important/);
  assert.match(correctionSource, /border:\s*1px solid rgba\(210, 174, 65, \.46\)\s*!important/);
  assert.match(correctionSource, /border:\s*1px dashed rgba\(226, 181, 62, \.58\)\s*!important/);
});

test('V67 endpoint softness is tiny, button-level and pointer transparent', () => {
  assert.match(correctionSource, /\.personNode::before/);
  assert.match(correctionSource, /width:\s*60px/);
  assert.match(correctionSource, /\.slotNode::before/);
  assert.match(correctionSource, /width:\s*54px/);
  assert.match(correctionSource, /pointer-events:\s*none/);
  assert.doesNotMatch(correctionSource, /filter:\s*(?:blur|drop-shadow)/);
  assert.doesNotMatch(correctionSource, /backdrop-filter/);
});

test('V67 keeps YOU opaque and avoids floating authoritative group hubs', () => {
  assert.match(correctionSource, /\.centerCircle[\s\S]*?rgb\(24, 21, 13\)[\s\S]*?rgb\(13, 13, 11\)/);
  assert.match(correctionSource, /\.v42GroupHub[\s\S]*?animation:\s*none\s*!important/);
  assert.match(correctionSource, /\.v42GroupHub[\s\S]*?translate:\s*none\s*!important/);
});

test('motion respects accessibility, mobile limits and dense-network cost caps', () => {
  assert.match(visualSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(visualSource, /animation:\s*none\s*!important/);
  assert.match(visualSource, /@media \(max-width: 640px\)/);
  assert.match(visualSource, /\.personNode:nth-child\(n \+ 121\)/);
  assert.match(correctionSource, /@media \(max-width: 640px\)/);
});

test('the special Network canary is wired through V67 to V66', () => {
  assert.match(guideSource, /AppNetworkCanaryV67/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV66/);
  assert.match(correctionSource, /AppNetworkCanaryV66/);
});
