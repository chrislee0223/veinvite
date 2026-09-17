import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/network-single-runtime.test.mjs';
let tests = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

if (!tests.includes('final Network gestures are coordinate-owned')) {
  tests += '\n' + lines(
    "test('final Network gestures are coordinate-owned and deliberate', () => {",
    '  assert.match(networkSource, /const HOLD_TO_MOVE_MS = 500/);',
    '  assert.match(networkSource, /const MIN_SCALE = 0\\.32/);',
    '  assert.match(networkSource, /const MAX_SCALE = 2\\.5/);',
    '  assert.match(networkSource, /nearestVisibleChild/);',
    '  assert.match(networkSource, /nearestVisibleGroup/);',
    '  assert.match(networkSource, /beginHoldDrag/);',
    '  assert.match(networkSource, /holdDrag\\.armed/);',
    '  assert.match(networkSource, /persistNodePosition/);',
    '  assert.match(networkSource, /cancelHoldDrag\\(true\\)/);',
    '  assert.match(networkSource, /screenDistance <= HOLD_CANCEL_DISTANCE && !holdDrag\\.moved/);',
    '  assert.match(networkSource, /pinchCandidateWalletRef/);',
    '  assert.match(networkSource, /pinchEnterIntentRef/);',
    '  assert.match(networkSource, /wheelEnterDistanceRef/);',
    '  assert.doesNotMatch(networkSource, /elementFromPoint|elementsFromPoint/);',
    '  assert.doesNotMatch(networkSource, /querySelectorAll<HTMLElement>/);',
    '});',
    '',
    "test('YOU return is separate from explicit Fit and multi-level back protects parent camera ownership', () => {",
    '  assert.match(networkSource, /const returnToYou = useCallback/);',
    '  assert.match(networkSource, /const fitNetwork = useCallback/);',
    '  assert.match(networkSource, /className="fitButton" onClick=\\{fitNetwork\\}/);',
    '  assert.match(networkSource, /onClick=\\{returnToYou\\}/);',
    '  assert.match(networkSource, /immediateParent && keyWallet\\(immediateParent\\) === target/);',
    '});',
    '',
    "test('pinch navigation waits until every pointer is released', () => {",
    "  const endStart = networkSource.indexOf('const onPointerEndCapture');",
    "  const wheelStart = networkSource.indexOf('const onWheel', endStart);",
    '  const endSource = networkSource.slice(endStart, wheelStart);',
    "  const onePointerStart = endSource.indexOf('pointersRef.current.size === 1');",
    "  const zeroPointerStart = endSource.indexOf('pointersRef.current.size === 0');",
    '  assert.ok(onePointerStart >= 0 && zeroPointerStart > onePointerStart);',
    '  assert.doesNotMatch(endSource.slice(onePointerStart, zeroPointerStart), /returnToParent\\(|moveToFocus\\(/);',
    "  assert.match(endSource.slice(zeroPointerStart), /moveToFocus\\(enterWallet, 'forward'\\)/);",
    '});',
    '',
    "test('final group workspace keeps one React-owned membership path and no +N descendants badge', () => {",
    '  assert.match(networkSource, /moveWorkspaceMemberToGroup/);',
    '  assert.match(networkSource, /withWorkspaceGroupCollapsed/);',
    '  assert.match(networkSource, /className="groupsPanel"/);',
    '  assert.match(networkSource, /className="resetLayoutButton"/);',
    '  assert.match(networkSource, /className="saveLayoutButton"/);',
    '  assert.match(networkSource, /continuationEdge/);',
    '  assert.doesNotMatch(networkSource, /hidden descendants|\\+N|\\+15/);',
    '});',
    ''
  );
}

await writeFile(path, tests);
