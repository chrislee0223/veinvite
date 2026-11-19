import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const css = readFileSync(
  join(root, 'src/app/leaderboard-card-height-stability.css'),
  'utf8',
);
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);
const inviter = readFileSync(
  join(root, 'src/components/InviterLeaderboard.tsx'),
  'utf8',
);
const entry = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('leaderboard card stability guard is loaded after responsive table tuning', () => {
  const tuningImport = layout.indexOf("import './leaderboard-mobile-table-tuning.css';");
  const stabilityImport = layout.indexOf("import './leaderboard-card-height-stability.css';");
  assert.ok(tuningImport >= 0);
  assert.ok(stabilityImport > tuningImport);
});

test('stable card heights are derived from the existing desktop and mobile geometry', () => {
  assert.match(inviter, /--rank-row-height:50px;/);
  assert.match(inviter, /\.tableHeader \{[\s\S]*min-height:34px;/);
  assert.match(hub, /\.inviterInside \.tableHeader \{[\s\S]*margin-bottom:6px !important;/);
  assert.match(hub, /\.rankingTabs button \{[\s\S]*min-height:48px;/);
  assert.match(hub, /@media \(max-width:430px\)[\s\S]*\.rankingTabs button \{[\s\S]*min-height:44px;/);
  assert.match(inviter, /@media \(max-width:420px\)[\s\S]*--rank-row-height:46px;/);
  assert.match(inviter, /@media \(max-width:360px\)[\s\S]*--rank-row-height:44px;/);
  assert.match(entry, /\.countryScroll,[\s\S]*height:250px !important;/);
  assert.match(entry, /@media \(max-width:420px\)[\s\S]*height:230px !important;/);
  assert.match(entry, /@media \(max-width:360px\)[\s\S]*height:220px !important;/);

  assert.match(css, /--stable-ranking-base-height:376px;/);
  assert.match(css, /--stable-ranking-trailing-height:452px;/);
  assert.match(css, /@media \(max-width:430px\)[\s\S]*--stable-ranking-base-height:376px;[\s\S]*--stable-ranking-trailing-height:452px;/);
  assert.match(css, /@media \(max-width:420px\)[\s\S]*--stable-ranking-base-height:354px;[\s\S]*--stable-ranking-trailing-height:426px;/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*--stable-ranking-base-height:344px;[\s\S]*--stable-ranking-trailing-height:416px;/);
});

test('current-wallet footer state is reserved even while the country tab is visible', () => {
  assert.match(hub, /data-inviter-footer-hint=\{hasInviterRankHint/);
  assert.match(hub, /data-inviter-footer-trailing=\{hasInviterTrailingRow/);
  assert.match(css, /\.leaderboardHub\[data-inviter-footer-hint='true'\] \.unifiedRankingCard/);
  assert.match(css, /\.leaderboardHub\[data-inviter-footer-trailing='true'\] \.unifiedRankingCard/);
  assert.match(css, /--stable-ranking-context-reserve:calc\(8px \+ 1\.015rem\);/);
  assert.match(css, /@media \(max-width:430px\)[\s\S]*--stable-ranking-context-reserve:calc\(8px \+ 2\.03rem\);/);
});

test('an unranked connected wallet reserves both the trailing row and the note', () => {
  assert.match(inviter, /rankedCurrentUser \?\?[\s\S]*rank: 0,/);
  assert.match(inviter, /const trailingCurrentUser =\s*currentUser && !currentUserInList \? currentUser : null;/);
  assert.match(inviter, /!rankedCurrentUser && !loading/);
  assert.match(inviter, /rankContextPending/);
  assert.match(
    css,
    /\.leaderboardHub\[data-inviter-footer-trailing='true'\]\[data-inviter-footer-hint='true'\] \.unifiedRankingCard/,
  );
  assert.match(
    css,
    /var\(--stable-ranking-trailing-height\) \+ var\(--stable-ranking-context-reserve\)/,
  );
});

test('stability guard changes only minimum card height and leaves list scrolling intact', () => {
  assert.match(css, /\.leaderboardHub \.unifiedRankingCard \{\s*min-height:var\(--stable-ranking-base-height\);\s*\}/);
  assert.doesNotMatch(css, /\.rankScroll\s*\{/);
  assert.doesNotMatch(css, /\.countryScroll\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*width\s*:/m);
});


test('footer stability never infers state from impact-only markup', () => {
  assert.doesNotMatch(css, /:has\(\.impactOnly/);
  assert.match(css, /\[data-inviter-footer-hint='true'\]/);
  assert.match(css, /\[data-inviter-footer-trailing='true'\]/);
});
