import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/InviteeClient.tsx', import.meta.url),
  'utf8',
);

test('any-positive VOT3 policy is reflected in invitee demo progress', () => {
  assert.match(
    source,
    /vot3MinimumAmountWei:\s*'1'/,
  );
  assert.doesNotMatch(
    source,
    /vot3MinimumAmountWei:\s*'1000000000000000000'/,
  );
});

test('unlocked allocation vote mission links to the official VeBetterDAO page', () => {
  assert.match(
    source,
    /const VEBETTER_ALLOCATION_VOTING_URL\s*=\s*\n?\s*'https:\/\/governance\.vebetterdao\.org\/allocations';/,
  );
  assert.match(
    source,
    /actionHref=\{!voteDone && voteUnlocked \? VEBETTER_ALLOCATION_VOTING_URL : undefined\}/,
  );

  const voteUnlockedIndex = source.indexOf(
    'const voteUnlocked = conversionDone || voteDone;',
  );
  const actionIndex = source.indexOf(
    'actionHref={!voteDone && voteUnlocked ? VEBETTER_ALLOCATION_VOTING_URL : undefined}',
  );

  assert.ok(voteUnlockedIndex >= 0);
  assert.ok(actionIndex > voteUnlockedIndex);
});

test('allocation vote action uses the same mission status link pattern as the dApp action', () => {
  assert.match(
    source,
    /actionHref=\{appsDone \? undefined : VEBETTER_APPS_URL\}/,
  );
  assert.match(
    source,
    /if \(href\) \{[\s\S]*?<a[\s\S]*?href=\{href\}[\s\S]*?<span aria-hidden="true">↗<\/span>/,
  );
});
