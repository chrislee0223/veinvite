'use client';

import { TransientSnackbar, type TransientFeedbackKind } from '@/components/TransientSnackbar';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { PROGRESS_CLAIM_COPY } from '@/lib/i18n/progressClaimCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { QaHomeStateHarness, type QaHomeStateId } from './QaHomeStateHarness';

export type QaHomeFeedbackStateId =
  | 'HOME-COPY-SUCCESS'
  | 'HOME-COPY-ERROR'
  | 'HOME-LOAD-ERROR'
  | 'REWARD-CLAIM-QUEUED'
  | 'REWARD-CLAIM-ERROR';

type FeedbackFixture = {
  backgroundState: QaHomeStateId;
  kind: TransientFeedbackKind;
  text: string;
};

function fixtureForState(
  stateId: QaHomeFeedbackStateId,
  locale: SupportedLocale,
): FeedbackFixture {
  const home = HOME_COPY[locale];
  const reward = PROGRESS_CLAIM_COPY[locale];

  switch (stateId) {
    case 'HOME-COPY-SUCCESS':
      return {
        backgroundState: 'HOME-SLOTS-EMPTY',
        kind: 'success',
        text: home.copied,
      };
    case 'HOME-COPY-ERROR':
      return {
        backgroundState: 'HOME-SLOTS-EMPTY',
        kind: 'error',
        text: home.genericError,
      };
    case 'HOME-LOAD-ERROR':
      return {
        backgroundState: 'HOME-SLOTS-SKELETON',
        kind: 'error',
        text: home.loadError,
      };
    case 'REWARD-CLAIM-QUEUED':
      return {
        backgroundState: 'REWARD-CLAIM-QUEUED',
        kind: 'success',
        text: reward.claimQueued,
      };
    case 'REWARD-CLAIM-ERROR':
      return {
        backgroundState: 'REWARD-AWAITING-CLAIM',
        kind: 'error',
        text: reward.claimFailed,
      };
  }
}

export function QaHomeFeedbackHarness({
  stateId,
  locale,
}: {
  stateId: QaHomeFeedbackStateId;
  locale: SupportedLocale;
}) {
  const fixture = fixtureForState(stateId, locale);

  return (
    <div data-qa-home-feedback-state={stateId}>
      <QaHomeStateHarness
        stateId={fixture.backgroundState}
        locale={locale}
      />
      <TransientSnackbar
        feedback={{
          id: 1,
          kind: fixture.kind,
          text: fixture.text,
        }}
        closeLabel={NOTIFICATION_COPY[locale].closeAria}
        onDismiss={() => {}}
      />
    </div>
  );
}
