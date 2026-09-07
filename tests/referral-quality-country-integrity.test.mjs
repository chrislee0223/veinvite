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

test('country ranking counts only verified NEW and RETURNING relationships', () => {
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

test('country UI keeps inviter ranking intact and shows new/returning split lazily', () => {
  assert.match(countryHub, /type RankingView = 'inviter' \| 'country'/);
  assert.match(countryHub, /fetch\('\/api\/leaderboard\/country'/);
  assert.match(countryHub, /rankingView !== 'country'/);
  assert.match(countryHub, /leaderboardCopy\.newUsers/);
  assert.match(countryHub, /leaderboardCopy\.returningUsers/);
  assert.match(countryHub, /InviterLeaderboard/);
});
