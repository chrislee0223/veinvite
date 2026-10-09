import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectSecurityClientTiming } from '../src/lib/sybil/v2/securityClientTiming.ts';

const observer = await readFile(
  'src/lib/sybil/v2/postVoteFunding.ts', 'utf8',
);
const cron = await readFile(
  'src/app/api/cron/sybil-post-vote-observation/route.ts', 'utf8',
);
const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts', 'utf8',
);
const configuration = JSON.parse(
  await readFile('vercel.json', 'utf8'),
);

test('post-vote observation is bounded by referral activation and voting finality', () => {
  assert.match(observer, /activationBlock <= 0/u);
  assert.match(observer, /voteBlock < activationBlock/u);
  assert.match(observer, /voteBlock - activationBlock > MAX_BLOCK_SPAN/u);
  assert.match(observer, /from: activationBlock/u);
  assert.match(observer, /to: voteBlock/u);
  assert.match(observer, /MAX_LOGS_PER_ASSET/u);
  assert.match(observer, /reached its per-asset event limit/u);
  assert.match(cron, /\.eq\('vote_completed', true\)/u);
  assert.match(cron, /vote_completed_block/u);
});

test('B3TR and VTHO observations exclude protocol contracts and preserve source-level evidence', () => {
  assert.match(observer, /address: config\.b3trAddress/u);
  assert.match(observer, /address: VTHO_ADDRESS/u);
  assert.match(observer, /protocolSources\.has\(transfer\.sender\)/u);
  assert.match(observer, /prior\.totalAmountWei/u);
  assert.match(observer, /MAX_SOURCES_PER_ASSET/u);
  assert.match(cron, /related_wallet: source\.sender/u);
  assert.match(cron, /source\.sender === candidate\.inviter_wallet\.toLowerCase\(\)/u);
});

test('observation cannot issue a new Sybil verdict or reserve, forfeit or pay rewards', () => {
  assert.match(cron, /strength: 'INFO'/u);
  assert.match(cron, /score: 0/u);
  assert.match(cron, /observationalOnly: true/u);
  assert.match(cron, /automaticRestriction: false/u);
  assert.match(cron, /rewardOrSybilStatusModified: false/u);
  assert.match(cron, /\.from\('sybil_v2_evidence_records'\)/u);
  assert.doesNotMatch(cron, /\.from\('(invitations|reward_queue_entries|sybil_v2_referral_assessments)'\)\s*\.update/u);
  assert.doesNotMatch(cron, /issueClearance|evaluateSybilV2Policy|applySybil|rewardReservation|rewardPayout|\.rpc\(/u);
  assert.match(cron, /\.eq\('signal_code', COMPLETION_CODE\)/u);
  assert.match(cron, /ignoreDuplicates: true/u);
});

test('legacy allowlisted protocol sink evidence is audit-tagged, never deleted or counted twice', () => {
  assert.match(cron, /loadKnownProtocolDestinations\('mainnet'\)/u);
  assert.match(cron, /HISTORICAL_COMMON_B3TR_SINK/u);
  assert.match(cron, /RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK/u);
  assert.match(cron, /ALLOWLISTED_PROTOCOL_DESTINATION/u);
  assert.match(cron, /excludedLegacyProtocolEvidence/u);
  assert.doesNotMatch(cron, /\.delete\(/u);
});

test('browser evidence first discovered after a completed vote stays post-vote', () => {
  const timing = inspectSecurityClientTiming({
    inviterFirstSeenAt: '2026-09-21T16:24:41Z',
    inviterLastSeenAt: '2026-10-01T03:39:48Z',
    inviteeFirstSeenAt: '2026-09-17T07:24:04Z',
    activatedAt: '2026-09-17T07:24:17Z',
    voteCompletedAt: '2026-09-21T09:24:40Z',
  });
  assert.equal(timing.preVoteDetection, false);
  assert.equal(timing.immediateSwitch, false);
  assert.equal(timing.sharedClientFirstSeenAt, '2026-09-21T16:24:41.000Z');
  assert.ok(pipeline.includes('inspectSecurityClientTiming('));
  assert.match(pipeline, /preVoteDetection,/u);
});

test('client wallet replacement does not fabricate a vote timestamp', () => {
  const args = {
    inviterFirstSeenAt: '2026-09-18T16:41:19Z',
    inviterLastSeenAt: '2026-09-18T16:42:30Z',
    inviteeFirstSeenAt: '2026-09-18T16:43:33Z',
    activatedAt: '2026-09-18T16:43:43Z',
    voteCompletedAt: null,
  };
  const unknown = inspectSecurityClientTiming(args);
  assert.equal(unknown.preVoteDetection, null);
  assert.equal(unknown.immediateSwitch, true);
  assert.equal(unknown.switchGapSeconds, 63);
  assert.equal(unknown.activationGapSeconds, 10);
  const verified = inspectSecurityClientTiming({
    ...args, voteCompletedAt: '2026-09-19T00:00:00Z',
  });
  assert.equal(verified.preVoteDetection, true);
});

test('historical client timing and legacy allowlist annotations remain non-scoring', () => {
  assert.ok(cron.includes('loadSharedClientChronology('));
  assert.ok(cron.includes('inspectSecurityClientTiming('));
  assert.ok(cron.includes('sharedClientChronology,'));
  assert.ok(cron.includes('excludedLegacyProtocolEvidence,'));
  assert.ok(cron.includes(".eq('activation_network', 'mainnet')"));
  assert.ok(cron.includes('.slice(0, MAX_BATCH * 4)'));
  assert.ok(cron.includes('if (scanned >= MAX_BATCH) break'));
});

test('daily cron uses a secret, production isolation and bounded processing', () => {
  assert.match(cron, /timingSafeEqual/u);
  assert.match(cron, /process\.env\.CRON_SECRET/u);
  assert.match(cron, /process\.env\.VERCEL_ENV !== 'production'/u);
  assert.match(cron, /const MAX_BATCH = 5/u);
  assert.match(cron, /\.limit\(500\)/u);
  assert.ok(configuration.crons.some(
    (task) => task.path === '/api/cron/sybil-post-vote-observation' &&
      task.schedule === '12 1 * * *',
  ));
});
