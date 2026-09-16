import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  claimRoute,
  payoutWrapper,
  queueHelper,
  queueConsumer,
  vercelConfigRaw,
  packageRaw,
] = await Promise.all([
  read('src/app/api/rewards/claims/route.ts'),
  read('src/lib/rewards/automaticRewardPayoutWithMnemonic.ts'),
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
  'older submitted finality is preserved without blocking a newer approved Claim',
  () => {
    const start = payoutWrapper.indexOf(
      'export async function runImmediateClaimRewardPayout',
    );
    const end = payoutWrapper.indexOf(
      'export async function runAutomaticRewardPayout',
    );
    assert.ok(start >= 0 && end > start);

    const immediateFunction = payoutWrapper.slice(start, end);
    const recoveryIndex = immediateFunction.indexOf(
      'const submittedRecovery = await recoverSubmittedBeforePayout()',
    );
    const prepareIndex = immediateFunction.indexOf(
      'await prepareClaimedRewardFastPath',
    );
    const transferIndex = immediateFunction.indexOf(
      'const payoutResult = await runClaimTransferWorker()',
      prepareIndex,
    );

    assert.ok(recoveryIndex >= 0);
    assert.ok(prepareIndex > recoveryIndex);
    assert.ok(transferIndex > prepareIndex);
    assert.doesNotMatch(
      immediateFunction,
      /submittedRecovery(?:\.result)?\.status\s*===\s*['"]WAITING_FINALITY['"]/,
    );
    assert.match(
      immediateFunction,
      /submittedRecovery:\s*submittedRecovery\.result/,
    );
    assert.match(
      immediateFunction,
      /submittedRecoveryFailed:\s*submittedRecovery\.failed/,
    );
  },
);

test(
  'durable continuation retains recovery waiting and transient recovery failures',
  () => {
    assert.match(
      queueHelper,
      /submittedRecoveryFailed\s*===\s*true/,
    );
    assert.match(
      queueHelper,
      /submittedRecovery\?\.status\s*===\s*['"]WAITING_FINALITY['"]/,
    );
    assert.match(
      queueHelper,
      /submittedRecovery\?\.status\s*===\s*['"]LOCKED['"]/,
    );
    assert.match(
      payoutWrapper,
      /failed:\s*true/,
    );
  },
);

test(
  'manual recovery safety state takes precedence over a later payout result',
  () => {
    assert.match(
      queueHelper,
      /readClaimPayoutManualIntervention/,
    );
    assert.match(
      queueHelper,
      /recovery\?\.status\s*!==\s*['"]MANUAL_INTERVENTION_REQUIRED['"]/,
    );
    assert.match(
      payoutWrapper,
      /submittedRecovery\.result\?\.status\s*===\s*\n?\s*['"]MANUAL_INTERVENTION_REQUIRED['"]/,
    );
    assert.match(
      queueConsumer,
      /const manualIntervention\s*=\s*\n?\s*readClaimPayoutManualIntervention\(result\)/,
    );
    assert.match(
      queueConsumer,
      /if \(manualIntervention\)/,
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
      /\b(?:sendTransaction|signTransaction|privateKey)\b/i,
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
