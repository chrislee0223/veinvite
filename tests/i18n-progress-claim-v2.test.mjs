import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const localesSource = await readFile(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const progressCopy = await readFile(
  new URL('../src/lib/i18n/progressClaimCopy.ts', import.meta.url),
  'utf8',
);
const notificationCopy = await readFile(
  new URL('../src/lib/i18n/notificationV2Copy.ts', import.meta.url),
  'utf8',
);
const guideHardening = await readFile(
  new URL('../src/lib/i18n/guideRewardClaimHardening.ts', import.meta.url),
  'utf8',
);
const providers = await readFile(
  new URL('../src/components/AppProviders.tsx', import.meta.url),
  'utf8',
);
const notificationState = await readFile(
  new URL('../src/lib/notifications/inviteNotificationState.ts', import.meta.url),
  'utf8',
);
const notificationStateV2 = await readFile(
  new URL('../src/lib/notifications/inviteNotificationStateV2.ts', import.meta.url),
  'utf8',
);

const locales = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);

function hasLocaleEntry(source, locale) {
  const escaped = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|\\n)\\s*(?:'${escaped}'|${escaped}):\\s*\\{`,
    'm',
  ).test(source);
}

test('new progress, notification and claim-guide copy cover every supported locale', () => {
  assert.equal(locales.length, 27);

  for (const locale of locales) {
    assert.equal(
      hasLocaleEntry(progressCopy, locale),
      true,
      `progressClaimCopy missing ${locale}`,
    );
    assert.equal(
      hasLocaleEntry(notificationCopy, locale),
      true,
      `notificationV2Copy missing ${locale}`,
    );
    assert.equal(
      hasLocaleEntry(guideHardening, locale),
      true,
      `guideRewardClaimHardening missing ${locale}`,
    );
  }
});

test('claim guide hardening is applied after expanded locale registration', () => {
  const registration = providers.indexOf(
    "import '@/lib/i18n/localePacks/registerExpandedLocales';",
  );
  const hardening = providers.indexOf(
    "import '@/lib/i18n/guideRewardClaimHardening';",
  );

  assert.ok(registration >= 0);
  assert.ok(hardening > registration);
  assert.match(
    guideHardening,
    /Claiming and payout must never reprice|확정된 금액|claiming never recalculates it/i,
  );
});

test('legacy notification stage numbers are not renumbered', () => {
  assert.match(notificationState, /accepted: 1/);
  assert.match(notificationState, /dappMissionCompleted: 2/);
  assert.match(notificationState, /vot3Converted: 3/);
  assert.match(notificationState, /allMissionsCompleted: 4/);
  assert.match(notificationState, /rewardPaid: 5/);
  assert.match(notificationState, /ineligible: 6/);

  assert.match(
    notificationStateV2,
    /dappProgressAcknowledged/,
  );
  assert.match(
    notificationStateV2,
    /rewardReadyAcknowledgedAt/,
  );
});

test('fully missed lifecycle collapses into the final paid notification', () => {
  assert.match(
    notificationStateV2,
    /kind: 'REWARD_PAID'[\s\S]*collapsedProgress:[\s\S]*rewardReadyAcknowledgedAt === null/,
  );
  assert.match(
    notificationStateV2,
    /allMissionsObserved[\s\S]*return null;/,
  );
});
