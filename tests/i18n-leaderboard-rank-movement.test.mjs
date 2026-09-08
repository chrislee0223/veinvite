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
  new URL('../src/components/InviterLeaderboard.tsx', import.meta.url),
  'utf8',
);
const preview = await readFile(
  new URL('../src/components/LeaderboardUiPreview.tsx', import.meta.url),
  'utf8',
);
const layout = await readFile(
  new URL('../src/app/layout.tsx', import.meta.url),
  'utf8',
);
const finalUiHardening = await readFile(
  new URL('../src/app/final-ui-hardening.css', import.meta.url),
  'utf8',
);
const approvedPodium = await readFile(
  new URL('../src/app/podium-laurel-option-c.css', import.meta.url),
  'utf8',
);
const approvedPodiumTuning = await readFile(
  new URL('../src/app/podium-laurel-size-tuning.css', import.meta.url),
  'utf8',
);
const podiumLayoutGuard = await readFile(
  new URL('../src/app/leaderboard-podium-layout-guard.css', import.meta.url),
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

test('movement UI keeps new/up/down explicit while unchanged ranks stay visually quiet', () => {
  assert.match(leaderboard, /entry\.rankMovement === 'NEW'/);
  assert.match(leaderboard, /entry\.rankMovement === 'SAME'/);
  assert.match(leaderboard, /entry\.rankMovement === 'UP'/);
  assert.match(leaderboard, /entry\.rankMovement === 'DOWN'/);
  assert.match(leaderboard, /entry\.rankMovement === 'UNAVAILABLE'/);
  assert.match(leaderboard, /▲/);
  assert.match(leaderboard, /▼/);
  assert.match(
    leaderboard,
    /entry\.rankMovement === 'UNAVAILABLE' \|\|[\s\S]*entry\.rankMovement === 'SAME'[\s\S]*return null;/,
  );
});

test('RTL locales keep leaderboard geometry and numeric movement left-to-right', () => {
  assert.match(leaderboard, /<bdi dir="ltr">/);
  assert.match(leaderboard, /\.tableHeader,\.rankRow \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankStack \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankValue \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.walletCell \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankMetric \{[\s\S]*direction:ltr;/);
  assert.match(podiumLayoutGuard, /html\[dir='rtl'\][\s\S]*direction:ltr !important/);
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

test('rank cells use one fixed axis and fixed row height regardless of locale typography', () => {
  assert.match(leaderboard, /data-rank=\{entry\.rank > 0 \? entry\.rank : undefined\}/);
  assert.match(leaderboard, /data-rank=\{rank\}/);
  assert.match(
    leaderboard,
    /\.leaderboardPage \.rankRow,[\s\S]*height:var\(--rank-row-height\) !important;[\s\S]*min-height:var\(--rank-row-height\) !important;[\s\S]*max-height:var\(--rank-row-height\) !important;/,
  );
  assert.match(
    podiumLayoutGuard,
    /\.rankValue\.rankValue \{[\s\S]*left:50% !important;[\s\S]*top:50% !important;[\s\S]*transform:translate\(-50%,-50%\) !important;/,
  );
});

test('approved podium artwork is restored while the temporary component redraw is disabled', () => {
  assert.match(approvedPodium, /--podium-shape:path\(/);
  assert.match(approvedPodium, /rankValue\.rankValue::before/);
  assert.match(approvedPodiumTuning, /scale\(\.80\)/);
  assert.match(approvedPodiumTuning, /scale\(\.95\)/);
  assert.match(approvedPodiumTuning, /top:calc\(50% \+ 2px\) !important/);
  assert.match(
    podiumLayoutGuard,
    /rankRow\[data-rank='1'\] \.rankStack::before,[\s\S]*content:none !important;[\s\S]*display:none !important;/,
  );
});

test('movement labels occupy the full fixed rank slot instead of shifting the numeral', () => {
  assert.match(
    podiumLayoutGuard,
    /\.rankMovement\.rankMovement \{[\s\S]*width:100% !important;[\s\S]*justify-content:center !important;[\s\S]*transform:none !important;/,
  );
  assert.match(leaderboard, /className="rankMovement new"[\s\S]*dir="auto"/);
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

test('B3TR unit is declared once in the centered table header while detail view keeps the explicit unit', () => {
  assert.match(
    leaderboard,
    /className="rewardHeader"[\s\S]*\{t\.earned\}[\s\S]*<bdi dir="ltr">\(B3TR\)<\/bdi>/,
  );
  assert.match(
    leaderboard,
    /\.tableHeader \.rewardHeader \{[\s\S]*justify-content:center;[\s\S]*text-align:center;/,
  );
  assert.match(
    leaderboard,
    /className="rankMetric rewardMetric">\s*<b>\{formatRewardWei\(entry\.totalRewardWei\)\}<\/b>/,
  );
  assert.match(
    leaderboard,
    /formatRewardWei\(selectedEntry\.totalRewardWei\)\} B3TR/,
  );
});

test('approved podium assets are loaded and obsolete replacement layers stay removed', () => {
  assert.match(layout, /podium-laurel-option-c\.css/);
  assert.match(layout, /podium-laurel-size-tuning\.css/);
  assert.match(layout, /leaderboard-podium-layout-guard\.css/);
  assert.doesNotMatch(layout, /leaderboard-podium-unified\.css/);
  assert.doesNotMatch(layout, /leaderboard-rank-axis-hardening\.css/);
  assert.doesNotMatch(finalUiHardening, /rankValue::before/);
  assert.doesNotMatch(finalUiHardening, /featured:nth-child/);
  assert.doesNotMatch(finalUiHardening, /placeholderRow:nth-child/);
});
