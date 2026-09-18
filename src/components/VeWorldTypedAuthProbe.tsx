'use client';

import {
  useMemo,
  useState,
} from 'react';
import {
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

type ProbeState = {
  status: 'idle' | 'pending' | 'success' | 'error';
  title: string;
  lines: string[];
};

const MAINNET_CHAIN_ID = 100009;

function short(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 18
    ? `${value.slice(0, 8)}…${value.slice(-6)}`
    : value;
}

function buildTypedData(walletAddress: string) {
  const nonce =
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const issuedAt =
    new Date().toISOString();

  return {
    domain: {
      name: 'VeInvite',
      version: '1',
      chainId: MAINNET_CHAIN_ID,
    },
    types: {
      Authentication: [
        { name: 'wallet', type: 'address' },
        { name: 'nonce', type: 'string' },
        { name: 'issuedAt', type: 'string' },
        { name: 'origin', type: 'string' },
      ],
    },
    value: {
      wallet: walletAddress,
      nonce,
      issuedAt,
      origin: window.location.origin,
    },
  };
}

export function VeWorldTypedAuthProbe() {
  const {
    account: veChainKitAccount,
    connection,
  } = useVeChainKitWallet();
  const {
    account: dappKitAccount,
    source,
    availableMethods,
    connectV2,
    requestTypedData,
  } = useDappKitWallet();

  const [probe, setProbe] =
    useState<ProbeState>({
      status: 'idle',
      title: '아직 테스트하지 않음',
      lines: [],
    });

  const walletAddress =
    veChainKitAccount?.address
      ?.trim()
      .toLowerCase() ||
    dappKitAccount
      ?.trim()
      .toLowerCase() ||
    null;

  const inAppBrowser =
    typeof window !== 'undefined' &&
    Boolean(
      (
        window as Window & {
          vechain?: {
            isInAppBrowser?: boolean;
          };
        }
      ).vechain?.isInAppBrowser,
    );

  const typedDataSupported =
    availableMethods.includes(
      'thor_signTypedData',
    );

  const connectionSummary = useMemo(
    () => [
      `VeChainKit: ${short(veChainKitAccount?.address)}`,
      `DAppKit: ${short(dappKitAccount)}`,
      `source: ${source ?? '—'}`,
      `VeWorld in-app: ${inAppBrowser ? 'YES' : 'NO'}`,
      `thor_signTypedData: ${typedDataSupported ? 'YES' : 'NO'}`,
    ],
    [
      dappKitAccount,
      inAppBrowser,
      source,
      typedDataSupported,
      veChainKitAccount?.address,
    ],
  );

  const runConnectV2Probe = async () => {
    if (!walletAddress) {
      setProbe({
        status: 'error',
        title: '지갑이 연결되지 않음',
        lines: [
          '먼저 VeWorld에서 지갑을 연결한 뒤 다시 눌러주세요.',
        ],
      });
      return;
    }

    setProbe({
      status: 'pending',
      title: 'Test A 진행 중',
      lines: [
        'VeWorld의 typed-data 서명 화면을 확인해주세요.',
      ],
    });

    const startedAt = performance.now();

    try {
      const typedData =
        buildTypedData(walletAddress);
      const result =
        await connectV2(typedData);
      const elapsed =
        Math.round(
          performance.now() - startedAt,
        );

      setProbe({
        status: 'success',
        title: 'Test A 성공',
        lines: [
          `완료 시간: ${elapsed}ms`,
          `반환 signer: ${short(result.signer)}`,
          `signature: ${short(result.signature)}`,
          `accounts: ${result.accounts?.length ?? 0}`,
          '서명 완료 후 VeWorld 창이 자동으로 닫혔는지가 가장 중요합니다.',
        ],
      });
    } catch (error) {
      setProbe({
        status: 'error',
        title: 'Test A 실패',
        lines: [
          error instanceof Error
            ? error.message
            : String(error),
          'VeWorld 화면에 표시된 오류도 같이 확인해주세요.',
        ],
      });
    }
  };

  const runDirectTypedDataProbe =
    async () => {
      if (!walletAddress) {
        setProbe({
          status: 'error',
          title: '지갑이 연결되지 않음',
          lines: [
            '먼저 VeWorld에서 지갑을 연결한 뒤 다시 눌러주세요.',
          ],
        });
        return;
      }

      setProbe({
        status: 'pending',
        title: 'Test B 진행 중',
        lines: [
          'VeWorld의 typed-data 서명 화면을 확인해주세요.',
        ],
      });

      const startedAt = performance.now();

      try {
        const typedData =
          buildTypedData(walletAddress);
        const signature =
          await requestTypedData(
            typedData.domain,
            typedData.types,
            typedData.value,
            {
              signer: walletAddress,
            },
          );
        const elapsed =
          Math.round(
            performance.now() - startedAt,
          );

        setProbe({
          status: 'success',
          title: 'Test B 성공',
          lines: [
            `완료 시간: ${elapsed}ms`,
            `signature: ${short(signature)}`,
            '서명 완료 후 VeWorld 창이 자동으로 닫혔는지가 가장 중요합니다.',
          ],
        });
      } catch (error) {
        setProbe({
          status: 'error',
          title: 'Test B 실패',
          lines: [
            error instanceof Error
              ? error.message
              : String(error),
            'VeWorld 화면에 표시된 오류도 같이 확인해주세요.',
          ],
        });
      }
    };

  const busy =
    probe.status === 'pending';

  return (
    <main className="authProbe">
      <section className="authProbeCard">
        <span className="eyebrow">
          VEWORLD AUTH PROBE
        </span>
        <h1>
          Certificate 없이 로그인 서명 테스트
        </h1>
        <p className="lead">
          Production 로그인은 바꾸지 않았습니다.
          이 preview에서 VeWorld의 typed-data
          서명창이 정상 종료되는지만 확인합니다.
        </p>

        <div className="summary">
          {connectionSummary.map((line) => (
            <div key={line}>{line}</div>
          ))}
          <div>
            connected:{' '}
            {connection.isConnected
              ? 'YES'
              : 'NO'}
          </div>
        </div>

        <div className="tests">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void runConnectV2Probe();
            }}
          >
            <b>Test A</b>
            <span>
              connectV2 + typed-data
            </span>
            <small>
              지갑 상태 동기화 + 서명
            </small>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void runDirectTypedDataProbe();
            }}
          >
            <b>Test B</b>
            <span>
              typed-data 서명만
            </span>
            <small>
              signer를 직접 지정
            </small>
          </button>
        </div>

        <div
          className={`result ${probe.status}`}
        >
          <strong>{probe.title}</strong>
          {probe.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <ol>
          <li>
            VeWorld에서 다른 지갑으로 바꿉니다.
          </li>
          <li>
            이 preview로 돌아와 Test A를
            누릅니다.
          </li>
          <li>
            서명 후 창이 바로 닫히면
            성공입니다.
          </li>
          <li>
            Test A가 오류면 Test B도
            한 번 확인합니다.
          </li>
        </ol>
      </section>

      <style>{`
        .authProbe {
          min-height:100svh;
          padding:20px 14px 60px;
          background:#080807;
          color:#f8f6ef;
          font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        .authProbeCard {
          width:min(100%,560px);
          margin:0 auto;
          padding:24px 18px;
          border:1px solid rgba(255,255,255,.09);
          border-radius:24px;
          background:#11100e;
          box-sizing:border-box;
        }
        .eyebrow {
          color:#f4b728;
          font-size:.68rem;
          font-weight:900;
          letter-spacing:.11em;
        }
        h1 {
          margin:9px 0 0;
          font-size:1.55rem;
          line-height:1.15;
          letter-spacing:-.04em;
        }
        .lead {
          margin:12px 0 0;
          color:#aaa39a;
          font-size:.84rem;
          line-height:1.65;
        }
        .summary {
          margin-top:18px;
          padding:13px;
          display:grid;
          gap:6px;
          border-radius:15px;
          background:#090908;
          color:#c9c2b8;
          font:700 .72rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
          overflow-wrap:anywhere;
        }
        .tests {
          margin-top:16px;
          display:grid;
          gap:10px;
          grid-template-columns:1fr 1fr;
        }
        button {
          min-height:116px;
          padding:14px;
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          justify-content:center;
          gap:4px;
          border:1px solid rgba(244,183,40,.24);
          border-radius:17px;
          background:rgba(244,183,40,.08);
          color:#f8f6ef;
          text-align:left;
          font:inherit;
        }
        button:disabled {
          opacity:.45;
        }
        button b {
          color:#f4b728;
          font-size:.72rem;
        }
        button span {
          font-size:.88rem;
          font-weight:850;
        }
        button small {
          color:#9d968d;
          font-size:.68rem;
        }
        .result {
          min-height:76px;
          margin-top:14px;
          padding:13px;
          border-radius:15px;
          background:rgba(255,255,255,.035);
          border:1px solid rgba(255,255,255,.07);
        }
        .result.success {
          border-color:rgba(72,211,149,.28);
        }
        .result.error {
          border-color:rgba(255,113,134,.28);
        }
        .result.pending {
          border-color:rgba(244,183,40,.28);
        }
        .result strong {
          font-size:.82rem;
        }
        .result p {
          margin:6px 0 0;
          color:#aaa39a;
          font-size:.72rem;
          line-height:1.5;
          overflow-wrap:anywhere;
        }
        ol {
          margin:18px 0 0;
          padding-left:20px;
          color:#aaa39a;
          font-size:.75rem;
          line-height:1.75;
        }
        @media (max-width:430px) {
          .authProbe {
            padding:10px 10px 50px;
          }
          .authProbeCard {
            padding:20px 14px;
            border-radius:20px;
          }
          .tests {
            grid-template-columns:1fr;
          }
          button {
            min-height:92px;
          }
        }
      `}</style>
    </main>
  );
}
