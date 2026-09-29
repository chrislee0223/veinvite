import assert from 'node:assert/strict';
import test from 'node:test';

import {
  materializeExpandedWorkspaceGroupOffsets,
  moveWorkspaceMemberBetweenGroups,
  toggleWorkspaceGroupCollapsed,
  withWorkspaceGroupLabel,
} from '../src/lib/networkWorkspace.ts';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';

function workspace(groups) {
  return { positions: {}, groups };
}

test('group collapse toggling preserves the established collapsed semantics', () => {
  const source = workspace([
    { id: 'one', label: 'One', members: [A], x: 10, y: 20, collapsed: true },
    { id: 'two', label: 'Two', members: [B], x: 30, y: 40, collapsed: false },
  ]);

  const opened = toggleWorkspaceGroupCollapsed(source, 'one');
  assert.equal(opened.groups[0].collapsed, false);
  assert.equal(opened.groups[1].collapsed, false);

  const closed = toggleWorkspaceGroupCollapsed(source, 'two');
  assert.equal(closed.groups[0].collapsed, true);
  assert.equal(closed.groups[1].collapsed, true);

  assert.equal(toggleWorkspaceGroupCollapsed(source, 'missing'), source);
});

test('group label updates only the selected group and no-ops on identical labels', () => {
  const source = workspace([
    { id: 'one', label: 'One', members: [A], x: 10, y: 20 },
    { id: 'two', label: 'Two', members: [B], x: 30, y: 40 },
  ]);

  const renamed = withWorkspaceGroupLabel(source, 'one', 'Friends');
  assert.equal(renamed.groups[0].label, 'Friends');
  assert.equal(renamed.groups[1].label, 'Two');
  assert.equal(withWorkspaceGroupLabel(source, 'one', 'One'), source);
  assert.equal(withWorkspaceGroupLabel(source, 'missing', 'Ignored'), source);
});

test('expanded group offsets materialize from the current absolute member points', () => {
  const source = workspace([
    {
      id: 'one',
      label: 'One',
      members: [A, B],
      x: 100,
      y: 200,
      collapsed: false,
    },
  ]);

  const points = new Map([
    [A, { x: 120, y: 240 }],
    [B, { x: 80, y: 260 }],
  ]);

  const next = materializeExpandedWorkspaceGroupOffsets(
    source,
    'one',
    (_group, member) => points.get(member),
  );

  assert.deepEqual(next.groups[0].memberOffsets, {
    [A]: { x: 20, y: 40 },
    [B]: { x: -20, y: 60 },
  });

  const collapsed = workspace([
    {
      id: 'one',
      label: 'One',
      members: [A],
      x: 100,
      y: 200,
      collapsed: true,
    },
  ]);
  assert.equal(
    materializeExpandedWorkspaceGroupOffsets(
      collapsed,
      'one',
      () => ({ x: 0, y: 0 }),
    ),
    collapsed,
  );
});

test('moving an expanded member preserves materialized offsets and gives the moved member the target default offset', () => {
  const source = workspace([
    {
      id: 'source',
      label: 'Source',
      members: [A, B],
      x: 100,
      y: 100,
      collapsed: false,
    },
    {
      id: 'target',
      label: 'Target',
      members: [C],
      x: 500,
      y: 400,
      collapsed: false,
    },
  ]);

  const absolutePoints = {
    source: {
      [A]: { x: 120, y: 130 },
      [B]: { x: 130, y: 140 },
    },
    target: {
      [C]: { x: 520, y: 420 },
    },
  };

  const next = moveWorkspaceMemberBetweenGroups(
    source,
    A,
    'source',
    'target',
    (group, member) => absolutePoints[group.id][member],
    (index, count) => ({ x: 70 + index, y: 80 + count }),
  );

  const sourceGroup = next.groups.find((group) => group.id === 'source');
  const targetGroup = next.groups.find((group) => group.id === 'target');

  assert.deepEqual(sourceGroup.members, [B]);
  assert.deepEqual(sourceGroup.memberOffsets, {
    [B]: { x: 30, y: 40 },
  });
  assert.deepEqual(targetGroup.members, [C, A]);
  assert.deepEqual(targetGroup.memberOffsets, {
    [C]: { x: 20, y: 20 },
    [A]: { x: 71, y: 82 },
  });
});
