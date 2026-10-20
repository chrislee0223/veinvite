'use client';

import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  RewardXPromotionPanel,
  type RewardXPromotionQaPreview,
} from '@/components/RewardXPromotionPanel';

export type QaXPromotionPreviewState =
  | 'XPROMO-OPEN'
  | 'XPROMO-GENERIC'
  | 'XPROMO-PREPARING'
  | 'XPROMO-LOAD-ERROR'
  | 'XPROMO-SUBMIT-ERROR';

const QA_INVITE_CODE = 'QA-X-PROMOTION';
const QA_REWARD_SHARE_URL =
  'https://veinvite.vercel.app/s/ABCDEFGHJKLMNP23';

const OPEN_RESPONSE: NonNullable<
  RewardXPromotionQaPreview['response']
> = {
  newOffersEnabled: true,
  promotionPending: false,
  promotion: {
    inviteCode: QA_INVITE_CODE,
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-20T00:00:00.000Z',
    postDeadlineAt: '2099-01-01T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
};

function previewForState(
  state: QaXPromotionPreviewState,
): RewardXPromotionQaPreview {
  switch (state) {
    case 'XPROMO-OPEN':
      return { response: OPEN_RESPONSE };
    case 'XPROMO-GENERIC':
      return {
        response: {
          newOffersEnabled: true,
          promotionPending: false,
          promotion: null,
        },
      };
    case 'XPROMO-PREPARING':
      return {
        response: {
          newOffersEnabled: true,
          promotionPending: true,
          promotion: null,
        },
      };
    case 'XPROMO-LOAD-ERROR':
      return {
        response: null,
        loadError: true,
      };
    case 'XPROMO-SUBMIT-ERROR':
      return {
        response: OPEN_RESPONSE,
        submitErrorStatus: 409,
      };
  }
}

export function QaRewardXPromotionPreview({
  locale,
  state,
}: {
  locale: SupportedLocale;
  state: QaXPromotionPreviewState;
}) {
  return (
    <main
      className="qaXPromotionPreviewRoot"
      lang={locale}
      dir={getLocaleDirection(locale)}
    >
      <section className="qaXPromotionPreviewCard">
        <RewardXPromotionPanel
          locale={locale}
          inviteCode={QA_INVITE_CODE}
          receiptAmountB3tr="193.91"
          rewardShareUrl={QA_REWARD_SHARE_URL}
          qaPreview={previewForState(state)}
        />
      </section>

      <style jsx>{`
        .qaXPromotionPreviewRoot{
          min-height:100vh;
          box-sizing:border-box;
          padding:16px;
          display:flex;
          align-items:flex-start;
          justify-content:center;
          background:#0b0b0a;
          color:#f2ede4;
          overflow-x:hidden;
        }
        .qaXPromotionPreviewCard{
          width:min(100%,400px);
          min-width:0;
          box-sizing:border-box;
          padding:14px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:18px;
          background:#11110f;
        }
        @media(max-width:360px){
          .qaXPromotionPreviewRoot{padding:10px}
          .qaXPromotionPreviewCard{padding:10px}
        }
      `}</style>
    </main>
  );
}
