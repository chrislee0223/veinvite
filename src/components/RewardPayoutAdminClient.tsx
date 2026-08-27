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

import {
  WalletControl,
} from '@/components/WalletControl';

type RewardPoolStatus = {
  network: string;
  appId: string;
  x2EarnRewardsPoolAddress: string;
  rewardsPoolEnabled: boolean;
  rewardsPoolBalanceWei: string;
  availableFundsWei: string;
  totalBalanceWei: string;
  effectiveRewardPoolWei: string;
  distributionPaused: boolean;
  contractVersion: string;
  appAdmin: string;
  rewardDistributors: string[];
};

type RewardRound = {
  id: string | number;
  network: string;
  app_id: string;
  status: string;
  observed_pool_balance_wei: string;
  reserved_before_round_wei: string;
  distributable_wei: string;
  eligible_count: number;
  per_reward_wei: string;
  remainder_wei: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

type RewardPayout = {
  id: string | number;
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string;
  status: string;
  tx_id?: string | null;
  paid_at?: string | null;
};

type ManifestClause = {
  payoutId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  to: string;
  value: string;
  data: string;
};

type RewardManifest = {
  id: string | number;
  round_id: string | number;
  manifest_version: string;
  network: string;
  app_id: string;
  x2earn_rewards_pool_address: string;
  operator_wallet: string;
  manifest_hash: string;
  payout_count: number;
  total_amount_wei: string;
  clauses: ManifestClause[];
  created_at: string;
};

type ManifestCheckpoint = {
  manifest_id: string | number;
  block_id: string;
  block_number: string | number;
  block_timestamp: string | number;
  recorded_at: string;
};

type TransactionSubmission = {
  id: string | number;
  manifest_id: string | number;
  round_id: string | number;
  network: string;
  manifest_hash: string;
  tx_id: string;
  operator_wallet: string;
  registered_at: string;
};

type TransactionSettlement = {
  id: string | number;
  manifest_id: string | number;
  round_id: string | number;
  network: string;
  manifest_hash: string;
  tx_id: string;
  tx_origin: string;
  block_id: string;
  block_number: string | number;
  block_timestamp: string | number;
  finalized_head_id: string;
  finalized_head_number: string | number;
  clause_count: number;
  verified_at: string;
  paid_at: string;
};

type CompletedRound = {
  id: string | number;
  network: string;
  app_id: string;
  status: string;
  distributable_wei: string;
  eligible_count: number;
  created_at: string;
  completed_at: string | null;
};

type RewardOverview = {
  pool: RewardPoolStatus;
  verifiedOperator: string;
  queuedCount: number;
  activeRound: RewardRound | null;
  payouts: RewardPayout[];
  manifest: RewardManifest | null;
  checkpoint: ManifestCheckpoint | null;
  submission: TransactionSubmission | null;
  settlement: TransactionSettlement | null;
  latestCompletedRound: CompletedRound | null;
};

type ActionName =
  | 'prepare'
  | 'manifest'
  | 'checkpoint'
  | 'preflight'
  | 'register'
  | 'verify'
  | null;

const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/;
const B3TR_SCALE = 10n ** 18n;
const MAX_FINALITY_ATTEMPTS = 40;
const FINALITY_RETRY_MS = 12_000;

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatB3trWei(value: string) {
  try {
    const amount = BigInt(value);
    const whole = amount / B3TR_SCALE;
    const fraction = (amount % B3TR_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 6)
      .replace(/0+$/, '');

    return `${whole.toString()}${
      fraction ? `.${fraction}` : ''
    } B3TR`;
  } catch {
    return `${value} wei`;
  }
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

function apiError(
  body: unknown,
  status: number,
): string {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string' &&
    body.error.trim()
  ) {
    return body.error;
  }

  return `VeInvite request failed (${status}).`;
}

function bodyCode(body: unknown): string | null {
  if (
    body &&
    typeof body === 'object' &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    return body.code;
  }

  return null;
}

function isOverview(
  value: unknown,
): value is RewardOverview {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<
    string,
    unknown
  >;

  return (
    typeof record.verifiedOperator ===
      'string' &&
    typeof record.queuedCount === 'number' &&
    typeof record.pool === 'object' &&
    record.pool !== null &&
    Array.isArray(record.payouts)
  );
}

function readReceiptTxId(
  value: unknown,
): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<
    string,
    unknown
  >;
  const meta =
    record.meta &&
    typeof record.meta === 'object'
      ? (record.meta as Record<
          string,
          unknown
        >)
      : null;

  const candidates = [
    meta?.txID,
    meta?.txId,
    record.txID,
    record.txId,
    record.id,
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

function storageKey(manifestId: string) {
  return `veinvite-payout-tx:${manifestId}`;
}

function panelStyle(
  emphasized = false,
): React.CSSProperties {
  return {
    border: emphasized
      ? '1px solid rgba(247,201,40,0.38)'
      : '1px solid rgba(255,255,255,0.12)',
    borderRadius: '18px',
    background: emphasized
      ? 'rgba(247,201,40,0.065)'
      : 'rgba(255,255,255,0.045)',
    padding: '20px',
    display: 'grid',
    gap: '12px',
  };
}

function primaryButtonStyle(
  enabled: boolean,
): React.CSSProperties {
  return {
    minHeight: '48px',
    border: 0,
    borderRadius: '14px',
    padding: '0 18px',
    fontWeight: 800,
    fontSize: '15px',
    cursor: enabled
      ? 'pointer'
      : 'not-allowed',
    background: enabled
      ? '#f7c928'
      : 'rgba(255,255,255,0.1)',
    color: enabled
      ? '#141414'
      : 'rgba(255,255,255,0.45)',
  };
}

export function RewardPayoutAdminClient() {
  const { account } = useWallet();
  const wallet =
    account?.address?.toLowerCase() ?? null;

  const [overview, setOverview] =
    useState<RewardOverview | null>(null);
  const [loading, setLoading] =
    useState(false);
  const [busyAction, setBusyAction] =
    useState<ActionName>(null);
  const [errorMessage, setErrorMessage] =
    useState('');
  const [successMessage, setSuccessMessage] =
    useState('');
  const [candidateTxId, setCandidateTxId] =
    useState<string | null>(null);
  const [waitingFinality, setWaitingFinality] =
    useState(false);
  const [verificationAttempts, setVerificationAttempts] =
    useState(0);

  const sendManifestIdRef =
    useRef<string | null>(null);
  const processedReceiptRef =
    useRef<string | null>(null);
  const registerInFlightRef =
    useRef<string | null>(null);
  const verifyInFlightRef =
    useRef<string | null>(null);

  const handleTxFailedOrCancelled =
    useCallback(
      (error?: Error | string) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : String(
                error ||
                  'Transaction cancelled.',
              ),
        );
        setSuccessMessage('');
      },
      [],
    );

  const transaction = useSendTransaction({
    signerAccountAddress:
      account?.address,
    onTxFailedOrCancelled:
      handleTxFailedOrCancelled,
  });

  const refresh = useCallback(async () => {
    if (!wallet) {
      setOverview(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(
        '/api/admin/rewards/overview',
        {
          cache: 'no-store',
        },
      );
      const body =
        await readResponseBody(response);

      if (!response.ok) {
        throw new Error(
          apiError(body, response.status),
        );
      }

      if (!isOverview(body)) {
        throw new Error(
          'Reward overview returned an invalid response.',
        );
      }

      setOverview(body);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Reward overview could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verifyCandidate =
    useCallback(
      async (
        manifestId: string,
        txId: string,
      ) => {
        const inFlightKey =
          `${manifestId}:${txId}`;

        if (
          verifyInFlightRef.current ===
          inFlightKey
        ) {
          return;
        }

        verifyInFlightRef.current =
          inFlightKey;
        setBusyAction('verify');

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
            window.localStorage.removeItem(
              storageKey(manifestId),
            );
            setCandidateTxId(null);
            setWaitingFinality(false);
            setVerificationAttempts(0);
            setErrorMessage('');
            setSuccessMessage(
              '지급 트랜잭션이 finalized 온체인 검증을 통과했고 DB가 PAID로 확정되었습니다. / The payout transaction passed finalized on-chain verification and the database is now PAID.',
            );
            transaction.resetStatus();
            await refresh();
            return;
          }

          const code = bodyCode(body);

          if (
            response.status === 409 &&
            (code === 'TX_NOT_FINALIZED' ||
              code ===
                'TX_RECEIPT_NOT_FOUND' ||
              code === 'TX_NOT_FOUND')
          ) {
            setWaitingFinality(true);
            setVerificationAttempts(
              (current) => current + 1,
            );
            setErrorMessage('');
            setSuccessMessage(
              '트랜잭션은 기록되었습니다. VeChain finality를 기다린 뒤 자동으로 다시 확인합니다. / Transaction recorded. Waiting for VeChain finality before checking again.',
            );
            return;
          }

          throw new Error(
            apiError(body, response.status),
          );
        } catch (error) {
          setWaitingFinality(false);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Payout transaction verification failed.',
          );
        } finally {
          verifyInFlightRef.current = null;
          setBusyAction(null);
        }
      },
      [refresh, transaction],
    );

  const registerCandidate =
    useCallback(
      async (
        manifestId: string,
        txId: string,
      ) => {
        const inFlightKey =
          `${manifestId}:${txId}`;

        if (
          registerInFlightRef.current ===
          inFlightKey
        ) {
          return;
        }

        registerInFlightRef.current =
          inFlightKey;
        setBusyAction('register');
        setErrorMessage('');

        try {
          const response = await fetch(
            '/api/admin/rewards/register-transaction',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                intent:
                  'REGISTER_PAYOUT_TRANSACTION',
                manifestId,
                txId,
              }),
            },
          );
          const body =
            await readResponseBody(response);

          if (!response.ok) {
            throw new Error(
              apiError(body, response.status),
            );
          }

          setCandidateTxId(txId);
          setWaitingFinality(true);
          setSuccessMessage(
            '지급 tx ID를 안전하게 기록했습니다. 이제 finalized 검증만 남았습니다. / Payout tx ID recorded safely. Finalized verification is the only remaining step.',
          );
          await refresh();
          void verifyCandidate(
            manifestId,
            txId,
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Payout transaction could not be registered.',
          );
        } finally {
          registerInFlightRef.current = null;
          setBusyAction(null);
        }
      },
      [refresh, verifyCandidate],
    );

  useEffect(() => {
    const manifest = overview?.manifest;

    if (!manifest) {
      return;
    }

    const manifestId =
      String(manifest.id);

    if (overview?.settlement) {
      window.localStorage.removeItem(
        storageKey(manifestId),
      );
      setWaitingFinality(false);
      return;
    }

    if (overview?.submission?.tx_id) {
      const txId =
        overview.submission.tx_id
          .toLowerCase();

      if (TX_ID_PATTERN.test(txId)) {
        if (candidateTxId !== txId) {
          setCandidateTxId(txId);
          setVerificationAttempts(0);
        }
        setWaitingFinality(true);
      }
      return;
    }

    if (!overview?.checkpoint) {
      return;
    }

    const stored =
      window.localStorage
        .getItem(storageKey(manifestId))
        ?.toLowerCase() ?? null;

    if (!stored) {
      return;
    }

    if (!TX_ID_PATTERN.test(stored)) {
      window.localStorage.removeItem(
        storageKey(manifestId),
      );
      return;
    }

    setCandidateTxId(stored);
    void registerCandidate(
      manifestId,
      stored,
    );
  }, [
    overview,
    candidateTxId,
    registerCandidate,
  ]);

  useEffect(() => {
    if (
      !waitingFinality ||
      !candidateTxId ||
      !overview?.manifest ||
      overview.settlement ||
      verificationAttempts >=
        MAX_FINALITY_ATTEMPTS
    ) {
      return;
    }

    const manifestId = String(
      overview.manifest.id,
    );
    const timer = window.setTimeout(
      () => {
        void verifyCandidate(
          manifestId,
          candidateTxId,
        );
      },
      FINALITY_RETRY_MS,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    waitingFinality,
    candidateTxId,
    overview,
    verificationAttempts,
    verifyCandidate,
  ]);

  useEffect(() => {
    if (
      transaction.status !== 'success'
    ) {
      return;
    }

    const manifestId =
      sendManifestIdRef.current;
    const txId = readReceiptTxId(
      transaction.txReceipt,
    );

    if (!manifestId || !txId) {
      if (manifestId) {
        setErrorMessage(
          'VeWorld confirmed the payout transaction but VeInvite could not read its tx ID. Do not send another payout. Refresh and recover the transaction before retrying.',
        );
      }
      return;
    }

    if (
      processedReceiptRef.current === txId
    ) {
      return;
    }

    processedReceiptRef.current = txId;
    window.localStorage.setItem(
      storageKey(manifestId),
      txId,
    );
    setCandidateTxId(txId);
    void registerCandidate(
      manifestId,
      txId,
    );
  }, [
    transaction.status,
    transaction.txReceipt,
    registerCandidate,
  ]);

  const prepareRound =
    useCallback(async () => {
      if (!overview || overview.activeRound) {
        return;
      }

      setBusyAction('prepare');
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const response = await fetch(
          '/api/admin/rewards/prepare',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              intent:
                'PREPARE_REWARD_ROUND',
            }),
          },
        );
        const body =
          await readResponseBody(response);

        if (!response.ok) {
          throw new Error(
            apiError(body, response.status),
          );
        }

        if (
          body &&
          typeof body === 'object' &&
          'roundCreated' in body &&
          body.roundCreated === false
        ) {
          setSuccessMessage(
            '현재 생성할 보상 라운드가 없습니다. 보상 풀 잔액과 대기 중인 완료 사용자를 확인하세요. / No reward round can be created yet. Check the reward pool balance and queued completed users.',
          );
        } else {
          setSuccessMessage(
            '보상 라운드를 생성하고 지급 대상/금액을 DB에 예약했습니다. 아직 B3TR은 전송되지 않았습니다. / Reward round prepared and payout amounts reserved in the database. No B3TR has been transferred.',
          );
        }

        await refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Reward round could not be prepared.',
        );
      } finally {
        setBusyAction(null);
      }
    }, [overview, refresh]);

  const freezeManifest =
    useCallback(async () => {
      const round = overview?.activeRound;

      if (!round || overview?.manifest) {
        return;
      }

      const confirmed = window.confirm(
        '현재 지급 대상과 금액을 수정 불가능한 지급 계획으로 확정합니다. 아직 B3TR은 전송되지 않습니다.\n\nFreeze the current recipients and amounts into an immutable payout plan? No B3TR will be transferred yet.',
      );

      if (!confirmed) {
        return;
      }

      setBusyAction('manifest');
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const response = await fetch(
          '/api/admin/rewards/manifest',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              intent:
                'CREATE_PAYOUT_MANIFEST',
              roundId: String(round.id),
            }),
          },
        );
        const body =
          await readResponseBody(response);

        if (!response.ok) {
          throw new Error(
            apiError(body, response.status),
          );
        }

        setSuccessMessage(
          '지급 계획을 immutable manifest로 확정했습니다. / Payout plan frozen into an immutable manifest.',
        );
        await refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Payout manifest could not be created.',
        );
      } finally {
        setBusyAction(null);
      }
    }, [overview, refresh]);

  const createCheckpoint =
    useCallback(async () => {
      const manifest = overview?.manifest;

      if (!manifest || overview?.checkpoint) {
        return;
      }

      setBusyAction('checkpoint');
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const response = await fetch(
          '/api/admin/rewards/manifest-checkpoint',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              intent:
                'CREATE_MANIFEST_CHAIN_CHECKPOINT',
              manifestId:
                String(manifest.id),
            }),
          },
        );
        const body =
          await readResponseBody(response);

        if (!response.ok) {
          throw new Error(
            apiError(body, response.status),
          );
        }

        setSuccessMessage(
          '서명 전 체인 체크포인트를 기록했습니다. 지급 tx는 반드시 이 블록 이후여야 합니다. / Pre-signing chain checkpoint recorded. The payout tx must be in a later block.',
        );
        await refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Chain checkpoint could not be created.',
        );
      } finally {
        setBusyAction(null);
      }
    }, [overview, refresh]);

  const sendPayout =
    useCallback(async () => {
      const manifest = overview?.manifest;

      if (
        !manifest ||
        !overview?.checkpoint ||
        overview.submission ||
        overview.settlement ||
        !wallet
      ) {
        return;
      }

      setBusyAction('preflight');
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const response = await fetch(
          '/api/admin/rewards/preflight',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              intent:
                'PREFLIGHT_PAYOUT_TRANSACTION',
              manifestId:
                String(manifest.id),
            }),
          },
        );
        const body =
          await readResponseBody(response);

        if (!response.ok) {
          throw new Error(
            apiError(body, response.status),
          );
        }

        if (
          !body ||
          typeof body !== 'object' ||
          !('readyToSign' in body) ||
          body.readyToSign !== true
        ) {
          throw new Error(
            'Payout preflight did not return a safe signing result.',
          );
        }

        const confirmed = window.confirm(
          `실제 B3TR을 지급합니다.\n\n수령인: ${manifest.payout_count}명\n총 지급액: ${formatB3trWei(manifest.total_amount_wei)}\n\n이 작업은 VeWorld에서 한 번 더 승인해야 하며, 승인 후에는 되돌릴 수 없습니다.\n\nThis will transfer real B3TR.\nRecipients: ${manifest.payout_count}\nTotal: ${formatB3trWei(manifest.total_amount_wei)}\n\nVeWorld will ask for final approval. Once submitted, the payout cannot be undone.`,
        );

        if (!confirmed) {
          return;
        }

        const clauses = manifest.clauses.map(
          (clause, index) => ({
            to: clause.to,
            value: clause.value,
            data: clause.data,
            comment:
              `VeInvite reward ${index + 1}/${manifest.payout_count}: ${formatB3trWei(clause.amountWei)} → ${shortAddress(clause.recipientWallet)}`,
          }),
        );

        sendManifestIdRef.current =
          String(manifest.id);
        processedReceiptRef.current = null;
        transaction.resetStatus();
        setBusyAction(null);

        await transaction.sendTransaction(
          clauses,
        );
      } catch (error) {
        setBusyAction(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Payout transaction could not be submitted.',
        );
      }
    }, [
      overview,
      wallet,
      transaction,
    ]);

  const transactionBusy =
    transaction.status === 'pending' ||
    transaction.status ===
      'waitingConfirmation';
  const actionBusy =
    busyAction !== null ||
    transactionBusy;

  const isOperator = Boolean(
    wallet &&
      overview &&
      overview.verifiedOperator
        .toLowerCase() === wallet,
  );

  const poolHasFunds = Boolean(
    overview &&
      BigInt(
        overview.pool
          .effectiveRewardPoolWei,
      ) > 0n,
  );

  const canPrepare = Boolean(
    overview &&
      isOperator &&
      !overview.activeRound &&
      overview.queuedCount > 0 &&
      poolHasFunds &&
      !overview.pool.distributionPaused &&
      !actionBusy,
  );

  const canFreeze = Boolean(
    overview?.activeRound &&
      !overview.manifest &&
      isOperator &&
      !actionBusy,
  );

  const canCheckpoint = Boolean(
    overview?.manifest &&
      !overview.checkpoint &&
      isOperator &&
      !actionBusy,
  );

  const canSend = Boolean(
    overview?.manifest &&
      overview.checkpoint &&
      !overview.submission &&
      !overview.settlement &&
      isOperator &&
      !overview.pool.distributionPaused &&
      BigInt(
        overview.pool
          .effectiveRewardPoolWei,
      ) >=
        BigInt(
          overview.manifest
            .total_amount_wei,
        ) &&
      !actionBusy,
  );

  const manifestId =
    overview?.manifest
      ? String(overview.manifest.id)
      : null;

  return (
    <main
      style={{
        minHeight: '100dvh',
        background:
          'linear-gradient(180deg, #120d20 0%, #0c0914 100%)',
        color: '#ffffff',
        padding: '28px 18px 64px',
      }}
    >
      <div
        style={{
          width: 'min(880px, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: '18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '13px',
                opacity: 0.66,
                marginBottom: '5px',
              }}
            >
              VeInvite Admin
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: '28px',
              }}
            >
              사용자 보상 지급 / Reward Payouts
            </h1>
          </div>
          <WalletControl />
        </div>

        <section style={panelStyle(true)}>
          <strong>
            수동 지갑 승인 방식 / Manual wallet approval
          </strong>
          <p
            style={{
              margin: 0,
              opacity: 0.78,
              lineHeight: 1.6,
            }}
          >
            서버에는 개인키가 없습니다. 실제 B3TR 이동은 이 페이지에서 검증된 지급 계획을 확인한 뒤 운영 지갑으로 VeWorld 승인을 해야만 발생합니다.
            <br />
            The server holds no private key. Real B3TR moves only after the verified payout plan is reviewed here and explicitly approved by the operator wallet in VeWorld.
          </p>
        </section>

        {loading && !overview ? (
          <section style={panelStyle()}>
            보상 상태 확인 중… / Loading reward status…
          </section>
        ) : null}

        {!wallet ? (
          <section style={panelStyle()}>
            운영 지갑을 연결하세요. / Connect the VeInvite operator wallet.
          </section>
        ) : null}

        {overview ? (
          <section style={panelStyle()}>
            <strong>
              현재 상태 / Current status
            </strong>
            <div>
              Network:{' '}
              <strong>
                {overview.pool.network}
              </strong>
            </div>
            <div>
              사용자 보상 풀 / User reward pool:{' '}
              <strong>
                {formatB3trWei(
                  overview.pool
                    .effectiveRewardPoolWei,
                )}
              </strong>
            </div>
            <div>
              지급 대기 / Queued:{' '}
              <strong>
                {overview.queuedCount}
              </strong>
            </div>
            <div>
              Distribution:{' '}
              <strong>
                {overview.pool
                  .distributionPaused
                  ? '일시정지 / Paused'
                  : '정상 / Active'}
              </strong>
            </div>
            <div>
              Operator:{' '}
              <strong>
                {shortAddress(
                  overview.verifiedOperator,
                )}
              </strong>
            </div>
          </section>
        ) : null}

        {overview ? (
          <section style={panelStyle()}>
            <strong>
              1. 보상 라운드 준비 / Prepare reward round
            </strong>
            {overview.activeRound ? (
              <div>
                Round #{overview.activeRound.id} —{' '}
                {overview.activeRound.eligible_count}명 / recipients —{' '}
                <strong>
                  {formatB3trWei(
                    overview.activeRound
                      .distributable_wei,
                  )}
                </strong>
              </div>
            ) : (
              <div
                style={{
                  opacity: 0.78,
                  lineHeight: 1.5,
                }}
              >
                완료·검증된 대기 사용자가 있고 보상 풀에 B3TR이 들어오면 라운드를 생성합니다. / Creates a round only when verified completed users are queued and B3TR is available.
              </div>
            )}
            <button
              type="button"
              disabled={!canPrepare}
              onClick={() => {
                void prepareRound();
              }}
              style={primaryButtonStyle(
                canPrepare,
              )}
            >
              {busyAction === 'prepare'
                ? '준비 중… / Preparing…'
                : overview.activeRound
                  ? '라운드 준비 완료 / Round prepared'
                  : '보상 라운드 준비 / Prepare reward round'}
            </button>
          </section>
        ) : null}

        {overview?.activeRound ? (
          <section style={panelStyle()}>
            <strong>
              지급 대상 / Recipients
            </strong>
            <div
              style={{
                display: 'grid',
                gap: '8px',
              }}
            >
              {overview.payouts.map(
                (payout, index) => (
                  <div
                    key={String(payout.id)}
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      gap: '12px',
                      flexWrap: 'wrap',
                      padding:
                        '9px 10px',
                      borderRadius: '10px',
                      background:
                        'rgba(255,255,255,0.04)',
                    }}
                  >
                    <span>
                      {index + 1}.{' '}
                      {shortAddress(
                        payout.recipient_wallet,
                      )}
                    </span>
                    <strong>
                      {formatB3trWei(
                        payout.amount_wei,
                      )}
                    </strong>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {overview?.activeRound ? (
          <section style={panelStyle()}>
            <strong>
              2. 지급 계획 확정 / Freeze payout plan
            </strong>
            {overview.manifest ? (
              <div
                style={{
                  display: 'grid',
                  gap: '6px',
                }}
              >
                <span>
                  Manifest #{overview.manifest.id}
                </span>
                <span>
                  Hash:{' '}
                  {shortHash(
                    overview.manifest
                      .manifest_hash,
                  )}
                </span>
                <span>
                  총액 / Total:{' '}
                  <strong>
                    {formatB3trWei(
                      overview.manifest
                        .total_amount_wei,
                    )}
                  </strong>
                </span>
              </div>
            ) : (
              <span style={{ opacity: 0.76 }}>
                지급 대상과 금액을 변경 불가능한 manifest로 고정합니다. / Locks recipients and amounts into an immutable manifest.
              </span>
            )}
            <button
              type="button"
              disabled={!canFreeze}
              onClick={() => {
                void freezeManifest();
              }}
              style={primaryButtonStyle(
                canFreeze,
              )}
            >
              {overview.manifest
                ? 'Manifest 확정 완료 / Manifest frozen'
                : busyAction === 'manifest'
                  ? '확정 중… / Freezing…'
                  : '지급 계획 확정 / Freeze payout plan'}
            </button>
          </section>
        ) : null}

        {overview?.manifest ? (
          <section style={panelStyle()}>
            <strong>
              3. 서명 전 체크포인트 / Pre-sign checkpoint
            </strong>
            {overview.checkpoint ? (
              <div>
                Block{' '}
                <strong>
                  {overview.checkpoint.block_number}
                </strong>{' '}
                기록 완료 / recorded
              </div>
            ) : (
              <span style={{ opacity: 0.76 }}>
                과거 tx 재사용을 막기 위해 지급 전에 현재 체인 블록을 불변 기록합니다. / Records the current chain block before signing to prevent historical transaction replay.
              </span>
            )}
            <button
              type="button"
              disabled={!canCheckpoint}
              onClick={() => {
                void createCheckpoint();
              }}
              style={primaryButtonStyle(
                canCheckpoint,
              )}
            >
              {overview.checkpoint
                ? '체크포인트 완료 / Checkpoint ready'
                : busyAction === 'checkpoint'
                  ? '기록 중… / Recording…'
                  : '체크포인트 생성 / Create checkpoint'}
            </button>
          </section>
        ) : null}

        {overview?.manifest &&
        overview.checkpoint ? (
          <section style={panelStyle(true)}>
            <strong>
              4. 실제 B3TR 지급 / Send real B3TR
            </strong>

            {overview.settlement ? (
              <div
                style={{
                  color: '#8ff0bd',
                  lineHeight: 1.5,
                }}
              >
                지급 완료 / Paid ✅<br />
                Tx:{' '}
                {shortHash(
                  overview.settlement.tx_id,
                )}
              </div>
            ) : overview.submission ? (
              <div
                style={{
                  lineHeight: 1.5,
                }}
              >
                Tx 기록됨 / Tx registered:{' '}
                <strong>
                  {shortHash(
                    overview.submission.tx_id,
                  )}
                </strong>
                <br />
                finalized 검증 대기 중 / waiting for finalized verification
              </div>
            ) : (
              <div
                style={{
                  opacity: 0.82,
                  lineHeight: 1.6,
                }}
              >
                서명 직전에 체인 상태·보상 풀 잔액·가스 추정을 다시 검사합니다. 통과한 경우에만 VeWorld 승인창이 열립니다.
                <br />
                Chain state, reward-pool balance and gas are rechecked immediately before signing. VeWorld opens only if preflight passes.
              </div>
            )}

            {!overview.submission &&
            !overview.settlement ? (
              <button
                type="button"
                disabled={!canSend}
                onClick={() => {
                  void sendPayout();
                }}
                style={primaryButtonStyle(
                  canSend,
                )}
              >
                {transactionBusy
                  ? 'VeWorld 승인/확인 중… / Waiting for VeWorld…'
                  : busyAction === 'preflight'
                    ? '최종 안전검사 중… / Running preflight…'
                    : `VeWorld에서 ${formatB3trWei(
                        overview.manifest
                          .total_amount_wei,
                      )} 지급 / Send with VeWorld`}
              </button>
            ) : null}

            {overview.submission &&
            !overview.settlement ? (
              <button
                type="button"
                disabled={
                  busyAction === 'verify'
                }
                onClick={() => {
                  void verifyCandidate(
                    String(
                      overview.manifest
                        ?.id,
                    ),
                    overview.submission
                      ?.tx_id ?? '',
                  );
                }}
                style={primaryButtonStyle(
                  busyAction !== 'verify',
                )}
              >
                {busyAction === 'verify'
                  ? 'finalized 확인 중… / Checking finality…'
                  : '지금 finalized 다시 확인 / Check finality now'}
              </button>
            ) : null}

            {waitingFinality &&
            verificationAttempts <
              MAX_FINALITY_ATTEMPTS ? (
              <div
                style={{
                  fontSize: '13px',
                  opacity: 0.72,
                }}
              >
                자동 확인 {verificationAttempts}/{MAX_FINALITY_ATTEMPTS} — 약 12초 간격 / automatic finality check every ~12 seconds
              </div>
            ) : null}

            {waitingFinality &&
            verificationAttempts >=
              MAX_FINALITY_ATTEMPTS ? (
              <div
                style={{
                  color: '#ffd38a',
                  lineHeight: 1.5,
                }}
              >
                자동 확인 횟수를 모두 사용했습니다. 지급을 다시 보내지 말고 위 버튼으로 기존 tx를 다시 확인하세요. / Automatic checks stopped. Do not send another payout; verify the existing tx with the button above.
              </div>
            ) : null}

            {candidateTxId &&
            !overview.submission ? (
              <div
                style={{
                  fontSize: '13px',
                  opacity: 0.76,
                }}
              >
                복구 중인 tx / recovering tx:{' '}
                {shortHash(candidateTxId)}
              </div>
            ) : null}
          </section>
        ) : null}

        {overview?.latestCompletedRound &&
        !overview.activeRound ? (
          <section style={panelStyle()}>
            <strong>
              최근 지급 완료 / Latest completed payout
            </strong>
            <div>
              Round #{overview.latestCompletedRound.id} —{' '}
              {overview.latestCompletedRound.eligible_count}명 / recipients —{' '}
              {formatB3trWei(
                overview.latestCompletedRound
                  .distributable_wei,
              )}
            </div>
          </section>
        ) : null}

        {successMessage ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background:
                'rgba(56,211,137,0.12)',
              color: '#8ff0bd',
              lineHeight: 1.5,
            }}
          >
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background:
                'rgba(255,80,80,0.1)',
              color: '#ffb1b1',
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void refresh();
          }}
          style={{
            minHeight: '44px',
            borderRadius: '13px',
            border:
              '1px solid rgba(255,255,255,0.16)',
            background: 'transparent',
            color: '#ffffff',
            cursor: loading
              ? 'wait'
              : 'pointer',
          }}
        >
          {loading
            ? '새로고침 중… / Refreshing…'
            : '전체 상태 다시 확인 / Refresh all status'}
        </button>

        <a
          href="/admin/funding"
          style={{
            textAlign: 'center',
            color: '#d7caff',
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          Funding Split 설정으로 돌아가기 / Back to Funding Split
        </a>

        {manifestId ? (
          <div
            style={{
              textAlign: 'center',
              opacity: 0.42,
              fontSize: '11px',
            }}
          >
            Manifest #{manifestId}
          </div>
        ) : null}
      </div>
    </main>
  );
}
