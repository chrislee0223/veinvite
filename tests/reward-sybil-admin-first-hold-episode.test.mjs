import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile('src/app/admin/sybil-review/page.tsx', 'utf8');
const api = await readFile('src/app/api/admin/sybil/review/route.ts', 'utf8');

test('oldest open HOLD alert uses first event of current episode, not last refresh', () => {
  assert.match(page, /v2_first_held_at: string \| null/u);
  assert.match(page, /const firstHeldAt = review\.v2_first_held_at \?\? review\.v2_updated_at/u);
  assert.match(page, /Date\.parse\(firstHeldAt\)/u);
  assert.match(page, /SYBIL_V2 · \$\{formatDate\(review\.v2_first_held_at \?\? review\.v2_updated_at\)\}/u);
  assert.match(api, /v2_first_held_at: assessment\?\.first_held_at \?\? null/u);
});

test('operators see first-held timestamp separately from last check, with no decision changes', () => {
  assert.match(page, /label="HOLD since"/u);
  assert.match(page, /label="Checked"/u);
  assert.match(page, /selected\.v2_first_held_at \?\? selected\.v2_updated_at/u);
  assert.match(page, /disabled=\{!actionReady \|\| !clearAllowed\}/u);
  assert.match(page, /disabled=\{!actionReady \|\| !blockedAllowed\}/u);
});
