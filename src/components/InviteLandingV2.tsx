'use client';

import { Brand } from './Brand';
import { INVITE_LANDING_COPY } from '@/lib/i18n/inviteLandingCopy';
import {
  LANGUAGE_OPTIONS,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

type DemoOutcome = 'success' | 'existing' | 'other' | 'review';

type InviteLandingV2Props = {
  locale: Locale;
  disabled?: boolean;
  demoMode?: boolean;
  demoOutcome: DemoOutcome;
  onLocaleChange: (locale: SupportedLocale) => void;
  onBeginnerStart: () => void;
  onExistingWallet: () => void;
  onDemoOutcomeChange: (outcome: DemoOutcome) => void;
};

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
  const t = INVITE_LANDING_COPY[locale];

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <label className="language">
          <select
            className="languageSelect"
            aria-label={t.languageAria}
            value={locale}
            onChange={(event) =>
              onLocaleChange(event.target.value as SupportedLocale)}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.locale} value={option.locale}>
                {option.nativeName}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="gameCard">
        <h1>{t.rewardTitle}</h1>
        <p className="title">{t.title}</p>
        <div className="steps" aria-label={t.title}>
          <div className="step active"><span>1</span><b>{t.step1}</b></div><div className="line" />
          <div className="step"><span>2</span><b>{t.step2}</b></div><div className="line" />
          <div className="step"><span>3</span><b>{t.step3}</b></div>
        </div>
        <button
          type="button"
          className="startButton"
          onClick={onBeginnerStart}
          disabled={disabled}
        >
          {t.start}<span aria-hidden="true">›</span>
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
      <p className="reassurance">{t.reassurance}</p>

      {demoMode ? (
        <label className="demoSelect">
          {t.demoResult}
          <select
            value={demoOutcome}
            onChange={(event) =>
              onDemoOutcomeChange(event.target.value as DemoOutcome)}
          >
            <option value="success">{t.demoSuccess}</option>
            <option value="existing">{t.demoExisting}</option>
            <option value="other">{t.demoOther}</option>
            <option value="review">{t.demoReview}</option>
          </select>
        </label>
      ) : null}

      <style jsx>{`
        .screen { min-height:100svh; width:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; padding:22px 18px 32px; color:#fff; background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.16),transparent 34%),#080807; }
        .topBar { width:min(100%,520px); display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:26px; }
        .language { width:120px; max-width:48%; display:inline-flex; align-items:center; padding:0; border:0; background:transparent; color:#fff; }
        .language select { width:120px; max-width:100%; height:34px; box-sizing:border-box; padding:0 28px 0 9px; border:1px solid rgba(255,255,255,.1); outline:0; border-radius:10px; background:#141625; color:inherit; font:inherit; font-size:.68rem; font-weight:800; cursor:pointer; }
        .language option { color:#111421; }
        .gameCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; padding:34px 24px 24px; border:1px solid rgba(255,205,80,.25); border-radius:30px; background:linear-gradient(160deg,rgba(54,40,14,.98),rgba(16,16,14,.98) 64%); box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.08); }
        .gameCard::before { content:''; position:absolute; width:250px; height:250px; right:-110px; top:-120px; border-radius:50%; background:rgba(244,183,40,.19); }
        h1 { position:relative; z-index:1; margin:0; text-align:center; font-size:clamp(1.9rem,8vw,2.55rem); line-height:1.08; letter-spacing:-.045em; overflow-wrap:anywhere; }
        .title { position:relative; z-index:1; margin:10px 0 24px; text-align:center; color:#cbc7dc; font-size:.94rem; font-weight:700; overflow-wrap:anywhere; }
        .steps { position:relative; z-index:1; display:grid; grid-template-columns:auto 1fr auto 1fr auto; align-items:start; gap:7px; margin:0 2px 24px; }
        .step { min-width:52px; display:grid; justify-items:center; gap:6px; color:#858196; text-align:center; }
        .step span { width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.12); border-radius:50%; background:rgba(255,255,255,.05); font-size:.82rem; font-weight:900; }
        .step b { max-width:82px; font-size:.67rem; line-height:1.2; overflow-wrap:anywhere; }
        .step.active { color:#fff; }
        .step.active span { border-color:#ffd24d; background:#f4b728; color:#17120a; }
        .line { height:2px; margin-top:16px; border-radius:999px; background:rgba(255,255,255,.08); }
        .startButton { position:relative; z-index:1; width:100%; min-height:58px; border:0; border-radius:18px; display:flex; align-items:center; justify-content:center; gap:12px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:1rem; font-weight:950; cursor:pointer; }
        .startButton span { font-size:1.75rem; line-height:1; }
        .walletLink { position:relative; z-index:1; display:block; width:100%; margin:15px 0 0; border:0; background:transparent; color:#a9a4bb; font:inherit; font-size:.78rem; font-weight:800; text-decoration:underline; text-underline-offset:4px; cursor:pointer; overflow-wrap:anywhere; }
        .startButton:disabled,.walletLink:disabled { opacity:.48; cursor:not-allowed; }
        .reassurance { width:min(100%,520px); margin:15px 0 0; text-align:center; color:#777387; font-size:.74rem; line-height:1.5; overflow-wrap:anywhere; }
        .demoSelect { width:min(100%,520px); margin-top:16px; color:#9994a7; font-size:.72rem; }
        .demoSelect select { width:100%; margin-top:6px; min-height:42px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:#151520; color:#fff; padding:0 10px; }
        @media (max-width:560px) {
          .screen { padding:18px 14px 32px; }
          .topBar { gap:12px; margin-bottom:22px; }
          .language { width:120px; }
          .language select { width:120px; height:34px; padding:0 28px 0 9px; border-radius:10px; font-size:.68rem; }
          .gameCard { padding:28px 18px 20px; border-radius:26px; }
          .title { margin-bottom:22px; }
          .steps { margin-bottom:22px; }
        }
      `}</style>
    </main>
  );
}
