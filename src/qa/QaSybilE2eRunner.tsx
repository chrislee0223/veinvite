'use client';

import { useState } from 'react';

type QaReport = {
  mode?: string;
  passed?: boolean;
  writesRolledBack?: boolean;
  transfersPerformed?: boolean;
  fixtureResidue?: number;
  error?: string | null;
  checks?: Record<string, unknown>;
};

export function QaSybilE2eRunner() {
  const [running, setRunning] =
    useState(false);
  const [report, setReport] =
    useState<QaReport | null>(null);
  const [requestError, setRequestError] =
    useState('');

  const run = async () => {
    if (running) return;

    setRunning(true);
    setRequestError('');
    setReport(null);

    try {
      const response = await fetch(
        '/qa/sybil-e2e/run',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: '{}',
          cache: 'no-store',
        },
      );

      const body =
        (await response.json()) as
          QaReport & {
            error?: string;
          };

      setReport(body);

      if (!response.ok) {
        setRequestError(
          body.error ??
            'E2E QA failed.',
        );
      }
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'E2E QA request failed.',
      );
    } finally {
      setRunning(false);
    }
  };

  const checks =
    report?.checks &&
    typeof report.checks ===
      'object'
      ? Object.entries(
          report.checks,
        )
      : [];

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#080807',
        color: '#fff',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <div>
          <p
            style={{
              opacity: 0.65,
              marginBottom: 6,
            }}
          >
            Preview only · rollback QA
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
            }}
          >
            Sybil E2E QA
          </h1>
          <p
            style={{
              lineHeight: 1.6,
              opacity: 0.8,
            }}
          >
            실제 Preview DB 트리거를
            통과해 HOLD, BLOCKED,
            알림, 보상 차단, 슬롯 반환,
            inviter WATCH/HOLD를
            검사합니다. 테스트 변경은
            내부 롤백되며 토큰 전송 코드는
            실행하지 않습니다.
          </p>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={run}
          style={{
            minHeight: 48,
            borderRadius: 12,
            border: 0,
            padding: '0 18px',
            fontWeight: 700,
            cursor: running
              ? 'wait'
              : 'pointer',
          }}
        >
          {running
            ? '검사 중…'
            : '전체 Sybil E2E 테스트 실행'}
        </button>

        {requestError ? (
          <div
            role="alert"
            style={{
              padding: 16,
              borderRadius: 12,
              background:
                'rgba(255,255,255,0.08)',
            }}
          >
            {requestError}
          </div>
        ) : null}

        {report ? (
          <section
            style={{
              padding: 18,
              borderRadius: 16,
              background:
                'rgba(255,255,255,0.06)',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              {report.passed
                ? 'PASS'
                : 'FAIL'}
            </h2>
            <p>
              DB 롤백:{' '}
              {report.writesRolledBack
                ? '정상'
                : '확인 필요'}
              {' · '}
              실제 전송:{' '}
              {report.transfersPerformed
                ? '발생'
                : '없음'}
              {' · '}
              잔여 fixture:{' '}
              {String(
                report.fixtureResidue ??
                  '-',
              )}
            </p>

            <div
              style={{
                display: 'grid',
                gap: 8,
              }}
            >
              {checks.map(
                ([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      gap: 16,
                      padding:
                        '9px 0',
                      borderBottom:
                        '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span>{key}</span>
                    <strong>
                      {String(value)}
                    </strong>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
