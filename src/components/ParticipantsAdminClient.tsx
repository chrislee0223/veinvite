'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useWallet } from '@vechain/vechain-kit';

import { WalletControl } from '@/components/WalletControl';

type EntryClass =
  | 'NEW'
  | 'RETURNING'
  | 'ACTIVE_EXISTING'
  | 'UNKNOWN';

type Participant = {
  eligibilityCheckId: string;
  walletAddress: string;
  inviteCode: string;
  entryClass: EntryClass;
  outcome: string;
  checkedBlock: string;
  checkedAt: string;
  inviterWallet: string | null;
  invitationStatus: string | null;
  activatedAt: string | null;
  updatedAt: string | null;
  mission: {
    appsCompleted: number;
    appsRequired: number;
    rewardsReceived: number;
    rewardsRequired: number;
    vot3Converted: boolean;
    voteCompleted: boolean;
    lastSyncedAt: string | null;
  } | null;
  reward: {
    rewardStatus: string;
    rewardEligibleAt: string | null;
    rewardPaidAt: string | null;
    queueStatus: string | null;
    assignedRoundId: string | null;
    queuedAt: string | null;
    assignedAt: string | null;
  } | null;
  sybil: {
    status: string | null;
    riskLevel: string | null;
  } | null;
};

type GrowthRow = {
  roundId: string;
  verifiedNewUsers: string;
  activatedNewUsers: string;
  flaggedNewUsers: string;
  verifiedReturningUsers: string;
  activatedReturningUsers: string;
  activeExistingRejectedUsers: string;
  activeExistingRejectionAttempts: string;
  cumulativeVerifiedNewUsers: string;
  cumulativeActivatedNewUsers: string;
  cumulativeFlaggedNewUsers: string;
  cumulativeVerifiedReturningUsers: string;
  cumulativeActivatedReturningUsers: string;
  cumulativeActiveExistingRejectedUsers: string;
  cumulativeActiveExistingRejectionAttempts: string;
  firstVerifiedEntryAt: string | null;
  latestVerifiedEntryAt: string | null;
};

type ParticipantOverview = {
  network: string;
  verifiedOperator: string;
  generatedAt: string;
  summary: {
    newUsers: number;
    returningUsers: number;
    activeExistingUsers: number;
    queuedRewards: number;
  };
  growth: {
    metricDefinition: string;
    currentRound: {
      id: string;
      status: string;
      startAt: string;
      endAt: string;
      endAtEstimated: boolean;
      checkedThroughBlock: string;
    };
    current: GrowthRow | null;
    previous: GrowthRow | null;
    trend: GrowthRow[];
    publicReporting: {
      enabled: boolean;
      startAt: string | null;
      baselineRoundId: string | null;
      lockedAt: string | null;
      current: GrowthRow | null;
      previous: GrowthRow | null;
      trend: GrowthRow[];
    };
  };
  participants: Participant[];
};

type Filter =
  | 'ALL'
  | 'NEW'
  | 'RETURNING'
  | 'ACTIVE_EXISTING';

function shortAddress(value: string) {
  if (value.length < 16) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function classLabel(entryClass: EntryClass) {
  switch (entryClass) {
    case 'NEW':
      return '신규 / New';
    case 'RETURNING':
      return '복귀 / Returning';
    case 'ACTIVE_EXISTING':
      return '활성 기존 / Active existing';
    default:
      return '확인 필요 / Unknown';
  }
}

function filterLabel(filter: Filter) {
  switch (filter) {
    case 'NEW':
      return '신규 / New';
    case 'RETURNING':
      return '복귀 / Returning';
    case 'ACTIVE_EXISTING':
      return '활성 기존 / Active';
    default:
      return '전체 / All';
  }
}

function yesNo(value: boolean) {
  return value ? '완료 / Done' : '대기 / Pending';
}

function formatCount(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed)
    ? parsed.toLocaleString('ko-KR')
    : value;
}

export function ParticipantsAdminClient() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  const [overview, setOverview] =
    useState<ParticipantOverview | null>(null);
  const [filter, setFilter] =
    useState<Filter>('ALL');
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');
  const [copiedLanguage, setCopiedLanguage] =
    useState<'ko' | 'en' | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress) {
      setOverview(null);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        '/api/admin/participants',
        { cache: 'no-store' },
      );
      const data =
        (await response.json()) as
          | ParticipantOverview
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Participant overview could not be loaded.',
        );
      }

      setOverview(data as ParticipantOverview);
    } catch (loadError) {
      console.error(
        'Failed to load participant overview:',
        loadError,
      );
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Participant overview could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredParticipants = useMemo(() => {
    if (!overview) {
      return [];
    }

    if (filter === 'ALL') {
      return overview.participants;
    }

    return overview.participants.filter(
      (participant) =>
        participant.entryClass === filter,
    );
  }, [filter, overview]);

  const filters: Filter[] = [
    'ALL',
    'NEW',
    'RETURNING',
    'ACTIVE_EXISTING',
  ];

  const growthCopy = useMemo(() => {
    const publicReporting =
      overview?.growth.publicReporting;
    const current = publicReporting?.current;

    if (
      !overview ||
      !publicReporting?.enabled ||
      !current
    ) {
      return null;
    }

    const roundId =
      overview.growth.currentRound.id;
    const currentActivatedNew = formatCount(
      current.activatedNewUsers,
    );
    const currentActivatedReturning = formatCount(
      current.activatedReturningUsers,
    );
    const cumulativeActivatedNew = formatCount(
      current.cumulativeActivatedNewUsers,
    );
    const cumulativeActivatedReturning = formatCount(
      current.cumulativeActivatedReturningUsers,
    );
    const isActive =
      overview.growth.currentRound.status ===
      'ACTIVE';

    return {
      ko:
        `VeBetterDAO 라운드 ${roundId}에 VeInvite로 유입된 사용자 중 현재까지 신규 ${currentActivatedNew}명과 복귀 ${currentActivatedReturning}명이 마지막 미션까지 모두 완료하고 Sybil 검증을 통과했습니다. ` +
        `공식 집계 시작 이후 누적 완료자는 신규 ${cumulativeActivatedNew}명, 복귀 ${cumulativeActivatedReturning}명입니다.` +
        (isActive
          ? ' 이번 라운드 수치는 종료 전 잠정치입니다.'
          : ''),
      en:
        `Among users who entered through VeInvite in VeBetterDAO Round ${roundId}, ${currentActivatedNew} new user(s) and ${currentActivatedReturning} returning user(s) have completed every onboarding mission and passed Sybil screening so far. ` +
        `Since the official reporting baseline, cumulative completions are ${cumulativeActivatedNew} new user(s) and ${cumulativeActivatedReturning} returning user(s).` +
        (isActive
          ? ' This round is provisional until it closes.'
          : ''),
    };
  }, [overview]);

  const copyGrowthMessage = useCallback(
    async (language: 'ko' | 'en') => {
      const message = growthCopy?.[language];

      if (!message) {
        return;
      }

      try {
        await window.navigator.clipboard.writeText(
          message,
        );
        setCopiedLanguage(language);
      } catch (copyError) {
        console.error(
          'Failed to copy growth message:',
          copyError,
        );
      }
    },
    [growthCopy],
  );

  return (
    <main
      style={{
        minHeight: '100dvh',
        background:
          'linear-gradient(180deg, #171024 0%, #0f0b18 100%)',
        color: '#ffffff',
        padding: '24px 16px 48px',
      }}
    >
      <div
        style={{
          width: 'min(1120px, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: '20px',
        }}
      >
        <header
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                color: '#ffb84d',
                fontWeight: 800,
                fontSize: '13px',
                letterSpacing: '0.08em',
              }}
            >
              VEINVITE ADMIN
            </div>
            <h1
              style={{
                margin: '6px 0 4px',
                fontSize: 'clamp(26px, 5vw, 40px)',
              }}
            >
              성장·참가자 현황 / Growth & Participants
            </h1>
            <p
              style={{
                margin: 0,
                opacity: 0.72,
                lineHeight: 1.5,
              }}
            >
              라운드별 신규 유입 성장과 유저 판정·미션·보상 상태를 확인합니다.
              <br />
              View round-based growth, entry classification, missions, and rewards.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/admin/rewards"
              style={{
                color: '#ffffff',
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '12px',
                padding: '10px 14px',
              }}
            >
              보상 관리 / Rewards
            </Link>
            <WalletControl />
          </div>
        </header>

        {!walletAddress ? (
          <section
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '18px',
              padding: '24px',
              lineHeight: 1.6,
            }}
          >
            운영자 지갑을 연결해 주세요.
            <br />
            Connect the VeInvite operator wallet to continue.
          </section>
        ) : null}

        {walletAddress && loading && !overview ? (
          <section
            style={{
              borderRadius: '18px',
              padding: '24px',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            참가자 정보를 불러오는 중입니다. / Loading participant data…
          </section>
        ) : null}

        {walletAddress && error ? (
          <section
            style={{
              border: '1px solid rgba(255,184,77,0.45)',
              borderRadius: '18px',
              padding: '20px',
              background: 'rgba(255,184,77,0.08)',
              display: 'grid',
              gap: '12px',
            }}
          >
            <strong>
              참가자 정보를 불러오지 못했습니다. / Could not load participants.
            </strong>
            <span style={{ opacity: 0.8 }}>
              {error}
            </span>
            <button
              type="button"
              onClick={() => {
                void load();
              }}
              style={{
                justifySelf: 'start',
                border: 0,
                borderRadius: '12px',
                padding: '10px 14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              다시 시도 / Retry
            </button>
          </section>
        ) : null}

        {overview ? (
          <>
            {overview.growth.current ? (
              <section
                style={{
                  border: '1px solid rgba(255,184,77,0.28)',
                  background:
                    'linear-gradient(145deg, rgba(255,184,77,0.12), rgba(116,72,255,0.09))',
                  borderRadius: '22px',
                  padding: '20px',
                  display: 'grid',
                  gap: '18px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: '#ffca78',
                        fontSize: '12px',
                        fontWeight: 900,
                        letterSpacing: '0.06em',
                      }}
                    >
                      VERIFIED GROWTH
                    </div>
                    <h2
                      style={{
                        margin: '5px 0 4px',
                        fontSize: '24px',
                      }}
                    >
                      신규 유입 성장 / New-user growth
                    </h2>
                    <div
                      style={{
                        opacity: 0.68,
                        fontSize: '13px',
                      }}
                    >
                      VeBetterDAO Round {overview.growth.currentRound.id} ·{' '}
                      {overview.growth.currentRound.status}
                    </div>
                  </div>
                  <div
                    style={{
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: '12px',
                      padding: '9px 12px',
                      fontSize: '12px',
                      opacity: 0.75,
                    }}
                  >
                    기준 블록 / Through block{' '}
                    {overview.growth.currentRound.checkedThroughBlock}
                  </div>
                </div>

                <div
                  style={{
                    border: overview.growth.publicReporting.enabled
                      ? '1px solid rgba(88,214,141,0.35)'
                      : '1px solid rgba(255,184,77,0.35)',
                    borderRadius: '13px',
                    padding: '11px 13px',
                    background: overview.growth.publicReporting.enabled
                      ? 'rgba(88,214,141,0.08)'
                      : 'rgba(255,184,77,0.08)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  {overview.growth.publicReporting.enabled ? (
                    <>
                      공식 집계 기준선 잠금 완료: Round{' '}
                      {overview.growth.publicReporting.baselineRoundId} ·{' '}
                      {formatDate(
                        overview.growth.publicReporting.startAt,
                      )}
                      <br />
                      Official reporting baseline locked.
                    </>
                  ) : (
                    <>
                      공식 공개 통계는 아직 비활성입니다. 시작 라운드를 승인해
                      기준선을 잠그기 전에는 아래 완료 수치를 외부에 공개하지
                      않습니다.
                      <br />
                      Public reporting remains disabled until the launch round
                      is approved and locked.
                    </>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(155px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {[
                    [
                      '이번 라운드 유입 신규 완료',
                      'Completed new · entry cohort',
                      overview.growth.publicReporting.current
                        ?.activatedNewUsers ?? '—',
                    ],
                    [
                      '누적 완료 신규',
                      'Cumulative completed new',
                      overview.growth.publicReporting.current
                        ?.cumulativeActivatedNewUsers ?? '—',
                    ],
                    [
                      '이번 라운드 유입 복귀 완료',
                      'Completed returning · entry cohort',
                      overview.growth.publicReporting.current
                        ?.activatedReturningUsers ?? '—',
                    ],
                    [
                      '누적 완료 복귀',
                      'Cumulative completed returning',
                      overview.growth.publicReporting.current
                        ?.cumulativeActivatedReturningUsers ?? '—',
                    ],
                    [
                      '검증 신규 진입 · 내부 퍼널',
                      'Verified new entries · internal',
                      overview.growth.current.verifiedNewUsers,
                    ],
                    [
                      '검증 복귀 진입 · 내부 퍼널',
                      'Verified returning entries · internal',
                      overview.growth.current.verifiedReturningUsers,
                    ],
                    [
                      'Sybil 확인 필요 신규',
                      'Flagged new users',
                      overview.growth.current.flaggedNewUsers,
                    ],
                    [
                      '조건 미충족 거절 지갑',
                      `Rejected wallets · ${formatCount(overview.growth.current.activeExistingRejectionAttempts)} attempts`,
                      overview.growth.current.activeExistingRejectedUsers,
                    ],
                  ].map(([ko, en, value]) => (
                    <div
                      key={String(ko)}
                      style={{
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        background: 'rgba(7,9,18,0.34)',
                        padding: '15px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          opacity: 0.72,
                          lineHeight: 1.4,
                        }}
                      >
                        {ko}
                        <br />
                        {en}
                      </div>
                      <strong
                        style={{
                          display: 'block',
                          marginTop: '6px',
                          fontSize: '28px',
                        }}
                      >
                        {formatCount(String(value))}
                      </strong>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    overflowX: 'auto',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: '15px',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      minWidth: '1100px',
                      borderCollapse: 'collapse',
                      fontSize: '13px',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: 'rgba(0,0,0,0.2)',
                          textAlign: 'left',
                        }}
                      >
                        {[
                          'Round',
                          '유입 신규 완료 / Completed new cohort',
                          '유입 복귀 완료 / Completed returning cohort',
                          '검증 신규 / Verified new (internal)',
                          '검증 복귀 / Verified returning (internal)',
                          '거절 지갑 / Rejected',
                          '누적 완료 신규 / Cumulative new',
                          '누적 완료 복귀 / Cumulative returning',
                        ].map((label) => (
                          <th
                            key={label}
                            style={{
                              padding: '11px 12px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {overview.growth.trend
                        .slice(0, 8)
                        .map((row) => {
                          const publicRow =
                            overview.growth.publicReporting.trend.find(
                              (candidate) =>
                                candidate.roundId === row.roundId,
                            ) ?? null;

                          return (
                            <tr
                              key={row.roundId}
                              style={{
                                borderTop:
                                  '1px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              {[
                                row.roundId,
                                publicRow?.activatedNewUsers ?? '—',
                                publicRow?.activatedReturningUsers ?? '—',
                                row.verifiedNewUsers,
                                row.verifiedReturningUsers,
                                row.activeExistingRejectedUsers,
                                publicRow?.cumulativeActivatedNewUsers ?? '—',
                                publicRow?.cumulativeActivatedReturningUsers ??
                                  '—',
                              ].map((value, index) => (
                                <td
                                  key={`${row.roundId}-${index}`}
                                  style={{
                                    padding: '11px 12px',
                                  }}
                                >
                                  {formatCount(value)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {growthCopy ? (
                  <div
                    style={{
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    {(['ko', 'en'] as const).map(
                      (language) => (
                        <div
                          key={language}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '13px',
                            borderRadius: '14px',
                            background: 'rgba(0,0,0,0.2)',
                            fontSize: '13px',
                            lineHeight: 1.55,
                          }}
                        >
                          <span>{growthCopy[language]}</span>
                          <button
                            type="button"
                            onClick={() => {
                              void copyGrowthMessage(language);
                            }}
                            style={{
                              flex: '0 0 auto',
                              border:
                                '1px solid rgba(255,255,255,0.14)',
                              background: 'rgba(255,255,255,0.05)',
                              color: '#ffffff',
                              borderRadius: '10px',
                              padding: '8px 10px',
                            }}
                          >
                            {copiedLanguage === language
                              ? '복사됨 / Copied'
                              : '복사 / Copy'}
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                ) : null}

                <p
                  style={{
                    margin: 0,
                    opacity: 0.62,
                    fontSize: '12px',
                    lineHeight: 1.55,
                  }}
                >
                  {overview.growth.metricDefinition}
                  <br />
                  공개 성과는 마지막 미션까지 완료하고 Sybil CLEAR인 신규·복귀
                  사용자만 사용합니다. 검증 진입 수는 내부 퍼널로만 표시합니다. /
                  Public impact includes only new and returning users who
                  completed every mission and received Sybil CLEAR; verified
                  entries remain an internal funnel metric.
                </p>
              </section>
            ) : null}

            <h2
              style={{
                margin: '4px 0 -8px',
                fontSize: '20px',
              }}
            >
              참가자 기록 / Participant records
            </h2>

            <section
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '12px',
              }}
            >
              {[
                [
                  '신규 / New',
                  overview.summary.newUsers,
                ],
                [
                  '복귀 / Returning',
                  overview.summary.returningUsers,
                ],
                [
                  '활성 기존 / Active',
                  overview.summary.activeExistingUsers,
                ],
                [
                  '보상 대기 / Queued',
                  overview.summary.queuedRewards,
                ],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '16px',
                    padding: '18px',
                  }}
                >
                  <div
                    style={{
                      opacity: 0.7,
                      fontSize: '13px',
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: '30px',
                      fontWeight: 900,
                      marginTop: '4px',
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </section>

            <section
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                {filters.map((item) => {
                  const active = item === filter;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      style={{
                        border: active
                          ? '1px solid #ffb84d'
                          : '1px solid rgba(255,255,255,0.14)',
                        background: active
                          ? 'rgba(255,184,77,0.14)'
                          : 'rgba(255,255,255,0.04)',
                        color: '#ffffff',
                        borderRadius: '999px',
                        padding: '9px 13px',
                        cursor: 'pointer',
                        fontWeight: active ? 800 : 600,
                      }}
                    >
                      {filterLabel(item)}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  void load();
                }}
                disabled={loading}
                style={{
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#ffffff',
                  borderRadius: '12px',
                  padding: '9px 13px',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.55 : 1,
                }}
              >
                {loading
                  ? '새로고침 중… / Refreshing…'
                  : '새로고침 / Refresh'}
              </button>
            </section>

            <section
              style={{
                display: 'grid',
                gap: '12px',
              }}
            >
              {filteredParticipants.length === 0 ? (
                <div
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '18px',
                    padding: '24px',
                    opacity: 0.75,
                  }}
                >
                  표시할 기록이 없습니다. / No records to show.
                </div>
              ) : null}

              {filteredParticipants.map(
                (participant) => (
                  <article
                    key={participant.eligibilityCheckId}
                    style={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '18px',
                      padding: '18px',
                      display: 'grid',
                      gap: '14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            fontSize: '17px',
                          }}
                        >
                          {shortAddress(
                            participant.walletAddress,
                          )}
                        </strong>
                        <div
                          style={{
                            opacity: 0.62,
                            fontSize: '12px',
                            marginTop: '3px',
                            wordBreak: 'break-all',
                          }}
                        >
                          {participant.walletAddress}
                        </div>
                      </div>

                      <div
                        style={{
                          border: '1px solid rgba(255,184,77,0.45)',
                          color: '#ffd08a',
                          borderRadius: '999px',
                          padding: '7px 11px',
                          fontSize: '12px',
                          fontWeight: 800,
                        }}
                      >
                        {classLabel(
                          participant.entryClass,
                        )}
                      </div>
                    </div>

                    {participant.mission ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(145px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        {[
                          [
                            'dApp',
                            `${participant.mission.appsCompleted}/${participant.mission.appsRequired}`,
                          ],
                          [
                            'B3TR',
                            `${participant.mission.rewardsReceived}/${participant.mission.rewardsRequired}`,
                          ],
                          [
                            'VOT3',
                            yesNo(
                              participant.mission.vot3Converted,
                            ),
                          ],
                          [
                            'Vote',
                            yesNo(
                              participant.mission.voteCompleted,
                            ),
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            style={{
                              borderRadius: '12px',
                              background: 'rgba(0,0,0,0.18)',
                              padding: '12px',
                            }}
                          >
                            <div
                              style={{
                                opacity: 0.6,
                                fontSize: '11px',
                              }}
                            >
                              {label}
                            </div>
                            <strong>
                              {value}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          borderRadius: '12px',
                          background: 'rgba(0,0,0,0.18)',
                          padding: '12px',
                          opacity: 0.78,
                        }}
                      >
                        최근 활동이 확인되어 초대는 사용되지 않았습니다.
                        <br />
                        Recent activity was found, so the invite was not consumed.
                      </div>
                    )}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '8px 20px',
                        fontSize: '13px',
                        lineHeight: 1.55,
                      }}
                    >
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          초대 코드 / Invite
                        </span>
                        <br />
                        <strong>{participant.inviteCode}</strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          초대 상태 / Invite status
                        </span>
                        <br />
                        <strong>
                          {participant.invitationStatus ?? 'NOT_CONSUMED'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          보상 상태 / Reward
                        </span>
                        <br />
                        <strong>
                          {participant.reward?.queueStatus ??
                            participant.reward?.rewardStatus ??
                            'NOT_ELIGIBLE'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          Sybil
                        </span>
                        <br />
                        <strong>
                          {participant.sybil?.status ?? '—'}
                          {participant.sybil?.riskLevel
                            ? ` · ${participant.sybil.riskLevel}`
                            : ''}
                        </strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          자격 확인 / Checked
                        </span>
                        <br />
                        <strong>
                          {formatDate(participant.checkedAt)}
                        </strong>
                      </div>
                      <div>
                        <span style={{ opacity: 0.6 }}>
                          마지막 미션 동기화 / Last mission sync
                        </span>
                        <br />
                        <strong>
                          {formatDate(
                            participant.mission?.lastSyncedAt ?? null,
                          )}
                        </strong>
                      </div>
                    </div>
                  </article>
                ),
              )}
            </section>

            <footer
              style={{
                opacity: 0.55,
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              Network: {overview.network} · Operator:{' '}
              {shortAddress(overview.verifiedOperator)} · Updated:{' '}
              {formatDate(overview.generatedAt)}
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
