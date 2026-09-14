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
    '--v63-adjust-',
    '--v42-group-d',
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

test('V67 removes oversized halos without re-owning mature circle visuals', () => {
  assert.match(correctionSource, /\.nodeCircle::before[\s\S]*?content:\s*none\s*!important/);
  assert.match(correctionSource, /\.nodeCircle,[\s\S]*?overflow:\s*hidden\s*!important/);

  for (const forbidden of [
    'border-width:',
    'border-style:',
    'border-color:',
    'background-color:',
  ]) {
    assert.ok(!correctionSource.includes(forbidden), `V67 must not replace mature circle visual state: ${forbidden}`);
  }
});

test('V67 endpoint softness is only a three-pixel paint extension', () => {
  assert.match(correctionSource, /\.personNode::before/);
  assert.match(correctionSource, /width:\s*58px/);
  assert.match(correctionSource, /height:\s*58px/);
  assert.match(correctionSource, /\.slotNode::before/);
  assert.match(correctionSource, /width:\s*52px/);
  assert.match(correctionSource, /height:\s*52px/);
  assert.match(correctionSource, /pointer-events:\s*none/);
  assert.match(correctionSource, /z-index:\s*0/);
  assert.doesNotMatch(correctionSource, /filter:\s*(?:blur|drop-shadow)/);
  assert.doesNotMatch(correctionSource, /backdrop-filter/);
});

test('V67 puts readable metadata in front without changing mature layout anchors', () => {
  assert.match(correctionSource, /\.personNode > \.nodeCircle,[\s\S]*?z-index:\s*1\s*!important/);
  assert.match(correctionSource, /\.personNode > b,[\s\S]*?z-index:\s*2\s*!important/);

  for (const forbiddenPattern of [
    /\.personNode\s*>\s*b[\s\S]*?position:/,
    /\.personNode\s*>\s*b[\s\S]*?top:/,
    /\.personNode\s*>\s*b[\s\S]*?left:/,
    /\.personNode\s*>\s*b[\s\S]*?margin:/,
    /\.personNode\s*>\s*b[\s\S]*?transform:/,
    /\.personNode\s*>\s*\.nodeCircle[\s\S]*?position:/,
    /\.personNode\s*>\s*\.nodeCircle[\s\S]*?top:/,
    /\.personNode\s*>\s*\.nodeCircle[\s\S]*?left:/,
    /\.personNode\s*>\s*\.nodeCircle[\s\S]*?margin:/,
    /\.personNode\s*>\s*\.nodeCircle[\s\S]*?transform:/,
  ]) {
    assert.doesNotMatch(correctionSource, forbiddenPattern);
  }
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
  assert.match(correctionSource, /--v66-fy1:\s*-\.95px\s*!important/);
});

test('the special Network canary is wired through V67 to V66', () => {
  assert.match(guideSource, /AppNetworkCanaryV67/);
  assert.doesNotMatch(guideSource, /const AppNetworkCanaryV66/);
  assert.match(correctionSource, /AppNetworkCanaryV66/);
});
