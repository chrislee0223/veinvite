'use client';

import { NOTIFICATION_HISTORY_COPY } from '@/lib/i18n/notificationHistoryCopy';
import { REWARD_RECEIPT_COPY } from '@/lib/i18n/rewardReceiptCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
} from '@/lib/rewards/rewardReceiptShare';
import { getVeChainExplorerTransactionUrl } from '@/lib/vechainExplorer';

function shortTx(value: string): string {
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function RewardReceiptView({
  locale,
  receipt,
  loading,
  error,
  rewardShareUrl = '',
  onRewardShare,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt | null;
  loading: boolean;
  error: string;
  rewardShareUrl?: string;
  onRewardShare?: (intentUrl: string) => void;
}) {
  const structure = NOTIFICATION_HISTORY_COPY[locale];
  const copy = REWARD_RECEIPT_COPY[locale];
  const transactionUrl = receipt
    ? getVeChainExplorerTransactionUrl(
        receipt.txId,
        receipt.network === 'testnet' ? 'testnet' : 'mainnet',
      )
    : null;
  const rewardShareIntentUrl =
    receipt && rewardShareUrl
      ? rewardReceiptXIntentUrl({
          locale,
          amountB3tr: receipt.amountB3tr,
          referralUrl: rewardShareUrl,
        })
      : '';

  const shareRewardOnX = () => {
    if (!rewardShareIntentUrl) return;
    if (onRewardShare) {
      onRewardShare(rewardShareIntentUrl);
      return;
    }
    window.open(
      rewardShareIntentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div className="notificationReceiptView">
      {loading ? (
        <div className="notificationHistoryState" aria-busy="true">
          <span className="notificationHistorySpinner" aria-hidden="true" />
          <strong>{structure.loadingTitle}</strong>
        </div>
      ) : receipt ? (
        <>
          <section className="notificationReceiptHero">
            <div className="notificationReceiptAmount">
              <strong>{receipt.amountB3tr}</strong>
              <span>B3TR</span>
            </div>
            <p>{copy.description}</p>
          </section>
          <dl className="notificationReceiptFacts">
            <div>
              <dt>{copy.round}</dt>
              <dd>#{receipt.veBetterRoundId}</dd>
            </div>
            <div>
              <dt>{copy.invite}</dt>
              <dd>{receipt.inviteCode}</dd>
            </div>
            <div>
              <dt>{copy.transaction}</dt>
              <dd title={receipt.txId} dir="ltr">{shortTx(receipt.txId)}</dd>
            </div>
          </dl>

          {transactionUrl ? (
            <a
              className="notificationExplorerLink"
              href={transactionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.viewTransaction}<span aria-hidden="true">↗</span>
            </a>
          ) : null}

          {rewardShareIntentUrl ? (
            <button
              type="button"
              className="notificationXShare"
              aria-label={rewardReceiptShareLabel(locale)}
              onClick={shareRewardOnX}
            >
              {rewardReceiptShareLabel(locale)}
            </button>
          ) : null}

          {error ? (
            <p className="notificationReceiptError" role="alert">{error}</p>
          ) : null}
        </>
      ) : (
        <div className="notificationHistoryState errorState" role="alert">
          <span className="notificationHistoryStateIcon" aria-hidden="true">!</span>
          <strong>{structure.errorTitle}</strong>
          <p>{error || copy.error}</p>
        </div>
      )}

      <style jsx>{`
        .notificationReceiptView{max-height:100%;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#3b3529 transparent;padding:20px 18px 18px;box-sizing:border-box}
        .notificationReceiptHero{display:grid;gap:8px}
        .notificationReceiptAmount{display:flex;align-items:baseline;gap:7px}
        .notificationReceiptAmount strong{color:#fff1b0;font-size:1.9rem;line-height:1;font-variant-numeric:tabular-nums}
        .notificationReceiptAmount span{color:#d4b953;font-size:.64rem;font-weight:900;letter-spacing:.02em}
        .notificationReceiptHero p{margin:0;color:#a8a197;font-size:.67rem;line-height:1.55}
        .notificationReceiptFacts{margin:14px 0 0;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:rgba(255,255,255,.018)}
        .notificationReceiptFacts div{min-height:39px;padding:9px 11px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .notificationReceiptFacts div+div{border-top:1px solid rgba(255,255,255,.05)}
        .notificationReceiptFacts dt{color:#777168;font-size:.56rem;font-weight:800}
        .notificationReceiptFacts dd{margin:0;color:#d9d2c7;font-size:.6rem;font-weight:850;overflow-wrap:anywhere;text-align:end}
        .notificationExplorerLink{width:max-content;max-width:100%;margin-top:9px;display:inline-flex;align-items:center;gap:5px;color:#cdb45e;text-decoration:none;font-size:.59rem;font-weight:850}
        .notificationXShare{width:100%;min-height:44px;margin-top:14px;padding:10px 14px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.75rem;font-weight:950;cursor:pointer}
        .notificationReceiptError{margin:8px 0 0!important;color:#d48b93!important;font-size:.6rem!important}
        .notificationHistoryState{height:100%;min-height:0;box-sizing:border-box;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}
        .notificationHistorySpinner{width:32px;height:32px;border:3px solid rgba(244,183,40,.16);border-top-color:#e6bd4c;border-radius:50%;animation:notificationHistorySpin .8s linear infinite}
        .notificationHistoryStateIcon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(255,110,120,.08);color:#ff8f9b;font-size:1.2rem;font-weight:950}
        .notificationHistoryState strong{margin-top:14px;color:#ddd8cf;font-size:.9rem}
        .notificationHistoryState p{max-width:280px;margin:7px 0 0;color:#77726b;font-size:.66rem;line-height:1.55}
        .notificationXShare:focus-visible,.notificationExplorerLink:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @keyframes notificationHistorySpin{to{transform:rotate(360deg)}}
        @media(max-width:560px){.notificationReceiptView{padding:16px 14px}.notificationReceiptAmount strong{font-size:1.75rem}}
        @media(prefers-reduced-motion:reduce){.notificationHistorySpinner{animation:none}}
      `}</style>
    </div>
  );
}
