import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [groupSource, localeLayerSource] = await Promise.all([
  readFile('src/qa/QaNetworkRadialPlaygroundV42.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
]);

test('group edit toggles membership on the first pointer press', () => {
  assert.match(
    groupSource,
    /if \(creatingRef\.current \|\| managingGroupIdRef\.current\)[\s\S]*?setSelectedIds\(\(current\) => current\.includes\(id\) \? current\.filter\(\(value\) => value !== id\) : \[\.\.\.current, id\]\)/,
  );
});

test('group edit visual state immediately fades every unselected person', () => {
  assert.match(
    localeLayerSource,
    /\.v42ManualGroupsRoot\.v42Managing \.personNode:not\(\.v42SelectedMember\)[\s\S]*?opacity:\s*\.48\s*!important/,
  );
  assert.match(
    localeLayerSource,
    /\.v42ManualGroupsRoot\.v42Managing \.personNode\.v42SelectedMember[\s\S]*?opacity:\s*1\s*!important/,
  );
});
