'use client';

import { useState } from 'react';
import Link from 'next/link';

type Locale = 'en' | 'ko';

const COPY = {
  ko: {
    eyebrow: '설정',
    title: '앱 설정',
    walletTitle: '지갑',
    connected: '연결됨',
    notConnected: '연결된 지갑이 없어요',
    connect: '지갑 연결',
    connectAnother: '다른 지갑 연결',
    disconnect: '지갑 연결 해제',
    working: '처리 중…',
    walletNote:
      '연결을 해제해도 기존 초대와 보상 기록은 그대로 유지돼요.',
    switchNote:
      '다른 지갑을 연결하면 새 지갑에서 소유권 확인 서명을 한 번 진행해요.',
    actionError:
      '지갑 연결 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
    languageTitle: '언어',
    languageNote:
      '선택한 언어는 이 기기에 저장돼요.',
    legalTitle: '약관 및 정책',
    privacy: '개인정보처리방침',
    terms: '이용약관',
  },
  en: {
    eyebrow: 'SETTINGS',
    title: 'App settings',
    walletTitle: 'Wallet',
    connected: 'Connected',
    notConnected: 'No wallet connected',
    connect: 'Connect wallet',
    connectAnother: 'Connect another wallet',
    disconnect: 'Disconnect wallet',
    working: 'Working…',
    walletNote:
      "Disconnecting won't delete your invite or reward history.",
    switchNote:
      "When you connect another wallet, you'll sign once to verify that you own it.",
    actionError:
      'Your wallet connection could not be changed. Please try again.',
    languageTitle: 'Language',
    languageNote:
      'Your language choice is saved on this device.',
    legalTitle: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
  },
} as const;

function maskWallet(address: string): string {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}

export function AppSettings({
  locale,
  wallet,
  isWalletActionPending,
  onLocaleChange,
  onConnect,
  onConnectAnother,
  onDisconnect,
}: {
  locale: Locale;
  wallet: string | null;
  isWalletActionPending: boolean;
  onLocaleChange: (locale: Locale) => void;
  onConnect: () => void;
  onConnectAnother: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const t = COPY[locale];

  const runWalletAction = async (
    action: () => Promise<void>,
  ) => {
    setError('');

    try {
      await action();
    } catch (actionError) {
      console.error(
        'Wallet settings action failed:',
        actionError,
      );
      setError(t.actionError);
    }
  };

  return (
    <section className="settingsPage">
      <header>
        <span>{t.eyebrow}</span>
        <h1>{t.title}</h1>
      </header>

      <section className="settingsCard">
        <div className="cardHeading">
          <h2>{t.walletTitle}</h2>
          {wallet ? (
            <span className="connectedBadge">
              <i />
              {t.connected}
            </span>
          ) : null}
        </div>

        {wallet ? (
          <>
            <code>{maskWallet(wallet)}</code>
            <p>{t.walletNote}</p>
            <p>{t.switchNote}</p>

            <div className="walletActions">
              <button
                type="button"
                className="primarySettingAction"
                disabled={isWalletActionPending}
                onClick={() =>
                  void runWalletAction(
                    onConnectAnother,
                  )
                }
              >
                {isWalletActionPending
                  ? t.working
                  : t.connectAnother}
              </button>
              <button
                type="button"
                className="secondarySettingAction"
                disabled={isWalletActionPending}
                onClick={() =>
                  void runWalletAction(
                    onDisconnect,
                  )
                }
              >
                {t.disconnect}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{t.notConnected}</p>
            <button
              type="button"
              className="primarySettingAction"
              onClick={onConnect}
            >
              {t.connect}
            </button>
          </>
        )}

        {error ? (
          <p className="errorMessage" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="settingsCard">
        <h2>{t.languageTitle}</h2>
        <p>{t.languageNote}</p>
        <div className="languageButtons">
          <button
            type="button"
            className={
              locale === 'ko' ? 'selected' : ''
            }
            onClick={() =>
              onLocaleChange('ko')
            }
          >
            한국어
          </button>
          <button
            type="button"
            className={
              locale === 'en' ? 'selected' : ''
            }
            onClick={() =>
              onLocaleChange('en')
            }
          >
            English
          </button>
        </div>
      </section>

      <section className="settingsCard legalCard">
        <h2>{t.legalTitle}</h2>
        <Link href="/privacy">
          {t.privacy}
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/terms">
          {t.terms}
          <span aria-hidden="true">›</span>
        </Link>
      </section>

      <style jsx>{`
        .settingsPage {
          width: min(100%, 560px);
          margin: 0 auto;
          padding-bottom: 12px;
        }

        header > span {
          color: #f8bc2e;
          font-size: 0.7rem;
          font-weight: 950;
          letter-spacing: 0.12em;
        }

        h1 {
          margin: 8px 0 0;
          font-size: clamp(2rem, 8vw, 2.75rem);
          line-height: 1.05;
          letter-spacing: -0.05em;
        }

        .settingsCard {
          box-sizing: border-box;
          margin-top: 18px;
          padding: 19px;
          border: 1px solid rgba(255, 205, 80, 0.14);
          border-radius: 21px;
          background: rgba(255, 255, 255, 0.035);
        }

        .cardHeading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        h2 {
          margin: 0;
          font-size: 1rem;
          letter-spacing: -0.02em;
        }

        .connectedBadge {
          min-height: 25px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(69, 218, 151, 0.18);
          border-radius: 999px;
          background: rgba(55, 190, 132, 0.08);
          color: #74e9b3;
          font-size: 0.63rem;
          font-weight: 900;
        }

        .connectedBadge i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #55dea1;
          box-shadow: 0 0 12px rgba(85, 222, 161, 0.55);
        }

        code {
          margin-top: 14px;
          padding: 14px;
          display: block;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          background: #0b0b0a;
          color: #eeeade;
          font-size: 0.82rem;
          overflow-wrap: anywhere;
        }

        p {
          margin: 11px 0 0;
          color: #918d84;
          font-size: 0.75rem;
          line-height: 1.52;
          word-break: keep-all;
        }

        .walletActions,
        .languageButtons {
          margin-top: 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .primarySettingAction,
        .secondarySettingAction,
        .languageButtons button {
          min-height: 48px;
          border-radius: 15px;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 900;
        }

        .primarySettingAction {
          width: 100%;
          margin-top: 16px;
          border: 0;
          background: linear-gradient(135deg, #ffd24d, #f1aa1e);
          color: #17120a;
        }

        .walletActions .primarySettingAction {
          margin-top: 0;
        }

        .secondarySettingAction,
        .languageButtons button {
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.035);
          color: #d6d2c9;
        }

        button:disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }

        .errorMessage {
          color: #ff8797;
        }

        .languageButtons button.selected {
          border-color: rgba(255, 201, 61, 0.3);
          background: rgba(255, 201, 61, 0.1);
          color: #ffd66e;
        }

        .legalCard {
          display: grid;
        }

        .legalCard h2 {
          margin-bottom: 9px;
        }

        .legalCard :global(a) {
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          color: #d4d0c7;
          font-size: 0.78rem;
          font-weight: 800;
          text-decoration: none;
        }

        .legalCard :global(a span) {
          color: #ffc93d;
          font-size: 1.2rem;
        }

        @media (max-width: 420px) {
          .walletActions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
