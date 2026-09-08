import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(
  new URL('../src/app/layout.tsx', import.meta.url),
  'utf8',
);
const podium = await readFile(
  new URL('../src/app/leaderboard-podium-unified.css', import.meta.url),
  'utf8',
);
const movementCopy = await readFile(
  new URL('../src/lib/i18n/leaderboardMovementCopy.ts', import.meta.url),
  'utf8',
);

test('one unified podium layer is loaded after general UI hardening', () => {
  assert.match(layout, /final-ui-hardening\.css'[\s\S]*leaderboard-podium-unified\.css'/);
  assert.doesNotMatch(layout, /podium-laurel-option-c\.css/);
  assert.doesNotMatch(layout, /podium-laurel-size-tuning\.css/);
  assert.doesNotMatch(layout, /leaderboard-rank-axis-hardening\.css/);
});

test('podium visuals are driven by actual rank rather than DOM order', () => {
  for (const rank of [1, 2, 3]) {
    assert.match(podium, new RegExp(`rankRow\\[data-rank='${rank}'\\]`));
  }
  assert.doesNotMatch(podium, /nth-child/);
  assert.match(podium, /rankRow\[data-rank='1'\][\s\S]*rankStack::after/);
  assert.match(podium, /rankRow\[data-rank='2'\][\s\S]*rankStack::after,[\s\S]*rankRow\[data-rank='3'\][\s\S]*content:none !important/);
});

test('rank numerals and movement copy use separate fixed layers', () => {
  assert.match(
    podium,
    /\.rankValue \{[\s\S]*left:50% !important;[\s\S]*top:calc\(50% \+ var\(--rank-core-offset\)\) !important;[\s\S]*transform:translate\(-50%,-50%\) !important;/,
  );
  assert.match(
    podium,
    /\.rankMovement \{[\s\S]*left:0 !important;[\s\S]*right:0 !important;[\s\S]*width:100% !important;[\s\S]*justify-content:center !important;[\s\S]*transform:none !important;/,
  );
});

test('podium geometry is locale-neutral and RTL cannot mirror the rank axis', () => {
  assert.doesNotMatch(podium, /html\[lang=/);
  assert.match(podium, /html\[dir='rtl'\] \.leaderboardPage \.rankStack/);
  assert.match(podium, /direction:ltr !important/);
  assert.match(podium, /text-align:center !important/);
});

test('all localized new-entry labels stay short enough for the fixed movement slot', () => {
  const labels = [...movementCopy.matchAll(/newEntry:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(labels.length >= 28);
  for (const label of labels) {
    assert.ok(label.length <= 8, `movement label is too long for rank slot: ${label}`);
  }
});

test('podium vectors are font-independent masks and responsive sizes stay inside rank columns', () => {
  assert.match(podium, /mask-image:url\("data:image\/svg\+xml/);
  assert.match(podium, /--podium-size:38px/);
  assert.match(podium, /@media \(max-width:420px\)[\s\S]*--podium-size:34px/);
  assert.match(podium, /@media \(max-width:360px\)[\s\S]*--podium-size:32px/);
});