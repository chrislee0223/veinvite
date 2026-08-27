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
              참가자 현황 / Participants
            </h1>
            <p
              style={{
                margin: 0,
                opacity: 0.72,
                lineHeight: 1.5,
              }}
            >
              신규·복귀·활성 기존 유저 판정과 미션·보상 상태를 확인합니다.
              <br />
              View entry classification, mission progress, and reward status.
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
