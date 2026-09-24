import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const leaderboard = readFileSync(
  new URL('../src/components/InviterLeaderboard.tsx', import.meta.url),
  'utf8',
);
const networkIdentity = readFileSync(
  new URL('../src/components/NetworkWalletIdentity.tsx', import.meta.url),
  'utf8',
);
const warmup = readFileSync(
  new URL('../src/components/LeaderboardAvatarWarmup.tsx', import.meta.url),
  'utf8',
);
const avatarCache = readFileSync(
  new URL('../src/lib/profileAvatarCache.ts', import.meta.url),
  'utf8',
);

test('Network and leaderboard share the verified profile-avatar v2 cache', () => {
  assert.match(leaderboard, /readCachedProfileAvatar/);
  assert.match(leaderboard, /rememberProfileAvatar/);
  assert.match(networkIdentity, /readCachedProfileAvatar/);
  assert.match(networkIdentity, /rememberProfileAvatar/);
  assert.match(warmup, /readCachedProfileAvatar/);
  assert.match(warmup, /rememberProfileAvatar/);
  assert.match(avatarCache, /veinvite_profile_avatar_v2/);
  assert.match(avatarCache, /PROFILE_AVATAR_CACHE_TTL_MS = 15 \* 60_000/);
  assert.match(
    avatarCache,
    /const profileAvatarMemory = new Map<string, StoredProfileAvatar>\(\)/,
  );
  assert.doesNotMatch(avatarCache, /veinvite_leaderboard_profile_avatar_v1/);
});

test('Picasso stays a display fallback and is never persisted as a profile avatar', () => {
  assert.match(leaderboard, /getPicassoImage\(address\)/);
  assert.match(networkIdentity, /getPicassoImage\(address\)/);
  assert.doesNotMatch(warmup, /getPicassoImage/);
  assert.doesNotMatch(
    leaderboard,
    /rememberProfileAvatar\([^\n]*fallbackUrl/,
  );
  assert.doesNotMatch(
    networkIdentity,
    /rememberProfileAvatar\([^\n]*fallbackUrl/,
  );
  assert.doesNotMatch(avatarCache, /getPicassoImage/);
});

test('avatar does not paint Picasso before profile resolution completes', () => {
  assert.match(
    leaderboard,
    /const \[displayUrl, setDisplayUrl\] = useState<string \| null>\(\(\) =>\s*readCachedProfileAvatar\(address\)/,
  );
  assert.match(leaderboard, /const \[showFallback, setShowFallback\] = useState\(false\)/);
  assert.match(leaderboard, /const visibleUrl = displayUrl \|\| \(showFallback \? fallbackUrl : null\)/);
  assert.match(
    leaderboard,
    /data-avatar-pending=\{!visibleUrl \? 'true' : undefined\}/,
  );
  assert.match(
    leaderboard,
    /visibleUrl \? \([\s\S]*<img[\s\S]*\) : \([\s\S]*walletAvatarNeutral/,
  );
});

test('profile image is preloaded before becoming visible and transient failures preserve verified state', () => {
  for (const source of [leaderboard, networkIdentity]) {
    assert.match(source, /const image = new Image\(\);/);
    assert.match(source, /image\.referrerPolicy = 'no-referrer';/);
    assert.match(
      source,
      /image\.onload = \(\) => \{[\s\S]*rememberProfileAvatar[\s\S]*setDisplayUrl\(profileAvatarUrl\)/,
    );
    assert.match(
      source,
      /avatarError \|\| !avatarSuccess[\s\S]*if \(!displayUrl\) setShowFallback\(true\)/,
    );
  }
});

test('confirmed profile removal clears only the verified profile cache', () => {
  for (const source of [leaderboard, networkIdentity]) {
    assert.match(
      source,
      /if \(!profileAvatarUrl\) \{[\s\S]*clearCachedProfileAvatar\(address\)[\s\S]*setShowFallback\(true\)/,
    );
  }
  assert.match(avatarCache, /export function clearCachedProfileAvatar/);
});

test('Network profile images use uncropped contain rendering and keep iOS image guards', () => {
  assert.match(networkIdentity, /objectFit: 'contain'/);
  assert.match(networkIdentity, /pointerEvents:\s*'none'/);
  assert.match(networkIdentity, /WebkitTouchCallout:\s*'none'/);
  assert.match(networkIdentity, /draggable=\{false\}/);
});
