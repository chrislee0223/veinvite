type Locale = 'en' | 'ko';

const COPY = {
  ko: {
    eyebrow: '30초 가이드',
    title: '이렇게 초대하면 돼요',
    description:
      'VeInvite는 링크만 열었다고 보상을 주지 않아요. 친구가 생태계를 끝까지 경험하고 검증을 통과해야 초대가 완료돼요.',
    steps: [
      {
        title: '친구 한 명 초대',
        description:
          '활성 초대 슬롯은 한 개예요. 초대가 끝나면 다음 친구를 초대할 수 있어요.',
      },
      {
        title: '친구가 모든 미션 완료',
        description:
          '신규 또는 복귀 사용자가 dApp 3개를 이용하고, VOT3 전환과 투표까지 마쳐야 해요.',
      },
      {
        title: '검증 후 보상 수령',
        description:
          '최종 검토를 통과하면 알림을 받고 홈에서 보상 수령을 요청할 수 있어요.',
      },
    ],
    eligibilityTitle: '누가 참여할 수 있나요?',
    newTitle: '신규 사용자',
    newDescription:
      '이전 VeBetterDAO 보상이나 투표 이력이 없는 지갑이에요.',
    returningTitle: '복귀 사용자',
    returningDescription:
      '최근 12개 완료 라운드 동안 보상이나 투표 활동이 없었던 사용자예요.',
    countTitle: '공개 집계 기준',
    countDescription:
      '모든 미션을 완료하고 검증을 통과한 지갑만 신규·복귀 사용자 수에 포함해요.',
  },
  en: {
    eyebrow: '30-SECOND GUIDE',
    title: 'How VeInvite works',
    description:
      "VeInvite doesn't reward a link click. A referral counts only after your friend completes the full journey and passes verification.",
    steps: [
      {
        title: 'Invite one friend',
        description:
          'One invite can be active at a time. Once it is complete, you can invite someone else.',
      },
      {
        title: 'They finish every mission',
        description:
          'An eligible new or returning user completes three dApps, converts to VOT3 and votes.',
      },
      {
        title: 'Claim after verification',
        description:
          "Once the final checks are complete, you'll get a notice and can request your reward from Home.",
      },
    ],
    eligibilityTitle: 'Who can take part?',
    newTitle: 'New user',
    newDescription:
      'A wallet with no previous VeBetterDAO reward or voting history.',
    returningTitle: 'Returning user',
    returningDescription:
      'A user with no reward or voting activity in the last 12 completed rounds.',
    countTitle: 'What the public totals count',
    countDescription:
      'New and returning user totals include only wallets that finished every mission and passed verification.',
  },
} as const;

export function AppGuide({
  locale,
}: {
  locale: Locale;
}) {
  const t = COPY[locale];

  return (
    <section className="guidePage">
      <header>
        <span>{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{t.description}</p>
      </header>

      <ol className="steps">
        {t.steps.map((step, index) => (
          <li key={step.title}>
            <span className="stepNumber">
              {index + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="eligibilityCard">
        <h2>{t.eligibilityTitle}</h2>
        <Definition
          title={t.newTitle}
          description={t.newDescription}
          icon="N"
        />
        <Definition
          title={t.returningTitle}
          description={t.returningDescription}
          icon="R"
        />
        <Definition
          title={t.countTitle}
          description={t.countDescription}
          icon="✓"
        />
      </section>

      <style jsx>{`
        .guidePage {
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
          text-wrap: balance;
          word-break: keep-all;
        }

        header p {
          margin: 12px 0 0;
          color: #aaa69d;
          font-size: 0.9rem;
          line-height: 1.62;
          word-break: keep-all;
        }

        .steps {
          margin: 22px 0 0;
          padding: 0;
          display: grid;
          gap: 11px;
          list-style: none;
        }

        .steps li {
          padding: 17px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          border: 1px solid rgba(255, 205, 80, 0.14);
          border-radius: 19px;
          background: rgba(255, 255, 255, 0.035);
        }

        .stepNumber {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: linear-gradient(135deg, #ffd24d, #efa718);
          color: #17120a;
          font-size: 0.78rem;
          font-weight: 950;
        }

        .steps strong {
          display: block;
          font-size: 0.91rem;
        }

        .steps p {
          margin: 5px 0 0;
          color: #96928a;
          font-size: 0.76rem;
          line-height: 1.55;
          word-break: keep-all;
        }

        .eligibilityCard {
          margin-top: 18px;
          padding: 20px;
          border: 1px solid rgba(255, 205, 80, 0.14);
          border-radius: 22px;
          background:
            radial-gradient(
              circle at 90% 0,
              rgba(255, 194, 41, 0.12),
              transparent 34%
            ),
            rgba(255, 255, 255, 0.03);
        }

        .eligibilityCard h2 {
          margin: 0 0 14px;
          font-size: 1.08rem;
          letter-spacing: -0.025em;
        }
      `}</style>
    </section>
  );
}

function Definition({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="definition">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>

      <style jsx>{`
        .definition {
          padding: 12px 0;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .definition > span {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(255, 201, 61, 0.1);
          color: #ffc93d;
          font-size: 0.7rem;
          font-weight: 950;
        }

        strong {
          display: block;
          font-size: 0.82rem;
        }

        p {
          margin: 4px 0 0;
          color: #8f8b83;
          font-size: 0.73rem;
          line-height: 1.5;
          word-break: keep-all;
        }
      `}</style>
    </div>
  );
}
