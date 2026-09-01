import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const migration = read('supabase/migrations/20260901104000_add_public_wallet_profiles.sql');
const route = read('src/app/api/profile/route.ts');
const profile = read('src/lib/publicProfile.ts');
const leaderboardRoute = read('src/app/api/leaderboard/route.ts');
const leaderboard = read('src/components/PublicLeaderboard.tsx');
const settings = read('src/components/PublicProfileSettings.tsx');

if (!/public_wallet_profiles/.test(migration) || !/enable row level security/i.test(migration)) {
  failures.push('Public profile data must remain behind RLS.');
}
if (!/revoke all on table public\.public_wallet_profiles from public, anon, authenticated/i.test(migration)) {
  failures.push('Direct client access to public profile rows must stay revoked.');
}
if (!/profile-avatars/.test(migration) || !/2097152/.test(migration)) {
  failures.push('Profile avatar bucket must retain the reviewed 2 MB storage limit.');
}
if (!/requireWalletSession/.test(route)) {
  failures.push('Profile mutations must remain bound to a verified wallet session.');
}
if (!/enforceRateLimits/.test(route)) {
  failures.push('Profile reads and writes must remain rate limited.');
}
if (!/detectPublicAvatarType/.test(route) || !/image\/png/.test(profile) || !/image\/jpeg/.test(profile) || !/image\/webp/.test(profile)) {
  failures.push('Avatar uploads must validate file signatures and stay limited to PNG/JPEG/WebP.');
}
if (!/CONTROL_OR_BIDI_PATTERN/.test(profile) || !/PUBLIC_PROFILE_MAX_NAME_LENGTH\s*=\s*32/.test(profile)) {
  failures.push('Public profile names must retain control-character filtering and the 32-character limit.');
}
if (!/readPublicProfiles/.test(leaderboardRoute) || !/displayName/.test(leaderboardRoute) || !/avatarUrl/.test(leaderboardRoute)) {
  failures.push('Leaderboard responses must continue attaching public profile metadata.');
}
if (!/entry\.displayName\?\.trim\(\) \|\| maskWallet/.test(leaderboard)) {
  failures.push('Leaderboard must fall back to a masked wallet when no profile name exists.');
}
if (!/fullAddress/.test(leaderboard) || !/getVeChainExplorerAddressUrl/.test(leaderboard)) {
  failures.push('Profiles must not replace the authoritative wallet address and Explorer details.');
}
if (!/publicNotice/.test(settings) || !/profile-avatars|avatar/.test(settings)) {
  failures.push('Settings must tell users that profile data is public and keep avatar controls available.');
}

if (failures.length > 0) {
  console.error('Public profile stability gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Public profile stability gate passed.');
