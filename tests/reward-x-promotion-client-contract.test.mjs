import assert from 'node:assert/strict';
import test from 'node:test';

const {
  parseRewardXPromotionResponse,
  rewardXPromotionCopy,
} = await import(
  '../src/lib/rewards/rewardXPromotionClient.ts'
);

const token =
  '123e4567-e89b-42d3-a456-426614174000';

function openPayload(overrides = {}) {
  return {
    newOffersEnabled: true,
    promotion: {
      inviteCode: 'ABCDEFG',
      state: 'OPEN',
      amountWei: '10000000000000000000',
      amountB3tr: '10',
      openedAt: '2026-10-11T00:00:00.000Z',
      postDeadlineAt: '2026-10-12T00:00:00.000Z',
      submissionGraceSeconds: 900,
      shareToken: token,
      shareUrl:
        `https://veinvite.vercel.app/s/abcdefghijklmnop?xp=${token}`,
      submittedAt: null,
      verifyAfter: null,
      paidAt: null,
      ...overrides,
    },
  };
}

test('accepts exact OPEN server-authoritative share URL identity', () => {
  const parsed =
    parseRewardXPromotionResponse(openPayload());

  assert.equal(parsed?.promotion?.state, 'OPEN');
  assert.equal(parsed?.promotion?.shareToken, token);
});

test('rejects OPEN response when share URL token differs', () => {
  const other =
    '223e4567-e89b-42d3-a456-426614174000';

  assert.equal(
    parseRewardXPromotionResponse(
      openPayload({
        shareUrl:
          `https://veinvite.vercel.app/s/abcdefghijklmnop?xp=${other}`,
      }),
    ),
    null,
  );
});

test('rejects malformed OPEN referral share URL', () => {
  assert.equal(
    parseRewardXPromotionResponse(
      openPayload({
        shareUrl:
          `https://example.com/s/abcdefghijklmnop?xp=${token}`,
      }),
    ),
    null,
  );
});

test('non-OPEN state does not require an exposed share URL', () => {
  const parsed =
    parseRewardXPromotionResponse(
      openPayload({
        state: 'RETENTION',
        shareToken: null,
        shareUrl: null,
        submittedAt:
          '2026-10-11T00:10:00.000Z',
        verifyAfter:
          '2026-10-12T00:10:00.000Z',
      }),
    );

  assert.equal(
    parsed?.promotion?.state,
    'RETENTION',
  );
  assert.equal(
    parsed?.promotion?.shareUrl,
    null,
  );
});

test('rejects non-numeric or negative submission grace', () => {
  assert.equal(
    parseRewardXPromotionResponse(
      openPayload({
        submissionGraceSeconds: '900',
      }),
    ),
    null,
  );
  assert.equal(
    parseRewardXPromotionResponse(
      openPayload({
        submissionGraceSeconds: -1,
      }),
    ),
    null,
  );
});

test('copy falls back to English for locales without a dedicated promotion pack', () => {
  assert.equal(
    rewardXPromotionCopy('ko').title,
    'X 홍보 보너스',
  );
  assert.equal(
    rewardXPromotionCopy('vi').title,
    'X promotion bonus',
  );
});
