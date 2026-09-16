import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('src/components/NetworkReleaseGroups.tsx', 'utf8');

test('release node positions are root-wallet scoped and focus-wallet scoped', () => {
  assert.match(source, /const NODE_POSITION_PREFIX = 'veinvite-network-release-node-positions-v1:';/);
  assert.match(source, /localStorage\.getItem\(`\$\{NODE_POSITION_PREFIX\}\$\{walletKey\}`\)/);
  assert.match(source, /localStorage\.setItem\(`\$\{NODE_POSITION_PREFIX\}\$\{walletKey\}`/);
  assert.match(source, /return `\$\{keyWallet\(scope\)\}\|\$\{keyWallet\(wallet\)\}`/);
});

test('tap quick-drag long-hold and pinch have separate gesture ownership', () => {
  assert.match(source, /const NODE_HOLD_MS = 500;/);
  assert.match(source, /const NODE_TRANSFER_THRESHOLD_PX = 10;/);
  assert.match(source, /mode: 'pending' \| 'free' \| 'transfer'/);
  assert.match(source, /state\.mode = 'free'/);
  assert.match(source, /drag\.mode = 'transfer'/);
  assert.match(source, /touchPointersRef\.current\.size > 1[\s\S]*?clearNodeDrag\(\)/);
});

test('quick node drag moves between groups or removes from the source group', () => {
  assert.match(source, /const moveMember = \(address: string, sourceGroupId: string \| null, targetGroupId: string \| null\)/);
  assert.match(source, /group\.members\.filter\(\(member\) => member !== address\)/);
  assert.match(source, /targetGroupId && group\.id === targetGroupId[\s\S]*?\[\.\.\.members, address\]/);
  assert.match(source, /const targetGroupId = groupTargetAt\(event\.clientX, event\.clientY\)/);
  assert.match(source, /data-release-group-id=\{group\.id\}/);
});

test('long-hold node movement updates both node position and its direct edge', () => {
  assert.match(source, /setNodeDragPreview\(\{ wallet: drag\.wallet, offset: previewOffset \}\)/);
  assert.match(source, /commitNodeOffset\(drag\.wallet, drag\.previewOffset\)/);
  assert.match(source, /--release-node-offset-x/);
  assert.match(source, /edge\.setAttribute\('x2', String\(base\.x \+ offset\.x\)\)/);
  assert.match(source, /edge\.setAttribute\('y2', String\(base\.y \+ offset\.y\)\)/);
});

test('cancelled gestures discard transient node and group drag state', () => {
  assert.match(source, /onPointerCancelCapture/);
  assert.match(source, /nodeDragRef\.current\?\.pointerId === event\.pointerId[\s\S]*?clearNodeDrag\(\)/);
  assert.match(source, /groupDragRef\.current\?\.pointerId === event\.pointerId[\s\S]*?setDragPreview\(null\)/);
});
