import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/InviterLeaderboard.tsx', import.meta.url),
  'utf8',
);

test('avatar does not paint Picasso before profile resolution completes', () => {
  assert.match(
    source,
    /const \[displayUrl, setDisplayUrl\] = useState<string \| null>\(\(\) =>\s*readCachedAvatar\(address\)/,
  );
  assert.match(source, /if \(!shouldLoadProfile \|\| domainLoading\) return;/);
  assert.match(source, /if \(domain && avatarLoading\) return;/);
  assert.match(source, /const resolvedUrl = profileAvatarUrl \|\| fallbackUrl;/);
  assert.match(source, /displayUrl \? \([\s\S]*<img[\s\S]*\) : \([\s\S]*walletAvatarNeutral/);
});

test('resolved profile avatar is reused across leaderboard remounts and hard refreshes', () => {
  assert.match(source, /const resolvedAvatarMemory = new Map<string, string>\(\)/);
  assert.match(source, /AVATAR_PROFILE_CACHE_KEY = 'veinvite_leaderboard_profile_avatar_v1'/);
  assert.match(source, /AVATAR_PROFILE_CACHE_TTL_MS = 15 \* 60_000/);
  assert.match(source, /rememberResolvedAvatar\(address, resolvedUrl, persistProfile\)/);
  assert.match(source, /if \(!persistProfile \|\| typeof window === 'undefined'\) return;/);
});

test('profile image is preloaded before becoming visible and fallback remains fail-safe', () => {
  assert.match(source, /const image = new Image\(\);/);
  assert.match(source, /image\.onload = \(\) => \{[\s\S]*setDisplayUrl\(resolvedUrl\)/);
  assert.match(source, /image\.onerror = \(\) => \{[\s\S]*setDisplayUrl\(fallbackUrl\)/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*setDisplayUrl\(fallbackUrl\);\s*\}, \[fallbackUrl\]\)/);
});

test('pending avatar keeps fixed geometry without a pulse animation', () => {
  assert.match(source, /data-avatar-pending=!displayUrl/);
  assert.match(source, /\.walletAvatarNeutral \{[\s\S]*width:100%;[\s\S]*height:100%;/);
  assert.doesNotMatch(source, /walletAvatarNeutral[\s\S]{0,300}animation:/);
});
