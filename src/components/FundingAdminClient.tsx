'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Interface } from 'ethers';
import {
  useSendTransaction,
  useWallet,
} from '@vechain/vechain-kit';

import {
  WalletControl,
} from '@/components/WalletControl';

type FundingConfig = {
  network: string;
  appId: string;
  x2EarnAppsAddress: string;
  appAdmin: string;
  teamWallet: string;
  teamAllocationPercentage: number;
  rewardDistributors: string[];
  targetTeamAllocationPercentage: number;
};

const x2EarnAppsInterface =
  new Interface([
    'function setTeamAllocationPercentage(bytes32 appId, uint256 percentage)',
  ]);

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
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

function getApiError(
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

  return `Funding configuration could not be loaded (${status}).`;
}

function isFundingConfig(
  value: unknown,
): value is FundingConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.network === 'string' &&
    typeof record.appId === 'string' &&
    typeof record.x2EarnAppsAddress === 'string' &&
    typeof record.appAdmin === 'string' &&
    typeof record.teamWallet === 'string' &&
    typeof record.teamAllocationPercentage === 'number' &&
    Array.isArray(record.rewardDistributors) &&
    record.rewardDistributors.every(
      (item) => typeof item === 'string',
    ) &&
    typeof record.targetTeamAllocationPercentage === 'number'
  );
}

export function FundingAdminClient() {
  const { account } = useWallet();
  const wallet =
    account?.address?.toLowerCase() ?? null;

  const [config, setConfig] =
    useState<FundingConfig | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [readError, setReadError] =
    useState('');
  const [actionError, setActionError] =
    useState('');
  const [confirmedMessage, setConfirmedMessage] =
    useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setReadError('');

    try {
      const response = await fetch(
        '/api/admin/funding-config',
        {
          cache: 'no-store',
        },
      );
      const body =
        await readResponseBody(response);

      if (!response.ok) {
        throw new Error(
          getApiError(body, response.status),
        );
      }

      if (!isFundingConfig(body)) {
        throw new Error(
          'Funding configuration returned an invalid response.',
        );
      }

      setConfig(body);
    } catch (error) {
      setReadError(
        error instanceof Error
          ? error.message
          : 'Funding configuration could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleTxConfirmed = useCallback(async () => {
    setActionError('');
    setConfirmedMessage(
      '20% 운영 / 80% 사용자 배분 설정이 온체인에서 확인되었습니다. / The 20% team / 80% user split was confirmed on-chain.',
    );
    await refresh();
  }, [refresh]);

  const handleTxFailedOrCancelled = useCallback(
    (error?: Error | string) => {
      setConfirmedMessage('');
      setActionError(
        error instanceof Error
          ? error.message
          : String(error || 'Transaction cancelled.'),
      );
    },
    [],
  );

  const transaction = useSendTransaction({
    signerAccountAddress:
      account?.address,
    onTxConfirmed: handleTxConfirmed,
    onTxFailedOrCancelled:
      handleTxFailedOrCancelled,
  });

  const isAdmin = Boolean(
    wallet &&
      config &&
      wallet === config.appAdmin,
  );

  const distributorReady = Boolean(
    wallet &&
      config?.rewardDistributors.includes(
        wallet,
      ),
  );

  const target =
    config?.targetTeamAllocationPercentage ??
    20;
  const alreadyConfigured =
    config?.teamAllocationPercentage === target;
  const safeStartingValue = Boolean(
    config &&
      (config.teamAllocationPercentage === 0 ||
        alreadyConfigured),
  );

  const transactionBusy =
    transaction.status === 'pending' ||
    transaction.status ===
      'waitingConfirmation';

  const canSubmit = Boolean(
    config &&
      wallet &&
      isAdmin &&
      distributorReady &&
      config.network === 'mainnet' &&
      safeStartingValue &&
      !alreadyConfigured &&
      !transactionBusy,
  );

  let statusText = '';
  if (config) {
    if (alreadyConfigured) {
      statusText = '설정 완료 / Configured';
    } else if (
      config.teamAllocationPercentage !== 0
    ) {
      statusText =
        '예상하지 못한 기존 값 — 변경 중지 / Unexpected existing value — blocked';
    } else {
      statusText = '변경 준비 완료 / Ready to update';
    }
  }

  const setTwentyPercent =
    useCallback(async () => {
      if (!config || !canSubmit) {
        return;
      }

      const confirmed = window.confirm(
        'VeInvite Team Allocation을 20%로 설정합니다.\n사용자 보상 몫은 80%가 됩니다.\n\nSet VeInvite Team Allocation to 20%?\nUser rewards allocation will be 80%.',
      );

      if (!confirmed) {
        return;
      }

      setActionError('');
      setConfirmedMessage('');

      try {
        const data =
          x2EarnAppsInterface.encodeFunctionData(
            'setTeamAllocationPercentage',
            [config.appId, BigInt(20)],
          );

        await transaction.sendTransaction([
          {
            to: config.x2EarnAppsAddress,
            value: '0x0',
            data,
          },
        ]);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : 'Transaction could not be submitted.',
        );
      }
    }, [config, canSubmit, transaction]);

  return (
    <main
      style={{
        minHeight: '100dvh',
        background:
          'linear-gradient(180deg, #120d20 0%, #0c0914 100%)',
        color: '#ffffff',
        padding: '28px 18px 56px',
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: '18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
              보상 배분 설정 / Funding Split
            </h1>
          </div>
          <WalletControl />
        </div>

        <section
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '18px',
            background: 'rgba(255,255,255,0.055)',
            padding: '20px',
            display: 'grid',
            gap: '15px',
          }}
        >
          <strong>
            20% 운영 / 80% 사용자 보상
          </strong>
          <p
            style={{
              margin: 0,
              opacity: 0.76,
              lineHeight: 1.6,
            }}
          >
            이 트랜잭션은 B3TR을 전송하지 않습니다. VeBetterDAO allocation을 claim할 때 적용되는 팀/사용자 보상 비율만 변경합니다.
            <br />
            This transaction does not transfer B3TR. It only changes the team/user rewards split used when allocations are claimed.
          </p>
        </section>

        <section
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '18px',
            background: 'rgba(255,255,255,0.04)',
            padding: '20px',
            display: 'grid',
            gap: '12px',
          }}
        >
          {loading && !config ? (
            <span>
              온체인 설정 확인 중… / Reading on-chain configuration…
            </span>
          ) : null}

          {readError ? (
            <div style={{ color: '#ff9d9d' }}>
              {readError}
            </div>
          ) : null}

          {config ? (
            <>
              <div>
                Network: <strong>{config.network}</strong>
              </div>
              <div>
                현재 Team Allocation / Current:{' '}
                <strong>
                  {config.teamAllocationPercentage}%
                </strong>
              </div>
              <div>
                목표 / Target:{' '}
                <strong>{target}%</strong>
              </div>
              <div>
                App Admin:{' '}
                <strong>
                  {shortAddress(config.appAdmin)}
                </strong>
              </div>
              <div>
                Reward Distributor:{' '}
                <strong>
                  {distributorReady
                    ? '확인됨 / Confirmed'
                    : '미확인 / Not confirmed'}
                </strong>
              </div>
              <div>
                상태 / Status:{' '}
                <strong>{statusText}</strong>
              </div>
            </>
          ) : null}
        </section>

        {!wallet ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,190,60,0.1)',
              lineHeight: 1.5,
            }}
          >
            운영 지갑을 연결하세요. / Connect the VeInvite admin wallet.
          </div>
        ) : null}

        {wallet && config && !isAdmin ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,80,80,0.1)',
              color: '#ffb1b1',
            }}
          >
            연결된 지갑은 VeInvite App Admin이 아닙니다. / The connected wallet is not the VeInvite App Admin.
          </div>
        ) : null}

        {config &&
        config.teamAllocationPercentage !== 0 &&
        !alreadyConfigured ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,80,80,0.1)',
              color: '#ffb1b1',
            }}
          >
            현재 값이 예상한 0%가 아니므로 자동 변경을 차단했습니다. 먼저 설정을 검토하세요. / The current value is not the expected 0%, so the update is blocked for review.
          </div>
        ) : null}

        {confirmedMessage ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(56,211,137,0.12)',
              color: '#8ff0bd',
            }}
          >
            {confirmedMessage}
          </div>
        ) : null}

        {actionError ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,80,80,0.1)',
              color: '#ffb1b1',
            }}
          >
            {actionError}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            void setTwentyPercent();
          }}
          style={{
            minHeight: '52px',
            border: 0,
            borderRadius: '15px',
            fontWeight: 800,
            fontSize: '16px',
            cursor: canSubmit
              ? 'pointer'
              : 'not-allowed',
            background: canSubmit
              ? '#f7c928'
              : 'rgba(255,255,255,0.1)',
            color: canSubmit
              ? '#141414'
              : 'rgba(255,255,255,0.45)',
          }}
        >
          {alreadyConfigured
            ? '20% 설정 완료 / 20% configured'
            : transactionBusy
              ? '트랜잭션 확인 중… / Confirming transaction…'
              : 'Team Allocation 20%로 설정 / Set Team Allocation to 20%'}
        </button>

        <button
          type="button"
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
            cursor: 'pointer',
          }}
        >
          온체인 값 다시 확인 / Refresh on-chain values
        </button>
      </div>
    </main>
  );
}
