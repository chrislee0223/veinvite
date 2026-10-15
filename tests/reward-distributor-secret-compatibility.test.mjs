import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helper = await readFile(
  new URL(
    '../src/lib/rewards/rewardDistributorSecret.ts',
    import.meta.url,
  ),
  'utf8',
);
const core = await readFile(
  new URL(
    '../src/lib/rewards/automaticRewardPayoutWithMnemonic.ts',
    import.meta.url,
  ),
  'utf8',
);
const xRuntime = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);

test('core and X promotion use one distributor-secret normalization path', () => {
  assert.match(
    core,
    /prepareRewardDistributorSecret/,
  );
  assert.match(
    xRuntime,
    /prepareRewardDistributorSecret/,
  );
  assert.match(
    core,
    /from '\.\/rewardDistributorSecret'/,
  );
  assert.match(
    xRuntime,
    /from '\.\/rewardDistributorSecret'/,
  );
});

test('shared normalization preserves existing VeWorld mnemonic support', () => {
  assert.match(helper, /Mnemonic\.toPrivateKey/);
  assert.match(helper, /HDKey\.fromMnemonic/);
  assert.match(helper, /MAX_VEWORLD_ACCOUNT_INDEX\s*=\s*50/);
  assert.match(
    helper,
    /12,[\s\S]*15,[\s\S]*18,[\s\S]*21,[\s\S]*24/,
  );
  assert.match(
    helper,
    /VEINVITE_REWARD_DISTRIBUTOR_ADDRESS/,
  );
  assert.match(
    helper,
    /VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY/,
  );
});

test('X promotion normalizes before enforcing raw private-key format', () => {
  const normalizeIndex =
    xRuntime.indexOf(
      'prepareRewardDistributorSecret();',
    );
  const formatIndex =
    xRuntime.indexOf(
      '!PRIVATE_KEY_PATTERN.test(rawKey)',
    );

  assert.ok(normalizeIndex >= 0);
  assert.ok(
    formatIndex > normalizeIndex,
    'X promotion must normalize a mnemonic before raw-key format validation',
  );
});

test('X promotion still verifies normalized key matches distributor address', () => {
  assert.match(
    xRuntime,
    /Address\.ofPrivateKey\(bytes\)/,
  );
  assert.match(
    xRuntime,
    /does not match the configured reward distributor/,
  );
});

test('secret material is not logged by the shared normalizer', () => {
  assert.doesNotMatch(
    helper,
    /console\.(?:log|info|warn|error)/,
  );
  assert.doesNotMatch(
    helper,
    /return\s+rawSecret|return\s+words|return\s+privateKeyBytes/,
  );
});
