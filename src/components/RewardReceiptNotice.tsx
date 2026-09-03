'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { REWARD_RECEIPT_COPY } from '@/lib/i18n/rewardReceiptCopy';
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import { getVeChainExplorerTransactionUrl } from '@/lib/vechainExplorer';

type ReceiptResponse = {
  latestUnseen?: RewardReceipt | null;
};

const REWARD_RECEIPT_ACKNOWLEDGED_EVENT =
  'veinvite-reward-receipt-acknowledged';

function shortTx(txId: string): string {
  if (txId.length < 18) {
    return txId;
  }

  return `${txId.slice(0, 10)}…${txId.slice(-8)}`;
}

export function RewardReceiptNotice() {
  const [locale, setLocale] = useState<Locale>('en');
  const [receipt, setReceipt] = useState<RewardReceipt | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState('');
  const t = REWARD_RECEIPT_COPY[locale];

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const initialLocale = isLocale(saved)
      ? saved
      : resolveBrowserLocale(window.navigator.languages, 'en');

    setLocale(initialLocale);

    const handleLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) {
        setLocale(detail);
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
      const response = await fetch(
        '/api/rewards/receipts?limit=1',
        { cache: 'no-store' },
      );

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as ReceiptResponse;
      setReceipt(data.latestUnseen ?? null);
    } catch {
      // This notice is optional. A receipt-loading problem must never break the
      // core invitation experience.
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
      window.dispatchEvent(
        new Event(REWARD_RECEIPT_ACKNOWLEDGED_EVENT),
      );
      // Two simultaneous friend slots can produce multiple reward receipts for
      // the same inviter. Load the next unseen receipt immediately instead of
      // requiring a page refresh after acknowledging the first one.
      await loadReceipt();
    } catch {
      setError(t.error);
    } finally {
      setAcknowledging(false);
    }
  };

  if (!receipt) {
    return null;
  }

  const explorerNetwork =
    receipt.network === 'testnet'
      ? 'testnet'
      : 'mainnet';
  const transactionUrl =
    getVeChainExplorerTransactionUrl(
      receipt.txId,
      explorerNetwork,
    );

  return (
    <aside
      className="rewardReceiptNotice"
      role="status"
      aria-live="polite"
      aria-label={t.title}
    >
      <div className="receiptGlow" aria-hidden="true" />

      <div className="receiptHeader">
        <div className="receiptHeading">
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

      <a
        className="explorerLink"
        href={transactionUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t.viewTransaction}<span aria-hidden="true">↗</span>
      </a>

      {error ? (
        <p className="receiptError" role="alert">{error}</p>
      ) : null}

      <button
        type="button"
        className="receiptButton"
        disabled={acknowledging}
        onClick={() => void acknowledge()}
      >
        {acknowledging ? t.acknowledging : t.acknowledge}
      </button>

      <style jsx>{`
        .rewardReceiptNotice {
          position: fixed;
          z-index: 95;
          left: 50%;
          bottom: calc(98px + env(safe-area-inset-bottom));
          width: min(calc(100vw - 28px), 500px);
          max-height: calc(100dvh - 128px - env(safe-area-inset-bottom));
          box-sizing: border-box;
          transform: translateX(-50%);
          overflow: auto;
          padding: 20px;
          border: 1px solid rgba(255, 207, 66, 0.34);
          border-radius: 24px;
          background:
            linear-gradient(150deg, rgba(47, 39, 20, 0.985), rgba(14, 16, 30, 0.995) 62%);
          color: #ffffff;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.56);
          overscroll-behavior: contain;
        }
        .receiptGlow { position:absolute; width:180px; height:180px; top:-105px; right:-72px; border-radius:50%; background:rgba(255,198,44,.18); pointer-events:none; }
        .receiptHeader { position:relative; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
        .receiptHeading { min-width:0; }
        .receiptEyebrow { display:block; margin-bottom:6px; color:#ffd453; font-size:.67rem; font-weight:900; letter-spacing:.075em; overflow-wrap:anywhere; }
        h2 { margin:0; font-size:1.16rem; line-height:1.28; overflow-wrap:anywhere; }
        .receiptAmount { flex:0 0 auto; max-width:44%; text-align:right; }
        .receiptAmount strong { display:block; color:#ffd453; font-size:clamp(1.15rem,5vw,1.5rem); line-height:1.05; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
        .receiptAmount span { display:block; margin-top:4px; color:rgba(255,255,255,.66); font-size:.7rem; font-weight:850; }
        .receiptDescription { position:relative; margin:12px 0 16px; color:rgba(255,255,255,.73); font-size:.82rem; line-height:1.55; overflow-wrap:anywhere; }
        .receiptFacts { position:relative; margin:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .receiptFacts div { min-width:0; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(255,255,255,.035); }
        dt { margin-bottom:5px; color:rgba(255,255,255,.5); font-size:.61rem; font-weight:800; overflow-wrap:anywhere; }
        dd { margin:0; overflow:hidden; color:#fff; font-size:.71rem; font-weight:850; text-overflow:ellipsis; white-space:nowrap; }
        .explorerLink { position:relative; min-height:42px; margin-top:12px; padding:0 12px; display:flex; align-items:center; justify-content:center; gap:7px; border:1px solid rgba(255,205,80,.2); border-radius:13px; background:rgba(255,201,61,.07); color:#ffd453; text-decoration:none; font-size:.72rem; font-weight:850; overflow-wrap:anywhere; }
        .receiptError { position:relative; margin:10px 0 0; color:#ffb2bb; font-size:.72rem; line-height:1.45; }
        .receiptButton { position:relative; width:100%; min-height:45px; margin-top:12px; border:0; border-radius:14px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.78rem; font-weight:950; cursor:pointer; }
        .receiptButton:disabled { opacity:.55; cursor:wait; }
        @media (max-width:420px) {
          .rewardReceiptNotice { bottom:calc(92px + env(safe-area-inset-bottom)); padding:16px; border-radius:20px; }
          .receiptHeader { gap:10px; }
          .receiptFacts { grid-template-columns:1fr; }
          .receiptAmount { max-width:38%; }
        }
      `}</style>
    </aside>
  );
}
