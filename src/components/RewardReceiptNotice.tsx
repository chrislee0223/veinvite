'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

type Locale = 'en' | 'ko';

type ReceiptResponse = {
  latestUnseen?: RewardReceipt | null;
  error?: string;
};

const LANGUAGE_STORAGE_KEY = 'veinvite-language';

const COPY = {
  en: {
    eyebrow: 'REFERRAL REWARD RECEIVED',
    title: 'Your B3TR reward arrived',
    description:
      'A verified VeInvite referral reward has been paid to your connected wallet.',
    round: 'VeBetterDAO round',
    invite: 'Invite',
    transaction: 'Transaction',
    acknowledge: 'Got it',
    acknowledging: 'Saving…',
    error: 'The reward receipt could not be acknowledged. Please try again.',
  },
  ko: {
    eyebrow: '추천 보상 지급 완료',
    title: 'B3TR 보상이 도착했어요',
    description:
      '검증이 완료된 VeInvite 추천 보상이 연결된 지갑으로 지급됐어요.',
    round: 'VeBetterDAO 라운드',
    invite: '초대',
    transaction: '트랜잭션',
    acknowledge: '확인',
    acknowledging: '처리 중…',
    error: '보상 영수증을 확인 처리하지 못했어요. 다시 시도해 주세요.',
  },
} as const;

function shortTx(txId: string) {
  if (txId.length < 16) {
    return txId;
  }

  return `${txId.slice(0, 8)}…${txId.slice(-6)}`;
}

export function RewardReceiptNotice() {
  const [locale, setLocale] = useState<Locale>('en');
  const [receipt, setReceipt] = useState<RewardReceipt | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState('');

  const t = COPY[locale];

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    setLocale(saved === 'ko' ? 'ko' : 'en');

    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent<Locale>;

      if (customEvent.detail === 'en' || customEvent.detail === 'ko') {
        setLocale(customEvent.detail);
      }
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
    };
  }, []);

  const loadReceipt = useCallback(async () => {
    try {
      const response = await fetch('/api/rewards/receipts?limit=1', {
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as ReceiptResponse;
      setReceipt(data.latestUnseen ?? null);
    } catch {
      // Receipt notices are non-blocking. The core invite UI should keep working
      // even when the optional receipt surface cannot be loaded.
    }
  }, []);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  const acknowledge = async () => {
    if (!receipt || acknowledging) {
      return;
    }

    setAcknowledging(true);
    setError('');

    try {
      const response = await fetch(
        `/api/rewards/receipts/${encodeURIComponent(receipt.id)}/seen`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            intent: 'ACKNOWLEDGE_REWARD_RECEIPT',
          }),
        },
      );

      if (!response.ok) {
        throw new Error('receipt acknowledgement failed');
      }

      setReceipt(null);
    } catch {
      setError(t.error);
    } finally {
      setAcknowledging(false);
    }
  };

  if (!receipt) {
    return null;
  }

  return (
    <aside
      className="rewardReceiptNotice"
      role="status"
      aria-live="polite"
      aria-label={t.title}
    >
      <div className="receiptGlow" aria-hidden="true" />

      <div className="receiptHeader">
        <div>
          <span className="receiptEyebrow">{t.eyebrow}</span>
          <h2>{t.title}</h2>
        </div>

        <div className="receiptAmount">
          <strong>{receipt.amountB3tr}</strong>
          <span>B3TR</span>
        </div>
      </div>

      <p className="receiptDescription">{t.description}</p>

      <dl className="receiptFacts">
        <div>
          <dt>{t.round}</dt>
          <dd>#{receipt.veBetterRoundId}</dd>
        </div>
        <div>
          <dt>{t.invite}</dt>
          <dd>{receipt.inviteCode}</dd>
        </div>
        <div>
          <dt>{t.transaction}</dt>
          <dd title={receipt.txId}>{shortTx(receipt.txId)}</dd>
        </div>
      </dl>

      {error ? <p className="receiptError">{error}</p> : null}

      <button
        type="button"
        className="receiptButton"
        disabled={acknowledging}
        onClick={acknowledge}
      >
        {acknowledging ? t.acknowledging : t.acknowledge}
      </button>

      <style jsx>{`
        .rewardReceiptNotice {
          position: fixed;
          z-index: 60;
          left: 50%;
          bottom: max(18px, env(safe-area-inset-bottom));
          width: min(calc(100vw - 32px), 488px);
          box-sizing: border-box;
          transform: translateX(-50%);
          overflow: hidden;
          padding: 20px;
          border: 1px solid rgba(255, 207, 66, 0.34);
          border-radius: 24px;
          background:
            linear-gradient(150deg, rgba(47, 39, 20, 0.98), rgba(14, 16, 30, 0.99) 62%);
          color: #ffffff;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
        }

        .receiptGlow {
          position: absolute;
          width: 170px;
          height: 170px;
          top: -100px;
          right: -70px;
          border-radius: 50%;
          background: rgba(255, 198, 44, 0.18);
          pointer-events: none;
        }

        .receiptHeader {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .receiptEyebrow {
          display: block;
          margin-bottom: 6px;
          color: #ffd453;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        h2 {
          margin: 0;
          font-size: 1.18rem;
          line-height: 1.25;
        }

        .receiptAmount {
          flex: 0 0 auto;
          min-width: 92px;
          text-align: right;
        }

        .receiptAmount strong {
          display: block;
          color: #ffd453;
          font-size: 1.45rem;
          line-height: 1;
        }

        .receiptAmount span {
          display: block;
          margin-top: 4px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 0.72rem;
          font-weight: 850;
        }

        .receiptDescription {
          position: relative;
          margin: 12px 0 16px;
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.84rem;
          line-height: 1.55;
        }

        .receiptFacts {
          position: relative;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .receiptFacts div {
          min-width: 0;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.035);
        }

        dt {
          margin-bottom: 5px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.62rem;
          font-weight: 800;
        }

        dd {
          margin: 0;
          overflow: hidden;
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 850;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .receiptError {
          margin: 12px 0 0;
          color: #ffb7b7;
          font-size: 0.76rem;
          line-height: 1.4;
        }

        .receiptButton {
          position: relative;
          width: 100%;
          min-height: 44px;
          margin-top: 14px;
          border: 0;
          border-radius: 14px;
          background: #f6c945;
          color: #11131d;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 900;
          cursor: pointer;
        }

        .receiptButton:disabled {
          cursor: wait;
          opacity: 0.68;
        }

        @media (max-width: 420px) {
          .rewardReceiptNotice {
            padding: 18px;
          }

          .receiptHeader {
            align-items: flex-start;
          }

          .receiptFacts {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </aside>
  );
}
