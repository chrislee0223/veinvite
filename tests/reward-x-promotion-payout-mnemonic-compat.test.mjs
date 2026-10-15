import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const xRuntime = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutRuntime.ts',
    import.meta.url,
  ),
  'utf8',
);

const coreRuntime = await readFile(
  new URL(
    '../src/lib/rewards/automaticRewardPayoutWithMnemonic.ts',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion accepts the same raw private-key credential as core payout', () => {
  assert.match(
    xRuntime,
    /PRIVATE_KEY_PATTERN = \/\^\(\?:0x\)\?\[0-9a-fA-F\]\{64\}\$\//,
  );
  assert.match(
    xRuntime,
    /PRIVATE_KEY_PATTERN\.test\(rawSecret\)/,
  );
  assert.match(
    xRuntime,
    /addressOfPrivateKey\(bytes\) !==[\s\S]*expectedAddress/,
  );
});

test('X promotion supports the existing VeWorld mnemonic credential', () => {
  assert.match(
    xRuntime,
    /VALID_MNEMONIC_WORD_COUNTS = new Set\(\[[\s\S]*12,[\s\S]*15,[\s\S]*18,[\s\S]*21,[\s\S]*24/,
  );
  assert.match(
    xRuntime,
    /Mnemonic\.toPrivateKey\(words\)/,
  );
  assert.match(
    xRuntime,
    /HDKey\.fromMnemonic\(words\)/,
  );
  assert.match(
    xRuntime,
    /MAX_VEWORLD_ACCOUNT_INDEX = 50/,
  );
  assert.match(
    xRuntime,
    /hdKey\.deriveChild\(index\)/,
  );
});

test('X promotion mnemonic derivation matches the established core payout compatibility boundary', () => {
  for (const source of [xRuntime, coreRuntime]) {
    assert.match(
      source,
      /MAX_VEWORLD_ACCOUNT_INDEX = 50/,
    );
    assert.match(
      source,
      /Mnemonic\.toPrivateKey\(words\)/,
    );
    assert.match(
      source,
      /HDKey\.fromMnemonic\(words\)/,
    );
  }
});

test('X promotion never mutates the configured signing secret', () => {
  assert.doesNotMatch(
    xRuntime,
    /process\.env\.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY\s*=/,
  );
});

test('derived private-key bytes and mnemonic word copies are wiped after use', () => {
  assert.match(
    xRuntime,
    /privateKeyBytes\.fill\(0\)/,
  );
  assert.match(
    xRuntime,
    /candidate\.fill\(0\)/,
  );
  assert.match(
    xRuntime,
    /basePrivateKey\.fill\(0\)/,
  );
  assert.match(
    xRuntime,
    /hdKey\.wipePrivateData\(\)/,
  );
  assert.match(
    xRuntime,
    /words\.fill\(''\)/,
  );
});

test('readiness still exposes only the coarse credential error', () => {
  assert.match(
    xRuntime,
    /catch \{[\s\S]*reason: 'PAYOUT_CREDENTIALS_INVALID'/,
  );
});
