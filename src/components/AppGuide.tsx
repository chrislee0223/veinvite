import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { GUIDE_FLOW_COPY } from '@/lib/i18n/guideFlowCopy';
import { GUIDE_REWARD_STEP_COPY } from '@/lib/i18n/guideRewardStepCopy';
import type { Locale } from '@/lib/i18n/locales';

export function AppGuide({ locale }: { locale: Locale }) {
  const t = GUIDE_COPY[locale];
  const flow = GUIDE_FLOW_COPY[locale];
  const rewardStep = GUIDE_REWARD_STEP_COPY[locale];
  const steps = [
    {
      ...t.steps[0],
      description: flow.inviteDescription,
    },
    t.steps[1],
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
        <Definition title={t.newTitle} description={t.newDescription} icon="N" />
        <Definition title={t.returningTitle} description={t.returningDescription} icon="R" />
        <Definition title={t.countTitle} description={flow.countDescription} icon="✓" />
      </section>

      <style jsx>{`
        .guidePage { width:min(100%,560px); margin:0 auto; padding-bottom:12px; }
        header > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        h1 { margin:8px 0 0; font-size:clamp(2rem,8vw,2.75rem); line-height:1.05; letter-spacing:-.05em; text-wrap:balance; }
        header p { margin:12px 0 0; color:#aaa69d; font-size:.9rem; line-height:1.62; }
        .steps { margin:22px 0 0; padding:0; display:grid; gap:11px; list-style:none; }
        .steps li { padding:17px; display:flex; align-items:flex-start; gap:14px; border:1px solid rgba(255,205,80,.14); border-radius:19px; background:rgba(255,255,255,.035); }
        .stepNumber { flex:0 0 auto; width:34px; height:34px; display:grid; place-items:center; border-radius:11px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font-size:.78rem; font-weight:950; }
        .steps strong { display:block; font-size:.91rem; }
        .steps p { margin:5px 0 0; color:#96928a; font-size:.76rem; line-height:1.55; }
        .eligibilityCard { margin-top:18px; padding:20px; border:1px solid rgba(255,205,80,.14); border-radius:22px; background:radial-gradient(circle at 90% 0,rgba(255,194,41,.12),transparent 34%),rgba(255,255,255,.03); }
        .eligibilityCard h2 { margin:0 0 14px; font-size:1.08rem; letter-spacing:-.025em; }
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
