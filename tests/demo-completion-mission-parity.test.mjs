import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/app/api/invites/[code]/complete/route.ts', import.meta.url),
  'utf8',
);

test('preview demo completion persists every mission dimension it declares complete', () => {
  assert.match(
    route,
    /convertedToVot3:\s*true/,
    'demo verifier must declare VOT3 conversion complete',
  );
  assert.match(
    route,
    /vot3_converted:\s*true/,
    'demo database update must persist VOT3 conversion when completion is forced',
  );
  assert.match(
    route,
    /apps_completed:\s*3/,
    'demo database update must persist three completed app/reward units',
  );
  assert.match(
    route,
    /vote_completed:\s*true/,
    'demo database update must persist governance voting completion',
  );
});

test('demo completion remains fail-closed for Production and reward eligibility', () => {
  assert.match(
    route,
    /process\.env\.VERCEL_ENV\s*===\s*'preview'/,
    'demo completion must stay scoped to Preview/local development',
  );
  assert.match(
    route,
    /reward_status:\s*'PENDING'/,
    'demo completion must not create reward eligibility without real on-chain evidence',
  );
});
