import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const autoA = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopyA.ts',
  'utf8',
);
const expandedA = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopyA.ts',
  'utf8',
);
const oauth = readFileSync(
  'src/lib/i18n/rewardXPromotionOAuthFeedbackCopy.ts',
  'utf8',
);

test('reviewed Korean and Vietnamese X promotion copy avoids misleading hold/verification wording', () => {
  assert.match(mainCopy, /추가 보상은 계속 확보되어 있어요/);
  assert.match(mainCopy, /추가 보상을 확인받으세요/);
  assert.doesNotMatch(mainCopy, /추가 보상을 인증하세요/);

  assert.match(
    mainCopy,
    /Phần thưởng quảng bá vẫn được dành riêng cho bạn/,
  );
  assert.doesNotMatch(
    mainCopy,
    /Phần thưởng quảng bá vẫn được giữ lại/,
  );
  assert.match(mainCopy, /phần thưởng bổ sung/);
});

test('reviewed Dutch and Indonesian copy uses natural post terminology', () => {
  assert.match(
    mainCopy,
    /link naar de openbare post hieronder\. Dezelfde post/,
  );
  assert.doesNotMatch(mainCopy, /openbare Post-link|X-Post/);

  assert.match(mainCopy, /tautan postingan publik/);
  assert.match(mainCopy, /Verifikasi postingan/);
  assert.doesNotMatch(mainCopy, /tautan Post publik|Verifikasi Post/);

  assert.match(autoA, /URL postingan/);
  assert.doesNotMatch(autoA, /URL Post/);
  assert.match(oauth, /tautan postingan publik/);
});

test('reviewed Nigerian Pidgin and French copy avoids literal English carryover', () => {
  assert.match(expandedA, /Post am for X within 24 hours/);
  assert.doesNotMatch(expandedA, /Share for X within 24 hours/);
  assert.match(expandedA, /come back to VeInvite/);

  assert.match(
    mainCopy,
    /reversé à la réserve de récompenses/,
  );
  assert.doesNotMatch(
    mainCopy,
    /reversé au pool de récompenses/,
  );
});
