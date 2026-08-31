'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import type { Locale } from '@/lib/i18n/locales';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';
import { getVeChainExplorerAddressUrl } from '@/lib/vechainExplorer';

function maskWallet(address: string): string {
  return `${address.slice(0, 6)}···${address.slice(-4)}`;
}

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0';
  const normalized = value.replace(/^0+(?=\d)/, '');
  const padded = normalized.padStart(19, '0');
  const whole = padded.slice(0, -18);
  const fraction = padded.slice(-18, -14).replace(/0+$/, '');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
}

function rankLabel(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export function PublicLeaderboard({
  locale,
  wallet,
  previewData,
}: {
  locale: Locale;
  wallet: string | null;
  previewData?: PublicLeaderboardResponse;
}) {
  const [data, setData] = useState<PublicLeaderboardResponse | null>(
    previewData ?? null,
  );
  const [loading, setLoading] = useState(!previewData);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] =
    useState<PublicLeaderboardEntry | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const t = LEADERBOARD_COPY[locale];

  const load = useCallback(async (signal?: AbortSignal) => {
    if (previewData) {
      setData(previewData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const search = new URLSearchParams();
      if (wallet) search.set('wallet', wallet);
      const query = search.toString();
      const response = await fetch(
        `/api/leaderboard${query ? `?${query}` : ''}`,
        { cache: 'no-store', signal },
      );
      const result = (await response.json()) as
        | PublicLeaderboardResponse
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          'error' in result && result.error
            ? result.error
            : t.loadError,
        );
      }
      setData(result as PublicLeaderboardResponse);
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === 'AbortError'
      ) {
        return;
      }
      setError(t.loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [previewData, t.loadError, wallet]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (previewData) {
      setData(previewData);
      setLoading(false);
    }
  }, [previewData]);

  const closeDialog = useCallback(() => {
    setSelectedEntry(null);
    setImpactOpen(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  const openWalletDetails = (
    entry: PublicLeaderboardEntry,
    opener: HTMLElement,
  ) => {
    openerRef.current = opener;
    setImpactOpen(false);
    setSelectedEntry(entry);
  };

  const openImpactDetails = (opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedEntry(null);
    setImpactOpen(true);
  };

  useEffect(() => {
    if (!selectedEntry && !impactOpen) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length < 1) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedEntry, impactOpen, closeDialog]);

  const displayedLeaders = useMemo(
    () => data?.leaders.slice(0, 5) ?? [],
    [data],
  );
  const currentUser = data?.currentUser ?? null;
  const totalUsers = data?.impact.totalActivatedUsers ?? 0;

  if (loading && !data) {
    return (
      <section className="statePage">
        <p>{t.loading}</p>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="statePage">
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>
          {t.retry}
        </button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  return (
    <section className="leaderboardPage">
      <header>
        <span>{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </header>

      <section
        className="impactCard"
        data-reward-forecast-preview={previewData ? 'true' : undefined}
      >
        <h2>{t.impactTitle}</h2>
        <button
          type="button"
          className="impactSummaryButton"
          onClick={(event) => openImpactDetails(event.currentTarget)}
          aria-label={`${t.impactTitle}: ${totalUsers.toLocaleString()}`}
        >
          <span>{t.totalUsers}</span>
          <strong>{totalUsers.toLocaleString()}</strong>
          <b aria-hidden="true">›</b>
        </button>
        <p>{t.impactNote}</p>
      </section>

      <section className="rankingCard">
        <div className="tableHeader" aria-hidden="true">
          <span>{t.rank}</span>
          <span>{t.wallet}</span>
          <span>{t.completed}</span>
          <span>{t.earned}</span>
        </div>

        {displayedLeaders.length ? (
          <div className="rows">
            {displayedLeaders.map((entry) => (
              <button
                key={entry.walletAddress}
                type="button"
                className={
                  entry.isCurrentWallet
                    ? 'rankRow current'
                    : 'rankRow'
                }
                onClick={(event) =>
                  openWalletDetails(entry, event.currentTarget)
                }
                aria-label={t.openWallet(entry.walletAddress)}
              >
                <div className="rankPrimary">
                  <strong className="rankValue">
                    {rankLabel(entry.rank)}
                  </strong>
                  <span className="walletCell">
                    {maskWallet(entry.walletAddress)}
                  </span>
                </div>
                <span className="rankMetric completedMetric">
                  <small>{t.completed}</small>
                  <b>{entry.completedReferrals}</b>
                </span>
                <span className="rankMetric rewardMetric">
                  <small>{t.earned}</small>
                  <b>{formatRewardWei(entry.totalRewardWei)} B3TR</b>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">{t.empty}</p>
        )}
      </section>

      <section className="myRankCard">
        <h2>{t.myRank}</h2>
        {!wallet ? (
          <p>{t.connectForRank}</p>
        ) : currentUser ? (
          <button
            type="button"
            className="myRankButton"
            onClick={(event) =>
              openWalletDetails(currentUser, event.currentTarget)
            }
            aria-label={t.openWallet(currentUser.walletAddress)}
          >
            <strong>{rankLabel(currentUser.rank)}</strong>
            <span>{maskWallet(currentUser.walletAddress)}</span>
            <span>
              {currentUser.completedReferrals} ·{' '}
              {formatRewardWei(currentUser.totalRewardWei)} B3TR
            </span>
          </button>
        ) : (
          <p>{t.unranked}</p>
        )}
      </section>

      {impactOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            className="walletDialog impactDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="impact-dialog-title"
          >
            <div className="dialogTop">
              <div>
                <small>{t.totalUsers}</small>
                <h2 id="impact-dialog-title">{t.impactTitle}</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="closeButton"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ×
              </button>
            </div>

            <div className="impactBreakdown">
              <span>
                <small>{t.newUsers}</small>
                <strong>{(data?.impact.newUsers ?? 0).toLocaleString()}</strong>
              </span>
              <span>
                <small>{t.returningUsers}</small>
                <strong>
                  {(data?.impact.returningUsers ?? 0).toLocaleString()}
                </strong>
              </span>
            </div>
            <p>{t.impactNote}</p>
            {data?.reportingStartRound ? (
              <small className="reportingSince">
                {t.reportingSince(data.reportingStartRound)}
              </small>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedEntry ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            className="walletDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-dialog-title"
          >
            <div className="dialogTop">
              <div>
                <small>{t.walletDetails}</small>
                <h2 id="wallet-dialog-title">
                  {rankLabel(selectedEntry.rank)}{' '}
                  {maskWallet(selectedEntry.walletAddress)}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="closeButton"
                onClick={closeDialog}
                aria-label={t.close}
              >
                ×
              </button>
            </div>

            <label>{t.fullAddress}</label>
            <code>{selectedEntry.walletAddress}</code>
            <div className="dialogStats">
              <span>
                <small>{t.completed}</small>
                <strong>{selectedEntry.completedReferrals}</strong>
              </span>
              <span>
                <small>{t.earned}</small>
                <strong>
                  {formatRewardWei(selectedEntry.totalRewardWei)} B3TR
                </strong>
              </span>
            </div>
            <a
              href={getVeChainExplorerAddressUrl(
                selectedEntry.walletAddress,
                data?.network,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.viewExplorer}
              <span aria-hidden="true">↗</span>
            </a>
            <p>{t.explorerNote}</p>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .leaderboardPage {
          width:min(100%,560px);
          margin:0 auto;
          padding-bottom:12px;
        }
        header > span {
          color:#f8bc2e;
          font-size:.7rem;
          font-weight:950;
          letter-spacing:.12em;
        }
        h1 {
          margin:8px 0 0;
          font-size:clamp(2rem,8vw,2.75rem);
          line-height:1.05;
          letter-spacing:-.05em;
        }
        header p {
          margin:12px 0 0;
          color:#aaa69d;
          font-size:.88rem;
          line-height:1.58;
        }
        .impactCard,.rankingCard,.myRankCard {
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
        }
        h2 {
          margin:0;
          font-size:1rem;
          letter-spacing:-.02em;
        }
        .impactSummaryButton {
          width:100%;
          min-height:104px;
          margin-top:14px;
          padding:16px 18px;
          display:grid;
          grid-template-columns:1fr auto;
          grid-template-rows:auto 1fr;
          align-items:center;
          gap:4px 12px;
          border:1px solid rgba(255,205,80,.16);
          border-radius:17px;
          background:linear-gradient(135deg,rgba(244,183,40,.11),rgba(255,255,255,.025));
          color:#f8f4e8;
          text-align:left;
          cursor:pointer;
        }
        .impactSummaryButton:hover,.impactSummaryButton:focus-visible {
          border-color:rgba(255,205,80,.4);
          outline:none;
          box-shadow:0 0 0 3px rgba(244,183,40,.08);
        }
        .impactSummaryButton span {
          color:#928c80;
          font-size:.7rem;
          font-weight:850;
        }
        .impactSummaryButton strong {
          grid-row:2;
          color:#ffd35c;
          font-size:2rem;
          line-height:1;
          font-variant-numeric:tabular-nums;
        }
        .impactSummaryButton b {
          grid-column:2;
          grid-row:1 / span 2;
          color:#d9b956;
          font-size:1.55rem;
          font-weight:500;
        }
        .impactCard > p,.myRankCard > p {
          margin:13px 0 0;
          color:#8f8b83;
          font-size:.73rem;
          line-height:1.5;
        }
        .tableHeader {
          display:none;
        }
        .rows {
          display:grid;
          gap:8px;
        }
        .rankRow {
          width:100%;
          min-width:0;
          padding:12px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px 12px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:15px;
          background:rgba(255,255,255,.025);
          color:#e9e5dc;
          font:inherit;
          text-align:left;
          cursor:pointer;
        }
        .rankRow:hover,.rankRow:focus-visible {
          border-color:rgba(255,205,80,.38);
          outline:none;
        }
        .rankRow.current {
          background:rgba(244,183,40,.08);
          border-color:rgba(255,205,80,.22);
        }
        .rankPrimary {
          grid-column:1 / -1;
          min-width:0;
          display:flex;
          align-items:center;
          gap:10px;
        }
        .rankValue {
          flex:0 0 auto;
          min-width:34px;
        }
        .walletCell {
          min-width:0;
          overflow:hidden;
          color:#bcb6aa;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:.72rem;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .rankMetric {
          min-width:0;
          display:grid;
          gap:4px;
        }
        .rankMetric small {
          color:#777269;
          font-size:.59rem;
          font-weight:850;
        }
        .rankMetric b {
          min-width:0;
          color:#e9e5dc;
          font-size:.72rem;
          font-weight:850;
          font-variant-numeric:tabular-nums;
        }
        .rewardMetric {
          text-align:right;
        }
        .empty {
          margin:14px 0 0;
          color:#827e76;
          font-size:.75rem;
        }
        .myRankButton {
          width:100%;
          margin-top:12px;
          padding:13px;
          display:grid;
          grid-template-columns:auto 1fr;
          gap:6px 10px;
          align-items:center;
          border:1px solid rgba(255,205,80,.2);
          border-radius:14px;
          background:rgba(244,183,40,.07);
          color:#eee8d8;
          font:inherit;
          text-align:left;
          cursor:pointer;
        }
        .myRankButton span:last-child {
          grid-column:2;
          color:#b8ad8c;
          font-size:.68rem;
          text-align:left;
        }
        .modalBackdrop {
          position:fixed;
          z-index:120;
          inset:0;
          display:grid;
          place-items:center;
          padding:16px;
          background:rgba(2,3,8,.82);
          backdrop-filter:blur(10px);
        }
        .walletDialog {
          width:min(100%,460px);
          max-height:min(82svh,720px);
          overflow:auto;
          box-sizing:border-box;
          padding:20px;
          border:1px solid rgba(255,205,80,.22);
          border-radius:24px;
          background:#11120f;
          box-shadow:0 28px 90px rgba(0,0,0,.55);
        }
        .dialogTop {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }
        .dialogTop small {
          color:#f4bd35;
          font-size:.68rem;
          font-weight:900;
          letter-spacing:.08em;
        }
        .dialogTop h2 {
          margin-top:5px;
        }
        .closeButton {
          flex:0 0 auto;
          width:42px;
          height:42px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:rgba(255,255,255,.04);
          color:#fff;
          font-size:1.3rem;
          cursor:pointer;
        }
        .walletDialog > label {
          display:block;
          margin-top:18px;
          color:#817d74;
          font-size:.68rem;
          font-weight:800;
        }
        .walletDialog code {
          display:block;
          margin-top:7px;
          padding:12px;
          border-radius:13px;
          background:#080906;
          color:#e9c457;
          font-size:.7rem;
          line-height:1.5;
          overflow-wrap:anywhere;
        }
        .dialogStats,.impactBreakdown {
          margin-top:14px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
        }
        .dialogStats span,.impactBreakdown span {
          min-width:0;
          padding:12px;
          display:grid;
          gap:5px;
          border:1px solid rgba(255,255,255,.06);
          border-radius:13px;
          background:rgba(255,255,255,.025);
        }
        .dialogStats small,.impactBreakdown small {
          color:#7e796f;
          font-size:.64rem;
        }
        .dialogStats strong,.impactBreakdown strong {
          font-size:.86rem;
          font-variant-numeric:tabular-nums;
        }
        .impactBreakdown strong {
          color:#ffd35c;
          font-size:1.35rem;
        }
        .impactDialog > p {
          margin:14px 0 0;
          color:#8f8b83;
          font-size:.72rem;
          line-height:1.55;
        }
        .reportingSince {
          display:block;
          margin-top:8px;
          color:#706c65;
          font-size:.65rem;
        }
        .walletDialog :global(a) {
          min-height:50px;
          margin-top:14px;
          padding:0 15px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          border-radius:15px;
          background:linear-gradient(135deg,#ffd24d,#efa718);
          color:#17120a;
          font-size:.82rem;
          font-weight:950;
          text-decoration:none;
          text-align:center;
        }
        .walletDialog > p {
          margin:9px 0 0;
          text-align:center;
          color:#777269;
          font-size:.66rem;
        }
        @media (min-width:620px) {
          .tableHeader,.rankRow {
            grid-template-columns:50px minmax(0,1fr) 88px 112px;
            gap:8px;
            align-items:center;
          }
          .tableHeader {
            padding:0 12px 9px;
            display:grid;
            color:#777269;
            font-size:.61rem;
            font-weight:900;
            text-transform:uppercase;
          }
          .rankRow {
            min-height:56px;
            padding:10px 12px;
          }
          .rankPrimary {
            display:contents;
          }
          .rankMetric {
            display:block;
            text-align:right;
          }
          .rankMetric small {
            display:none;
          }
          .rankMetric b {
            font-size:.72rem;
          }
          .rewardMetric b {
            white-space:nowrap;
          }
          .myRankButton {
            grid-template-columns:auto 1fr auto;
          }
          .myRankButton span:last-child {
            grid-column:auto;
            text-align:right;
          }
        }
        @media (max-width:420px) {
          .impactCard,.rankingCard,.myRankCard {
            padding:15px;
            border-radius:19px;
          }
          .impactBreakdown {
            grid-template-columns:1fr;
          }
          .rankRow {
            padding:11px;
          }
          .walletDialog {
            padding:18px;
            border-radius:21px;
          }
        }
      `}</style>
    </section>
  );
}

const stateStyles = `
  .statePage {
    width:min(100%,560px);
    margin:0 auto;
    min-height:260px;
    display:grid;
    place-items:center;
    text-align:center;
    color:#8f8b83;
  }
  .statePage button {
    margin-top:12px;
    min-height:46px;
    padding:0 16px;
    border:1px solid rgba(255,205,80,.25);
    border-radius:13px;
    background:rgba(244,183,40,.08);
    color:#f5d36f;
    font:inherit;
    font-weight:850;
  }
`;
