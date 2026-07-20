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
    invitation: '친구가 VeBetter로 초대했어요',
    title1: '처음이어도 괜찮아요',
    title2: '첫 B3TR을 받아보세요',
    description:
      '안내를 따라 쉬운 활동 3개를 완료하고, 마음에 드는 앱을 응원하면 참여가 완료돼요.',
    timeLabel: '예상 시간',
    timeValue: '약 10~15분',
    costLabel: '참여 비용',
    costValue: '무료',
    resultLabel: '완료 후',
    resultValue: '친구 1명 초대 가능',
    beginnerStart: '처음부터 시작하기',
    existingWallet:
      '이미 VeWorld 지갑이 있어요',
    b3trHelp:
      'B3TR은 VeBetter 활동을 완료하면 받을 수 있는 디지털 보상이에요. 어려운 용어 없이 한 단계씩 안내해 드릴게요.',
    demoResult: '데모 결과',
    demoSuccess: '정상 연결',
    demoExisting: '기존 VeBetter 이용자',
    demoOther: '다른 추천인 연결',
    demoReview: '안전성 검토',
  },
  en: {
    invitation:
      'A friend invited you to VeBetter',
    title1: 'New here? No problem.',
    title2: 'Earn your first B3TR',
    description:
      'Follow the guide, complete three simple activities, and support an app you enjoyed.',
    timeLabel: 'Estimated time',
    timeValue: 'About 10–15 minutes',
    costLabel: 'Cost',
    costValue: 'Free',
    resultLabel: 'After completion',
    resultValue: 'Invite one friend',
    beginnerStart: 'Start from the beginning',
    existingWallet:
      'I already have a VeWorld wallet',
    b3trHelp:
      'B3TR is a digital reward earned through VeBetter activities. We will guide you one step at a time without complicated terminology.',
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
    <main className="inviteLanding">
      <LanguageSwitcher
        locale={locale}
        onChange={onLocaleChange}
      />

      <Brand compact />

      <div
        className="inviteOrb"
        aria-hidden="true"
      >
        ✦
      </div>

      <span className="eyebrow">
        {t.invitation}
      </span>

      <h1>
        {t.title1}
        <br />
        {t.title2}
      </h1>

      <p>{t.description}</p>

      <section
        className="panel eligibilityInfo"
        aria-label="Participation overview"
      >
        <InfoRow
          icon="⏱"
          label={t.timeLabel}
          value={t.timeValue}
        />

        <InfoRow
          icon="✓"
          label={t.costLabel}
          value={t.costValue}
        />

        <InfoRow
          icon="↗"
          label={t.resultLabel}
          value={t.resultValue}
        />
      </section>

      <button
        type="button"
        className="primaryButton"
        onClick={onBeginnerStart}
        disabled={disabled}
      >
        {t.beginnerStart}
      </button>

      <button
        type="button"
        className="secondaryButton"
        onClick={onExistingWallet}
        disabled={disabled}
      >
        {t.existingWallet}
      </button>

      <p
        className="muted"
        style={{
          marginTop: '4px',
          fontSize: '0.9rem',
          lineHeight: 1.6,
        }}
      >
        {t.b3trHelp}
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
    </main>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 0',
        borderBottom:
          '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background:
            'rgba(116,72,255,0.16)',
          color: '#cbbcff',
        }}
      >
        {icon}
      </span>

      <span
        className="muted"
        style={{ textAlign: 'left' }}
      >
        {label}
      </span>

      <strong
        style={{
          textAlign: 'right',
          color: '#f8f7ff',
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <label
      style={{
        position: 'fixed',
        top: '18px',
        right: '18px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 10px',
        border:
          '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        background:
          'rgba(17,20,33,0.92)',
        color: '#f8f7ff',
        zIndex: 20,
      }}
    >
      <span aria-hidden="true">🌐</span>

      <select
        aria-label="Language"
        value={locale}
        onChange={(event) =>
          onChange(
            event.target.value as Locale,
          )
        }
        style={{
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <option
          value="ko"
          style={{ color: '#111421' }}
        >
          한국어
        </option>

        <option
          value="en"
          style={{ color: '#111421' }}
        >
          English
        </option>
      </select>
    </label>
  );
}
