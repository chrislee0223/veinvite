import { notFound } from 'next/navigation';

import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';
import { isLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export const dynamic = 'force-dynamic';

const QA_RECEIPT: RewardReceipt = {
  id: 'qa-x-promotion-receipt',
  receiptVersion: 'v1',
  payoutId: 'qa-x-promotion-payout',
  rewardRoundId: '117',
  settlementId: 'qa-x-promotion-settlement',
  network: 'mainnet',
  veBetterRoundId: '117',
  inviteCode: 'qa-reward-invite-code',
  recipientWallet:
    '0x0000000000000000000000000000000000000b01',
  amountWei: '262970000000000000000',
  amountB3tr: '262.97',
  txId:
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  paidAt: '2026-10-04T00:00:00.000Z',
  seen: true,
  seenAt: '2026-10-04T00:01:00.000Z',
  createdAt: '2026-10-04T00:00:00.000Z',
};

export default async function RewardXPromotionQaPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;
  if (locale && !isLocale(locale)) notFound();

  const supportedLocale = isLocale(locale) ? locale : 'en';

  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '14px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: '#080807',
        color: '#fff',
      }}
    >
      <section
        style={{
          width: 'min(400px, calc(100vw - 28px))',
          maxWidth: '100%',
          minWidth: 0,
          border: '1px solid rgba(255,205,80,.22)',
          borderRadius: '22px',
          background: '#11110f',
          overflow: 'hidden',
        }}
      >
        <QaRewardXPromotionHarness
          locale={supportedLocale}
          receipt={QA_RECEIPT}
        />
      </section>
    </main>
  );
}
