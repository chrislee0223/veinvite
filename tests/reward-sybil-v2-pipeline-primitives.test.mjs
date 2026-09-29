import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appOverlap,
  hasHighSignal,
  intervalsSimilar,
  isFinalizedVoteCheckpoint,
  normalizeWallet,
  safeError,
  safeNonNegativeBlock,
  safePositiveBlock,
  safeRevision,
  unique,
} from '../src/lib/sybil/v2/pipelinePrimitives.ts';

test('Sybil block and revision parsing preserves strict integer boundaries', () => {
  assert.equal(safePositiveBlock(1), 1);
  assert.equal(safePositiveBlock('42'), 42);
  assert.equal(safePositiveBlock(0), null);
  assert.equal(safePositiveBlock(-1), null);
  assert.equal(safePositiveBlock('1.5'), null);
  assert.equal(safePositiveBlock('nope'), null);

  assert.equal(safeNonNegativeBlock(0), 0);
  assert.equal(safeNonNegativeBlock('0'), 0);
  assert.equal(safeNonNegativeBlock(null), null);
  assert.equal(safeNonNegativeBlock(undefined), null);
  assert.equal(safeNonNegativeBlock(''), null);
  assert.equal(safeNonNegativeBlock('   '), null);
  assert.equal(safeNonNegativeBlock(-1), null);


  assert.equal(
    isFinalizedVoteCheckpoint({
      voteCompleted: false,
      voteBlock: null,
      finalizedBlock: 100,
    }),
    false,
  );
  assert.equal(
    isFinalizedVoteCheckpoint({
      voteCompleted: false,
      voteBlock: 0,
      finalizedBlock: 100,
    }),
    false,
  );
  assert.equal(
    isFinalizedVoteCheckpoint({
      voteCompleted: true,
      voteBlock: null,
      finalizedBlock: 100,
    }),
    false,
  );
  assert.equal(
    isFinalizedVoteCheckpoint({
      voteCompleted: true,
      voteBlock: 101,
      finalizedBlock: 100,
    }),
    false,
  );
  assert.equal(
    isFinalizedVoteCheckpoint({
      voteCompleted: true,
      voteBlock: 100,
      finalizedBlock: 100,
    }),
    true,
  );
  assert.equal(safeRevision(0), 0);
  assert.equal(safeRevision('7'), 7);
  assert.equal(safeRevision(null), 0);
  assert.equal(safeRevision(undefined), null);
  assert.equal(safeRevision('7.5'), null);
});

test('Sybil error and wallet normalization stay bounded and canonical', () => {
  assert.equal(
    normalizeWallet('  0xABCdef  '),
    '0xabcdef',
  );

  const longError = new Error('x'.repeat(1500));
  assert.equal(safeError(longError).length, 1000);
  assert.equal(safeError('plain'), 'plain');
});

test('unique preserves first-seen order', () => {
  assert.deepEqual(
    unique(['a', 'b', 'a', 'c', 'b']),
    ['a', 'b', 'c'],
  );
});

test('mission interval similarity preserves absolute and relative thresholds', () => {
  assert.equal(
    intervalsSimilar([1000, 2000], [1100, 2100]),
    true,
  );
  assert.equal(
    intervalsSimilar([1000], [1600]),
    false,
  );
  assert.equal(
    intervalsSimilar([1000], [1000, 1100]),
    false,
  );
  assert.equal(
    intervalsSimilar([], []),
    false,
  );
  assert.equal(
    intervalsSimilar(['bad'], [100]),
    false,
  );
});

test('app overlap remains Jaccard similarity over distinct app ids', () => {
  assert.equal(appOverlap([], []), 0);
  assert.equal(
    appOverlap(['a', 'b'], ['a', 'b']),
    1,
  );
  assert.equal(
    appOverlap(['a', 'b', 'c'], ['b', 'c', 'd']),
    0.5,
  );
  assert.equal(
    appOverlap(['a', 'a'], ['a']),
    1,
  );
});

test('high-signal lookup requires matching code, HIGH strength, and positive score', () => {
  const signals = [
    { code: 'A', strength: 'MEDIUM', score: 100 },
    { code: 'B', strength: 'HIGH', score: 0 },
    { code: 'C', strength: 'HIGH', score: 1 },
  ];

  assert.equal(hasHighSignal(signals, 'A'), false);
  assert.equal(hasHighSignal(signals, 'B'), false);
  assert.equal(hasHighSignal(signals, 'C'), true);
  assert.equal(hasHighSignal(signals, 'D'), false);
});
