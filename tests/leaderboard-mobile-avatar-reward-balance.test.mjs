import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('leaderboard avatar loading keeps a neutral placeholder and suppresses generated Picasso fallbacks', () => {
  assert.match(
    source,
    /\.leaderboardHub \.walletAvatar \{\s*background:rgba\(255,205,80,\.055\) !important;/,
  );
  assert.match(
    source,
    /\.leaderboardHub \.walletAvatar img\[src\^='data:image\/svg\+xml'\] \{\s*display:none !important;\s*animation:none !important;/,
  );
  assert.match(source, /@keyframes leaderboardAvatarReveal/);
});

test('mobile inviter reward values match completed-count type size while wallet text is smaller', () => {
  assert.match(
    source,
    /@media \(max-width:420px\)[\s\S]*?\.leaderboardHub \.walletCell \{\s*font-size:\.60rem !important;[\s\S]*?\.leaderboardHub \.completedMetric b,\s*\.leaderboardHub \.rewardMetric b \{\s*font-size:\.65rem !important;/,
  );
  assert.match(
    source,
    /@media \(max-width:360px\)[\s\S]*?\.leaderboardHub \.walletCell \{\s*font-size:\.55rem !important;[\s\S]*?\.leaderboardHub \.completedMetric b,\s*\.leaderboardHub \.rewardMetric b \{\s*font-size:\.61rem !important;/,
  );
});

test('mobile vertical-only leaderboard scrolling remains protected', () => {
  assert.match(
    source,
    /\.leaderboardHub \.rankScroll,\s*\.leaderboardHub \.countryScroll \{\s*overflow-x:hidden !important;\s*touch-action:pan-y;/,
  );
});

test('avatar reveal respects reduced motion', () => {
  assert.match(
    source,
    /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.leaderboardHub \.walletAvatar img \{\s*animation:none !important;/,
  );
});
