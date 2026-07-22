'use client';

import { Brand } from './Brand';

type Locale = 'ko' | 'en';

type DemoOutcome =
  | 'success'
  | 'existing'
  | 'other'
  | 'review';

type InviteLandingV2Props = {
  locale: Locale;
  disabled?: boolean;
  demoMode?: boolean;
  demoOutcome: DemoOutcome;
  onLocaleChange: (locale: Locale) => void;
  onBeginnerStart: () => void;
  onExistingWallet: () => void;
  onDemoOutcomeChange: (
    outcome: DemoOutcome,
  ) => void;
};

const COPY = {
  ko: {
    inviteBadge: '친구 초대',
    rewardLabel: 'WELCOME MISSION',
    rewardTitle: '첫 B3TR 받기',
    title: '세 단계만 완료하면 돼요',
    step1: '계정',
    step2: '활동',
    step3: '응원',
    time: '약 10분',
    free: '무료',
    start: '시작하기',
    existingWallet: '이미 VeWorld 지갑이 있어요',
    reassurance: '처음이어도 괜찮아요. 한 단계씩 안내해 드려요.',
    demoResult: '데모 결과',
    demoSuccess: '정상 연결',
    demoExisting: '기존 VeBetter 이용자',
    demoOther: '다른 추천인 연결',
    demoReview: '안전성 검토',
  },
  en: {
    inviteBadge: 'FRIEND INVITE',
    rewardLabel: 'WELCOME MISSION',
    rewardTitle: 'Earn your first B3TR',
    title: 'Just three simple steps',
    step1: 'Account',
    step2: 'Activity',
    step3: 'Support',
    time: 'About 10 min',
    free: 'Free',
    start: 'Start',
    existingWallet: 'I already have a VeWorld wallet',
    reassurance: 'New here? No problem. We guide you one step at a time.',
    demoResult: 'Demo result',
    demoSuccess: 'Eligible',
    demoExisting: 'Existing VeBetter user',
    demoOther: 'Connected to another inviter',
    demoReview: 'Security review',
  },
} as const;

export function InviteLandingV2({
  locale,
  disabled = false,
  demoMode = false,
  demoOutcome,
  onLocaleChange,
  onBeginnerStart,
  onExistingWallet,
  onDemoOutcomeChange,
}: InviteLandingV2Props) {
  const t = COPY[locale];

  return (
    <main className="screen">
      <header className="topBar">
        <Brand compact />

        <label className="language">
          <span aria-hidden="true">◎</span>
          <select
            aria-label="Language"
            value={locale}
            onChange={(event) =>
              onLocaleChange(
                event.target.value as Locale,
              )
            }
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      <section className="gameCard">
        <div className="inviteBadge">
          {t.inviteBadge}
        </div>

        <div
          className="rewardVisual"
          aria-hidden="true"
        >
          <div className="halo haloOne" />
          <div className="halo haloTwo" />
          <div className="token">
            <span>V</span>
          </div>
        </div>

        <div className="rewardLabel">
          {t.rewardLabel}
        </div>

        <h1>{t.rewardTitle}</h1>

        <p className="title">{t.title}</p>

        <div
          className="steps"
          aria-label={t.title}
        >
          <div className="step active">
            <span>1</span>
            <b>{t.step1}</b>
          </div>

          <div className="line" />

          <div className="step">
            <span>2</span>
            <b>{t.step2}</b>
          </div>

          <div className="line" />

          <div className="step">
            <span>3</span>
            <b>{t.step3}</b>
          </div>
        </div>

        <div className="meta">
          <span>{t.time}</span>
          <i />
          <span>{t.free}</span>
        </div>

        <button
          type="button"
          className="startButton"
          onClick={onBeginnerStart}
          disabled={disabled}
        >
          {t.start}
          <span aria-hidden="true">›</span>
        </button>

        <button
          type="button"
          className="walletLink"
          onClick={onExistingWallet}
          disabled={disabled}
        >
          {t.existingWallet}
        </button>
      </section>

      <p className="reassurance">
        {t.reassurance}
      </p>

      {demoMode ? (
        <label className="demoSelect">
          {t.demoResult}

          <select
            value={demoOutcome}
            onChange={(event) =>
              onDemoOutcomeChange(
                event.target
                  .value as DemoOutcome,
              )
            }
          >
            <option value="success">
              {t.demoSuccess}
            </option>
            <option value="existing">
              {t.demoExisting}
            </option>
            <option value="other">
              {t.demoOther}
            </option>
            <option value="review">
              {t.demoReview}
            </option>
          </select>
        </label>
      ) : null}

      <style jsx>{`
        .screen {
          min-height: 100svh;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 18px 32px;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 50% 24%,
              rgba(116, 72, 255, 0.19),
              transparent 34%
            ),
            #070914;
        }

        .topBar {
          width: min(100%, 430px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
        }

        .language {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 38px;
          padding: 0 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          color: #ded8ff;
        }

        .language select {
          border: 0;
          outline: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
        }

        .language option {
          color: #111421;
        }

        .gameCard {
          position: relative;
          overflow: hidden;
          width: min(100%, 430px);
          box-sizing: border-box;
          padding: 24px 22px 20px;
          border: 1px solid rgba(158, 122, 255, 0.3);
          border-radius: 28px;
          background:
            linear-gradient(
              160deg,
              rgba(37, 28, 82, 0.98),
              rgba(15, 17, 31, 0.98) 64%
            );
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .gameCard::before {
          content: '';
          position: absolute;
          width: 240px;
          height: 240px;
          right: -110px;
          top: -120px;
          border-radius: 50%;
          background: rgba(123, 75, 255, 0.22);
          filter: blur(4px);
        }

        .inviteBadge {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          height: 28px;
          padding: 0 11px;
          border: 1px solid rgba(171, 139, 255, 0.28);
          border-radius: 999px;
          background: rgba(116, 72, 255, 0.13);
          color: #cfc1ff;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .rewardVisual {
          position: relative;
          width: 128px;
          height: 128px;
          margin: 20px auto 12px;
          display: grid;
          place-items: center;
        }

        .halo {
          position: absolute;
          border-radius: 50%;
        }

        .haloOne {
          inset: 0;
          border: 1px solid rgba(164, 129, 255, 0.32);
          background: rgba(116, 72, 255, 0.08);
        }

        .haloTwo {
          inset: 14px;
          border: 1px solid rgba(194, 173, 255, 0.3);
          background: rgba(116, 72, 255, 0.1);
        }

        .token {
          position: relative;
          z-index: 2;
          width: 72px;
          height: 72px;
          border-radius: 24px;
          display: grid;
          place-items: center;
          transform: rotate(45deg);
          background:
            linear-gradient(
              135deg,
              #9a74ff,
              #6d3fff
            );
          box-shadow:
            0 14px 34px rgba(92, 49, 255, 0.46),
            inset 0 1px 0 rgba(255, 255, 255, 0.34);
        }

        .token span {
          transform: rotate(-45deg);
          font-size: 1.8rem;
          font-weight: 950;
          letter-spacing: -0.08em;
        }

        .rewardLabel {
          text-align: center;
          color: #a995f4;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        h1 {
          margin: 6px 0 0;
          text-align: center;
          font-size: clamp(2rem, 8vw, 2.7rem);
          line-height: 1.08;
          letter-spacing: -0.055em;
        }

        .title {
          margin: 10px 0 20px;
          text-align: center;
          color: #cbc7dc;
          font-size: 0.98rem;
          font-weight: 700;
        }

        .steps {
          display: grid;
          grid-template-columns: auto 1fr auto 1fr auto;
          align-items: center;
          gap: 8px;
          margin: 0 2px 18px;
        }

        .step {
          display: grid;
          justify-items: center;
          gap: 6px;
          color: #858196;
        }

        .step span {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          font-size: 0.82rem;
          font-weight: 900;
        }

        .step b {
          font-size: 0.72rem;
        }

        .step.active {
          color: #ffffff;
        }

        .step.active span {
          border-color: #9b78ff;
          background: #7448ff;
          box-shadow: 0 0 22px rgba(116, 72, 255, 0.54);
        }

        .line {
          height: 2px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
        }

        .meta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 16px;
          color: #b4afc2;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .meta i {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #786f91;
        }

        .startButton {
          width: 100%;
          min-height: 58px;
          border: 0;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background:
            linear-gradient(
              135deg,
              #8255ff,
              #6d3fff
            );
          color: #ffffff;
          font: inherit;
          font-size: 1.08rem;
          font-weight: 950;
          cursor: pointer;
          box-shadow:
            0 15px 34px rgba(87, 45, 255, 0.36),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
          transition:
            transform 150ms ease,
            filter 150ms ease;
        }

        .startButton span {
          font-size: 1.75rem;
          line-height: 1;
          margin-top: -2px;
        }

        .startButton:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.07);
        }

        .startButton:active:not(:disabled) {
          transform: translateY(1px) scale(0.995);
        }

        .startButton:disabled,
        .walletLink:disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }

        .walletLink {
          display: block;
          width: 100%;
          margin: 15px 0 0;
          border: 0;
          background: transparent;
          color: #a9a4bb;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 800;
          text-decoration: underline;
          text-decoration-color: rgba(169, 164, 187, 0.44);
          text-underline-offset: 4px;
          cursor: pointer;
        }

        .reassurance {
          width: min(100%, 430px);
          margin: 15px 0 0;
          text-align: center;
          color: #777387;
          font-size: 0.75rem;
          line-height: 1.5;
        }

        .demoSelect {
          width: min(100%, 430px);
          box-sizing: border-box;
          display: grid;
          gap: 7px;
          margin-top: 18px;
          padding: 12px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          color: #777387;
          font-size: 0.7rem;
        }

        .demoSelect select {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 9px;
          background: #111421;
          color: #ffffff;
        }

        @media (max-width: 380px) {
          .screen {
            padding-inline: 14px;
          }

          .gameCard {
            padding-inline: 18px;
          }

          .rewardVisual {
            width: 112px;
            height: 112px;
          }

          .token {
            width: 64px;
            height: 64px;
            border-radius: 21px;
          }
        }
      `}</style>
    </main>
  );
}
