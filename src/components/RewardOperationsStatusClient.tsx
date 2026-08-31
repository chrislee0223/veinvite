'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

const TOKEN_SCALE = 10n ** 18n;
const REFRESH_INTERVAL_MS = 60_000;

type Severity =
  | 'NORMAL'
  | 'WARNING'
  | 'CRITICAL';

type OperationsAlert = {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
};

type OperationsStatus = {
  capturedAt: string;
  network: string;
  severity: Severity;
  operational: boolean;
  alerts: OperationsAlert[];
  distributor: {
    address: string | null;
    automaticRewardsEnabled: boolean;
    configured: boolean;
    registered: boolean;
    vthoWei: string | null;
    gasStatus: string;
  };
  runtime: {
    funded: boolean;
    emergencyPaused: boolean;
    distributionPaused: boolean;
  };
  pool: {
    effectiveRewardPoolWei: string;
    rewardsPoolEnabled: boolean;
    expectedCompletions: number | null;
    stressCompletions: number | null;
    rewardPerInviteWei: string | null;
    maxImmediatelyPayableCount: string | null;
  };
  queue: {
    queuedCount: number;
    oldestQueuedAt: string | null;
    oldestQueuedAgeSeconds: number | null;
  };
  payoutPipeline: {
    activeRoundId: string | null;
    activeRoundStatus: string | null;
    activeRoundAgeSeconds: number | null;
    oldestUnsettledSignedTxId: string | null;
    oldestUnsettledSignedTxAgeSeconds: number | null;
  };
};

function isOperationsStatus(
  value: unknown,
): value is OperationsStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<
    string,
    unknown
  >;

  return (
    typeof record.capturedAt === 'string' &&
    typeof record.network === 'string' &&
    typeof record.severity === 'string' &&
    typeof record.operational === 'boolean' &&
    Array.isArray(record.alerts) &&
    typeof record.distributor === 'object' &&
    record.distributor !== null &&
    typeof record.pool === 'object' &&
    record.pool !== null &&
    typeof record.queue === 'object' &&
    record.queue !== null
  );
}

function formatTokenWei(
  value: string | null,
  symbol: string,
) {
  if (value === null) {
    return '—';
  }

  try {
    const amount = BigInt(value);
    const whole = amount / TOKEN_SCALE;
    const fraction = (amount % TOKEN_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 3)
      .replace(/0+$/, '');

    return `${whole.toLocaleString()}${
      fraction ? `.${fraction}` : ''
    } ${symbol}`;
  } catch {
    return '—';
  }
}

function shortAddress(value: string | null) {
  if (!value) {
    return '—';
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatAge(seconds: number | null) {
  if (seconds === null) {
    return '—';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return `${hours}h ${remainderMinutes}m`;
}

async function readResponse(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readError(
  body: unknown,
  status: number,
) {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }

  return `Reward operations request failed (${status}).`;
}

function statusLabel(severity: Severity) {
  if (severity === 'CRITICAL') {
    return '조치 필요 / Action required';
  }

  if (severity === 'WARNING') {
    return '주의 / Warning';
  }

  return '정상 / Healthy';
}

function statusColor(severity: Severity) {
  if (severity === 'CRITICAL') {
    return '#ff7a7a';
  }

  if (severity === 'WARNING') {
    return '#f7c928';
  }

  return '#8de2a8';
}

export function RewardOperationsStatusClient() {
  const [status, setStatus] =
    useState<OperationsStatus | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [errorMessage, setErrorMessage] =
    useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/admin/rewards/operations',
        { cache: 'no-store' },
      );
      const body = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          readError(body, response.status),
        );
      }

      if (!isOperationsStatus(body)) {
        throw new Error(
          'Reward operations returned an invalid response.',
        );
      }

      setStatus(body);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Reward operations status could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(
      () => {
        void refresh();
      },
      REFRESH_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh]);

  const panel: React.CSSProperties = {
    margin: '20px auto',
    width: 'min(980px, calc(100% - 32px))',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '18px',
    background: 'rgba(255,255,255,0.045)',
    padding: '20px',
    display: 'grid',
    gap: '16px',
  };

  const metricGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  };

  const metric: React.CSSProperties = {
    borderRadius: '14px',
    background: 'rgba(0,0,0,0.2)',
    padding: '14px',
    display: 'grid',
    gap: '5px',
  };

  return (
    <section style={panel}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 850,
            }}
          >
            자동 보상 운영 상태 / Reward Operations
          </div>
          <div
            style={{
              marginTop: '4px',
              color: 'rgba(255,255,255,0.62)',
              fontSize: '13px',
            }}
          >
            Reward Distributor, VTHO, reward pool, queue and finality health
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            minHeight: '40px',
            borderRadius: '12px',
            border:
              '1px solid rgba(255,255,255,0.14)',
            background:
              'rgba(255,255,255,0.06)',
            color: '#fff',
            padding: '0 14px',
            cursor: loading
              ? 'wait'
              : 'pointer',
          }}
        >
          {loading
            ? '확인 중… / Checking…'
            : '새로고침 / Refresh'}
        </button>
      </div>

      {errorMessage ? (
        <div
          style={{
            borderRadius: '12px',
            background: 'rgba(255,90,90,0.12)',
            padding: '12px',
            color: '#ffb0b0',
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {status ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: 800,
              color: statusColor(status.severity),
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '999px',
                background:
                  statusColor(status.severity),
              }}
            />
            {statusLabel(status.severity)}
          </div>

          <div style={metricGrid}>
            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                Reward Distributor
              </span>
              <strong>
                {shortAddress(
                  status.distributor.address,
                )}
              </strong>
              <span>
                {status.distributor.registered
                  ? 'Registered ✓'
                  : 'Not registered'}
              </span>
            </div>

            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                Gas reserve
              </span>
              <strong>
                {formatTokenWei(
                  status.distributor.vthoWei,
                  'VTHO',
                )}
              </strong>
              <span>
                {status.distributor.gasStatus}
              </span>
            </div>

            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                User reward pool
              </span>
              <strong>
                {formatTokenWei(
                  status.pool
                    .effectiveRewardPoolWei,
                  'B3TR',
                )}
              </strong>
              <span>
                Stress target:{' '}
                {status.pool.stressCompletions ?? '—'}
              </span>
            </div>

            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                Reward queue
              </span>
              <strong>
                {status.queue.queuedCount} queued
              </strong>
              <span>
                Oldest:{' '}
                {formatAge(
                  status.queue
                    .oldestQueuedAgeSeconds,
                )}
              </span>
            </div>

            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                Forecast reward
              </span>
              <strong>
                {formatTokenWei(
                  status.pool.rewardPerInviteWei,
                  'B3TR',
                )}
              </strong>
              <span>
                Immediate capacity:{' '}
                {status.pool
                  .maxImmediatelyPayableCount ?? '—'}
              </span>
            </div>

            <div style={metric}>
              <span
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: '12px',
                }}
              >
                Payout pipeline
              </span>
              <strong>
                {status.payoutPipeline
                  .activeRoundStatus ?? 'Idle'}
              </strong>
              <span>
                Open age:{' '}
                {formatAge(
                  status.payoutPipeline
                    .activeRoundAgeSeconds,
                )}
              </span>
            </div>
          </div>

          {status.alerts.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gap: '8px',
              }}
            >
              {status.alerts.map((alert) => (
                <div
                  key={alert.code}
                  style={{
                    borderRadius: '12px',
                    border:
                      '1px solid rgba(247,201,40,0.22)',
                    background:
                      'rgba(247,201,40,0.055)',
                    padding: '12px',
                  }}
                >
                  <strong>
                    {alert.severity} · {alert.code}
                  </strong>
                  <div
                    style={{
                      marginTop: '4px',
                      color:
                        'rgba(255,255,255,0.72)',
                    }}
                  >
                    {alert.message}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                color: 'rgba(255,255,255,0.68)',
                fontSize: '13px',
              }}
            >
              자동 지급을 막는 운영 이상이 없습니다. / No reward-operation anomaly is currently blocking automatic payouts.
            </div>
          )}

          <div
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: '12px',
            }}
          >
            Last checked:{' '}
            {new Date(
              status.capturedAt,
            ).toLocaleString()}
          </div>
        </>
      ) : null}
    </section>
  );
}
