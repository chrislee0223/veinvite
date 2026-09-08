import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const css = readFileSync(
  join(root, 'src/app/leaderboard-country-horizontal-balance.css'),
  'utf8',
);
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);

test('country horizontal balance guard loads after the card-height guard', () => {
  const heightImport = layout.indexOf("import './leaderboard-card-height-stability.css';");
  const balanceImport = layout.indexOf("import './leaderboard-country-horizontal-balance.css';");
  assert.ok(heightImport >= 0);
  assert.ok(balanceImport > heightImport);
});

test('balanced tracks are derived from the existing wider edge columns', () => {
  assert.match(hub, /grid-template-columns:64px minmax\(0,1fr\) 84px;/);
  assert.match(hub, /@media \(max-width:430px\)[\s\S]*grid-template-columns:46px minmax\(0,1fr\) 58px;/);
  assert.match(hub, /@media \(max-width:360px\)[\s\S]*grid-template-columns:42px minmax\(0,1fr\) 54px;/);

  assert.match(css, /grid-template-columns:84px minmax\(0,1fr\) 84px !important;/);
  assert.match(css, /@media \(max-width:430px\)[\s\S]*grid-template-columns:58px minmax\(0,1fr\) 58px !important;/);
  assert.match(css, /@media \(max-width:360px\)[\s\S]*grid-template-columns:54px minmax\(0,1fr\) 54px !important;/);
});

test('country labels and identities are centered without legacy inline offsets', () => {
  assert.match(
    css,
    /\.countryHeader span:nth-child\(2\) \{[\s\S]*padding-inline-start:0 !important;[\s\S]*text-align:center !important;/,
  );
  assert.match(
    css,
    /\.countryIdentity \{[\s\S]*justify-content:center !important;[\s\S]*text-align:center !important;/,
  );
});

test('horizontal balance does not alter card height or list scrolling geometry', () => {
  assert.doesNotMatch(css, /\.unifiedRankingCard\s*\{/);
  assert.doesNotMatch(css, /\.countryScroll\s*\{/);
  assert.doesNotMatch(css, /height\s*:/);
  assert.doesNotMatch(css, /overflow/);
  assert.doesNotMatch(css, /padding-(?:left|right|inline)\s*:/);
});
