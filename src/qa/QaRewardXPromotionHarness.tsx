'use client';

import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';

const QA_INVITE_CODE = 'QA-X-PROMOTION';
const QA_REWARD_SHARE_URL =
  'https://veinvite.vercel.app/s/ABCDEFGHJKLMNP23';

export function QaRewardXPromotionHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  const direction = getLocaleDirection(locale);

  return (
    <main
      className="qaXPromotionRoot"
      data-qa-x-promotion-ready="true"
      lang={locale}
      dir={direction}
    >
      <section className="qaXPromotionCard">
        <RewardXPromotionPanel
          locale={locale}
          inviteCode={QA_INVITE_CODE}
          receiptAmountB3tr="193.91"
          rewardShareUrl={QA_REWARD_SHARE_URL}
          onRewardShare={() => {}}
        />
      </section>

      <style jsx>{`
        .qaXPromotionRoot{
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
        .qaXPromotionCard{
          width:min(100%,400px);
          min-width:0;
          box-sizing:border-box;
          padding:14px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:18px;
          background:#11110f;
        }
        @media(max-width:360px){
          .qaXPromotionRoot{padding:10px}
          .qaXPromotionCard{padding:10px}
        }
      `}</style>
    </main>
  );
}
