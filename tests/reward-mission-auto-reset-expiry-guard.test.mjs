import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { verifyPreviousMissionVoteWindow } from '../src/lib/rewards/missionAutoResetExpiryProof.ts';

test('previous vote expiry guard exists as a read-only callable verifier', () => {
  assert.equal(typeof verifyPreviousMissionVoteWindow, 'function');
});

test('expiry needs finalized N+1 boundaries and positively confirms no vote', () => {
  const source = readFileSync('src/lib/rewards/missionAutoResetExpiryProof.ts', 'utf8');
  assert.match(source, /getBlockCompressed\('finalized'\)/);
  assert.match(source, /finalizedBlock < window\.voteEndBlock \+ minFinalityBlocks/);
  assert.match(source, /topic2: topic\(topics\[2\]\)/);
  assert.match(source, /logs\.length > 0 \? 'VOTE_PROOF_PENDING' : 'SAFE_TO_RESET'/);
  assert.doesNotMatch(source, /\.from\('invitations'\)|\.insert\(|\.update\(|commit_reward_shared_pool_v1/);
});
