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

const PUBLIC_RANK_LIMIT = 100;

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
  if (rank <= 0) return '—';
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
    () => data?.leaders.slice(0, PUBLIC_RANK_LIMIT) ?? [],
    [data],
  );
  const rankedCurrentUser = data?.currentUser ?? null;
  const currentUser: PublicLeaderboardEntry | null =
    rankedCurrentUser ??
    (wallet
      ? {
          rank: 0,
          walletAddress: wallet,
          completedReferrals: 0,
          totalRewardWei: '0',
          isCurrentWallet: true,
        }
      : null);
  const currentUserInList = currentUser
    ? displayedLeaders.some(
        (entry) =>
          entry.walletAddress.toLowerCase() ===
          currentUser.walletAddress.toLowerCase(),
      )
    : false;
  const trailingCurrentUser =
    currentUser && !currentUserInList ? currentUser : null;
  const totalUsers = data?.impact.totalActivatedUsers ?? 0;

  const renderRankRow = (
    entry: PublicLeaderboardEntry,
    trailing = false,
  ) => {
    const classes = [
      'rankRow',
      entry.rank > 0 && entry.rank <= 5 ? 'featured' : 'compact',
      entry.isCurrentWallet ? 'current' : '',
      trailing ? 'trailingCurrent' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        key={entry.walletAddress}
        type="button"
        className={classes}
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
    );
  };

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
      </section>

      <section className="rankingCard">
        <div className="rankingTopline">
          <span>TOP {PUBLIC_RANK_LIMIT}</span>
        </div>

        <div className="tableHeader" aria-hidden="true">
          <span>{t.rank}</span>
          <span>{t.wallet}</span>
          <span>{t.completed}</span>
          <span>{t.earned}</span>
        </div>

        {displayedLeaders.length || trailingCurrentUser ? (
          <div className="rows">
            {displayedLeaders.map((entry) => renderRankRow(entry))}
            {trailingCurrentUser ? (
              <>
                {displayedLeaders.length ? (
                  <div className="rankDivider" aria-hidden="true">
                    <span>···</span>
                  </div>
                ) : null}
                {renderRankRow(trailingCurrentUser, true)}
              </>
            ) : null}
          </div>
        ) : (
          <p className="empty">{t.empty}</p>
        )}

        {!wallet ? (
          <p className="rankContextNote">{t.connectForRank}</p>
        ) : !rankedCurrentUser ? (
          <p className="rankContextNote">{t.unranked}</p>
        ) : null}
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
          width:min(100%,520px);
          margin:0 auto;
          padding-bottom:12px;
        }
        .impactCard,.rankingCard {
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:21px;
          background:rgba(255,255,255,.035);
        }
        .impactCard {
          margin-top:0;
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
        .rankingTopline {
          min-height:24px;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          margin-bottom:8px;
        }
        .rankingTopline span {
          padding:5px 8px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:999px;
          background:rgba(244,183,40,.06);
          color:#a98c3d;
          font-size:.58rem;
          font-weight:950;
          letter-spacing:.08em;
        }
        .tableHeader {
          display:none;
        }
        .rows {
          display:grid;
          gap:7px;
        }
        .rankRow {
          width:100%;
          min-width:0;
          padding:11px 12px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:9px 12px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:15px;
          background:rgba(255,255,255,.025);
          color:#e9e5dc;
          font:inherit;
          text-align:left;
          cursor:pointer;
        }
        .rankRow.compact {
          padding-top:9px;
          padding-bottom:9px;
        }
        .rankRow:hover,.rankRow:focus-visible {
          border-color:rgba(255,205,80,.38);
          outline:none;
        }
        .rankRow.current {
          border-color:rgba(255,205,80,.52);
          background:linear-gradient(135deg,rgba(244,183,40,.14),rgba(244,183,40,.055));
          box-shadow:inset 3px 0 0 rgba(255,203,66,.78);
        }
        .rankRow.current .rankValue,
        .rankRow.current .rankMetric b {
          color:#ffd45f;
        }
        .rankRow.trailingCurrent {
          margin-top:1px;
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
          min-width:36px;
          color:#f0ede6;
          font-variant-numeric:tabular-nums;
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
        .completedMetric,.rewardMetric {
          text-align:right;
        }
        .rankDivider {
          display:flex;
          align-items:center;
          gap:10px;
          padding:6px 4px 2px;
          color:#6f6a61;
          font-size:.85rem;
          letter-spacing:.18em;
        }
        .rankDivider::before,.rankDivider::after {
          content:'';
          height:1px;
          flex:1;
          background:rgba(255,255,255,.07);
        }
        .rankContextNote,.empty {
          margin:14px 0 0;
          color:#827e76;
          font-size:.72rem;
          line-height:1.5;
          text-align:center;
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
        .reportingSince {
          display:block;
          margin-top:12px;
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
            grid-template-columns:52px minmax(0,1fr) 112px 130px;
            gap:10px;
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
          .tableHeader span:nth-child(3),
          .tableHeader span:nth-child(4) {
            text-align:right;
          }
          .rankRow.featured {
            min-height:56px;
            padding:10px 12px;
          }
          .rankRow.compact {
            min-height:48px;
            padding:8px 12px;
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
        }
        @media (max-width:420px) {
          .impactCard,.rankingCard {
            padding:15px;
            border-radius:19px;
          }
          .impactBreakdown {
            grid-template-columns:1fr;
          }
          .rankRow.featured {
            padding:11px;
          }
          .rankRow.compact {
            padding:9px 11px;
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
    width:min(100%,520px);
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
