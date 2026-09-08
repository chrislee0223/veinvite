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

test('leaderboard shows an immediate address avatar and upgrades to a real VET Domain profile without a blank state', () => {
  assert.match(inviter, /getPicassoImage\(address\)/);
  assert.match(inviter, /useVechainDomain/);
  assert.match(inviter, /useGetAvatar/);
  assert.doesNotMatch(inviter, /useGetAvatarOfAddress/);
  assert.match(inviter, /const \[shouldLoadProfile, setShouldLoadProfile\] = useState\(eager\)/);
  assert.match(inviter, /const \[displayUrl, setDisplayUrl\] = useState\(fallbackUrl\)/);
  assert.match(inviter, /image\.onload = \(\) => \{[\s\S]*?setDisplayUrl\(profileAvatarUrl\)/);
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
  assert.doesNotMatch(
    inviter,
    /radial-gradient\(circle at 50% 35%,#eec04c/,
  );
  assert.doesNotMatch(
    inviter,
    /radial-gradient\(ellipse at 50% 82%,#eec04c/,
  );
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

test('avatar loading no longer adds a reveal animation delay', () => {
  assert.doesNotMatch(source, /leaderboardAvatarReveal/);
});
