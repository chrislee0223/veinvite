import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260905130000_add_mission_dapp_attribution.sql',
  'utf8',
);
const precisionMigration = readFileSync(
  'supabase/migrations/20260905131000_add_mission_dapp_attribution_precision.sql',
  'utf8',
);
const activity = readFileSync('src/lib/vebetter/activity.ts', 'utf8');
const impactRecord = readFileSync('src/lib/impact/record.ts', 'utf8');

test('mission attribution remains derived from the existing reward-authoritative evidence', () => {
  assert.match(
    activity,
    /first positive B3TR reward from each of the first three[\s\S]*distinct dApps/i,
  );
  assert.match(activity, /qualifyingRewardEvents\.length < 3/);
  assert.match(activity, /uniqueAppIds\.has/);
  assert.match(activity, /BigInt\(amountWei\) <= 0n/);
  assert.match(impactRecord, /invite_impact_events/);
  assert.match(impactRecord, /onConflict:\s*'event_key'/);
  assert.match(impactRecord, /ignoreDuplicates:\s*true/);

  assert.match(
    migration,
    /from public\.invite_impact_events e[\s\S]*e\.event_type = 'DAPP_REWARD'/,
  );
  assert.match(
    migration,
    /row_number\(\) over \([\s\S]*partition by e\.invite_code[\s\S]*e\.block_number[\s\S]*e\.tx_index[\s\S]*e\.clause_index/,
  );
  assert.match(migration, /where r\.mission_step between 1 and 3/);
  assert.match(migration, /'B3TR_REWARD_DISTRIBUTED'::text as activity_evidence_type/);
});

test('mission step reporting never overstates chain ordering precision', () => {
  assert.match(
    precisionMigration,
    /count\(\*\) over \([\s\S]*partition by[\s\S]*e\.invite_code,[\s\S]*e\.block_number,[\s\S]*e\.tx_index,[\s\S]*e\.clause_index/,
  );
  assert.match(precisionMigration, /same_chain_position_count/);
  assert.match(precisionMigration, /'PARTIAL_CHAIN_POSITION'/);
  assert.match(precisionMigration, /'SAME_CLAUSE_TIE'/);
  assert.match(precisionMigration, /'EXACT_CHAIN_POSITION'/);
  assert.match(precisionMigration, /step_order_precision/);
});

test('dApp metadata enrichment is optional and cannot become reward eligibility authority', () => {
  assert.match(migration, /create table public\.vebetter_dapp_registry/);
  assert.match(migration, /metadata_source text not null default 'UNRESOLVED'/);
  assert.match(
    migration,
    /left join public\.vebetter_dapp_registry registry[\s\S]*registry\.app_id = r\.app_id/,
  );
  assert.match(
    migration,
    /coalesce\(registry\.metadata_source, 'UNRESOLVED'\)/,
  );
  assert.doesNotMatch(activity, /vebetter_dapp_registry/);
  assert.doesNotMatch(impactRecord, /vebetter_dapp_registry/);
});

test('historical mission rules are not invented retroactively', () => {
  assert.match(migration, /create table public\.veinvite_mission_rule_versions/);
  assert.match(
    migration,
    /'onboarding_3dapp_b3tr_vot3_vote_v1'/,
  );
  assert.match(
    migration,
    /coalesce\(rule\.version_key, 'legacy_unversioned'\)/,
  );
  assert.match(
    migration,
    /coalesce\(i\.activated_at, i\.created_at\) >= versions\.effective_from/,
  );
});

test('attribution metadata stays server-only and does not store raw dApp proof strings', () => {
  for (const relation of [
    'veinvite_mission_rule_versions',
    'vebetter_dapp_registry',
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${relation} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${relation} from public, anon, authenticated`,
      ),
    );
  }

  assert.match(
    migration,
    /revoke all on table public\.operator_mission_dapp_activities from public, anon, authenticated/,
  );
  assert.match(
    precisionMigration,
    /revoke all on table public\.operator_mission_dapp_activities[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_operator_mission_dapp_usage\(text, integer\)[\s\S]*from public, anon, authenticated/,
  );

  // The chain transaction + clause remain the durable reference. Do not copy
  // the dApp-defined RewardDistributed proof payload into analytics storage.
  assert.doesNotMatch(migration, /\bproof\b/i);
  assert.doesNotMatch(precisionMigration, /\bproof\b/i);
});

test('operator aggregation supports later dApp adoption analysis without exposing wallet rows', () => {
  assert.match(
    migration,
    /create or replace function public\.get_operator_mission_dapp_usage/,
  );
  assert.match(migration, /participant_count bigint/);
  assert.match(migration, /first_step_count bigint/);
  assert.match(migration, /second_step_count bigint/);
  assert.match(migration, /third_step_count bigint/);
  assert.match(migration, /new_participant_count bigint/);
  assert.match(migration, /returning_participant_count bigint/);
  assert.match(migration, /total_reward_wei numeric/);
});
