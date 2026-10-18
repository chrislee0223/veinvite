'use client';

import { RewardReceiptView } from '@/components/RewardReceiptView';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const QA_X_PROMOTION_RECEIPT: RewardReceipt = {
  id: 'qa-x-promotion-receipt',
  receiptVersion: 'v1',
  payoutId: 'qa-x-promotion-payout',
  rewardRoundId: '117',
  settlementId: 'qa-x-promotion-settlement',
  network: 'mainnet',
  veBetterRoundId: '117',
  inviteCode: 'QA-X-PROMOTION',
  recipientWallet: '0x0000000000000000000000000000000000000b01',
  amountWei: '262970000000000000000',
  amountB3tr: '262.97',
  txId: `0x${'a'.repeat(64)}`,
  paidAt: '2026-10-04T00:00:00.000Z',
  seen: false,
  seenAt: null,
  createdAt: '2026-10-04T00:00:00.000Z',
};

export function QaRewardXPromotionHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '10px',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 82% 8%, rgba(244,183,40,0.10), transparent 26%), #080807',
        color: '#fff',
      }}
    >
      <section
        data-qa-x-promotion-receipt
        style={{
          width: 'min(400px, 100%)',
          maxHeight: 'calc(100dvh - 20px)',
          overflow: 'hidden',
          border: '1px solid rgba(255,205,80,.22)',
          borderRadius: '22px',
          background: '#11110f',
          boxShadow: '0 24px 70px rgba(0,0,0,.5)',
        }}
      >
        <RewardReceiptView
          locale={locale}
          receipt={QA_X_PROMOTION_RECEIPT}
          loading={false}
          error=""
          rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promotion"
          onRewardShare={() => {}}
        />
      </section>
    </main>
  );
}
