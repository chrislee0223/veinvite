import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const baseMigration = await readFile(
  new URL(
    '../supabase/migrations/20260905095000_add_paid_leaderboard_rank_movement.sql',
    import.meta.url,
  ),
  'utf8',
);
const hardeningMigration = await readFile(
  new URL(
    '../supabase/migrations/20260905102500_harden_paid_leaderboard_completion_order.sql',
    import.meta.url,
  ),
  'utf8',
);
const route = await readFile(
  new URL('../src/app/api/leaderboard/route.ts', import.meta.url),
  'utf8',
);
const cron = await readFile(
  new URL('../src/app/api/cron/reconcile/route.ts', import.meta.url),
  'utf8',
);
const vercelConfig = await readFile(
  new URL('../vercel.json', import.meta.url),
  'utf8',
);

const rankingOrder = /order by\s+t\.completed_referrals desc,\s+r\.reached_count_block asc,\s+r\.reached_count_tx_index asc,\s+r\.reached_count_clause_index asc,\s+t\.wallet_address asc/i;

test('leaderboard inclusion requires finalized paid reward receipts', () => {
  assert.match(hardeningMigration, /from public\.reward_receipts r/i);
  assert.match(
    hardeningMigration,
    /join public\.reward_payout_transaction_settlements s\s+on s\.id = r\.settlement_id/i,
  );
  assert.match(hardeningMigration, /r\.amount_wei > 0/i);
});

test('equal referral counts use immutable completion order, not reward amount or claim time', () => {
  assert.match(hardeningMigration, /q\.reservation_completion_block as completion_block/i);
  assert.match(hardeningMigration, /q\.reservation_completion_tx_index as completion_tx_index/i);
  assert.match(hardeningMigration, /q\.reservation_completion_clause_index as completion_clause_index/i);
  assert.match(hardeningMigration, rankingOrder);
  const rankedOrderText = hardeningMigration.match(rankingOrder)?.[0] ?? '';
  assert.doesNotMatch(rankedOrderText, /total_reward_wei/i);
  assert.doesNotMatch(rankedOrderText, /claim_requested_at/i);
});

test('the time a wallet reaches its current referral count is the latest contributing completion tuple', () => {
  assert.match(
    hardeningMigration,
    /order by\s+wallet_address,\s+completion_block desc,\s+completion_tx_index desc,\s+completion_clause_index desc/i,
  );
});

test('historical snapshot cutoff requires both payout and referral completion by round end', () => {
  assert.match(
    hardeningMigration,
    /s\.block_number <= p_max_block[\s\S]*q\.reservation_completion_block <= p_max_block/i,
  );
});

test('snapshot publication waits for reconciled sealed growth evidence and does not backfill before activation', () => {
  assert.match(
    hardeningMigration,
    /round_end_at >= v_activation/i,
  );
  assert.match(
    hardeningMigration,
    /source_checked_through_block >= round_end_block/i,
  );
  assert.match(
    hardeningMigration,
    /not exists[\s\S]*leaderboard_round_snapshots/i,
  );
});

test('snapshots are full, hashed, append-only and server-only', () => {
  assert.match(baseMigration, /create table public\.leaderboard_round_snapshot_rows/i);
  assert.match(baseMigration, /content_sha256/i);
  assert.match(baseMigration, /leaderboard_snapshot_mutation_guard/i);
  assert.match(baseMigration, /enable row level security/i);
  assert.match(baseMigration, /revoke all on table public\.leaderboard_round_snapshots[\s\S]*from public, anon, authenticated/i);
  assert.match(baseMigration, /grant select, insert on table public\.leaderboard_round_snapshots[\s\S]*to service_role/i);
  assert.doesNotMatch(
    hardeningMigration,
    /get_lifetime_paid_referral_ranking_v2_internal\([^)]*\)[\s\S]{0,400}limit\s+100/i,
  );
});

test('rank movement uses only the immediately previous round and fails soft', () => {
  assert.match(route, /round\.currentRoundId - 1/);
  assert.match(route, /RANKING_ALGORITHM_VERSION = 'paid_referrals_v2'/);
  assert.match(route, /falling back to the paid lifetime leaderboard/i);
  assert.match(route, /rankMovement: 'UNAVAILABLE'/);
  assert.match(route, /comparison\.available/);
});

test('wallet-specific leaderboard responses are never shared through CDN cache', () => {
  assert.match(route, /wallet\s*\?\s*'private, no-store'/);
  assert.match(route, /'public, s-maxage=30, stale-while-revalidate=30'/);
});

test('leaderboard snapshots run only after round growth reporting succeeds', () => {
  const growthIndex = cron.indexOf('maintainRoundGrowthSnapshots');
  const publisherIndex = cron.indexOf('publishLeaderboardRoundSnapshots');
  assert.ok(growthIndex >= 0);
  assert.ok(publisherIndex > growthIndex);
  assert.match(cron, /if \(roundGrowthReports\)[\s\S]*publishLeaderboardRoundSnapshots/);
});

test('leaderboard snapshot publication reuses the established Hobby-compatible daily reconciliation cron', () => {
  const config = JSON.parse(vercelConfig);
  assert.equal(config.crons.length, 1);
  assert.equal(config.crons[0].path, '/api/cron/reconcile');
  assert.equal(config.crons[0].schedule, '17 0 * * *');
});

test('movement arithmetic examples preserve direction semantics', () => {
  const classify = (previousRank, currentRank, baselineAvailable = true) => {
    if (!baselineAvailable) return ['UNAVAILABLE', null];
    if (previousRank === null) return ['NEW', null];
    const change = previousRank - currentRank;
    if (change > 0) return ['UP', change];
    if (change < 0) return ['DOWN', change];
    return ['SAME', 0];
  };

  assert.deepEqual(classify(12, 8), ['UP', 4]);
  assert.deepEqual(classify(8, 12), ['DOWN', -4]);
  assert.deepEqual(classify(8, 8), ['SAME', 0]);
  assert.deepEqual(classify(null, 8), ['NEW', null]);
  assert.deepEqual(classify(null, 8, false), ['UNAVAILABLE', null]);
  assert.deepEqual(classify(153, 27), ['UP', 126]);
  assert.deepEqual(classify(27, 153), ['DOWN', -126]);
  assert.deepEqual(classify(101, 100), ['UP', 1]);
  assert.deepEqual(classify(100, 101), ['DOWN', -1]);
});
