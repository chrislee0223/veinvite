import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  claimRoute,
  queueHelper,
  queueConsumer,
  vercelConfigRaw,
  packageRaw,
] = await Promise.all([
  read('src/app/api/rewards/claims/route.ts'),
  read('src/lib/rewards/claimPayoutContinuationQueue.ts'),
  read('src/app/api/queues/reward-finality/route.ts'),
  read('vercel.json'),
  read('package.json'),
]);

const vercelConfig = JSON.parse(vercelConfigRaw);
const packageJson = JSON.parse(packageRaw);

test(
  'Claim no longer relies on a bounded request-lifetime finality loop',
  () => {
    assert.doesNotMatch(
      claimRoute,
      /CLAIM_PAYOUT_CONTINUATION_DELAYS_MS/,
    );
    assert.doesNotMatch(
      claimRoute,
      /continuation exhausted its bounded retries/i,
    );
    assert.doesNotMatch(
      claimRoute,
      /\bafter\s*\(/,
    );
    assert.match(
      claimRoute,
      /enqueueClaimPayoutContinuation/,
    );
    assert.match(
      claimRoute,
      /runClaimPayoutKickoff/,
    );
  },
);

test(
  'Claim eligibility remains precomputed instead of adding a new Sybil review at Claim time',
  () => {
    assert.match(
      claimRoute,
      /Sybil \/ identity,[\s\S]*already satisfied/,
    );
    assert.doesNotMatch(
      claimRoute,
      /refreshQueuedReferralSignalChecks/,
    );
    assert.doesNotMatch(
      queueConsumer,
      /refreshQueuedReferralSignalChecks/,
    );
  },
);

test(
  'durable continuation is idempotently queued with a bounded retention window',
  () => {
    assert.match(queueHelper, /from '@vercel\/queue'/);
    assert.match(queueHelper, /idempotencyKey:/);
    assert.match(queueHelper, /retentionSeconds:/);
    assert.match(
      queueHelper,
      /veinvite-reward-finality/,
    );
    assert.match(
      queueHelper,
      /WAITING_FINALITY/,
    );
  },
);

test(
  'queue redelivery reuses the existing idempotent payout worker',
  () => {
    assert.match(queueConsumer, /handleCallback/);
    assert.match(
      queueConsumer,
      /runImmediateClaimRewardPayout\(\)/,
    );
    assert.match(
      queueConsumer,
      /needsDurableClaimPayoutContinuation/,
    );
    assert.match(
      queueConsumer,
      /visibilityTimeoutSeconds:\s*180/,
    );
    assert.doesNotMatch(
      queueConsumer,
      /sendTransaction|signTransaction|privateKey|mnemonic/i,
    );
  },
);

test(
  'Vercel push trigger and queue SDK are pinned for the reward-finality worker',
  () => {
    const routeConfig =
      vercelConfig.functions?.[
        'src/app/api/queues/reward-finality/route.ts'
      ];
    const trigger = routeConfig?.experimentalTriggers?.[0];

    assert.equal(trigger?.type, 'queue/v2beta');
    assert.equal(trigger?.topic, 'veinvite-reward-finality');
    assert.equal(trigger?.retryAfterSeconds, 60);
    assert.equal(trigger?.initialDelaySeconds, 0);
    assert.equal(
      packageJson.dependencies?.['@vercel/queue'],
      '0.5.1',
    );
  },
);
