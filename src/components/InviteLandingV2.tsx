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
        <Brand compact />
        <label className="language">
          <span aria-hidden="true">◎</span>
          <select className="languageSelect" aria-label={t.languageAria} value={locale} onChange={(event) => onLocaleChange(event.target.value as SupportedLocale)}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.locale} value={option.locale}>{option.nativeName}</option>
            ))}
          </select>
        </label>
      </header>

      <section className="gameCard">
        <div className="inviteBadge">{t.inviteBadge}</div>
        <div className="rewardVisual" aria-hidden="true">
          <div className="halo haloOne" /><div className="halo haloTwo" />
          <div className="token"><span>V</span></div>
        </div>
        <div className="rewardLabel">{t.rewardLabel}</div>
        <h1>{t.rewardTitle}</h1>
        <p className="title">{t.title}</p>
        <div className="steps" aria-label={t.title}>
          <div className="step active"><span>1</span><b>{t.step1}</b></div><div className="line" />
          <div className="step"><span>2</span><b>{t.step2}</b></div><div className="line" />
          <div className="step"><span>3</span><b>{t.step3}</b></div>
        </div>
        <div className="meta"><span>{t.time}</span><i /><span>{t.free}</span></div>
        <button type="button" className="startButton" onClick={onBeginnerStart} disabled={disabled}>{t.start}<span aria-hidden="true">›</span></button>
        <button type="button" className="walletLink" onClick={onExistingWallet} disabled={disabled}>{t.existingWallet}</button>
      </section>
      <p className="reassurance">{t.reassurance}</p>

      {demoMode ? (
        <label className="demoSelect">
          {t.demoResult}
          <select value={demoOutcome} onChange={(event) => onDemoOutcomeChange(event.target.value as DemoOutcome)}>
            <option value="success">{t.demoSuccess}</option>
            <option value="existing">{t.demoExisting}</option>
            <option value="other">{t.demoOther}</option>
            <option value="review">{t.demoReview}</option>
          </select>
        </label>
      ) : null}

      <style jsx>{`
        .screen { min-height:100svh; width:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; padding:20px 18px 32px; color:#fff; background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.16),transparent 34%),#080807; }
        .topBar { width:min(100%,430px); display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:22px; }
        .language { max-width:54%; display:inline-flex; align-items:center; gap:6px; height:38px; padding:0 10px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(255,255,255,.06); color:#eee8d6; }
        .language select { min-width:0; max-width:150px; border:0; outline:0; background:transparent; color:inherit; font:inherit; font-size:.78rem; font-weight:700; cursor:pointer; }
        .language option { color:#111421; }
        .gameCard { position:relative; overflow:hidden; width:min(100%,430px); box-sizing:border-box; padding:24px 22px 20px; border:1px solid rgba(255,205,80,.25); border-radius:28px; background:linear-gradient(160deg,rgba(54,40,14,.98),rgba(16,16,14,.98) 64%); box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.08); }
        .gameCard::before { content:''; position:absolute; width:240px; height:240px; right:-110px; top:-120px; border-radius:50%; background:rgba(244,183,40,.19); }
        .inviteBadge { position:relative; z-index:1; display:inline-flex; align-items:center; min-height:28px; padding:0 11px; border:1px solid rgba(255,205,80,.28); border-radius:999px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.7rem; font-weight:800; letter-spacing:.06em; }
        .rewardVisual { position:relative; width:116px; height:116px; margin:18px auto 10px; display:grid; place-items:center; }
        .halo { position:absolute; border-radius:50%; }
        .haloOne { inset:0; border:1px solid rgba(255,205,80,.3); background:rgba(244,183,40,.07); }
        .haloTwo { inset:14px; border:1px solid rgba(255,222,132,.28); background:rgba(244,183,40,.09); }
        .token { position:relative; z-index:2; width:66px; height:66px; border-radius:22px; display:grid; place-items:center; transform:rotate(45deg); background:linear-gradient(135deg,#ffd45c,#e7a51e); box-shadow:0 14px 34px rgba(190,126,12,.36); }
        .token span { transform:rotate(-45deg); font-size:1.65rem; font-weight:950; }
        .rewardLabel { text-align:center; color:#e5b94c; font-size:.68rem; font-weight:900; letter-spacing:.12em; }
        h1 { margin:6px 0 0; text-align:center; font-size:clamp(1.9rem,8vw,2.55rem); line-height:1.08; letter-spacing:-.045em; overflow-wrap:anywhere; }
        .title { margin:10px 0 20px; text-align:center; color:#cbc7dc; font-size:.94rem; font-weight:700; overflow-wrap:anywhere; }
        .steps { display:grid; grid-template-columns:auto 1fr auto 1fr auto; align-items:start; gap:7px; margin:0 2px 18px; }
        .step { min-width:52px; display:grid; justify-items:center; gap:6px; color:#858196; text-align:center; }
        .step span { width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.12); border-radius:50%; background:rgba(255,255,255,.05); font-size:.82rem; font-weight:900; }
        .step b { max-width:82px; font-size:.67rem; line-height:1.2; overflow-wrap:anywhere; }
        .step.active { color:#fff; }
        .step.active span { border-color:#ffd24d; background:#f4b728; color:#17120a; }
        .line { height:2px; margin-top:16px; border-radius:999px; background:rgba(255,255,255,.08); }
        .meta { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:16px; color:#b4afc2; font-size:.76rem; font-weight:800; }
        .meta i { width:3px; height:3px; border-radius:50%; background:#786f91; }
        .startButton { width:100%; min-height:58px; border:0; border-radius:18px; display:flex; align-items:center; justify-content:center; gap:12px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:1rem; font-weight:950; cursor:pointer; }
        .startButton span { font-size:1.75rem; line-height:1; }
        .walletLink { display:block; width:100%; margin:15px 0 0; border:0; background:transparent; color:#a9a4bb; font:inherit; font-size:.78rem; font-weight:800; text-decoration:underline; text-underline-offset:4px; cursor:pointer; overflow-wrap:anywhere; }
        .startButton:disabled,.walletLink:disabled { opacity:.48; cursor:not-allowed; }
        .reassurance { width:min(100%,430px); margin:15px 0 0; text-align:center; color:#777387; font-size:.74rem; line-height:1.5; overflow-wrap:anywhere; }
        .demoSelect { width:min(100%,430px); margin-top:16px; color:#9994a7; font-size:.72rem; }
        .demoSelect select { width:100%; margin-top:6px; min-height:42px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:#151520; color:#fff; padding:0 10px; }
      `}</style>
    </main>
  );
}
