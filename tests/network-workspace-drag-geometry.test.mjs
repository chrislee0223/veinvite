import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NETWORK_GROUP_DROP_HIT_SLOP_X,
  NETWORK_GROUP_DROP_HIT_SLOP_Y,
  NETWORK_GROUP_SCREEN_DROP_RADIUS,
  findNearestNetworkGroupDropTarget,
  isNetworkPointInsideExpandedRect,
  networkClientPointToWorld,
  networkDragPointFromClient,
} from '../src/lib/networkWorkspaceDragGeometry.ts';
import { MAX_MEMBERS_PER_GROUP } from '../src/lib/networkWorkspace.ts';

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test('client points convert into world coordinates through the active camera', () => {
  const point = networkClientPointToWorld(
    { x: 320, y: 260 },
    { left: 20, top: 10 },
    { x: 100, y: 50, scale: 2 },
  );

  assertClose(point.x, 100, 'world x');
  assertClose(point.y, 100, 'world y');
});

test('drag points subtract the pointer offset and stay inside the workspace bounds', () => {
  const centered = networkDragPointFromClient(
    { x: 320, y: 260 },
    { left: 20, top: 10 },
    { x: 100, y: 50, scale: 2 },
    { x: 10, y: 20 },
    { width: 2600, height: 1900 },
  );

  assert.deepEqual(centered, { x: 90, y: 90 });

  const clamped = networkDragPointFromClient(
    { x: 99999, y: 99999 },
    { left: 0, top: 0 },
    { x: 0, y: 0, scale: 1 },
    { x: 0, y: 0 },
    { width: 2600, height: 1900 },
  );

  assert.deepEqual(clamped, { x: 2510, y: 1810 });
});

test('group drop hit areas preserve the existing horizontal and vertical slop', () => {
  const rect = {
    left: 100,
    right: 200,
    top: 80,
    bottom: 140,
  };

  assert.equal(
    isNetworkPointInsideExpandedRect(
      {
        x: rect.left - NETWORK_GROUP_DROP_HIT_SLOP_X,
        y: rect.top - NETWORK_GROUP_DROP_HIT_SLOP_Y,
      },
      rect,
    ),
    true,
  );

  assert.equal(
    isNetworkPointInsideExpandedRect(
      {
        x: rect.left - NETWORK_GROUP_DROP_HIT_SLOP_X - 0.1,
        y: 100,
      },
      rect,
    ),
    false,
  );
});

test('group targeting is screen-space based, nearest-first, and excludes source or full groups', () => {
  const fullMembers = Array.from(
    { length: MAX_MEMBERS_PER_GROUP },
    (_, index) => `member-${index}`,
  );
  const groups = [
    {
      id: 'source',
      members: ['a'],
      x: 100,
      y: 100,
    },
    {
      id: 'full',
      members: fullMembers,
      x: 105,
      y: 100,
    },
    {
      id: 'far',
      members: ['b'],
      x: 130,
      y: 100,
    },
    {
      id: 'near',
      members: ['c'],
      x: 110,
      y: 100,
    },
  ];

  const target = findNearestNetworkGroupDropTarget(
    groups,
    { x: 113, y: 100 },
    { left: 0, top: 0 },
    { x: 0, y: 0, scale: 1 },
    'source',
    MAX_MEMBERS_PER_GROUP,
  );

  assert.equal(target?.id, 'near');

  const outside = findNearestNetworkGroupDropTarget(
    groups,
    {
      x: 110 + NETWORK_GROUP_SCREEN_DROP_RADIUS + 1,
      y: 100 + NETWORK_GROUP_SCREEN_DROP_RADIUS + 1,
    },
    { left: 0, top: 0 },
    { x: 0, y: 0, scale: 1 },
    'source',
    MAX_MEMBERS_PER_GROUP,
  );

  assert.equal(outside, null);
});
