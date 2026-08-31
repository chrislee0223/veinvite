'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { getVeChainExplorerTransactionUrl } from '@/lib/vechainExplorer';

const B3TR_SCALE = 10n ** 18n;
const REFRESH_MS = 60_000;

type PayoutItem = {
  payoutId: string;
  roundId: string;
  veBetterRoundId: string | null;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  status: string;
  txId: string | null;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  receiptId: string | null;
  settlementId: string | null;
  finalizedBlockNumber: string | null;
  finalizedHeadNumber: string | null;
  verifiedAt: string | null;
};

type FailureItem = {
  eventId: string;
  payoutId: string;
  roundId: string;
  inviteCode: string;
  fromStatus: string | null;
  toStatus: string;
  attemptCount: number;
  txId: string | null;
  errorMessage: string;
  recordedAt: string;
};

type HistoryResponse = {
  capturedAt: string;
  network: string;
  pipeline: {
    stage: string;
    diagnosis: string;
    queuedCount: number;
    oldestQueuedAt: string | null;
    roundId: string | null;
    veBetterRoundId: string | null;
    manifestId: string | null;
    txId: string | null;
    latestError: string | null;
  };
  summary: {
    trackedPayouts: number;
    paidPayouts: number;
    pendingPayouts: number;
    payoutsWithErrors: number;
    latestPaidAt: string | null;
    latestPaidTxId: string | null;
  };
  recentPayouts: PayoutItem[];
  recentFailures: FailureItem[];
};

function short(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatB3tr(value: string) {
  try {
    const wei = BigInt(value);
    const whole = wei / B3TR_SCALE;
    const fraction = (wei % B3TR_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 6)
      .replace(/0+$/, '');
    return `${whole}${fraction ? `.${fraction}` : ''} B3TR`;
  } catch {
    return `${value} wei`;
  }
}

function formatTime(value: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function explorerNetwork(network: string): 'mainnet' | 'testnet' {
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

function isHistoryResponse(value: unknown): value is HistoryResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.network === 'string' &&
    typeof record.pipeline === 'object' &&
    record.pipeline !== null &&
    typeof record.summary === 'object' &&
    record.summary !== null &&
    Array.isArray(record.recentPayouts) &&
    Array.isArray(record.recentFailures)
  );
}

function errorMessage(body: unknown, status: number) {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }
  return `Payout observability request failed (${status}).`;
}

function stageTone(stage: string) {
  if (stage === 'ATTENTION_REQUIRED') {
    return {
      border: 'rgba(255,120,120,.38)',
      background: 'rgba(255,95,95,.08)',
      text: '#ffb5b5',
    };
  }
  if (stage === 'IDLE' || stage === 'SETTLED') {
    return {
      border: 'rgba(124,235,177,.3)',
      background: 'rgba(92,220,155,.07)',
      text: '#a9f2cc',
    };
  }
  return {
    border: 'rgba(247,201,40,.32)',
    background: 'rgba(247,201,40,.07)',
    text: '#f7d86b',
  };
}

export function RewardPayoutHistoryClient() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/admin/rewards/history?limit=30',
        { cache: 'no-store' },
      );
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }

      if (!response.ok) {
        throw new Error(errorMessage(body, response.status));
      }
      if (!isHistoryResponse(body)) {
        throw new Error('Payout observability returned an invalid response.');
      }

      setData(body);
      setError('');
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Payout observability could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const tone = stageTone(data?.pipeline.stage ?? 'IDLE');

  return (
    <section
      style={{
        width: 'min(1120px, calc(100% - 28px))',
        margin: '24px auto',
        padding: '20px',
        boxSizing: 'border-box',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '20px',
        background: 'rgba(255,255,255,.035)',
        color: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '14px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              color: '#f7c928',
              fontSize: '12px',
              fontWeight: 900,
              letterSpacing: '.06em',
            }}
          >
            PAYOUT OBSERVABILITY
          </div>
          <h2 style={{ margin: '5px 0 4px', fontSize: '20px' }}>
            지급 이력 및 진단 / Payout history & diagnostics
          </h2>
          <p
            style={{
              margin: 0,
              color: 'rgba(255,255,255,.63)',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            첫 실제 지급부터 TX, finality, receipt, 실패 원인을 한 화면에서 추적합니다.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          style={{
            minHeight: '40px',
            padding: '0 14px',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: '12px',
            background: 'rgba(255,255,255,.055)',
            color: '#fff',
            fontWeight: 800,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '확인 중…' : '새로고침'}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            border: '1px solid rgba(255,120,120,.28)',
            borderRadius: '12px',
            background: 'rgba(255,90,90,.07)',
            color: '#ffb8b8',
            fontSize: '13px',
            overflowWrap: 'anywhere',
          }}
        >
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div
            style={{
              marginTop: '16px',
              padding: '15px',
              border: `1px solid ${tone.border}`,
              borderRadius: '15px',
              background: tone.background,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ color: tone.text }}>
                {data.pipeline.stage}
              </strong>
              <span style={{ color: 'rgba(255,255,255,.52)', fontSize: '12px' }}>
                Queue {data.pipeline.queuedCount}
              </span>
              {data.pipeline.veBetterRoundId ? (
                <span style={{ color: 'rgba(255,255,255,.52)', fontSize: '12px' }}>
                  VeBetter #{data.pipeline.veBetterRoundId}
                </span>
              ) : null}
            </div>
            <p
              style={{
                margin: '8px 0 0',
                color: 'rgba(255,255,255,.78)',
                fontSize: '13px',
                lineHeight: 1.55,
              }}
            >
              {data.pipeline.diagnosis}
            </p>
            {data.pipeline.latestError ? (
              <p
                style={{
                  margin: '8px 0 0',
                  color: '#ffb8b8',
                  fontSize: '12px',
                  overflowWrap: 'anywhere',
                }}
              >
                Stored error: {data.pipeline.latestError}
              </p>
            ) : null}
            {data.pipeline.txId ? (
              <a
                href={getVeChainExplorerTransactionUrl(
                  data.pipeline.txId,
                  explorerNetwork(data.network),
                )}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: '9px',
                  color: '#f7d86b',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                현재 TX Explorer ↗
              </a>
            ) : null}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
              gap: '10px',
              marginTop: '14px',
            }}
          >
            {[
              ['추적 지급', data.summary.trackedPayouts],
              ['지급 완료', data.summary.paidPayouts],
              ['처리 중', data.summary.pendingPayouts],
              ['오류 기록', data.summary.payoutsWithErrors],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                style={{
                  padding: '12px',
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: '13px',
                  background: 'rgba(255,255,255,.025)',
                }}
              >
                <div style={{ color: 'rgba(255,255,255,.52)', fontSize: '11px' }}>
                  {label}
                </div>
                <strong style={{ display: 'block', marginTop: '4px', fontSize: '19px' }}>
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>
              최근 지급 / Recent payouts
            </h3>
            {data.recentPayouts.length < 1 ? (
              <div
                style={{
                  padding: '14px',
                  border: '1px dashed rgba(255,255,255,.14)',
                  borderRadius: '13px',
                  color: 'rgba(255,255,255,.55)',
                  fontSize: '13px',
                }}
              >
                아직 실제 지급 이력이 없습니다. 첫 지급이 발생하면 TX와 finality가 여기에 표시됩니다.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '9px' }}>
                {data.recentPayouts.map((payout) => (
                  <article
                    key={payout.payoutId}
                    style={{
                      padding: '13px',
                      border: '1px solid rgba(255,255,255,.09)',
                      borderRadius: '14px',
                      background: 'rgba(0,0,0,.12)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong>{formatB3tr(payout.amountWei)}</strong>
                        <div
                          style={{
                            marginTop: '4px',
                            color: 'rgba(255,255,255,.55)',
                            fontSize: '11px',
                          }}
                        >
                          {payout.inviteCode} · {short(payout.recipientWallet)}
                          {payout.veBetterRoundId
                            ? ` · VeBetter #${payout.veBetterRoundId}`
                            : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong
                          style={{
                            color:
                              payout.status === 'PAID'
                                ? '#a9f2cc'
                                : payout.errorMessage
                                  ? '#ffb5b5'
                                  : '#f7d86b',
                            fontSize: '12px',
                          }}
                        >
                          {payout.status}
                        </strong>
                        <div
                          style={{
                            marginTop: '4px',
                            color: 'rgba(255,255,255,.45)',
                            fontSize: '10px',
                          }}
                        >
                          {formatTime(payout.paidAt ?? payout.updatedAt)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '9px',
                        flexWrap: 'wrap',
                        color: 'rgba(255,255,255,.55)',
                        fontSize: '11px',
                      }}
                    >
                      <span>Attempts {payout.attemptCount}</span>
                      {payout.finalizedBlockNumber ? (
                        <span>Block #{payout.finalizedBlockNumber}</span>
                      ) : null}
                      {payout.finalizedHeadNumber ? (
                        <span>Finalized #{payout.finalizedHeadNumber}</span>
                      ) : null}
                      {payout.receiptId ? <span>Receipt ✓</span> : null}
                    </div>

                    {payout.txId ? (
                      <a
                        href={getVeChainExplorerTransactionUrl(
                          payout.txId,
                          explorerNetwork(data.network),
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={payout.txId}
                        style={{
                          display: 'inline-block',
                          marginTop: '8px',
                          color: '#f7d86b',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {short(payout.txId, 12, 8)} · Explorer ↗
                      </a>
                    ) : null}

                    {payout.errorMessage ? (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '9px 10px',
                          borderRadius: '10px',
                          background: 'rgba(255,85,85,.06)',
                          color: '#ffb8b8',
                          fontSize: '11px',
                          lineHeight: 1.45,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {payout.errorMessage}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          {data.recentFailures.length > 0 ? (
            <details style={{ marginTop: '18px' }}>
              <summary
                style={{
                  cursor: 'pointer',
                  color: '#ffb8b8',
                  fontSize: '13px',
                  fontWeight: 850,
                }}
              >
                최근 실패 기록 / Recent failure events ({data.recentFailures.length})
              </summary>
              <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                {data.recentFailures.map((failure) => (
                  <div
                    key={failure.eventId}
                    style={{
                      padding: '10px',
                      border: '1px solid rgba(255,110,110,.15)',
                      borderRadius: '11px',
                      color: 'rgba(255,255,255,.7)',
                      fontSize: '11px',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ color: '#ffb8b8' }}>
                      {failure.inviteCode} · {failure.toStatus}
                    </strong>
                    <div>{failure.errorMessage}</div>
                    <div style={{ marginTop: '4px', color: 'rgba(255,255,255,.4)' }}>
                      {formatTime(failure.recordedAt)} · attempt {failure.attemptCount}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div
            style={{
              marginTop: '13px',
              color: 'rgba(255,255,255,.38)',
              fontSize: '10px',
            }}
          >
            Read-only · {data.network} · checked {formatTime(data.capturedAt)}
          </div>
        </>
      ) : null}
    </section>
  );
}
