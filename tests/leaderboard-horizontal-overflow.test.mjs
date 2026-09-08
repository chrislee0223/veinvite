import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('leaderboard scrolling stays vertical-only on touch devices', () => {
  assert.match(
    source,
    /\.leaderboardHub \.rankScroll,[\s\S]*\.leaderboardHub \.countryScroll \{[\s\S]*overflow-x:hidden !important;[\s\S]*touch-action:pan-y;/,
  );
});

test('leaderboard rows cannot expand beyond the shared card width', () => {
  assert.match(
    source,
    /\.leaderboardHub \.rows,[\s\S]*\.leaderboardHub \.countryPlaceholderRow \{[\s\S]*min-width:0 !important;[\s\S]*max-width:100% !important;/,
  );
  assert.match(source, /\.leaderboardHub \.rows \{[\s\S]*overflow-x:hidden;/);
  assert.match(
    source,
    /\.leaderboardHub \.rewardMetric \{[\s\S]*overflow:hidden;/,
  );
});

test('mobile inviter columns reserve more width for exact B3TR rewards', () => {
  assert.match(
    source,
    /@media \(max-width:420px\)[\s\S]*--completed-column:54px !important;[\s\S]*--reward-column:98px !important;/,
  );
  assert.match(
    source,
    /@media \(max-width:360px\)[\s\S]*--completed-column:50px !important;[\s\S]*--reward-column:94px !important;/,
  );
  assert.match(source, /font-size:clamp\(\.56rem,2\.35vw,\.65rem\) !important;/);
});
