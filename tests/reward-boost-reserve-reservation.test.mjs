import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reservationServer = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);

test('late completion pricing reads an immutable source protection quote', () => {
  assert.match(
    reservationServer,
    /read_reward_boost_reserve_late_quote/,
  );
  assert.match(
    reservationServer,
    /lateQuote\?\.amountWei\s*\?\?\s*planning\.forecast\.rewardPerInviteWei/,
  );
  assert.match(
    reservationServer,
    /Late reward protection cohort mismatch/,
  );
});

test('all completion reservations pass through the late-reserve-safe wrapper', () => {
  assert.match(
    reservationServer,
    /commit_reward_reservation_with_late_reserve/,
  );
  assert.doesNotMatch(
    reservationServer,
    /\.rpc\(\s*'commit_reward_reservation'\s*,/,
  );
});

test('late protected reservations have a distinct audit version and basis', () => {
  assert.match(
    reservationServer,
    /late_completion_protected_v1/,
  );
  assert.match(
    reservationServer,
    /reward-boost-late-protection-v1/,
  );
  assert.match(
    reservationServer,
    /lateCompletionProtection:/,
  );
  assert.match(
    reservationServer,
    /protectedAmountWei: lateQuote\.amountWei/,
  );
  assert.match(
    reservationServer,
    /sourceRevision:\s*lateQuote\.sourceRevision/,
  );
});

test('ordinary completion pricing remains the existing cohort forecast path', () => {
  assert.match(
    reservationServer,
    /includePendingAcceptance: false/,
  );
  assert.match(
    reservationServer,
    /completion_fixed_reservation_v2_cohort/,
  );
  assert.match(
    reservationServer,
    /planning\.forecast\.rewardPerInviteWei/,
  );
});


test('underfunded late reserve skips only that candidate for later retry', () => {
  assert.match(
    reservationServer,
    /result\.reason === 'RESERVE_UNDERFUNDED'/,
  );
  assert.match(
    reservationServer,
    /skipCandidate\([\s\S]*'RESERVE_UNDERFUNDED'/,
  );
  assert.match(
    reservationServer,
    /will be retried by the normal[\s\S]*recovery sweep/,
  );
});
