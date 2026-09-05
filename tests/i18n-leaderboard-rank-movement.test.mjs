import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localeSource = await readFile(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const movementCopy = await readFile(
  new URL('../src/lib/i18n/leaderboardMovementCopy.ts', import.meta.url),
  'utf8',
);
const leaderboard = await readFile(
  new URL('../src/components/PublicLeaderboard.tsx', import.meta.url),
  'utf8',
);
const preview = await readFile(
  new URL('../src/components/LeaderboardUiPreview.tsx', import.meta.url),
  'utf8',
);

const supportedLocales = [
  ...localeSource.matchAll(/locale:\s*'([^']+)'/g),
].map((match) => match[1]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('rank movement copy covers every supported VeInvite locale', () => {
  assert.equal(supportedLocales.length, 28);
  for (const locale of supportedLocales) {
    assert.match(
      movementCopy,
      new RegExp(`(?:^|\\n)\\s*['\"]?${escapeRegex(locale)}['\"]?\\s*:\\s*\\{`),
      `missing leaderboard movement copy for ${locale}`,
    );
  }
});

test('movement UI distinguishes every state without relying on color alone', () => {
  assert.match(leaderboard, /entry\.rankMovement === 'NEW'/);
  assert.match(leaderboard, /entry\.rankMovement === 'SAME'/);
  assert.match(leaderboard, /entry\.rankMovement === 'UP'/);
  assert.match(leaderboard, /entry\.rankMovement === 'DOWN'/);
  assert.match(leaderboard, /entry\.rankMovement === 'UNAVAILABLE'/);
  assert.match(leaderboard, /▲/);
  assert.match(leaderboard, /▼/);
  assert.match(leaderboard, />—<\/small>/);
});

test('RTL locales keep numeric movement direction isolated left-to-right', () => {
  assert.match(leaderboard, /<bdi dir="ltr">/);
  for (const locale of ['ar', 'ur', 'arz']) {
    assert.match(
      movementCopy,
      new RegExp(`(?:^|\\n)\\s*${locale}:\\s*\\{`),
    );
  }
});

test('screen readers receive localized movement context in row labels', () => {
  assert.match(leaderboard, /movementCopy\.newEntryAria/);
  assert.match(leaderboard, /movementCopy\.up\(entry\.rankChange\)/);
  assert.match(leaderboard, /movementCopy\.down\(Math\.abs\(entry\.rankChange\)\)/);
  assert.match(leaderboard, /movementCopy\.same/);
  assert.match(leaderboard, /movementDescription/);
  assert.match(leaderboard, /aria-label=\{\[/);
});

test('large movement and top-100 boundary scenarios are represented in preview fixtures', () => {
  assert.match(preview, /previousRank: 163,[\s\S]*rankChange: 126/);
  assert.match(preview, /rank: 137,[\s\S]*previousRank: 27,[\s\S]*rankChange: -110/);
  assert.match(preview, /rankMovement: 'NEW'/);
  assert.match(preview, /rankMovement: 'SAME'/);
  assert.match(preview, /rankMovement: 'UNAVAILABLE'/);
});

test('mobile rank column reserves room for movement without adding a fifth table column', () => {
  assert.match(leaderboard, /--rank-column:50px/);
  assert.match(leaderboard, /--rank-column:40px/);
  assert.match(leaderboard, /--rank-column:38px/);
  assert.match(
    leaderboard,
    /grid-template-columns:\s*var\(--rank-column\)\s*minmax\(0,1fr\)\s*var\(--completed-column\)\s*var\(--reward-column\)/,
  );
});
