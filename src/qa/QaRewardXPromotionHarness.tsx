'use client';

import { RewardReceiptView } from '@/components/RewardReceiptView';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const QA_RECEIPT: RewardReceipt = {
  id: 'qa-x-promotion-receipt',
  receiptVersion: 'v1',
  payoutId: 'qa-x-promotion-payout',
  rewardRoundId: '117',
  settlementId: 'qa-x-promotion-settlement',
  network: 'mainnet',
  veBetterRoundId: '117',
  inviteCode: 'qa-reward-invite-code',
  recipientWallet: '0x0000000000000000000000000000000000000b01',
  amountWei: '262970000000000000000',
  amountB3tr: '262.97',
  txId: `0x${'a'.repeat(64)}`,
  paidAt: '2026-10-17T00:00:00.000Z',
  seen: false,
  seenAt: null,
  createdAt: '2026-10-17T00:00:00.000Z',
};

export function QaRewardXPromotionHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <main
      data-qa-x-promotion-ready="true"
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '12px',
        display: 'grid',
        placeItems: 'start center',
        background:
          'radial-gradient(circle at 82% 8%, rgba(244,183,40,0.10), transparent 26%), #080807',
        color: '#fff',
      }}
    >
      <section
        style={{
          width: 'min(400px, calc(100vw - 24px))',
          maxHeight: 'min(760px, calc(100dvh - 24px))',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: '16px',
          background: '#11110f',
          boxSizing: 'border-box',
        }}
      >
        <RewardReceiptView
          locale={locale}
          receipt={QA_RECEIPT}
          loading={false}
          error=""
          rewardShareUrl="https://veinvite.vercel.app/s/qa-reward-share-preview"
          onRewardShare={() => {}}
        />
      </section>
    </main>
  );
}
