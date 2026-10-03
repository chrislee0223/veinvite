import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261003032000_scope_unresolved_sybil_to_completed_missions.sql',
    import.meta.url,
  ),
  'utf8',
);

const syncInvitation = await readFile(
  new URL('../src/lib/impact/syncInvitation.ts', import.meta.url),
  'utf8',
);

test('unresolved post-vote Sybil integrity requires the full modern mission checklist', () => {
  assert.match(
    migration,
    /as unresolved_sybil_after_vote/i,
  );

  for (const predicate of [
    /invitee_wallet is not null/i,
    /eligibility_check_id is not null/i,
    /coalesce\(i\.apps_completed, 0\) >= 3/i,
    /coalesce\(i\.rewards_received, 0\) >= 3/i,
    /coalesce\(i\.vot3_converted, false\)/i,
    /coalesce\(i\.vote_completed, false\)/i,
    /i\.apps_completed_block is not null/i,
    /i\.vot3_converted_block is not null/i,
    /i\.vote_completed_block is not null/i,
    /i\.sybil_status in \('NOT_CHECKED', 'REVIEW'\)/i,
  ]) {
    assert.match(
      migration,
      predicate,
      `${predicate} must guard unresolved post-vote Sybil monitoring`,
    );
  }
});

test('vote before the third dApp remains a supported mission order', () => {
  assert.match(
    syncInvitation,
    /Mission ordering is intentionally flexible/i,
  );
  assert.match(
    syncInvitation,
    /dApp #1 -> any positive B3TR amount to VOT3 -> allocation vote -> dApps #2 and #3/i,
  );
  assert.match(
    syncInvitation,
    /const rawMissionEvidenceReady =\s*appsCompleted >= 3[\s\S]*?vot3Converted[\s\S]*?voteCompleted/i,
  );
  assert.doesNotMatch(
    syncInvitation,
    /appsCompletedAt[\s\S]{0,120}(?:>|>=)[\s\S]{0,120}voteCompletedAt/i,
    'completion must not require the third dApp to occur before the already-valid vote',
  );
});

test('monitoring-only repair does not mutate business or reward state', () => {
  for (const table of [
    'invitations',
    'invite_impact_events',
    'reward_payouts',
    'reward_rounds',
    'reward_queue_entries',
    'sybil_v2_referral_assessments',
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(
        `(?:update|delete\\s+from|truncate(?:\\s+table)?)\\s+public\\.${table}`,
        'i',
      ),
      `${table} must remain read-only in this monitoring repair`,
    );
  }
});
