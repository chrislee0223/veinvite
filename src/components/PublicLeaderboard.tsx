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
}: {
  locale: Locale;
  wallet: string | null;
}) {
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<PublicLeaderboardEntry | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const t = LEADERBOARD_COPY[locale];

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const search = new URLSearchParams();
      if (wallet) search.set('wallet', wallet);
      const query = search.toString();
      const response = await fetch(`/api/leaderboard${query ? `?${query}` : ''}`, {
        cache: 'no-store',
        signal,
      });
      const result = (await response.json()) as PublicLeaderboardResponse | { error?: string };
      if (!response.ok) {
        throw new Error('error' in result && result.error ? result.error : t.loadError);
      }
      setData(result as PublicLeaderboardResponse);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(t.loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t.loadError, wallet]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const closeDetails = useCallback(() => {
    setSelectedEntry(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  const openDetails = (entry: PublicLeaderboardEntry, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedEntry(entry);
  };

  useEffect(() => {
    if (!selectedEntry) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetails();
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
  }, [selectedEntry, closeDetails]);

  const displayedLeaders = useMemo(() => data?.leaders.slice(0, 5) ?? [], [data]);
  const currentUser = data?.currentUser ?? null;

  if (loading && !data) {
    return <section className="statePage"><p>{t.loading}</p><style jsx>{stateStyles}</style></section>;
  }

  if (error && !data) {
    return (
      <section className="statePage">
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>{t.retry}</button>
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

      <section className="impactCard">
        <h2>{t.impactTitle}</h2>
        <div className="impactGrid">
          <ImpactStat label={t.totalUsers} value={data?.impact.totalActivatedUsers ?? 0} />
          <ImpactStat label={t.newUsers} value={data?.impact.newUsers ?? 0} />
          <ImpactStat label={t.returningUsers} value={data?.impact.returningUsers ?? 0} />
        </div>
        <p>{t.impactNote}</p>
        {data?.reportingStartRound ? <small>{t.reportingSince(data.reportingStartRound)}</small> : null}
      </section>

      <section className="rankingCard">
        <div className="tableHeader">
          <span>{t.rank}</span><span>{t.wallet}</span><span>{t.completed}</span><span>{t.earned}</span>
        </div>
        {displayedLeaders.length ? (
          <div className="rows">
            {displayedLeaders.map((entry) => (
              <button
                key={entry.walletAddress}
                type="button"
                className={entry.isCurrentWallet ? 'rankRow current' : 'rankRow'}
                onClick={(event) => openDetails(entry, event.currentTarget)}
                aria-label={t.openWallet(entry.walletAddress)}
              >
                <strong>{rankLabel(entry.rank)}</strong>
                <span className="walletCell">{maskWallet(entry.walletAddress)}</span>
                <span>{entry.completedReferrals}</span>
                <span>{formatRewardWei(entry.totalRewardWei)}</span>
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
          <button type="button" className="myRankButton" onClick={(event) => openDetails(currentUser, event.currentTarget)} aria-label={t.openWallet(currentUser.walletAddress)}>
            <strong>{rankLabel(currentUser.rank)}</strong>
            <span>{maskWallet(currentUser.walletAddress)}</span>
            <span>{currentUser.completedReferrals} · {formatRewardWei(currentUser.totalRewardWei)} B3TR</span>
          </button>
        ) : (
          <p>{t.unranked}</p>
        )}
      </section>

      {selectedEntry ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
          <div ref={dialogRef} className="walletDialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title">
            <div className="dialogTop">
              <div>
                <small>{t.walletDetails}</small>
                <h2 id="wallet-dialog-title">{rankLabel(selectedEntry.rank)} {maskWallet(selectedEntry.walletAddress)}</h2>
              </div>
              <button ref={closeButtonRef} type="button" className="closeButton" onClick={closeDetails} aria-label={t.close}>×</button>
            </div>
            <label>{t.fullAddress}</label>
            <code>{selectedEntry.walletAddress}</code>
            <div className="dialogStats">
              <span><small>{t.completed}</small><strong>{selectedEntry.completedReferrals}</strong></span>
              <span><small>{t.earned}</small><strong>{formatRewardWei(selectedEntry.totalRewardWei)} B3TR</strong></span>
            </div>
            <a href={getVeChainExplorerAddressUrl(selectedEntry.walletAddress, data?.network)} target="_blank" rel="noopener noreferrer">
              {t.viewExplorer}<span aria-hidden="true">↗</span>
            </a>
            <p>{t.explorerNote}</p>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .leaderboardPage { width:min(100%,620px); margin:0 auto; padding-bottom:12px; }
        header > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        h1 { margin:8px 0 0; font-size:clamp(2rem,8vw,2.75rem); line-height:1.05; letter-spacing:-.05em; overflow-wrap:anywhere; }
        header p { margin:12px 0 0; color:#aaa69d; font-size:.88rem; line-height:1.58; overflow-wrap:anywhere; }
        .impactCard,.rankingCard,.myRankCard { margin-top:18px; padding:18px; border:1px solid rgba(255,205,80,.14); border-radius:21px; background:rgba(255,255,255,.035); }
        h2 { margin:0; font-size:1rem; letter-spacing:-.02em; overflow-wrap:anywhere; }
        .impactGrid { margin-top:14px; display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .impactCard > p,.myRankCard > p { margin:13px 0 0; color:#8f8b83; font-size:.73rem; line-height:1.5; overflow-wrap:anywhere; }
        .impactCard > small { display:block; margin-top:7px; color:#706c65; font-size:.66rem; }
        .tableHeader,.rankRow { display:grid; grid-template-columns:52px minmax(95px,1fr) 72px 92px; gap:7px; align-items:center; }
        .tableHeader { padding:0 8px 9px; color:#777269; font-size:.61rem; font-weight:900; text-transform:uppercase; }
        .rows { display:grid; gap:7px; }
        .rankRow { width:100%; min-height:54px; padding:8px; border:1px solid rgba(255,255,255,.07); border-radius:14px; background:rgba(255,255,255,.025); color:#e9e5dc; font:inherit; font-size:.72rem; text-align:left; cursor:pointer; }
        .rankRow:hover,.rankRow:focus-visible { border-color:rgba(255,205,80,.38); outline:none; }
        .rankRow.current { background:rgba(244,183,40,.08); border-color:rgba(255,205,80,.22); }
        .rankRow > span:nth-last-child(-n+2) { text-align:right; font-variant-numeric:tabular-nums; }
        .walletCell { color:#bcb6aa; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
        .empty { margin:14px 0 0; color:#827e76; font-size:.75rem; }
        .myRankButton { width:100%; margin-top:12px; padding:13px; display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; border:1px solid rgba(255,205,80,.2); border-radius:14px; background:rgba(244,183,40,.07); color:#eee8d8; font:inherit; text-align:left; cursor:pointer; }
        .myRankButton span:last-child { color:#b8ad8c; font-size:.68rem; text-align:right; }
        .modalBackdrop { position:fixed; z-index:120; inset:0; display:grid; place-items:center; padding:18px; background:rgba(2,3,8,.82); backdrop-filter:blur(10px); }
        .walletDialog { width:min(100%,460px); box-sizing:border-box; padding:22px; border:1px solid rgba(255,205,80,.22); border-radius:24px; background:#11120f; box-shadow:0 28px 90px rgba(0,0,0,.55); }
        .dialogTop { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }.dialogTop small { color:#f4bd35; font-size:.68rem; font-weight:900; letter-spacing:.08em; }.dialogTop h2 { margin-top:5px; }
        .closeButton { flex:0 0 auto; width:38px; height:38px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(255,255,255,.04); color:#fff; font-size:1.3rem; cursor:pointer; }
        .walletDialog > label { display:block; margin-top:18px; color:#817d74; font-size:.68rem; font-weight:800; }.walletDialog code { display:block; margin-top:7px; padding:12px; border-radius:13px; background:#080906; color:#e9c457; font-size:.7rem; line-height:1.5; overflow-wrap:anywhere; }
        .dialogStats { margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }.dialogStats span { padding:11px; display:grid; gap:4px; border:1px solid rgba(255,255,255,.06); border-radius:12px; background:rgba(255,255,255,.025); }.dialogStats small { color:#7e796f; font-size:.64rem; }.dialogStats strong { font-size:.78rem; overflow-wrap:anywhere; }
        .walletDialog :global(a) { min-height:50px; margin-top:14px; padding:0 15px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:15px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font-size:.82rem; font-weight:950; text-decoration:none; text-align:center; }.walletDialog > p { margin:9px 0 0; text-align:center; color:#777269; font-size:.66rem; }
        @media (max-width:520px) { .rankingCard { padding:14px 10px; overflow-x:auto; }.tableHeader,.rankRow { min-width:430px; }.impactGrid { grid-template-columns:1fr; }.myRankButton { grid-template-columns:auto 1fr; }.myRankButton span:last-child { grid-column:2; text-align:left; } }
      `}</style>
    </section>
  );
}

function ImpactStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="impactStat"><span>{label}</span><strong>{value.toLocaleString()}</strong>
      <style jsx>{`
        .impactStat { min-width:0; padding:12px; border:1px solid rgba(255,255,255,.06); border-radius:14px; background:rgba(255,255,255,.025); }
        span { display:block; color:#777269; font-size:.65rem; font-weight:800; overflow-wrap:anywhere; }
        strong { display:block; margin-top:6px; color:#ffd35c; font-size:1.3rem; font-variant-numeric:tabular-nums; }
      `}</style>
    </div>
  );
}

const stateStyles = `
  .statePage { width:min(100%,560px); margin:0 auto; padding:26px 18px; border:1px solid rgba(255,205,80,.14); border-radius:21px; background:rgba(255,255,255,.035); color:#aaa69d; text-align:center; }
  .statePage button { min-height:42px; margin-top:12px; padding:0 16px; border:0; border-radius:13px; background:#f4b728; color:#17120a; font:inherit; font-weight:900; cursor:pointer; }
`;
