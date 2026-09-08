import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const podium = await readFile(
  new URL('../src/app/leaderboard-podium-unified.css', import.meta.url),
  'utf8',
);

test('rank-one crown clears stale clip geometry before applying its vector mask', () => {
  const crown = podium.match(
    /\.leaderboardPage \.rankRow\[data-rank='1'\] \.rankStack::after \{([\s\S]*?)\n\}/,
  )?.[1] ?? '';

  assert.match(crown, /-webkit-clip-path:none !important;/);
  assert.match(crown, /clip-path:none !important;/);
  assert.match(crown, /mask-image:url\("data:image\/svg\+xml/);
});

test('laurel layer explicitly clears legacy border and transform geometry', () => {
  const laurel = podium.match(
    /\.leaderboardPage \.rankRow\[data-rank='1'\] \.rankStack::before,[\s\S]*?\{([\s\S]*?)\n\}/,
  )?.[1] ?? '';

  assert.match(laurel, /border:0 !important;/);
  assert.match(laurel, /border-radius:0 !important;/);
  assert.match(laurel, /transform:translate\(-50%,-50%\) !important;/);
});

test('second and third place can never inherit a crown', () => {
  assert.match(
    podium,
    /rankRow\[data-rank='2'\] \.rankStack::after,[\s\S]*rankRow\[data-rank='3'\] \.rankStack::after[\s\S]*content:none !important;[\s\S]*display:none !important;/,
  );
});