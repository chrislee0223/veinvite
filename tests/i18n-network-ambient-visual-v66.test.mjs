import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [visualSource, correctionSource, directDropSource, dragGhostSource, localeLayoutSource, rootIdentitySource, interactionOwnershipSource, parentVisualSource, guideSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV67.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV68.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV72.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV73.tsx', 'utf8'),
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

test('Network nodes are stationary instead of using independent ambient translation', () => {
  assert.doesNotMatch(visualSource, /@keyframes v66AmbientFloat/);
  assert.doesNotMatch(visualSource, /--v66-f[xy]\d/);
  assert.doesNotMatch(visualSource, /animation-duration:/);
  assert.doesNotMatch(correctionSource, /--v66-f[xy]\d/);
  assert.match(visualSource, /\.productionNetworkCanaryV45 :is\([\s\S]*?\.personNode,[\s\S]*?\.slotNode,[\s\S]*?\.clusterNode,[\s\S]*?\.v42GroupHub[\s\S]*?\)\s*\{[\s\S]*?translate:\s*none\s*!important/);
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

test('V67 removes separate endpoint paint extensions so each endpoint is one painted circle', () => {
  assert.match(correctionSource, /\.personNode::before,[\s\S]*?\.slotNode::before[\s\S]*?content:\s*none\s*!important/);
  assert.match(correctionSource, /\.nodeCircle,[\s\S]*?\.slotCircle,[\s\S]*?overflow:\s*hidden\s*!important/);
  assert.doesNotMatch(correctionSource, /width:\s*58px/);
  assert.doesNotMatch(correctionSource, /height:\s*58px/);
  assert.doesNotMatch(correctionSource, /width:\s*52px/);
  assert.doesNotMatch(correctionSource, /height:\s*52px/);
  assert.doesNotMatch(correctionSource, /filter:\s*(?:blur|drop-shadow)/);
  assert.doesNotMatch(correctionSource, /backdrop-filter/);
});

test('V67 leaves mature endpoint stacking and metadata anchors untouched', () => {
  assert.match(correctionSource, /\.personNode,[\s\S]*?\.slotNode\s*\{[\s\S]*?isolation:\s*auto\s*!important/);
  assert.doesNotMatch(correctionSource, /\.personNode > \.nodeCircle,[\s\S]*?z-index:/);
  assert.doesNotMatch(correctionSource, /\.personNode > b,[\s\S]*?z-index:/);

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

test('V67 keeps YOU opaque while V66 keeps all Network anchors stationary', () => {
  assert.match(correctionSource, /\.centerCircle[\s\S]*?rgb\(24, 21, 13\)[\s\S]*?rgb\(13, 13, 11\)/);
  assert.match(visualSource, /\.v42GroupHub[\s\S]*?translate:\s*none\s*!important/);
});

test('the special Network canary is wired through V73, V72, V71, V70, V69, V68, V67 and V66', () => {
  assert.match(guideSource, /AppNetworkCanaryV73/);
  assert.match(parentVisualSource, /AppNetworkCanaryV72/);
  assert.match(parentVisualSource, /<AppNetworkCanaryV72 locale=\{locale\} \/>/);
  assert.match(interactionOwnershipSource, /AppNetworkCanaryV71/);
  assert.match(interactionOwnershipSource, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.match(rootIdentitySource, /AppNetworkCanaryV70/);
  assert.match(rootIdentitySource, /<AppNetworkCanaryV70 locale=\{locale\} \/>/);
  assert.match(localeLayoutSource, /AppNetworkCanaryV69/);
  assert.match(localeLayoutSource, /<AppNetworkCanaryV69 locale=\{locale\} \/>/);
  assert.match(dragGhostSource, /AppNetworkCanaryV68/);
  assert.match(dragGhostSource, /<AppNetworkCanaryV68 locale=\{locale\} \/>/);
  assert.match(directDropSource, /AppNetworkCanaryV67/);
  assert.match(directDropSource, /<AppNetworkCanaryV67 locale=\{locale\} \/>/);
  assert.match(correctionSource, /AppNetworkCanaryV66/);
});
