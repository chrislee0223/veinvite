import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const country = readFileSync(
  join(root, 'src/app/leaderboard-country-horizontal-balance.css'),
  'utf8',
);
const guard = readFileSync(
  join(root, 'src/app/leaderboard-column-alignment-guard.css'),
  'utf8',
);
const inviter = readFileSync(
  join(root, 'src/components/InviterLeaderboard.tsx'),
  'utf8',
);
const mobileTuning = readFileSync(
  join(root, 'src/app/leaderboard-mobile-table-tuning.css'),
  'utf8',
);

test('leaderboard alignment guard remains the final shared-card override', () => {
  const baseImport = layout.indexOf(
    "import './leaderboard-country-horizontal-balance.css';",
  );
  const guardImport = layout.indexOf(
    "import './leaderboard-column-alignment-guard.css';",
  );

  assert.ok(baseImport >= 0);
  assert.ok(guardImport > baseImport);
});

test('country header aligns with country-name text axis from flag geometry', () => {
  assert.match(
    guard,
    /\.countryHeader \.countryHeaderCountry \{\s*padding-inline-start: 36px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 430px\)[\s\S]*\.countryHeader \.countryHeaderCountry \{\s*padding-inline-start: 31px;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 360px\)[\s\S]*\.countryHeader \.countryHeaderCountry \{\s*padding-inline-start: 30px;/,
  );

  const desktopFlagWidth = 28;
  const desktopIdentityGap = 8;
  const phoneFlagWidth = 25;
  const phoneIdentityGap = 6;
  const narrowPhoneIdentityGap = 5;

  assert.equal(desktopFlagWidth + desktopIdentityGap, 36);
  assert.equal(phoneFlagWidth + phoneIdentityGap, 31);
  assert.equal(phoneFlagWidth + narrowPhoneIdentityGap, 30);
});

test('country identity shifts right by exactly one existing grid gap', () => {
  assert.match(
    country,
    /grid-template-columns: 80px minmax\(0, 1fr\) 64px 64px 72px;\s*column-gap: 8px;/,
  );
  assert.match(
    country,
    /@media \(max-width: 500px\)[\s\S]*grid-template-columns: 74px minmax\(0, 1fr\) 56px 56px 68px;\s*column-gap: 6px;/,
  );
  assert.match(
    country,
    /@media \(max-width: 430px\)[\s\S]*grid-template-columns: 56px minmax\(0, 1fr\) 44px 44px 52px;\s*column-gap: 4px;/,
  );
  assert.match(
    country,
    /@media \(max-width: 360px\)[\s\S]*grid-template-columns: 49px minmax\(0, 1fr\) 40px 40px 46px;\s*column-gap: 3px;/,
  );

  const maxRail = 520;
  const cardBorders = 2;
  const cardInlinePadding = 14 * 2;
  const rowInlinePadding = 10 * 2;
  const gridWidth =
    maxRail - cardBorders - cardInlinePadding - rowInlinePadding;

  const previousDesktopRankTrack = 72;
  const desktopGap = 8;
  const desktopRankTrack = previousDesktopRankTrack + desktopGap;
  const fixedTracksAndGaps = desktopRankTrack + 64 + 64 + 72 + desktopGap * 4;

  assert.equal(gridWidth, 470);
  assert.equal(desktopRankTrack, 80);
  assert.equal(fixedTracksAndGaps, 312);
  assert.equal(gridWidth - fixedTracksAndGaps, 158);
  assert.equal(previousDesktopRankTrack + desktopGap, 80);
  assert.equal(desktopRankTrack + desktopGap, 88);

  assert.equal(68 + 6, 74);
  assert.equal(52 + 4, 56);
  assert.equal(46 + 3, 49);

  assert.doesNotMatch(country, /translateX|margin-inline-start|padding-inline-start/);
});

test('country desktop typography matches inviter table scale', () => {
  assert.match(inviter, /\.tableHeader \{[\s\S]*font-size:\.61rem;/);
  assert.match(inviter, /\.rankValue \{[\s\S]*font-size:\.74rem;/);
  assert.match(inviter, /\.walletCell \{[\s\S]*font-size:\.72rem;/);
  assert.match(inviter, /\.rankMetric b \{[\s\S]*font-size:\.72rem;/);

  assert.match(country, /\.countryHeader \{[\s\S]*font-size: \.61rem;/);
  assert.match(country, /\.countryRank \{[\s\S]*font-size: \.74rem;/);
  assert.match(country, /\.countryNameLine strong \{[\s\S]*font-size: \.72rem;/);
  assert.match(country, /\.countryMetricValue \{[\s\S]*font-size: \.72rem;/);
  assert.match(country, /\.countryTotal \{[\s\S]*font-size: \.72rem;/);
});

test('country phone typography follows inviter responsive values', () => {
  assert.match(
    inviter,
    /@media \(max-width:420px\)[\s\S]*\.tableHeader \{[\s\S]*font-size:\.52rem;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:420px\)[\s\S]*\.rankValue,\.rankMetric b \{\s*font-size:\.65rem;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:420px\)[\s\S]*\.walletCell \{[\s\S]*font-size:\.64rem;/,
  );
  assert.match(
    mobileTuning,
    /@media \(max-width: 420px\)[\s\S]*\.rankRow \.rankMetric b \{\s*font-size: \.72rem !important;/,
  );

  assert.match(
    country,
    /@media \(max-width: 420px\)[\s\S]*\.countryHeader \{\s*font-size: \.52rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 420px\)[\s\S]*\.countryRank \{\s*font-size: \.65rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 420px\)[\s\S]*\.countryNameLine strong \{\s*font-size: \.64rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 420px\)[\s\S]*\.countryMetricValue,[\s\S]*\.countryTotal \{\s*font-size: \.72rem;/,
  );

  assert.match(
    inviter,
    /@media \(max-width:360px\)[\s\S]*\.tableHeader \{[\s\S]*font-size:\.48rem;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:360px\)[\s\S]*\.rankValue,\.rankMetric b \{\s*font-size:\.61rem;/,
  );
  assert.match(
    inviter,
    /@media \(max-width:360px\)[\s\S]*\.walletCell \{[\s\S]*font-size:\.59rem;/,
  );
  assert.match(
    mobileTuning,
    /@media \(max-width: 360px\)[\s\S]*\.rankRow \.rankMetric b \{\s*font-size: \.67rem !important;/,
  );

  assert.match(
    country,
    /@media \(max-width: 360px\)[\s\S]*\.countryHeader \{[\s\S]*font-size: \.48rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 360px\)[\s\S]*\.countryRank \{\s*font-size: \.61rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 360px\)[\s\S]*\.countryNameLine strong \{\s*font-size: \.59rem;/,
  );
  assert.match(
    country,
    /@media \(max-width: 360px\)[\s\S]*\.countryMetricValue,[\s\S]*\.countryTotal \{\s*font-size: \.67rem;/,
  );
});

test('total arrivals use emphasis without a larger numeric font', () => {
  assert.match(
    country,
    /\.countryTotal \{\s*color: #ffd35c;\s*font-size: \.72rem;\s*font-weight: 900;/,
  );
});

test('empty inviter dash centers under inviter header on desktop and phone', () => {
  assert.match(
    guard,
    /\.placeholderRow \.walletCell::before \{\s*content: none;/,
  );
  assert.match(
    guard,
    /\.placeholderRow \.walletText \{\s*text-align: center !important;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 420px\)[\s\S]*\.placeholderRow \.walletCell \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;[\s\S]*column-gap: 0 !important;/,
  );
  assert.match(
    guard,
    /@media \(max-width: 420px\)[\s\S]*\.placeholderRow \.walletText \{[\s\S]*width: 100% !important;[\s\S]*min-width: 0 !important;[\s\S]*max-width: 100% !important;/,
  );
});
