import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260906011000_clarify_referral_quality_and_country_pair_integrity.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const countryFoundation = fs.readFileSync(
  'supabase/migrations/20260907142024_add_country_leaderboard_foundation_v1.sql',
  'utf8',
);
const countryLeaderboardV2 = fs.readFileSync(
  'supabase/migrations/20260907150000_harden_country_leaderboard_v2.sql',
  'utf8',
);
const countryPreferenceRoute = fs.readFileSync(
  'src/app/api/preferences/country/route.ts',
  'utf8',
);
const countryLeaderboardRoute = fs.readFileSync(
  'src/app/api/leaderboard/country/route.ts',
  'utf8',
);
const countryHub = fs.readFileSync(
  'src/components/PublicLeaderboardHub.tsx',
  'utf8',
);
const countryClientCache = fs.readFileSync(
  'src/lib/countryLeaderboardClientCache.ts',
  'utf8',
);
const leaderboardEntry = fs.readFileSync(
  'src/components/PublicLeaderboard.tsx',
  'utf8',
);

test('operator health distinguishes immutable raw referral gaps from unresolved quality backlog', () => {
  assert.match(migration, /qualified_referral_relationships/);
  assert.match(
    migration,
    /q\.resolved_network is null or q\.resolved_entry_class is null/i,
  );
  assert.match(migration, /referral_relationship_raw_quality_gaps/);
  assert.match(migration, /referral_relationship_resolved_from_evidence/);
});

test('country facts must match the invitation that created the canonical relationship', () => {
  assert.match(
    migration,
    /v_source_invitation_id is distinct from new\.source_invitation_id/i,
  );
  assert.match(
    migration,
    /country fact invitation does not match referral relationship source invitation/i,
  );
  assert.match(migration, /referral_activation_country_facts_integrity_guard/);
});

test('country UNKNOWN semantics and activation chronology fail closed', () => {
  assert.match(
    migration,
    /\(new\.country_source = 'UNKNOWN'\) <> \(new\.country_code = 'UNKNOWN'\)/i,
  );
  assert.match(
    migration,
    /new\.observed_at < v_relationship_effective_at/i,
  );
  assert.match(
    migration,
    /referral_activation_country_facts_unknown_consistency_check/i,
  );
});

test('country integrity helper stays behind the server boundary', () => {
  assert.match(
    migration,
    /revoke all on function public\.validate_referral_activation_country_fact_integrity\(\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.validate_referral_activation_country_fact_integrity\(\)\s+to postgres, service_role/i,
  );
});

test('trusted edge country observation records only coarse country and observation time', () => {
  assert.match(countryFoundation, /country_observed_at timestamptz/i);
  assert.match(countryPreferenceRoute, /x-vercel-ip-country/i);
  assert.match(countryPreferenceRoute, /country_source:[\s\S]*'TRUSTED_EDGE'/i);
  assert.match(countryPreferenceRoute, /country_observed_at:[\s\S]*observedAt/i);
  assert.doesNotMatch(countryPreferenceRoute, /x-forwarded-for|request\.ip|latitude|longitude/i);
  assert.match(countryFoundation, /rawIpStored',false/i);
});

test('country leaderboard uses the first point where every required mission is satisfied', () => {
  assert.match(countryLeaderboardV2, /event_type = 'DAPP_REWARD'/i);
  assert.match(countryLeaderboardV2, /group by e\.app_id/i);
  assert.match(countryLeaderboardV2, /limit 3/i);
  assert.match(countryLeaderboardV2, /event_type = 'VOT3_CONVERSION'/i);
  assert.match(countryLeaderboardV2, /min\(e\.block_number\).*vot3_completion_block/is);
  assert.match(countryLeaderboardV2, /event_type = 'ALLOCATION_VOTE'/i);
  assert.match(
    countryLeaderboardV2,
    /greatest\([\s\S]*dapp_completion_block[\s\S]*vot3_completion_block[\s\S]*vote_completion_block/is,
  );
});

test('country ranking counts only verified NEW and RETURNING relationships internally', () => {
  assert.match(countryLeaderboardV2, /qualified_referral_relationships/i);
  assert.match(
    countryLeaderboardV2,
    /q\.resolved_entry_class in \('NEW','RETURNING'\)/i,
  );
  assert.match(countryLeaderboardV2, /sybil_status = 'CLEAR'/i);
  assert.match(countryLeaderboardV2, /security_identity_reward_gate_passes/i);
  assert.match(countryLeaderboardV2, /'newUsers'/i);
  assert.match(countryLeaderboardV2, /'returningUsers'/i);
});

test('public country API exposes only aggregate country counts', () => {
  assert.match(countryLeaderboardRoute, /get_public_country_leaderboard/i);
  assert.match(countryLeaderboardRoute, /newUsers/i);
  assert.match(countryLeaderboardRoute, /returningUsers/i);
  assert.match(
    countryLeaderboardRoute,
    /newUsers \+ returningUsers !== completedReferrals/i,
  );
  assert.doesNotMatch(
    countryLeaderboardRoute,
    /walletAddress|wallet_address|invitee_wallet|inviter_wallet/i,
  );
});

test('country UI loads only on tab demand, exposes aggregate classification, and matches inviter viewport height', () => {
  assert.match(countryHub, /type RankingView = 'inviter' \| 'country'/);
  assert.match(countryClientCache, /fetch\('\/api\/leaderboard\/country'/);
  assert.match(countryHub, /refreshCountry\(false\)/);
  assert.match(countryHub, /getCachedCountryArrivals\(\)/);
  assert.doesNotMatch(countryHub, /useEffect\(\(\) => \{\s*refreshCountry\(false\)/);
  assert.match(countryClientCache, /COUNTRY_CACHE_TTL_MS\s*=\s*30 \* 60_000/);
  assert.match(countryHub, /InviterLeaderboard/);
  assert.doesNotMatch(countryHub, /leaderboardCopy\.loading/);
  assert.match(countryHub, /row\.newUsers\.toLocaleString\(locale\)/);
  assert.match(countryHub, /row\.returningUsers\.toLocaleString\(locale\)/);
  assert.match(countryHub, /row\.completedReferrals\.toLocaleString\(locale\)/);
  assert.doesNotMatch(countryHub, /currentRoundCompleted\.toLocaleString|className="roundGain"/);
  assert.doesNotMatch(countryHub, />TOP 100</);

  assert.match(
    leaderboardEntry,
    /\.leaderboardHub \.countryRow,[\s\S]*\.leaderboardHub \.countryPlaceholderRow \{[\s\S]*height:50px !important;[\s\S]*min-height:50px !important;/,
  );
  assert.match(
    leaderboardEntry,
    /\.leaderboardHub \.countryScroll,[\s\S]*\.leaderboardHub \.countrySkeleton,[\s\S]*\.leaderboardHub \.countryState \{[\s\S]*height:250px !important;/,
  );
  assert.match(
    leaderboardEntry,
    /@media \(max-width:420px\)[\s\S]*height:46px !important;[\s\S]*height:230px !important;/,
  );
  assert.match(
    leaderboardEntry,
    /@media \(max-width:360px\)[\s\S]*height:44px !important;[\s\S]*height:220px !important;/,
  );
});

// Late trusted country recovery regression contracts (executed by the existing referral CI gate).
const recoveryMigration = fs.readFileSync(
  'supabase/migrations/20261126143958_referral_country_recovery_v1.sql',
  'utf8',
);
const countryObservationSync = fs.readFileSync(
  'src/components/WalletCountryObservationSync.tsx',
  'utf8',
);
test('late country evidence is separate, immutable, unique, and server-only', () => {
  assert.match(recoveryMigration, /relationship_id uuid primary key/);
  assert.match(recoveryMigration, /source_invitation_id uuid not null unique/);
  assert.match(recoveryMigration, /enable row level security/);
  assert.match(recoveryMigration, /revoke all on public\.referral_country_recovery_facts from public, anon, authenticated/);
  assert.match(recoveryMigration, /before update or delete on public\.referral_country_recovery_facts/);
  assert.match(recoveryMigration, /r\.id=new\.relationship_id and r\.source_invitation_id=new\.source_invitation_id/);
  assert.match(recoveryMigration, /new\.recorded_at := clock_timestamp\(\)/);
  assert.match(recoveryMigration, /on conflict \(source_invitation_id\) do nothing/g);
  assert.doesNotMatch(recoveryMigration, /update public\.(invitations|referral_activation_country_facts|referral_acquisition_country_facts)\s/i);
});
test('capture requires trusted unresolved identity and does not change session renewal', () => {
  assert.match(recoveryMigration, /new\.country_source is distinct from 'TRUSTED_EDGE'/);
  assert.match(recoveryMigration, /r\.child_wallet = new\.wallet_address/);
  assert.match(recoveryMigration, /f\.country_source = 'UNKNOWN' and f\.country_code = 'UNKNOWN'/);
  assert.match(recoveryMigration, /new\.country_observed_at > r\.relationship_effective_at \+ interval '7 days'/);
  assert.match(recoveryMigration, /after update of country_code, country_source, country_observed_at/);
  assert.match(recoveryMigration, /new\.revoked_at is not null/);
  assert.match(recoveryMigration, /ws\.country_observed_at <= ws\.expires_at/);
});
test('both rankings prefer original evidence and prior rank excludes later recoveries', () => {
  assert.equal([...recoveryMigration.matchAll(/then f\.country_code[\s\S]*?then a\.country_code[\s\S]*?then b\.country_code/g)].length, 2);
  assert.match(recoveryMigration, /b\.recorded_at <= \([\s\S]*min\(g\.round_end_at\)/);
  assert.match(recoveryMigration, /s\.round_end_block=g\.round_end_block/);
  assert.equal([...recoveryMigration.matchAll(/is_sybil_v2_referral_invalidated/g)].length, 2);
});
test('verified wallet, strict ISO validation and foreground retry', () => {
  assert.match(countryPreferenceRoute, /requireWalletSession\(\{[\s\S]*expectedWallet/);
  assert.match(countryPreferenceRoute, /normalizeIsoCountryCode\(rawCountry\)/);
  assert.match(countryPreferenceRoute, /\.is\('revoked_at', null\)/);
  assert.match(countryObservationSync, /body\.recorded === true/);
  assert.match(countryObservationSync, /syncStarted = await recordCountry\(walletAddress\)/);
  assert.match(countryObservationSync, /document\.visibilityState === 'visible'/);
  assert.match(countryObservationSync, /removeEventListener\('visibilitychange'/);
});
