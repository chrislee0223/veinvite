'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useSendTransaction,
  useWallet,
} from '@vechain/vechain-kit';

type ManifestClause = {
  to: string;
  value: string;
  data: string;
};

type RewardOverview = {
  pool: {
    network: string;
    distributionPaused: boolean;
  };
  queuedCount: number;
  activeRound: {
    id: string | number;
  } | null;
  manifest: {
    id: string | number;
    clauses: ManifestClause[];
  } | null;
  checkpoint: unknown | null;
  submission: {
    tx_id: string;
  } | null;
  settlement: unknown | null;
};

type PreparedManifest = {
  id: string;
  clauses: ManifestClause[];
};

const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/;
const MAX_FINALITY_ATTEMPTS = 40;
const FINALITY_RETRY_MS = 12_000;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readApiError(
  body: unknown,
  status: number,
): string {
  if (
    isRecord(body) &&
    typeof body.error === 'string' &&
    body.error.trim()
  ) {
    return body.error;
  }

  return `VeInvite request failed (${status}).`;
}

function readBodyCode(
  body: unknown,
): string | null {
  if (
    isRecord(body) &&
    typeof body.code === 'string'
  ) {
    return body.code;
  }

  return null;
}

function readReceiptTxId(
  value: unknown,
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const meta = isRecord(value.meta)
    ? value.meta
    : null;
  const candidates = [
    meta?.txID,
    meta?.txId,
    value.txID,
    value.txId,
    value.id,
  ];

  for (const candidate of candidates) {
    const txId = String(candidate ?? '')
      .trim()
      .toLowerCase();

    if (TX_ID_PATTERN.test(txId)) {
      return txId;
    }
  }

  return null;
}

async function readResponseBody(
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

async function postJson(
  path: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw Object.assign(
      new Error(
        readApiError(body, response.status),
      ),
      {
        status: response.status,
        code: readBodyCode(body),
      },
    );
  }

  return body;
}

function parseOverview(
  body: unknown,
): RewardOverview {
  if (
    !isRecord(body) ||
    !isRecord(body.pool) ||
    typeof body.queuedCount !== 'number'
  ) {
    throw new Error(
      'Reward overview returned an invalid response.',
    );
  }

  return body as unknown as RewardOverview;
}

function parsePreparedManifest(
  body: unknown,
): PreparedManifest {
  if (
    !isRecord(body) ||
    body.manifestId === undefined ||
    !isRecord(body.manifest) ||
    !Array.isArray(body.manifest.clauses)
  ) {
    throw new Error(
      'Payout manifest returned an invalid response.',
    );
  }

  const clauses = body.manifest.clauses.map(
    (clause) => {
      if (
        !isRecord(clause) ||
        typeof clause.to !== 'string' ||
        typeof clause.value !== 'string' ||
        typeof clause.data !== 'string'
      ) {
        throw new Error(
          'Payout manifest contains an invalid transaction clause.',
        );
      }

      return {
        to: clause.to,
        value: clause.value,
        data: clause.data,
      };
    },
  );

  return {
    id: String(body.manifestId),
    clauses,
  };
}

function panelStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: '14px',
    padding: '20px',
    borderRadius: '18px',
    border: '1px solid rgba(247,201,40,0.38)',
    background: 'rgba(247,201,40,0.065)',
    marginBottom: '18px',
  };
}

function buttonStyle(
  enabled: boolean,
): React.CSSProperties {
  return {
    minHeight: '50px',
    border: 0,
    borderRadius: '14px',
    padding: '0 18px',
    fontSize: '15px',
    fontWeight: 800,
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: enabled
      ? '#f7c928'
      : 'rgba(255,255,255,0.1)',
    color: enabled
      ? '#141414'
      : 'rgba(255,255,255,0.45)',
  };
}

export function RewardPayoutAutomationClient() {
  const { account } = useWallet();
  const wallet =
    account?.address?.toLowerCase() ?? null;
  const [overview, setOverview] =
    useState<RewardOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] =
    useState('');
  const sendManifestIdRef =
    useRef<string | null>(null);
  const processedTxRef =
    useRef<string | null>(null);
  const pollTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const transaction = useSendTransaction({
    signerAccountAddress: account?.address,
    onTxFailedOrCancelled: (error) => {
      setBusy(false);
      setMessage('');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : String(
              error || 'Transaction cancelled.',
            ),
      );
    },
  });

  const loadOverview = useCallback(async () => {
    const response = await fetch(
      '/api/admin/rewards/overview',
      { cache: 'no-store' },
    );
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new Error(
        readApiError(body, response.status),
      );
    }

    const parsed = parseOverview(body);
    setOverview(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    if (!wallet) {
      setOverview(null);
      return;
    }

    void loadOverview().catch((error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Reward overview could not be loaded.',
      );
    });
  }, [loadOverview, wallet]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  const verifyUntilFinal = useCallback(
    async (
      manifestId: string,
      txId: string,
      attempt = 0,
    ) => {
      try {
        const response = await fetch(
          '/api/admin/rewards/verify-transaction',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              intent:
                'VERIFY_PAYOUT_TRANSACTION',
              manifestId,
              txId,
            }),
          },
        );
        const body =
          await readResponseBody(response);

        if (response.ok) {
          setBusy(false);
          setErrorMessage('');
          setMessage(
            '지급 완료. 온체인 finality와 DB 정산까지 자동 검증되었습니다. / Payout complete. On-chain finality and database settlement were verified automatically.',
          );
          await loadOverview();
          return;
        }

        const code = readBodyCode(body);
        const mayRetry =
          response.status === 409 &&
          (
            code === 'TX_NOT_FINALIZED' ||
            code === 'TX_RECEIPT_NOT_FOUND' ||
            code === 'TX_NOT_FOUND'
          );

        if (
          mayRetry &&
          attempt < MAX_FINALITY_ATTEMPTS
        ) {
          setMessage(
            '트랜잭션 전송 완료. VeChain finality를 기다리며 자동 확인 중입니다. / Transaction sent. Waiting for VeChain finality and checking automatically.',
          );
          pollTimerRef.current = setTimeout(
            () => {
              void verifyUntilFinal(
                manifestId,
                txId,
                attempt + 1,
              );
            },
            FINALITY_RETRY_MS,
          );
          return;
        }

        throw new Error(
          readApiError(body, response.status),
        );
      } catch (error) {
        setBusy(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Payout verification failed.',
        );
      }
    },
    [loadOverview],
  );

  const registerAndVerify = useCallback(
    async (
      manifestId: string,
      txId: string,
    ) => {
      await postJson(
        '/api/admin/rewards/register-transaction',
        {
          intent:
            'REGISTER_PAYOUT_TRANSACTION',
          manifestId,
          txId,
        },
      );

      setMessage(
        '지급 tx를 기록했습니다. finality 확인까지 자동 진행합니다. / Payout transaction recorded. Finality verification will continue automatically.',
      );
      await loadOverview();
      await verifyUntilFinal(
        manifestId,
        txId,
      );
    },
    [loadOverview, verifyUntilFinal],
  );

  useEffect(() => {
    if (transaction.status !== 'success') {
      return;
    }

    const manifestId =
      sendManifestIdRef.current;
    const txId = readReceiptTxId(
      transaction.txReceipt,
    );

    if (!manifestId || !txId) {
      if (manifestId) {
        setBusy(false);
        setErrorMessage(
          'Wallet reported success but VeInvite could not read the payout transaction ID.',
        );
      }
      return;
    }

    if (processedTxRef.current === txId) {
      return;
    }

    processedTxRef.current = txId;
    void registerAndVerify(
      manifestId,
      txId,
    ).catch((error) => {
      setBusy(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Payout transaction could not be registered.',
      );
    });
  }, [
    registerAndVerify,
    transaction.status,
    transaction.txReceipt,
  ]);

  const prepareAndSign = useCallback(async () => {
    if (!wallet || busy) {
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setMessage(
      '보상 대상과 온체인 상태를 재검증하고 있습니다. / Revalidating recipients and on-chain reward state.',
    );

    try {
      let current = await loadOverview();

      if (current.pool.distributionPaused) {
        throw new Error(
          'Reward distribution is paused. No payout transaction will be prepared.',
        );
      }

      if (
        current.submission &&
        current.manifest
      ) {
        setMessage(
          '기존 지급 트랜잭션의 finality를 확인합니다. / Checking finality of the existing payout transaction.',
        );
        await verifyUntilFinal(
          String(current.manifest.id),
          current.submission.tx_id,
        );
        return;
      }

      if (!current.activeRound) {
        if (current.queuedCount < 1) {
          setBusy(false);
          setMessage(
            '현재 지급 가능한 추천 보상이 없습니다. 적격자가 생기면 이 버튼 한 번으로 전체 지급 절차를 진행할 수 있습니다. / No referral rewards are ready yet. Once recipients qualify, this single action will run the payout flow.',
          );
          return;
        }

        setMessage(
          '적격자를 다시 확인하고 지급 배치를 생성합니다. / Rechecking eligibility and preparing the payout batch.',
        );
        const prepareBody = await postJson(
          '/api/admin/rewards/prepare',
          {
            intent:
              'PREPARE_REWARD_ROUND',
          },
        );

        if (
          isRecord(prepareBody) &&
          prepareBody.roundCreated === false
        ) {
          const reason = String(
            prepareBody.reason ?? '',
          );

          if (
            reason ===
            'NO_SETTLEABLE_CANDIDATES'
          ) {
            setBusy(false);
            setMessage(
              '큐에는 항목이 있지만 현재 안전검사를 모두 통과한 지급 대상은 없습니다. 어떤 자금도 이동하지 않았습니다. / Queue entries exist, but none currently pass every settlement safety check. No funds moved.',
            );
            await loadOverview();
            return;
          }
        }

        current = await loadOverview();
      }

      if (!current.activeRound) {
        throw new Error(
          'A payout batch could not be resolved after preparation.',
        );
      }

      let manifest: PreparedManifest;

      if (current.manifest) {
        manifest = {
          id: String(current.manifest.id),
          clauses: current.manifest.clauses,
        };
      } else {
        setMessage(
          '지급 내역을 변경 불가능한 manifest로 고정합니다. / Freezing the payout plan into an immutable manifest.',
        );
        const manifestBody = await postJson(
          '/api/admin/rewards/manifest',
          {
            intent:
              'CREATE_PAYOUT_MANIFEST',
            roundId:
              String(current.activeRound.id),
          },
        );
        manifest =
          parsePreparedManifest(manifestBody);
        current = await loadOverview();
      }

      if (!current.checkpoint) {
        setMessage(
          '서명 직전 체인 체크포인트를 기록합니다. / Recording the pre-signing chain checkpoint.',
        );
        await postJson(
          '/api/admin/rewards/manifest-checkpoint',
          {
            intent:
              'CREATE_MANIFEST_CHAIN_CHECKPOINT',
            manifestId: manifest.id,
          },
        );
      }

      setMessage(
        '풀 잔액, 설정, manifest, gas 한도를 최종 검사합니다. / Running final pool, configuration, manifest and gas checks.',
      );
      const preflightBody = await postJson(
        '/api/admin/rewards/preflight',
        {
          intent:
            'PREFLIGHT_PAYOUT_TRANSACTION',
          manifestId: manifest.id,
        },
      );

      if (
        !isRecord(preflightBody) ||
        preflightBody.readyToSign !== true
      ) {
        throw new Error(
          'Payout preflight did not return a safe signing result.',
        );
      }

      if (manifest.clauses.length < 1) {
        throw new Error(
          'The payout manifest contains no transaction clauses.',
        );
      }

      sendManifestIdRef.current =
        manifest.id;
      processedTxRef.current = null;
      transaction.resetStatus();
      setMessage(
        '모든 안전검사를 통과했습니다. VeWorld에서 한 번만 승인하면 전체 배치가 전송됩니다. / All safety checks passed. Approve once in your wallet to send the whole batch.',
      );

      await transaction.sendTransaction(
        manifest.clauses,
      );
    } catch (error) {
      setBusy(false);
      setMessage('');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'One-click payout preparation failed.',
      );
    }
  }, [
    busy,
    loadOverview,
    transaction,
    verifyUntilFinal,
    wallet,
  ]);

  const enabled =
    Boolean(wallet) &&
    !busy &&
    !overview?.pool.distributionPaused;

  return (
    <section style={panelStyle()}>
      <div>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#f7c928',
            textTransform: 'uppercase',
          }}
        >
          Recommended payout flow
        </div>
        <h2
          style={{
            margin: '6px 0 0',
            fontSize: '21px',
          }}
        >
          보상 지급 자동 준비 · 1회 서명
        </h2>
      </div>

      <p
        style={{
          margin: 0,
          lineHeight: 1.65,
          color: 'rgba(255,255,255,0.72)',
        }}
      >
        적격자 재검증 → 지급 배치 → immutable manifest → 체인 체크포인트 → gas/잔액 preflight를 자동으로 이어서 실행합니다. 실제 B3TR 전송만 운영 지갑에서 한 번 승인하며, 서버에는 운영 지갑 개인키를 저장하지 않습니다.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          fontSize: '14px',
          color: 'rgba(255,255,255,0.78)',
        }}
      >
        <span>
          대기 적격자: <strong>{overview?.queuedCount ?? 0}</strong>
        </span>
        <span>
          진행 배치: <strong>{overview?.activeRound ? `#${overview.activeRound.id}` : '없음'}</strong>
        </span>
        <span>
          네트워크: <strong>{overview?.pool.network ?? '-'}</strong>
        </span>
      </div>

      <button
        type="button"
        disabled={!enabled}
        onClick={() => {
          void prepareAndSign();
        }}
        style={buttonStyle(enabled)}
      >
        {busy
          ? '안전검사 및 지급 진행 중…'
          : overview?.submission
            ? '기존 지급 상태 자동 확인'
            : '지급 준비 후 한 번에 서명'}
      </button>

      {message ? (
        <div
          style={{
            fontSize: '14px',
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            border:
              '1px solid rgba(255,105,105,0.35)',
            background:
              'rgba(255,105,105,0.08)',
            color: '#ffd4d4',
            fontSize: '14px',
            lineHeight: 1.55,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
