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
      <header>
        <span>{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{flow.description}</p>
      </header>

      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="stepNumber">{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="eligibilityCard">
        <h2>{t.eligibilityTitle}</h2>
        <Definition title={t.newTitle} description={eligibility.newDescription} icon="N" />
        <Definition title={t.returningTitle} description={eligibility.returningDescription} icon="R" />
      </section>

      <style jsx>{`
        .guidePage { width:min(100%,560px); margin:0 auto; padding-bottom:12px; }
        header > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        h1 { margin:8px 0 0; font-size:clamp(2rem,8vw,2.75rem); line-height:1.05; letter-spacing:-.05em; text-wrap:balance; }
        header p { margin:12px 0 0; color:#aaa69d; font-size:.9rem; line-height:1.62; }
        .steps,
        .eligibilityCard {
          border:1px solid rgba(255,205,80,.14);
          border-radius:22px;
          background:radial-gradient(circle at 90% 0,rgba(255,194,41,.1),transparent 34%),rgba(255,255,255,.03);
        }
        .steps {
          margin:22px 0 0;
          padding:0;
          display:grid;
          gap:0;
          overflow:hidden;
          list-style:none;
        }
        .steps li {
          position:relative;
          padding:18px 20px;
          display:flex;
          align-items:flex-start;
          gap:14px;
          border:0;
          border-radius:0;
          background:transparent;
        }
        .steps li + li::before {
          content:'';
          position:absolute;
          top:0;
          left:20px;
          right:20px;
          height:1px;
          background:rgba(255,255,255,.06);
          pointer-events:none;
        }
        .stepNumber { flex:0 0 auto; width:34px; height:34px; display:grid; place-items:center; border-radius:11px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font-size:.78rem; font-weight:950; }
        .steps strong { display:block; font-size:.91rem; }
        .steps p { margin:5px 0 0; color:#96928a; font-size:.76rem; line-height:1.55; }
        .eligibilityCard { margin-top:18px; padding:20px; }
        .eligibilityCard h2 { margin:0 0 14px; font-size:1.08rem; letter-spacing:-.025em; }
        @media (max-width:560px) {
          .steps li { padding:17px; }
          .steps li + li::before { left:17px; right:17px; }
          .eligibilityCard { padding:17px; }
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
        strong { display:block; font-size:.82rem; }
        p { margin:4px 0 0; color:#8f8b83; font-size:.73rem; line-height:1.5; }
      `}</style>
    </div>
  );
}
