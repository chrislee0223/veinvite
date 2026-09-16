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
const alignmentGuard = await readFile(
  new URL('../src/app/leaderboard-column-alignment-guard.css', import.meta.url),
  'utf8',
);

const supportedLocales = [
  ...localeSource.matchAll(/locale:\s*'([^']+)'/g),
].map((match) => match[1]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('rank movement copy covers every supported VeInvite locale', () => {
  assert.equal(supportedLocales.length, 29);
  for (const locale of supportedLocales) {
    assert.match(
      movementCopy,
      new RegExp(`(?:^|\\n)\\s*['\"]?${escapeRegex(locale)}['\"]?\\s*:\\s*\\{`),
      `missing leaderboard movement copy for ${locale}`,
    );
  }
});

test('visible NEW labels stay inside the reviewed compact multilingual layout contract', () => {
  const newEntryLabels = [
    ...movementCopy.matchAll(/\bnewEntry:\s*'([^']+)'/g),
  ].map((match) => match[1]);

  assert.equal(newEntryLabels.length, supportedLocales.length);
  for (const label of newEntryLabels) {
    assert.ok(
      [...label].length <= 5,
      `review rank movement geometry before using longer NEW label: ${label}`,
    );
    assert.doesNotMatch(label, /\s/);
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

test('RTL locales keep leaderboard geometry while movement labels center as whole visual units', () => {
  assert.match(leaderboard, /<bdi dir="ltr">/);
  assert.match(leaderboard, /\.tableHeader,\.rankRow \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankStack \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankValue \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.walletCell \{[\s\S]*direction:ltr;/);
  assert.match(leaderboard, /\.rankMetric \{[\s\S]*direction:ltr;/);
  assert.match(podiumLayoutGuard, /html\[dir='rtl'\][\s\S]*direction:ltr !important/);
  assert.match(
    alignmentGuard,
    /\.rankRow\[data-rank\] \.rankStack,[\s\S]*direction: ltr !important;/,
  );
  assert.match(
    alignmentGuard,
    /\.rankRow\[data-rank\] \.rankMovement\.rankMovement,[\s\S]*justify-content: center !important;[\s\S]*text-align: center !important;[\s\S]*unicode-bidi: isolate !important;/,
  );
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

test('final inviter grid keeps header, top-100 rows, placeholders, and current-user row on one coordinate system', () => {
  const podiumImport = layout.indexOf(
    "import './leaderboard-podium-layout-guard.css';",
  );
  const alignmentImport = layout.indexOf(
    "import './leaderboard-column-alignment-guard.css';",
  );

  assert.ok(podiumImport >= 0);
  assert.ok(alignmentImport > podiumImport);
  assert.match(
    alignmentGuard,
    /\.tableHeader,\s*html body \.leaderboardPage \.rankingCard \.rankRow \{\s*grid-template-columns: 21fr 34fr 17fr 28fr !important;/,
  );
  assert.match(alignmentGuard, /\.rankRow\.trailingCurrent \.rankStack/);
  assert.match(leaderboard, /rankRow placeholderRow/);
  assert.match(leaderboard, /trailing \? 'trailingCurrent' : ''/);

  const rankTrack = 21;
  const inviterTrack = 34;
  const completedTrack = 17;
  const rewardTrack = 28;
  const rankAxisInsideTrack = 6 / rankTrack;
  const movementLaneStartInsideTrack = 0.55;
  const movementCenterInsideTrack =
    movementLaneStartInsideTrack + (1 - movementLaneStartInsideTrack) / 2;
  const headerAxisInsideTrack =
    (rankAxisInsideTrack + movementCenterInsideTrack) / 2;
  const headerShiftInsideTrack = headerAxisInsideTrack - 0.5;
  const rankAxis = rankTrack * rankAxisInsideTrack;
  const movementAxis = rankTrack * movementCenterInsideTrack;
  const headerAxis = rankTrack * headerAxisInsideTrack;

  assert.equal(rankTrack + inviterTrack + completedTrack + rewardTrack, 100);
  assert.equal(rankAxis, 6);
  assert.ok(Math.abs(movementAxis - 16.275) < 1e-9);
  assert.ok(Math.abs(headerAxis - 11.1375) < 1e-9);
  assert.ok(Math.abs(headerAxis - (rankAxis + movementAxis) / 2) < 1e-9);
  assert.ok(
    Math.abs(rankTrack / 2 + rankTrack * headerShiftInsideTrack - 11.1375) <
      1e-9,
  );
  assert.equal(rankTrack + inviterTrack / 2, 38);
  assert.equal(rankTrack + inviterTrack + completedTrack / 2, 63.5);
  assert.equal(rankTrack + inviterTrack + completedTrack + rewardTrack / 2, 86);
  assert.ok(movementAxis < rankTrack);
  assert.ok(38 - movementAxis > 21);
  assert.ok(86 - 63.5 < 24);
});

test('rank numeral stays on six-percent axis while rank header balances numeral and movement', () => {
  assert.match(leaderboard, /data-rank=\{entry\.rank > 0 \? entry\.rank : undefined\}/);
  assert.match(leaderboard, /data-rank=\{rank\}/);
  assert.match(
    leaderboard,
    /\.leaderboardPage \.rankRow,[\s\S]*height:var\(--rank-row-height\) !important;[\s\S]*min-height:var\(--rank-row-height\) !important;[\s\S]*max-height:var\(--rank-row-height\) !important;/,
  );
  assert.match(
    alignmentGuard,
    /--inviter-rank-number-axis: 28\.5714286%;[\s\S]*--inviter-rank-header-shift: 3\.0357143%;[\s\S]*--inviter-rank-movement-lane-start: 55%;/,
  );
  assert.match(
    alignmentGuard,
    /\.rankRow\[data-rank\] \.rankValue\.rankValue,[\s\S]*left: var\(--inviter-rank-number-axis\) !important;[\s\S]*top: 50% !important;[\s\S]*transform: translate\(-50%, -50%\) !important;/,
  );
  assert.match(
    alignmentGuard,
    /\.tableHeader > span:first-child \{[\s\S]*transform: translateX\(var\(--inviter-rank-header-shift\)\) !important;/,
  );
});

test('multilingual headers retain wrapping and shared physical axes at narrow widths', () => {
  assert.match(
    leaderboard,
    /\.tableHeader span \{[\s\S]*min-width:0;[\s\S]*overflow-wrap:anywhere;[\s\S]*text-align:center;/,
  );
  assert.match(
    leaderboard,
    /\.tableHeader \.rewardHeader \{[\s\S]*justify-content:center;[\s\S]*flex-wrap:wrap;[\s\S]*text-align:center;/,
  );
  assert.match(leaderboard, /@media \(max-width:420px\)[\s\S]*font-size:\.52rem;/);
  assert.match(leaderboard, /@media \(max-width:360px\)[\s\S]*font-size:\.48rem;/);
});

test('approved podium artwork is preserved while the temporary component redraw stays disabled', () => {
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

test('movement labels center the complete arrow-number or localized NEW label in one fixed lane', () => {
  assert.match(
    alignmentGuard,
    /\.rankMovement\.rankMovement \{[\s\S]*left: var\(--inviter-rank-movement-lane-start\) !important;[\s\S]*top: 50% !important;[\s\S]*right: 0 !important;[\s\S]*width: auto !important;[\s\S]*display: flex !important;[\s\S]*justify-content: center !important;[\s\S]*transform: translateY\(-50%\) !important;[\s\S]*text-align: center !important;[\s\S]*white-space: nowrap !important;/,
  );
  assert.match(leaderboard, /className="rankMovement new"[\s\S]*dir="auto"/);
  assert.match(
    leaderboard,
    /<bdi dir="ltr">[\s\S]*\{isUp \? '▲' : '▼'\}\{Math\.abs\(change\)\.toLocaleString\('en-US'\)\}/,
  );
});

test('responsive layouts keep the same four-column axes without locale-specific movement nudges', () => {
  assert.match(
    alignmentGuard,
    /grid-template-columns: 21fr 34fr 17fr 28fr !important;/,
  );
  assert.doesNotMatch(
    alignmentGuard,
    /grid-template-columns:[^;]*21fr[^;]*34fr[^;]*17fr[^;]*28fr[^;]*fr[^;]*;/,
  );
  assert.doesNotMatch(
    alignmentGuard,
    /@media \(max-width: 420px\)[\s\S]*--inviter-rank-movement-lane-start/,
  );
  assert.doesNotMatch(
    alignmentGuard,
    /html\[lang=['"][^'"]+['"]\][\s\S]*rankMovement/,
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
