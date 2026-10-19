'use client';

import { RewardReceiptView } from '@/components/RewardReceiptView';
import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';
import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const QA_RECEIPT: RewardReceipt = {
  id: 'qa-receipt-1',
  receiptVersion: 'reward-receipt-v1',
  payoutId: 'qa-payout-1',
  rewardRoundId: 'qa-round-1',
  settlementId: 'qa-settlement-1',
  network: 'mainnet',
  veBetterRoundId: '123456',
  inviteCode: 'QA-X-PROMO-I18N-LONG-CODE-1234567890',
  recipientWallet: '0x1111111111111111111111111111111111111111',
  amountWei: '193910000000000000000',
  amountB3tr: '193.91',
  txId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  paidAt: '2026-10-19T00:00:00.000Z',
  seen: false,
  seenAt: null,
  createdAt: '2026-10-19T00:00:00.000Z',
};

export function QaXPromotionI18nHarness({
  locale,
  mode = 'promotion',
}: {
  locale: SupportedLocale;
  mode?: 'promotion' | 'receipt';
}) {
  const direction = getLocaleDirection(locale);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '16px 12px 40px',
        background: '#0b0b0a',
        color: '#f4efe6',
      }}
      lang={locale}
      dir={direction}
    >
      <div
        data-qa-x-promotion-shell
        style={{
          width: 'min(400px, calc(100vw - 24px))',
          margin: '0 auto',
          minWidth: 0,
          maxHeight: 'calc(100vh - 32px)',
        }}
      >
        {mode === 'receipt' ? (
          <RewardReceiptView
            locale={locale}
            receipt={QA_RECEIPT}
            loading={false}
            error=""
            rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promo-i18n"
          />
        ) : (
          <RewardXPromotionPanel
            locale={locale}
            inviteCode="QA-X-PROMO-I18N"
            receiptAmountB3tr="193.91"
            rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promo-i18n"
          />
        )}
      </div>
    </main>
  );
}
