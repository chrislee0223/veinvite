import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);
const inviter = readFileSync(
  join(root, 'src/components/InviterLeaderboard.tsx'),
  'utf8',
);
const layoutPolish = readFileSync(
  join(root, 'src/components/SecondaryPageLayoutPolish.tsx'),
  'utf8',
);

test('leaderboard keeps VeChain avatars visible and uses a neutral loading placeholder', () => {
  assert.match(inviter, /useGetAvatarOfAddress/);
  assert.doesNotMatch(
    source,
    /\.walletAvatar img\[src\^=['"]data:image\/svg\+xml['"]\][\s\S]*?display:none/,
  );
  assert.match(source, /@keyframes leaderboardAvatarReveal/);
  assert.match(
    layoutPolish,
    /\.leaderboardPage \.walletAvatar:empty \{[\s\S]*?background:rgba\(255,205,80,\.055\) !important;/,
  );
  assert.doesNotMatch(
    layoutPolish,
    /radial-gradient\(circle at 50% 35%,#eec04c/,
  );
  assert.doesNotMatch(
    layoutPolish,
    /radial-gradient\(ellipse at 50% 82%,#eec04c/,
  );
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
