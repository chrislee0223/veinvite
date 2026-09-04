import { AppNetworkComingSoon } from './AppNetworkComingSoon';
import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { GUIDE_ELIGIBILITY_COPY } from '@/lib/i18n/guideEligibilityCopy';
import { GUIDE_FLOW_COPY } from '@/lib/i18n/guideFlowCopy';
import { GUIDE_MISSION_STEP_COPY } from '@/lib/i18n/guideMissionStepCopy';
import { GUIDE_REWARD_STEP_COPY } from '@/lib/i18n/guideRewardStepCopy';
import type { Locale } from '@/lib/i18n/locales';

// HomeClient still owns the legacy `guide` tab key for analytics compatibility.
// While Network is only a placeholder, that tab renders Network here. The actual
// invitation guide is exposed contextually from the Home invite card.
export function AppGuide({ locale }: { locale: Locale }) {
  return <AppNetworkComingSoon locale={locale} />;
}

export function InviteGuideContent({ locale }: { locale: Locale }) {
  const t = GUIDE_COPY[locale];
  const flow = GUIDE_FLOW_COPY[locale];
  const eligibility = GUIDE_ELIGIBILITY_COPY[locale];
  const missionStep = GUIDE_MISSION_STEP_COPY[locale];
  const rewardStep = GUIDE_REWARD_STEP_COPY[locale];
  const steps = [
    {
      title: t.inviteStepTitle,
      description: flow.inviteDescription,
    },
    missionStep,
    rewardStep,
  ];

  return (
    <section className="guidePage">
      <header className="guideIntro">
        <span>{t.eyebrow}</span>
        <p>{flow.description}</p>
      </header>

      <section className="guideCard stepsCard">
        <h2>{t.title}</h2>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="stepNumber" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guideCard eligibilityCard">
        <h2>{t.eligibilityTitle}</h2>
        <Definition title={t.newTitle} description={eligibility.newDescription} icon="N" />
        <Definition title={t.returningTitle} description={eligibility.returningDescription} icon="R" />
      </section>

      <style jsx>{`
        .guidePage { width:min(100%,560px); margin:0 auto; padding-bottom:12px; }
        .guideIntro { margin:0 0 22px; }
        .guideIntro > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        .guideIntro > p { margin:8px 0 0; color:#aaa69d; font-size:.82rem; line-height:1.58; }
        .guideCard {
          padding:20px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:22px;
          background:radial-gradient(circle at 90% 0,rgba(255,194,41,.1),transparent 34%),rgba(255,255,255,.03);
        }
        .guideCard + .guideCard { margin-top:18px; }
        .guideCard h2 { margin:0 0 14px; font-size:1.08rem; letter-spacing:-.025em; }
        .steps { margin:0; padding:0; list-style:none; }
        .steps li {
          padding:12px 0;
          display:flex;
          align-items:flex-start;
          gap:12px;
          border-top:1px solid rgba(255,255,255,.06);
        }
        .steps li > div { min-width:0; }
        .stepNumber {
          flex:0 0 auto;
          width:30px;
          height:30px;
          display:grid;
          place-items:center;
          border-radius:10px;
          background:rgba(255,201,61,.1);
          color:#ffc93d;
          font-size:.7rem;
          font-weight:950;
        }
        .steps strong { display:block; font-size:.86rem; }
        .steps p { margin:4px 0 0; color:#8f8b83; font-size:.75rem; line-height:1.5; overflow-wrap:anywhere; }
        @media (max-width:560px) {
          .guideIntro { margin-bottom:18px; }
          .guideCard { padding:17px; }
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
      <div><strong>{title}</strong><p>{description}</p></div>
      <style jsx>{`
        .definition { padding:12px 0; display:flex; align-items:flex-start; gap:12px; border-top:1px solid rgba(255,255,255,.06); }
        .definition > span { flex:0 0 auto; width:30px; height:30px; display:grid; place-items:center; border-radius:10px; background:rgba(255,201,61,.1); color:#ffc93d; font-size:.7rem; font-weight:950; }
        .definition > div { min-width:0; }
        strong { display:block; font-size:.86rem; }
        p { margin:4px 0 0; color:#8f8b83; font-size:.75rem; line-height:1.5; overflow-wrap:anywhere; }
      `}</style>
    </div>
  );
}
