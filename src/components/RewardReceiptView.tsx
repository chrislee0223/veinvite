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
  acknowledging,
  onAcknowledge,
  rewardShareUrl = '',
  onRewardShare,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt | null;
  loading: boolean;
  error: string;
  acknowledging: boolean;
  onAcknowledge: () => void;
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
          <span className="notificationReceiptEyebrow">{copy.eyebrow}</span>
          <div className="notificationReceiptAmount">
            <strong>{receipt.amountB3tr}</strong><span>B3TR</span>
          </div>
          <p>{copy.description}</p>
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

          {rewardShareIntentUrl ? (
            <button
              type="button"
              className="notificationXShare"
              onClick={shareRewardOnX}
            >
              <span aria-hidden="true">𝕏</span>
              {rewardReceiptShareLabel(locale)}
            </button>
          ) : null}

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

          {error ? (
            <p className="notificationReceiptError" role="alert">{error}</p>
          ) : null}

          {!receipt.seen ? (
            <button
              type="button"
              className="notificationReceiptAcknowledge"
              disabled={acknowledging}
              onClick={onAcknowledge}
            >
              {acknowledging ? copy.acknowledging : copy.acknowledge}
            </button>
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
        .notificationReceiptView{height:100%;max-height:none;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#3b3529 transparent;padding:18px;box-sizing:border-box}
        .notificationReceiptEyebrow{display:block;color:#ffd453;font-size:.6rem;font-weight:900;letter-spacing:.065em}
        .notificationReceiptAmount{margin-top:12px;display:flex;align-items:baseline;gap:7px}
        .notificationReceiptAmount strong{color:#fff1b0;font-size:1.8rem;line-height:1}
        .notificationReceiptAmount span{color:#d4b953;font-size:.66rem;font-weight:900}
        .notificationReceiptView>p{margin:12px 0 0;color:#a8a197;font-size:.66rem;line-height:1.55}
        .notificationReceiptFacts{margin:16px 0 0;display:grid;gap:8px}
        .notificationReceiptFacts div{padding:10px 11px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(255,255,255,.018)}
        .notificationReceiptFacts dt{color:#777168;font-size:.56rem;font-weight:800}
        .notificationReceiptFacts dd{margin:0;color:#d9d2c7;font-size:.6rem;font-weight:850;overflow-wrap:anywhere;text-align:end}
        .notificationXShare{width:100%;min-height:48px;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:9px;padding:11px 14px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:#f7f7f5;color:#0b0b0a;font:inherit;font-size:.8rem;font-weight:950;cursor:pointer}
        .notificationXShare span{font-size:1rem;line-height:1}
        .notificationExplorerLink{margin-top:12px;min-height:38px;padding-inline:12px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(244,183,40,.22);border-radius:11px;background:rgba(244,183,40,.06);color:#e8c862;text-decoration:none;font-size:.62rem;font-weight:900}
        .notificationReceiptError{margin:10px 0 0!important;color:#d48b93!important}
        .notificationReceiptAcknowledge{width:100%;min-height:42px;margin-top:12px;border:0;border-radius:12px;background:#f4b728;color:#17120a;font:inherit;font-size:.66rem;font-weight:950;cursor:pointer}
        .notificationReceiptAcknowledge:disabled{opacity:.55;cursor:wait}
        .notificationHistoryState{height:100%;min-height:0;box-sizing:border-box;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}
        .notificationHistorySpinner{width:32px;height:32px;border:3px solid rgba(244,183,40,.16);border-top-color:#e6bd4c;border-radius:50%;animation:notificationHistorySpin .8s linear infinite}
        .notificationHistoryStateIcon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(255,110,120,.08);color:#ff8f9b;font-size:1.2rem;font-weight:950}
        .notificationHistoryState strong{margin-top:14px;color:#ddd8cf;font-size:.9rem}
        .notificationHistoryState p{max-width:280px;margin:7px 0 0;color:#77726b;font-size:.66rem;line-height:1.55}
        .notificationXShare:focus-visible,.notificationExplorerLink:focus-visible,.notificationReceiptAcknowledge:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        @keyframes notificationHistorySpin{to{transform:rotate(360deg)}}
        @media(max-width:560px){.notificationReceiptView{padding:16px 14px}}
        @media(prefers-reduced-motion:reduce){.notificationHistorySpinner{animation:none}}
      `}</style>
    </div>
  );
}
