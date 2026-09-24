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

test('leaderboard reserves avatar geometry until verified profile resolution, then falls back safely', () => {
  assert.match(inviter, /getPicassoImage\(address\)/);
  assert.match(inviter, /useVechainDomain/);
  assert.match(inviter, /useGetAvatar/);
  assert.doesNotMatch(inviter, /useGetAvatarOfAddress/);
  assert.match(inviter, /readCachedProfileAvatar\(address\)/);
  assert.match(inviter, /const \[showFallback, setShowFallback\] = useState\(false\)/);
  assert.match(inviter, /const visibleUrl = displayUrl \|\| \(showFallback \? fallbackUrl : null\)/);
  assert.match(inviter, /walletAvatarNeutral/);
  assert.match(inviter, /loading=\{eager \? 'eager' : 'lazy'\}/);
  assert.match(inviter, /fetchPriority=\{eager \? 'high' : 'auto'\}/);
  assert.match(
    inviter,
    /entry\.rank > 0 && entry\.rank <= EAGER_AVATAR_RANK_LIMIT/,
  );
  assert.doesNotMatch(source, /@keyframes leaderboardAvatarReveal/);
  assert.doesNotMatch(
    source,
    /\.walletAvatar img\[src\^=['"]data:image\/svg\+xml['"]\][\s\S]*?display:none/,
  );
  assert.match(
    layoutPolish,
    /\.leaderboardPage \.walletAvatar:empty \{[\s\S]*?background:rgba\(255,205,80,\.055\) !important;/,
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

test('avatar loading no longer adds a reveal animation delay', () => {
  assert.doesNotMatch(source, /leaderboardAvatarReveal/);
});
