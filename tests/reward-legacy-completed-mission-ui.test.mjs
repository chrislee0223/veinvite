import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/InviteeClient.tsx', import.meta.url),
  'utf8',
);

test('legacy database COMPLETED status cannot fabricate modern mission completion', () => {
  assert.match(
    source,
    /const conversionDone = progress\.vot3Converted;/,
  );
  assert.match(
    source,
    /const voteDone = progress\.voteCompleted;/,
  );
  assert.match(
    source,
    /const completed = appsDone && conversionDone && voteDone;/,
  );
  assert.doesNotMatch(
    source,
    /completed \|\| progress\.vot3Converted/,
  );
  assert.doesNotMatch(
    source,
    /completed \|\| progress\.voteCompleted/,
  );
});

test('legacy incomplete records do not claim automatic progress is working', () => {
  assert.match(
    source,
    /invite\?\.status === 'COMPLETED' && !completed/,
  );
  assert.match(
    source,
    /legacyIncomplete \? \([\s\S]*?t\.errors\.complete/,
  );
});
