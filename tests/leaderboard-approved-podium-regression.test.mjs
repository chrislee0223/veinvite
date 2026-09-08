import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const optionC = await readFile('src/app/podium-laurel-option-c.css', 'utf8');
const tuning = await readFile('src/app/podium-laurel-size-tuning.css', 'utf8');
const guard = await readFile('src/app/leaderboard-podium-layout-guard.css', 'utf8');
const layout = await readFile('src/app/layout.tsx', 'utf8');

function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

test('approved Option C artwork is byte-for-byte the finalized version', () => {
  assert.equal(gitBlobSha(optionC), '2822bf8e88e27998612f51c3bb9ca35bb40159e3');
  assert.equal(gitBlobSha(tuning), 'f8c2ad46004ea832d9cfe1eeab875132fb4c0542');
});

test('approved podium artwork loads before the layout-only guard', () => {
  const optionIndex = layout.indexOf("./podium-laurel-option-c.css");
  const tuningIndex = layout.indexOf("./podium-laurel-size-tuning.css");
  const guardIndex = layout.indexOf("./leaderboard-podium-layout-guard.css");

  assert.ok(optionIndex >= 0);
  assert.ok(tuningIndex > optionIndex);
  assert.ok(guardIndex > tuningIndex);
  assert.equal(layout.includes('leaderboard-podium-unified.css'), false);
});

test('layout guard cannot redraw or restyle the approved crown and laurels', () => {
  assert.equal(/clip-path|mask-image|--podium-shape|linear-gradient|radial-gradient/i.test(guard), false);
  assert.match(guard, /rankStack::before/);
  assert.match(guard, /rankStack::after/);
  assert.match(guard, /content:none !important/);
});

test('movement copy owns a fixed slot and cannot move the rank numeral', () => {
  assert.match(guard, /rankMovement\.rankMovement/);
  assert.match(guard, /width:100% !important/);
  assert.match(guard, /justify-content:center !important/);
  assert.match(guard, /rankValue\.rankValue/);
  assert.match(guard, /left:50% !important/);
  assert.match(guard, /top:50% !important/);
});
