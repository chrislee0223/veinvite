import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const guide = read('src/components/AppGuide.tsx');
const hub = read('src/components/AppNetworkHub.tsx');
const network = read('src/components/AppNetwork.tsx');
const componentFiles = readdirSync(new URL('../src/components/', import.meta.url));
const qaFiles = readdirSync(new URL('../src/qa/', import.meta.url));

test('user-facing Network has one runtime path and no versioned canary owner', () => {
  assert.match(guide, /<AppNetworkHub locale=\{locale\} \/>/);
  assert.match(hub, /<AppNetwork locale=\{locale\} \/>/);
  assert.doesNotMatch(guide, /AppNetworkCanaryV\d+/);
  assert.doesNotMatch(hub, /AppNetworkCanaryV\d+/);
  assert.equal(componentFiles.some((name) => /^AppNetworkCanaryV\d+\.tsx$/.test(name)), false);
  assert.equal(qaFiles.some((name) => /^QaNetworkRadialPlaygroundV\d+\.tsx$/.test(name)), false);
});

test('camera and gestures are owned by AppNetwork rather than an outer wrapper', () => {
  assert.match(network, /const \[view, setView\] = useState<View>/);
  assert.match(network, /onPointerDownCapture=\{onPointerDownCapture\}/);
  assert.match(network, /onPointerMoveCapture=\{onPointerMoveCapture\}/);
  assert.match(network, /onPointerUpCapture=\{onPointerEndCapture\}/);
  assert.match(network, /onWheel=\{onWheel\}/);
  assert.match(network, /returnViewByChildRef/);

  for (const forbidden of [
    'setView(',
    'MutationObserver',
    "addEventListener('pointerdown'",
    "addEventListener('pointermove'",
    "addEventListener('wheel'",
  ]) {
    assert.ok(!hub.includes(forbidden), `AppNetworkHub must not compete for runtime ownership: ${forbidden}`);
  }
});

test('single runtime cannot revive legacy DOM transform or drag-patch ownership', () => {
  for (const forbidden of [
    'MutationObserver',
    '--v63-drag-x',
    '--v63-drag-y',
    '--cameraX',
    '--cameraY',
    '--networkZoom',
    "document.addEventListener('pointerdown'",
    "document.addEventListener('pointermove'",
    "document.addEventListener('pointerup'",
    'veinviteNodeDragGhost',
  ]) {
    assert.ok(!network.includes(forbidden), `legacy Network owner must stay retired: ${forbidden}`);
  }
});

test('parent return camera restoration has one explicit owner', () => {
  assert.match(network, /returnViewByChildRef\.current\.set\(target, view\)/);
  assert.match(network, /const immediateParent = currentData\.breadcrumb\[currentData\.breadcrumb\.length - 2\] \?\? null/);
  assert.match(network, /const exactParentView = immediateParent && keyWallet\(immediateParent\) === target/);
  assert.match(network, /returnViewByChildRef\.current\.get\(current\)/);
  assert.match(network, /viewByFocusRef\.current\.get\(target\)/);
  assert.match(network, /exactParentView \?\?/);
  assert.doesNotMatch(hub, /returnViewByChildRef/);
});