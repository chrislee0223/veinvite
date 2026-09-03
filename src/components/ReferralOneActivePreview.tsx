'use client';

import { useEffect, useState } from 'react';

import { AppBottomNavigation, type AppTab } from './AppBottomNavigation';
import { Brand } from './Brand';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { NAV_COPY } from '@/lib/i18n/navCopy';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isCjkLocale,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const FRIEND_WALLET = '0x8a72f1594d27e6c4b3f29ea51bca02b7d8b9f641';

export function ReferralOneActivePreview() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const initialLocale = isLocale(saved)
      ? saved
      : resolveBrowserLocale(window.navigator.languages, 'ko');
    setLocale(initialLocale);
    document.documentElement.lang = initialLocale;
  }, []);

  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];
  const nav = NAV_COPY[locale];
  const previewUrl = 'https://veinvite.app/r/8VtqR3k7L2nP5xY9mC4aZw';

  const changeLocale = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  };

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <div className="topActions">
          <div className="utilityActions">
            <button type="button" className="notificationButton" aria-label="Notifications">
              <span aria-hidden="true">◌</span>
            </button>
            <select
              className="languageSelect"
              value={locale}
              onChange={(event) => changeLocale(event.target.value as SupportedLocale)}
              aria-label={t.languageAria}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.nativeName}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="accountChip" aria-label={t.walletAria}>
            <span className="accountDot" />
            {TEST_WALLET.slice(0, 6)}···{TEST_WALLET.slice(-4)}
          </button>
        </div>
      </header>

      {activeTab === 'home' ? (
        <section className="missionCard">
          <div className="cardGlow" />
          <div className="missionHeader">
            <span className="missionLabel">{t.inviteMission}</span>
            <span className="badge">{referral.badge}</span>
          </div>

          <div className={isCjkLocale(locale) ? 'missionCopy cjkCopy' : 'missionCopy'}>
            <h1>{referral.homeTitle}</h1>
            <p>{referral.homeDescription}</p>
          </div>

          <div className="permanentLinkCard">
            <div className="linkHeading">
              <div>
                <small>{referral.linkLabel}</small>
                <strong>{referral.linkHelp}</strong>
              </div>
              <span className="linkMark" aria-hidden="true">∞</span>
            </div>
            <div className="linkPreview" title={previewUrl}>{previewUrl}</div>
            <div className="linkActions">
              <button type="button" className="primaryAction compactAction">{t.shareInvite}</button>
              <button type="button" className="secondaryAction compactAction">{t.copyLink}</button>
            </div>
          </div>

          <div className="slotsBlock">
            <div className="slotsHeading">
              <strong>{referral.slotsLabel}</strong>
              <span>1/2</span>
            </div>

            <div className="friendSlot progress">
              <span className="slotNumber">1</span>
              <div className="slotCopy">
                <strong>{referral.slotInProgress}</strong>
                <small>{FRIEND_WALLET.slice(0, 7)}…{FRIEND_WALLET.slice(-5)}</small>
              </div>
              <span className="slotState" aria-hidden="true">•</span>
            </div>

            <div className="friendSlot available">
              <span className="slotNumber">2</span>
              <div className="slotCopy">
                <strong>{referral.slotAvailable}</strong>
              </div>
              <span className="slotState" aria-hidden="true">+</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="placeholderCard">
          <strong>{nav[activeTab]}</strong>
          <span>이 Preview는 홈의 1/2 슬롯 상태 확인용입니다.</span>
        </section>
      )}

      <AppBottomNavigation
        activeTab={activeTab}
        locale={locale}
        onChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 118px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 26px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .topActions { min-width:0; display:flex; align-items:center; gap:10px; }
        .utilityActions { min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
        .notificationButton { width:40px; height:40px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:1.05rem; cursor:pointer; }
        .languageSelect { max-width:155px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
        .accountChip { min-height:40px; padding:0 13px; display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.72rem; font-weight:850; cursor:pointer; }
        .accountDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 14px rgba(244,183,40,.68); }
        .missionCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; margin:0 auto; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
        .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); filter:blur(4px); pointer-events:none; }
        .missionHeader { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .badge { width:fit-content; max-width:62%; display:inline-flex; align-items:center; min-height:28px; padding:0 11px; border:1px solid rgba(255,205,80,.3); border-radius:999px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.66rem; font-weight:950; letter-spacing:.05em; overflow-wrap:anywhere; }
        .missionLabel { color:#8f86ae; font-size:.68rem; font-weight:900; letter-spacing:.12em; }
        .missionCopy { position:relative; z-index:1; margin-top:24px; }
        .missionCopy h1 { max-width:100%; margin:0; font-size:clamp(2.05rem,8vw,3.05rem); line-height:1.04; letter-spacing:-.05em; text-wrap:balance; overflow-wrap:anywhere; hyphens:auto; }
        .missionCopy.cjkCopy h1 { font-size:clamp(2rem,7vw,2.85rem); line-height:1.1; letter-spacing:-.035em; }
        .missionCopy p { max-width:430px; margin:13px 0 0; color:#b7b1c7; font-size:.94rem; font-weight:650; line-height:1.58; overflow-wrap:anywhere; }
        .permanentLinkCard { position:relative; z-index:1; margin-top:22px; padding:16px; border:1px solid rgba(255,205,80,.2); border-radius:19px; background:rgba(255,205,80,.055); }
        .linkHeading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .linkHeading > div { min-width:0; display:grid; gap:4px; }
        .linkHeading small { color:#ffd66e; font-size:.66rem; font-weight:950; letter-spacing:.045em; overflow-wrap:anywhere; }
        .linkHeading strong { color:#dad5c9; font-size:.76rem; line-height:1.4; overflow-wrap:anywhere; }
        .linkMark { flex:0 0 auto; width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:rgba(244,183,40,.14); color:#ffd66e; font-size:1.35rem; font-weight:950; }
        .linkPreview { margin-top:13px; padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
        .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .primaryAction,.secondaryAction { position:relative; z-index:1; width:100%; min-height:56px; border-radius:18px; font:inherit; font-size:.92rem; font-weight:950; cursor:pointer; overflow-wrap:anywhere; }
        .primaryAction { margin-top:24px; border:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22); }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
        .compactAction { min-height:44px; margin-top:0; border-radius:13px; font-size:.75rem; box-shadow:none; }
        .slotsBlock { position:relative; z-index:1; margin-top:16px; display:grid; gap:9px; }
        .slotsHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#c7c2d0; font-size:.78rem; }
        .slotsHeading strong { overflow-wrap:anywhere; }
        .slotsHeading span { flex:0 0 auto; min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
        .friendSlot { min-width:0; min-height:68px; padding:12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.085); border-radius:16px; background:rgba(255,255,255,.035); }
        .friendSlot.available { border-style:dashed; background:rgba(255,255,255,.022); }
        .friendSlot.progress { border-color:rgba(91,212,162,.16); background:rgba(42,164,116,.05); }
        .slotNumber { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.76rem; font-weight:950; }
        .available .slotNumber { background:rgba(255,255,255,.045); color:#8d8797; }
        .slotCopy { min-width:0; display:grid; gap:4px; }
        .slotCopy strong { color:#ded9e7; font-size:.74rem; line-height:1.38; overflow-wrap:anywhere; }
        .slotCopy small { direction:ltr; color:#837e8e; font-size:.62rem; font-weight:750; overflow-wrap:anywhere; }
        .slotState { width:28px; height:28px; display:grid; place-items:center; border-radius:10px; color:#ffd66e; background:rgba(244,183,40,.08); font-weight:950; }
        .available .slotState { color:#8d8797; background:rgba(255,255,255,.035); }
        .placeholderCard { width:min(100%,520px); margin:0 auto; min-height:280px; padding:24px; box-sizing:border-box; display:grid; place-items:center; align-content:center; gap:8px; border:1px solid rgba(255,255,255,.08); border-radius:26px; background:#10100f; text-align:center; }
        .placeholderCard span { color:#817c87; font-size:.75rem; }
        @media (max-width:560px) {
          .screen { padding:18px 14px 116px; }
          .topBar { align-items:flex-start; }
          .topActions { max-width:58%; align-items:flex-end; flex-direction:column-reverse; gap:7px; }
          .utilityActions { width:100%; }
          .notificationButton { width:34px; height:34px; border-radius:11px; }
          .languageSelect { min-width:0; width:auto; flex:1; max-width:155px; height:34px; border-radius:11px; font-size:.68rem; }
          .accountChip { min-height:34px; padding:0 10px; border-radius:11px; font-size:.66rem; }
          .missionCard { padding:21px 18px; border-radius:26px; }
          .missionHeader { align-items:flex-start; }
          .missionCopy { margin-top:28px; }
          .missionCopy h1 { font-size:clamp(1.9rem,10vw,2.6rem); }
          .missionCopy.cjkCopy h1 { font-size:clamp(1.9rem,9vw,2.4rem); }
        }
        @media (max-width:340px) {
          .linkActions { grid-template-columns:1fr; }
          .badge { max-width:58%; }
        }
      `}</style>
    </main>
  );
}
