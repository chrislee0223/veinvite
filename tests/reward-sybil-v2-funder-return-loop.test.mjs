import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/20260929174500_add_prevote_funder_return_loop_enforcement.sql',
  'utf8',
);
const queueConsumer = await readFile(
  'src/app/api/queues/sybil-v2-evidence/route.ts',
  'utf8',
);
const cron = await readFile(
  'src/app/api/cron/reconcile/route.ts',
  'utf8',
);

test('funder-return loop uses a narrow three-wallet twelve-block signature', () => {
  assert.match(
    pipeline,
    /FUNDER_RETURN_LOOP_MAX_BLOCKS = 12/u,
  );
  assert.match(
    pipeline,
    /FUNDER_RETURN_LOOP_MIN_WALLETS = 3/u,
  );
  assert.match(
    pipeline,
    /HISTORICAL_FUNDER_RETURN_LOOP/u,
  );
  assert.match(
    pipeline,
    /HISTORICAL_FUNDER_RETURN_LOOP_HUB/u,
  );

  assert.match(
    migration,
    /f\.funding_block \+ 12/u,
  );
  assert.match(
    migration,
    /v_loop_wallets < 3/u,
  );
  assert.match(
    migration,
    /FUNDER_RETURN_LOOP_RUNTIME_VERIFICATION_FAILED/u,
  );
});

test('automatic funder-return restriction stays fail-closed and payout-safe', () => {
  assert.match(
    migration,
    /v_assessment\.state <> 'HOLD'[\s\S]*v_assessment\.source <> 'SYSTEM'/u,
  );
  assert.match(
    migration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    migration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    migration,
    /HUB_ALLOWLISTED/u,
  );
  assert.match(
    migration,
    /AUTO_FUNDER_RETURN_LOOP_RESTRICTION/u,
  );
  assert.match(
    migration,
    /restrictionScope', 'INVITEE_ONLY'/u,
  );
});

test('activation queue assesses the exact invite and cron recovers wider unpaid backlog', () => {
  assert.match(
    queueConsumer,
    /assessSybilV2Referral\(message\.inviteCode\)/u,
  );
  assert.match(
    pipeline,
    /sybil_v2_scan_checkpoints/u,
  );
  assert.match(
    pipeline,
    /staleConfirmedHub/u,
  );
  assert.match(
    cron,
    /runSybilV2AssessmentBatch\(25\)/u,
  );
});
