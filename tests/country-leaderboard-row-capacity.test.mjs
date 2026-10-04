import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const css = readFileSync(
  join(root, 'src/app/leaderboard-country-row-capacity.css'),
  'utf8',
);
const base = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('country ranking can use five through seven visible rows without changing rank data', () => {
  assert.match(hub, /const COUNTRY_MIN_VISIBLE_ROWS = 5;/);
  assert.match(hub, /const COUNTRY_MAX_VISIBLE_ROWS = 7;/);
  assert.match(
    hub,
    /const countryVisibleRowCount =[\s\S]*countryLeaders\.length > 0[\s\S]*COUNTRY_MAX_VISIBLE_ROWS[\s\S]*Math\.max\(COUNTRY_MIN_VISIBLE_ROWS, countryLeaders\.length\)[\s\S]*: COUNTRY_MAX_VISIBLE_ROWS/,
  );
  assert.match(
    hub,
    /className="countryPanel"[\s\S]*data-visible-rows=\{countryVisibleRowCount\}/,
  );
  assert.doesNotMatch(hub, /countryLeaders\.slice\(/);
});

test('base country card keeps the reviewed five-row geometry', () => {
  assert.match(
    base,
    /\.leaderboardHub \.countryRow,[\s\S]*height:50px !important;/,
  );
  assert.match(
    base,
    /\.leaderboardHub \.countryScroll,[\s\S]*height:250px !important;/,
  );
  assert.match(base, /@media \(max-width:420px\)[\s\S]*height:46px !important;[\s\S]*height:230px !important;/);
  assert.match(base, /@media \(max-width:360px\)[\s\S]*height:44px !important;[\s\S]*height:220px !important;/);
});

test('only inviter-reserved spare height expands the country viewport', () => {
  assert.match(css, /--country-base-viewport-height: 250px;/);
  assert.match(css, /:has\(\.impactOnly \.rankContextNote\)/);
  assert.match(css, /:has\(\.impactOnly \.trailingCurrent\)/);
  assert.match(
    css,
    /var\(--stable-ranking-trailing-height\) - var\(--stable-ranking-base-height\)/,
  );
  assert.match(css, /\+ var\(--stable-ranking-context-reserve\)/);
  assert.match(
    css,
    /var\(--country-base-viewport-height\) \+ var\(--country-spare-height\)/,
  );
});

test('expanded country rows fill the reserve without over-compressing context-only states', () => {
  assert.match(css, /data-visible-rows='6'/);
  assert.match(css, /data-visible-rows='7'/);
  assert.match(
    css,
    /:has\(\.impactOnly \.rankContextNote\):not\(:has\(\.impactOnly \.trailingCurrent\)\)[\s\S]*data-visible-rows='7'[\s\S]*--country-visible-row-count: 6/,
  );
  assert.match(css, /\.countrySkeleton \{[\s\S]*overflow: hidden;/);
  assert.match(
    css,
    /\/ var\(--country-visible-row-count\)/,
  );
  assert.match(hub, /countryLeaders\.map\(\(row\) => \(/);
  assert.match(
    hub,
    /Array\.from\(\{ length: countryVisibleRowCount \}/,
  );
});

test('country capacity guard is loaded after horizontal layout and card stability guards', () => {
  const stability = layout.indexOf("import './leaderboard-card-height-stability.css';");
  const horizontal = layout.indexOf("import './leaderboard-country-horizontal-balance.css';");
  const capacity = layout.indexOf("import './leaderboard-country-row-capacity.css';");
  assert.ok(stability >= 0);
  assert.ok(horizontal > stability);
  assert.ok(capacity > horizontal);
});

test('pending current-wallet geometry is mirrored by the hidden inviter measurement surface', () => {
  assert.match(
    hub,
    /className="impactOnly"[\s\S]*pendingCurrentWallet=\{pendingCurrentWallet\}[\s\S]*previewData=\{displayData\}/,
  );
});
