import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261005003000_add_reward_recovery_offset_accounting.sql';

async function sources() {
  const [sql, history, copy, leaderboard] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile('src/components/InAppInviteNotifications.tsx', 'utf8'),
    readFile('src/lib/i18n/rewardAdjustedCopy.ts', 'utf8'),
    readFile('src/app/api/leaderboard/route.ts', 'utf8'),
  ]);
  return { sql, history, copy, leaderboard };
}

function settle(gross, recovery) {
  const offset = gross < recovery ? gross : recovery;
  return {
    offset,
    net: gross - offset,
    remaining: recovery - offset,
  };
}

test('recovery arithmetic preserves the agreed full and partial offset examples', () => {
  assert.deepEqual(settle(50n, 100n), {
    offset: 50n,
    net: 0n,
    remaining: 50n,
  });
  assert.deepEqual(settle(30n, 50n), {
    offset: 30n,
    net: 0n,
    remaining: 20n,
  });
  assert.deepEqual(settle(70n, 20n), {
    offset: 20n,
    net: 50n,
    remaining: 0n,
  });
  assert.deepEqual(settle(110n, 100n), {
    offset: 100n,
    net: 10n,
    remaining: 0n,
  });
});

test('recovery is feature-gated and normal reward liability remains net payable only', async () => {
  const { sql } = await sources();
  assert.match(
    sql,
    /reward_recovery_enabled boolean not null default false/u,
  );
  assert.match(sql, /v_net := p_amount_wei;/u);
  assert.match(sql, /v_offset := least\(p_amount_wei,v_recovery_balance\);/u);
  assert.match(sql, /v_net := p_amount_wei - v_offset;/u);
  assert.match(
    sql,
    /reserved_amount_wei,[\s\S]*?v_net,[\s\S]*?'AWAITING_CLAIM'/u,
  );
  assert.match(
    sql,
    /if v_net>greatest\(p_observed_pool_balance_wei-v_reserved,0\)/u,
  );
});

test('full offsets never create a zero-value payout queue entry', async () => {
  const { sql } = await sources();
  const queueBranch = sql.indexOf('if v_net>0 then');
  const fullBranch = sql.indexOf(
    "if v_offset<=0 or v_settlement.id is null then",
  );
  assert.ok(queueBranch >= 0 && fullBranch > queueBranch);
  const fullSql = sql.slice(fullBranch);
  assert.match(
    fullSql,
    /set slot_released_at=coalesce\(i\.slot_released_at,v_now\)/u,
  );
  assert.match(fullSql, /'REWARD_ADJUSTED'/u);
  assert.doesNotMatch(
    fullSql,
    /insert into public\.reward_payouts/u,
  );
  assert.doesNotMatch(
    fullSql,
    /insert into public\.reward_receipts/u,
  );
});

test('historical invalidated paid referrals seed immutable recovery obligations', async () => {
  const { sql } = await sources();
  assert.match(
    sql,
    /from public\.sybil_v2_referral_invalidations x[\s\S]*?join public\.reward_receipts r/u,
  );
  assert.match(sql, /where x\.status = 'ACTIVE'/u);
  assert.match(
    sql,
    /unique \(network, source_invalidation_id, source_receipt_id\)/u,
  );
});

test('later invalidation restores offset capacity while reinstatement stops automatic recovery', async () => {
  const { sql } = await sources();
  assert.match(
    sql,
    /set[\s\S]*?state='INVALIDATED'[\s\S]*?where s\.network=lower\(new\.network\)/u,
  );
  assert.match(
    sql,
    /status='FROZEN'[\s\S]*?'SOURCE_INVALIDATION_REINSTATED_AFTER_CONSUMPTION'/u,
  );
  assert.match(
    sql,
    /status='REVERSED'[\s\S]*?'SOURCE_INVALIDATION_REINSTATED_BEFORE_CONSUMPTION'/u,
  );
  assert.match(
    sql,
    /state='REVIEW'[\s\S]*?'SETTLEMENT_INVALIDATION_REINSTATED'/u,
  );
});

test('gross cohort fairness and net payout liability are separated', async () => {
  const { sql } = await sources();
  assert.match(
    sql,
    /v_queue_committed \+ v_offset_committed/u,
  );
  assert.match(
    sql,
    /s\.state='ACTIVE'[\s\S]*?sum\(s\.offset_amount_wei\)/u,
  );
  assert.match(
    sql,
    /v_existing_queue \+ v_existing_offset[\s\S]*?new\.reserved_amount_wei \+ v_current_offset > v_budget/u,
  );
});

test('full-offset legitimate referrals remain recognized without inventing reward value', async () => {
  const { sql, leaderboard } = await sources();
  assert.match(
    sql,
    /get_lifetime_recognized_referral_ranking_v3_internal/u,
  );
  assert.match(
    sql,
    /full_offset_referrals[\s\S]*?0::numeric as amount_wei/u,
  );
  assert.match(
    sql,
    /s\.settlement_kind='FULL_OFFSET'/u,
  );
  assert.match(
    leaderboard,
    /RANKING_ALGORITHM_VERSION = 'recognized_referrals_v3'/u,
  );
});

test('full-offset user messaging is bell history only and exposes no recovery balance', async () => {
  const { sql, history, copy } = await sources();
  assert.match(history, /'REWARD_ADJUSTED'/u);
  assert.match(
    copy,
    /친구 초대 보상이 VeInvite 보상 정책에 따라 조정되었습니다\. 정상 초대 활동은 기록되었습니다\./u,
  );
  assert.doesNotMatch(copy, /남음|상계액|빚|debt|remaining recovery/ui);
  assert.match(
    sql,
    /reward_amount_wei,dapp_progress,collapsed_progress[\s\S]*?null,[\s\S]*?null,[\s\S]*?false/u,
  );
});
