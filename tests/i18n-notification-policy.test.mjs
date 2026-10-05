import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const types = read('src/lib/notifications/inviteNotificationStateV2.ts');
const policy = read('src/lib/notifications/notificationPolicy.ts');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const harness = read('src/qa/QaNotificationStateHarness.tsx');
const historyRoute = read('src/app/api/notifications/history/route.ts');
const adjustedCopy = read('src/lib/i18n/rewardAdjustedCopy.ts');
const paidCopy = read('src/lib/i18n/rewardPaidNotificationCopy.ts');
const locales = read('src/lib/i18n/locales.ts');

const supportedKinds = [
  ...(types.match(/export type InviteNotificationKindV2 =([\s\S]*?);\n/u)?.[1]
    ?? '').matchAll(/'([A-Z][A-Z0-9_]+)'/gmu),
].map((match) => match[1]);

test('every notification kind is covered by the central delivery policy', () => {
  assert.match(
    policy,
    /Record<\s*InviteNotificationKindV2,\s*NotificationDeliveryPolicy\s*>/u,
  );
  assert.ok(supportedKinds.length > 0);
  for (const kind of supportedKinds) {
    assert.match(policy, new RegExp(`\\b${kind}:\\s*`, 'u'));
  }
});

test('history never auto-opens and WATCH is internal-only', () => {
  assert.match(policy, /autoOpenHistory: false/u);
  assert.match(
    policy,
    /SECURITY_INVITER_WATCH:\s*\{[\s\S]*userVisible: false,[\s\S]*persistInHistory: false,[\s\S]*readBehavior: 'none'/u,
  );
  assert.match(center, /allowProgrammaticOpen = false/u);
  assert.match(
    center,
    /const visibleOpen = open && \(manualOpen \|\| allowProgrammaticOpen\)/u,
  );
  assert.match(
    center,
    /items\.filter\(\(item\) => item\.kind !== 'SECURITY_INVITER_WATCH'\)/u,
  );
});

test('user-facing history filters WATCH while preserving internal audit records', () => {
  assert.match(historyRoute, /const INTERNAL_WATCH_KIND = 'SECURITY_INVITER_WATCH'/u);
  assert.match(
    historyRoute,
    /batch\.filter\(\(row\) => row\.kind !== INTERNAL_WATCH_KIND\)/u,
  );
  assert.match(historyRoute, /countUnreadInternalWatch/u);
  assert.match(historyRoute, /visibleUnreadCount/u);
  assert.match(
    historyRoute,
    /Math\.max\(0, totalUnread - hiddenUnread\)/u,
  );
});

test('only actual paid rewards get the special transient reward surface', () => {
  assert.match(
    policy,
    /REWARD_PAID:\s*\{[\s\S]*transientSurface: 'reward-paid',[\s\S]*readBehavior: 'receipt'/u,
  );
  const rewardSurfaceCount =
    policy.match(/transientSurface: 'reward-paid'/gu) ?? [];
  assert.equal(rewardSurfaceCount.length, 1);

  assert.match(harness, /'NOTI-REWARD-PAID-POPUP'/u);
  assert.doesNotMatch(harness, /InviteNotificationSurfaceV2/u);
});

test('reward notification copy must cover every supported locale', () => {
  const supportedLocales = [
    ...locales.matchAll(/\{ locale: '([^']+)'/gmu),
  ].map((match) => match[1]);

  for (const source of [paidCopy, adjustedCopy]) {
    const translatedLocales = [
      ...source.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*(?:\{|')/gmu),
    ]
      .map((match) => match[1] ?? match[2])
      .filter((locale) => supportedLocales.includes(locale));

    assert.deepEqual(
      [...new Set(translatedLocales)].sort(),
      [...supportedLocales].sort(),
    );
  }
});
