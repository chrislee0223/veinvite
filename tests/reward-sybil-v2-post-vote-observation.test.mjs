import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('same-client evidence reports when a relationship was actually observed', () => {
  assert.match(pipeline, /const sharedClientFirstSeen = Math\.max\(inviterFirstSeen, inviteeFirstSeen\)/u);
  assert.match(pipeline, /sharedClientFirstSeen <= voteCompletedAt/u);
  assert.match(pipeline, /sharedClientFirstSeenAt:/u);
  assert.match(pipeline, /preVoteDetection,/u);
  assert.doesNotMatch(pipeline, /preVoteDetection: true/u);
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
