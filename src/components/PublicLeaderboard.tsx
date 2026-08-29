'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';
import { getVeChainExplorerAddressUrl } from '@/lib/vechainExplorer';

type Locale = 'en' | 'ko';

const COPY = {
  ko: {
    eyebrow: '전체 누계',
    title: 'VeInvite 리더보드',
    description:
      '친구가 모든 미션을 완료하고, 초대한 사람이 실제 보상까지 받은 건만 순위에 반영해요.',
    impactTitle: 'VeInvite를 통해 참여한 사용자',
    totalUsers: '전체',
    newUsers: '신규 사용자',
    returningUsers: '복귀 사용자',
    impactNote:
      '모든 미션을 완료하고 검증을 통과한 지갑만 집계해요.',
    reportingSince: (round: number) =>
      `공식 누계는 ${round} 라운드부터 집계해요.`,
    rank: '순위',
    wallet: '지갑',
    completed: '완료한 친구',
    earned: '누적 보상',
    myRank: '내 순위',
    unranked: '순위 없음',
    connectForRank:
      '지갑을 연결하면 내 순위를 바로 확인할 수 있어요.',
    empty:
      '아직 지급까지 완료된 초대 보상이 없어요.',
    loading: '리더보드를 불러오는 중이에요…',
    loadError: '리더보드를 불러오지 못했어요.',
    retry: '다시 불러오기',
    walletDetails: '지갑 활동 확인',
    fullAddress: '전체 지갑 주소',
    viewExplorer: 'VeChain Explorer에서 확인',
    explorerNote:
      'Explorer에는 공개된 온체인 활동만 표시돼요.',
    close: '닫기',
    openWallet: (address: string) =>
      `${address} 지갑 상세 보기`,
  },
  en: {
    eyebrow: 'ALL-TIME',
    title: 'VeInvite Leaderboard',
    description:
      'Rankings count referrals only after every mission is complete and the inviter has received the verified reward payout.',
    impactTitle: 'People onboarded through VeInvite',
    totalUsers: 'Total',
    newUsers: 'New users',
    returningUsers: 'Returning users',
    impactNote:
      'Only wallets that finished every mission and passed verification are counted.',
    reportingSince: (round: number) =>
      `Official totals are tracked from Round ${round}.`,
    rank: 'Rank',
    wallet: 'Wallet',
    completed: 'Completed',
    earned: 'B3TR earned',
    myRank: 'My rank',
    unranked: 'Not ranked',
    connectForRank:
      'Connect your wallet to see your rank here.',
    empty:
      'No referral rewards have been paid yet.',
    loading: 'Loading the leaderboard…',
    loadError: 'The leaderboard could not be loaded.',
    retry: 'Try again',
    walletDetails: 'Wallet details',
    fullAddress: 'Full wallet address',
    viewExplorer: 'View on VeChain Explorer',
    explorerNote:
      'The Explorer shows public on-chain activity.',
    close: 'Close',
    openWallet: (address: string) =>
      `View details for wallet ${address}`,
  },
} as const;

function maskWallet(address: string): string {
  return `${address.slice(0, 6)}···${address.slice(-4)}`;
}

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) {
    return '0';
  }

  const normalized = value.replace(/^0+(?=\d)/, '');
  const padded = normalized.padStart(19, '0');
  const whole = padded.slice(0, -18);
  const fraction = padded
    .slice(-18, -14)
    .replace(/0+$/, '');
  const groupedWhole = whole.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );

  return fraction
    ? `${groupedWhole}.${fraction}`
    : groupedWhole;
}

function rankLabel(rank: number): string {
  if (rank === 1) {
    return '🥇';
  }

  if (rank === 2) {
    return '🥈';
  }

  if (rank === 3) {
    return '🥉';
  }

  return `#${rank}`;
}

export function PublicLeaderboard({
  locale,
  wallet,
}: {
  locale: Locale;
  wallet: string | null;
}) {
  const [data, setData] =
    useState<PublicLeaderboardResponse | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] =
    useState<PublicLeaderboardEntry | null>(
      null,
    );

  const t = COPY[locale];

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');

      try {
        const search = new URLSearchParams();

        if (wallet) {
          search.set('wallet', wallet);
        }

        const query = search.toString();
        const response = await fetch(
          `/api/leaderboard${
            query ? `?${query}` : ''
          }`,
          {
            cache: 'no-store',
            signal,
          },
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

        setData(
          result as PublicLeaderboardResponse,
        );
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === 'AbortError'
        ) {
          return;
        }

        setError(t.loadError);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [t.loadError, wallet],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setSelectedEntry(null);
      }
    };

    window.addEventListener(
      'keydown',
      closeOnEscape,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        closeOnEscape,
      );
    };
  }, [selectedEntry]);

  const currentEntry = useMemo(() => {
    if (!wallet || !data) {
      return null;
    }

    if (data.currentUser) {
      return data.currentUser;
    }

    return {
      rank: 0,
      walletAddress: wallet.toLowerCase(),
      completedReferrals: 0,
      totalRewardWei: '0',
      isCurrentWallet: true,
    } satisfies PublicLeaderboardEntry;
  }, [data, wallet]);

  const currentUserIsInTopFive =
    currentEntry !== null &&
    currentEntry.rank > 0 &&
    currentEntry.rank <= 5;

  const openWalletDetails = (
    entry: PublicLeaderboardEntry,
  ) => {
    setSelectedEntry(entry);
  };

  return (
    <section className="leaderboardPage">
      <div className="pageHeading">
        <span>{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </div>

      {loading && !data ? (
        <div className="stateCard" aria-live="polite">
          <span className="loadingDot" />
          {t.loading}
        </div>
      ) : null}

      {error && !data ? (
        <div className="stateCard errorCard" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
          >
            {t.retry}
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="impactCard">
            <span className="impactLabel">
              {t.impactTitle}
            </span>
            <strong className="impactTotal">
              {data.impact.totalActivatedUsers.toLocaleString()}
            </strong>

            <div className="impactGrid">
              <div>
                <span>{t.newUsers}</span>
                <strong>
                  {data.impact.newUsers.toLocaleString()}
                </strong>
              </div>
              <div>
                <span>{t.returningUsers}</span>
                <strong>
                  {data.impact.returningUsers.toLocaleString()}
                </strong>
              </div>
            </div>

            <p>
              {t.impactNote}
              {data.reportingStartRound
                ? ` ${t.reportingSince(
                    data.reportingStartRound,
                  )}`
                : ''}
            </p>
          </section>

          <div className="leaderboardCard">
            <div className="tableHeader">
              <span>{t.rank}</span>
              <span>{t.wallet}</span>
              <span>{t.completed}</span>
              <span>{t.earned}</span>
            </div>

            {data.leaders.length > 0 ? (
              <div className="leaderRows">
                {data.leaders.map((entry) => (
                  <LeaderboardRow
                    key={entry.walletAddress}
                    entry={entry}
                    locale={locale}
                    openLabel={t.openWallet(
                      entry.walletAddress,
                    )}
                    onOpen={openWalletDetails}
                  />
                ))}
              </div>
            ) : (
              <p className="emptyState">
                {t.empty}
              </p>
            )}
          </div>

          {!currentUserIsInTopFive ? (
            wallet && currentEntry ? (
              <section className="myRankCard">
                <span className="myRankLabel">
                  {t.myRank}
                </span>
                <LeaderboardRow
                  entry={currentEntry}
                  locale={locale}
                  openLabel={t.openWallet(
                    currentEntry.walletAddress,
                  )}
                  onOpen={openWalletDetails}
                  unrankedLabel={t.unranked}
                />
              </section>
            ) : (
              <p className="connectNote">
                {t.connectForRank}
              </p>
            )
          ) : null}
        </>
      ) : null}

      {selectedEntry && data ? (
        <div
          className="walletModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedEntry(null);
            }
          }}
        >
          <div
            className="walletModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-details-title"
          >
            <span className="modalEyebrow">
              {selectedEntry.rank > 0
                ? rankLabel(selectedEntry.rank)
                : t.myRank}
            </span>
            <h2 id="wallet-details-title">
              {t.walletDetails}
            </h2>

            <label>{t.fullAddress}</label>
            <code>{selectedEntry.walletAddress}</code>

            <a
              href={getVeChainExplorerAddressUrl(
                data.network,
                selectedEntry.walletAddress,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {t.viewExplorer}
              <span aria-hidden="true">↗</span>
            </a>
            <p>{t.explorerNote}</p>

            <button
              type="button"
              className="closeButton"
              onClick={() =>
                setSelectedEntry(null)
              }
            >
              {t.close}
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .leaderboardPage {
          width: min(100%, 560px);
          margin: 0 auto;
          padding-bottom: 12px;
        }

        .pageHeading span,
        .impactLabel,
        .myRankLabel,
        .modalEyebrow {
          color: #f8bc2e;
          font-size: 0.7rem;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .pageHeading h1 {
          margin: 8px 0 0;
          font-size: clamp(2rem, 8vw, 2.75rem);
          line-height: 1.05;
          letter-spacing: -0.05em;
          text-wrap: balance;
        }

        .pageHeading p {
          margin: 12px 0 0;
          color: #aaa69d;
          font-size: 0.9rem;
          line-height: 1.62;
          word-break: keep-all;
        }

        .stateCard,
        .impactCard,
        .leaderboardCard,
        .myRankCard,
        .connectNote {
          box-sizing: border-box;
          margin-top: 18px;
          border: 1px solid rgba(255, 205, 80, 0.14);
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.035);
        }

        .stateCard {
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #b7b3aa;
          font-size: 0.84rem;
        }

        .loadingDot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ffc93d;
          box-shadow: 0 0 18px rgba(255, 201, 61, 0.7);
          animation: leaderboardPulse 1.4s ease-in-out infinite;
        }

        .errorCard {
          padding: 20px;
          flex-direction: column;
        }

        .errorCard button,
        .closeButton {
          min-height: 42px;
          padding: 0 16px;
          border: 1px solid rgba(255, 205, 80, 0.2);
          border-radius: 13px;
          background: rgba(255, 201, 61, 0.1);
          color: #ffd66e;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 900;
        }

        .impactCard {
          padding: 20px;
          background:
            radial-gradient(
              circle at 90% 10%,
              rgba(255, 194, 41, 0.18),
              transparent 36%
            ),
            linear-gradient(
              150deg,
              rgba(52, 38, 10, 0.86),
              rgba(19, 19, 18, 0.96)
            );
        }

        .impactTotal {
          display: block;
          margin-top: 8px;
          color: #ffffff;
          font-size: 2.6rem;
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .impactGrid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .impactGrid div {
          padding: 13px 14px;
          display: grid;
          gap: 4px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.04);
        }

        .impactGrid span {
          color: #928e85;
          font-size: 0.7rem;
          font-weight: 750;
        }

        .impactGrid strong {
          font-size: 1.2rem;
        }

        .impactCard p {
          margin: 13px 0 0;
          color: #8f8b83;
          font-size: 0.7rem;
          line-height: 1.55;
          word-break: keep-all;
        }

        .leaderboardCard {
          overflow: hidden;
        }

        .tableHeader {
          padding: 13px 14px;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 66px 88px;
          gap: 8px;
          color: #77736d;
          font-size: 0.61rem;
          font-weight: 900;
          text-align: right;
        }

        .tableHeader span:nth-child(1),
        .tableHeader span:nth-child(2) {
          text-align: left;
        }

        .leaderRows :global(.leaderboardRow) {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .emptyState {
          margin: 0;
          padding: 34px 20px;
          color: #8f8b83;
          font-size: 0.8rem;
          text-align: center;
        }

        .myRankCard {
          padding: 13px 12px 8px;
          border-color: rgba(255, 201, 61, 0.28);
          background: rgba(255, 201, 61, 0.06);
        }

        .myRankLabel {
          display: block;
          padding: 0 4px 5px;
        }

        .connectNote {
          margin-bottom: 0;
          padding: 16px 18px;
          color: #99958d;
          font-size: 0.77rem;
          line-height: 1.5;
          text-align: center;
        }

        .walletModalBackdrop {
          position: fixed;
          z-index: 120;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.78);
          backdrop-filter: blur(9px);
        }

        .walletModal {
          width: min(100%, 420px);
          box-sizing: border-box;
          padding: 24px;
          border: 1px solid rgba(255, 205, 80, 0.2);
          border-radius: 24px;
          background: #151513;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.56);
        }

        .walletModal h2 {
          margin: 7px 0 22px;
          font-size: 1.45rem;
          letter-spacing: -0.035em;
        }

        .walletModal label {
          display: block;
          color: #8c8880;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .walletModal code {
          margin-top: 8px;
          padding: 13px;
          display: block;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: #0b0b0a;
          color: #f3efe4;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.76rem;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .walletModal a {
          min-height: 50px;
          margin-top: 14px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 15px;
          background: linear-gradient(135deg, #ffd24d, #f3ad1f);
          color: #17120a;
          font-size: 0.86rem;
          font-weight: 950;
          text-decoration: none;
        }

        .walletModal p {
          margin: 10px 0 0;
          color: #817d75;
          font-size: 0.69rem;
          text-align: center;
        }

        .closeButton {
          width: 100%;
          margin-top: 18px;
        }

        @keyframes leaderboardPulse {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.86);
          }

          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }

        @media (max-width: 420px) {
          .tableHeader {
            grid-template-columns: 36px minmax(0, 1fr) 58px 78px;
            padding-inline: 10px;
            font-size: 0.56rem;
          }
        }
      `}</style>
    </section>
  );
}

function LeaderboardRow({
  entry,
  locale,
  openLabel,
  onOpen,
  unrankedLabel,
}: {
  entry: PublicLeaderboardEntry;
  locale: Locale;
  openLabel: string;
  onOpen: (entry: PublicLeaderboardEntry) => void;
  unrankedLabel?: string;
}) {
  return (
    <div
      className={`leaderboardRow${
        entry.isCurrentWallet ? ' current' : ''
      }`}
    >
      <span className="rank">
        {entry.rank > 0
          ? rankLabel(entry.rank)
          : unrankedLabel ?? '—'}
      </span>
      <button
        type="button"
        className="walletButton"
        aria-label={openLabel}
        onClick={() => onOpen(entry)}
      >
        <span className="walletAvatar" aria-hidden="true">
          {entry.walletAddress.slice(2, 4).toUpperCase()}
        </span>
        <span>{maskWallet(entry.walletAddress)}</span>
      </button>
      <strong className="completed">
        {entry.completedReferrals.toLocaleString(
          locale === 'ko' ? 'ko-KR' : 'en-US',
        )}
      </strong>
      <strong className="reward">
        {formatRewardWei(entry.totalRewardWei)}
        <small>B3TR</small>
      </strong>

      <style jsx>{`
        .leaderboardRow {
          min-height: 70px;
          padding: 9px 14px;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 66px 88px;
          align-items: center;
          gap: 8px;
        }

        .leaderboardRow.current {
          background: rgba(255, 201, 61, 0.075);
          box-shadow: inset 3px 0 0 #ffc93d;
        }

        .rank {
          color: #d6d1c6;
          font-size: 0.75rem;
          font-weight: 950;
          white-space: nowrap;
        }

        .walletButton {
          min-width: 0;
          padding: 0;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 0;
          background: transparent;
          color: #f4f1e8;
          font: inherit;
          font-size: 0.73rem;
          font-weight: 850;
          text-align: left;
          cursor: pointer;
        }

        .walletButton > span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .walletAvatar {
          flex: 0 0 auto;
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 205, 80, 0.18);
          border-radius: 10px;
          background: rgba(255, 201, 61, 0.09);
          color: #ffc93d;
          font-size: 0.57rem;
          font-weight: 950;
        }

        .completed,
        .reward {
          text-align: right;
          font-size: 0.8rem;
        }

        .reward {
          color: #ffd66e;
        }

        .reward small {
          display: block;
          margin-top: 2px;
          color: #77736d;
          font-size: 0.5rem;
          font-weight: 800;
        }

        @media (max-width: 420px) {
          .leaderboardRow {
            grid-template-columns: 36px minmax(0, 1fr) 58px 78px;
            padding-inline: 10px;
          }

          .walletAvatar {
            display: none;
          }

          .walletButton {
            font-size: 0.68rem;
          }

          .completed,
          .reward {
            font-size: 0.72rem;
          }
        }
      `}</style>
    </div>
  );
}
