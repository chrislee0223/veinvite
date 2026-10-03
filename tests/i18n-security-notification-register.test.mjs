import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const hold = read('src/lib/i18n/inviterHoldNotificationCopy.ts');
const inviter = read('src/lib/i18n/inviterSecurityNotificationCopy.ts');
const postPayout = read('src/lib/i18n/postPayoutSecurityNotificationCopy.ts');
const ineligible = read('src/lib/i18n/ineligibleInviterCopy.ts');
const invalidated = read('src/lib/i18n/referralInvalidatedCopy.ts');

test('security notifications keep each locale register consistent with the app', () => {
  assert.doesNotMatch(hold, /πρόσβασή σας|μπορείτε/);
  assert.doesNotMatch(inviter, /πρόσβασή σας|μπορείτε/);
  assert.doesNotMatch(hold, /můžete/);
  assert.doesNotMatch(inviter, /můžete/);
  assert.match(postPayout, /votre accès à VeInvite/);
  assert.doesNotMatch(postPayout, /ton accès à VeInvite/);
  assert.match(postPayout, /tvůj přístup k VeInvite/);
});

test('Indonesian lifecycle messages use the app-wide formal address', () => {
  assert.match(ineligible, /Sekarang Anda dapat mengundang teman lain/);
  assert.match(invalidated, /Wallet yang Anda undang/);
  assert.doesNotMatch(`${ineligible}\n${invalidated}`, /\bkamu\b|Temanmu|Reward-mu/i);
});
