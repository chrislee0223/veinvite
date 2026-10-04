'use client';

import { useState } from 'react';

import { AppBottomNavigation } from './AppBottomNavigation';
import { Brand } from './Brand';
import { PublicRewardForecastCard } from './PublicRewardForecastCard';
import { QaWalletLauncherOverrideProvider } from './WalletControl';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import {
  LANGUAGE_OPTIONS,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import {
  QaNotificationStateHarness,
  type QaNotificationStateId,
} from '@/qa/QaNotificationStateHarness';

type Scenario = {
  id: QaNotificationStateId;
  label: string;
};

const SCENARIOS: Scenario[] = [
  { id: 'NOTI-BELL-EMPTY', label: '알림 없음' },
  { id: 'NOTI-BELL-UNREAD', label: '새 알림 배지' },
  { id: 'NOTI-HISTORY-OPEN', label: '알림센터 열림' },
  { id: 'NOTI-HISTORY-LOADING', label: '알림 로딩' },
  { id: 'NOTI-HISTORY-ERROR', label: '알림 오류' },
  { id: 'NOTI-HISTORY-READ', label: '읽은 알림' },
  { id: 'NOTI-HISTORY-UNREAD', label: '안 읽은 알림' },
  { id: 'NOTI-HISTORY-MORE', label: '알림 더보기' },
  { id: 'NOTI-INVITE-ACCEPTED', label: '초대 수락' },
  { id: 'NOTI-DAPP-1', label: 'dApp 1/3' },
  { id: 'NOTI-DAPP-2', label: 'dApp 2/3' },
  { id: 'NOTI-DAPP-3', label: 'dApp 3/3' },
  { id: 'NOTI-VOT3', label: 'VOT3 전환' },
  { id: 'NOTI-COLLAPSED-PROGRESS', label: '여러 단계 완료' },
  { id: 'NOTI-REWARD-READY', label: '보상 수령 가능' },
  { id: 'NOTI-REWARD-PAID', label: '보상 지급 완료' },
  { id: 'NOTI-REWARD-ADJUSTED', label: '보상 정책 조정' },
  { id: 'NOTI-INELIGIBLE', label: '참여 조건 미충족' },
  { id: 'NOTI-SECURITY-REVIEW', label: '시빌 검사 시작' },
  { id: 'NOTI-SECURITY-CLEARED', label: '검토 해제 · 정상 복구' },
  { id: 'NOTI-POST-PAYOUT-REVIEW', label: '지급 후 재검토' },
  { id: 'NOTI-POST-PAYOUT-CLEARED', label: '재검토 후 정상' },
  { id: 'NOTI-SECURITY-RESTRICTED', label: 'BLACK · 제한 확정' },
  { id: 'NOTI-REFERRAL-INVALIDATED', label: '초대 관계 무효' },
  { id: 'NOTI-REFERRAL-RESTORED', label: '초대 관계 복구' },
  { id: 'NOTI-INVITER-WATCH', label: '초대자 WATCH · 레거시' },
  { id: 'NOTI-INVITER-HOLD', label: '초대자 HOLD' },
  { id: 'NOTI-INVITER-RESTRICTED', label: '초대자 제한' },
  { id: 'NOTI-INVITER-RESTORED', label: '초대자 복구' },
];

const PREVIEW_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

export function NotificationUiPreview() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [stateId, setStateId] = useState<QaNotificationStateId>(
    'NOTI-REWARD-READY',
  );
  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];

  return (
    <QaWalletLauncherOverrideProvider value={{ wallet: null }}>
      <div className="previewWorkspace">
        <section
          className="appViewport"
          aria-label="실제 앱 미리보기 화면"
          data-testid="notification-app-viewport"
        >
          <main className="screen">
            <header className="topBar">
              <Brand />
              <div className="topActions">
                <div className="utilityActions">
                  <QaNotificationStateHarness
                    stateId={stateId}
                    locale={locale}
                    embedded
                  />
                  <select
                    className="languageSelect"
                    value={locale}
                    onChange={(event) =>
                      setLocale(event.target.value as SupportedLocale)}
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
                  {PREVIEW_WALLET.slice(0, 6)}···{PREVIEW_WALLET.slice(-4)}
                </button>
              </div>
            </header>

            <section className="missionCard">
              <div className="cardGlow" />
              <div className="missionCopy">
                <h1>{referral.homeTitle}</h1>
              </div>

              <PublicRewardForecastCard
                locale={locale}
                rewardForecastPreview
              />

              <div className="permanentLinkCard">
                <div className="linkPreview">
                  https://veinvite.vercel.app/i/preview
                </div>
                <div className="linkActions">
                  <button type="button" className="primaryAction compactAction">
                    {t.shareInvite}
                  </button>
                  <button type="button" className="secondaryAction compactAction">
                    {t.copyLink}
                  </button>
                </div>
              </div>

              <div className="slotsBlock">
                <div className="slotsHeading">
                  <strong>{referral.slotsLabel}</strong>
                  <span>1/2</span>
                </div>
                <div className="friendSlot detailed">
                  <span className="slotNumber">1</span>
                  <div className="slotCopy">
                    <strong>0xbf4b…9e14</strong>
                    <div className="missionDots" aria-label="5/5">
                      {Array.from({ length: 5 }, (_, index) => (
                        <span key={index} className="missionDot done" />
                      ))}
                    </div>
                    <small>최종 확인 완료 · 보상 수령 가능</small>
                  </div>
                </div>
                <div className="friendSlot available">
                  <span className="slotNumber">2</span>
                  <div className="slotCopy">
                    <strong>친구 초대 가능</strong>
                    <small>영구 초대 링크 공유 ↗</small>
                  </div>
                  <span className="slotState" aria-hidden="true">↗</span>
                </div>
              </div>
            </section>

            <div className="previewNavigationGuard">
              <AppBottomNavigation
                activeTab="home"
                locale={locale}
                onChange={() => {}}
              />
            </div>
          </main>
        </section>

        <aside className="qaPanel" aria-label="알림 미리보기 설정">
          <div className="qaHeading">
            <div>
              <span>SAFE QA PREVIEW</span>
              <h2>실제 앱 화면에서 알림 확인</h2>
            </div>
            <b>실데이터 영향 없음</b>
          </div>
          <p>
            위 화면은 Production과 같은 앱 레이아웃과 실제 알림 컴포넌트를
            사용하고, 알림 내용만 테스트 데이터로 바꿉니다.
          </p>
          <label className="scenarioPicker">
            <span>알림 선택</span>
            <select
              value={stateId}
              onChange={(event) =>
                setStateId(event.target.value as QaNotificationStateId)}
            >
              {SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
          <div className="scenarioGrid">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={scenario.id === stateId ? 'selected' : ''}
                onClick={() => setStateId(scenario.id)}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </aside>

        <style jsx>{`
          .previewWorkspace { height:100dvh; min-height:0; box-sizing:border-box; padding:16px; display:grid; grid-template-columns:minmax(360px,560px) minmax(320px,430px); grid-template-areas:"app controls"; justify-content:center; gap:18px; overflow:hidden; background:#050504; }
          .appViewport { grid-area:app; position:relative; min-width:0; min-height:0; overflow:hidden; border:1px solid rgba(255,255,255,.09); border-radius:30px; background:#080807; box-shadow:0 28px 90px rgba(0,0,0,.45); transform:translateZ(0); isolation:isolate; }
          .screen { height:100%; min-height:0; overflow-y:auto; overscroll-behavior:contain; box-sizing:border-box; padding:22px 16px 132px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
          .topBar { width:min(100%,520px); margin:0 auto 26px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
          .topActions { min-width:0; display:flex; align-items:center; gap:8px; }
          .utilityActions { min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
          .languageSelect { max-width:155px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
          .accountChip { min-height:40px; padding:0 13px; display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.72rem; font-weight:850; }
          .accountDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 14px rgba(244,183,40,.68); }
          .missionCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; margin:0 auto; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
          .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); filter:blur(4px); pointer-events:none; }
          .missionCopy { position:relative; z-index:1; }
          .missionCopy h1 { max-width:100%; margin:0; font-size:clamp(2.05rem,8vw,3.05rem); line-height:1.04; letter-spacing:-.05em; text-wrap:balance; overflow-wrap:anywhere; }
          .permanentLinkCard { position:relative; z-index:1; margin-top:18px; padding:16px; border:1px solid rgba(255,205,80,.2); border-radius:19px; background:rgba(255,205,80,.055); }
          .linkPreview { padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
          .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }
          .primaryAction,.secondaryAction { position:relative; z-index:1; width:100%; min-height:56px; border-radius:18px; font:inherit; font-size:.92rem; font-weight:950; }
          .primaryAction { border:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22); }
          .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
          .compactAction { min-height:44px; border-radius:13px; font-size:.75rem; box-shadow:none; }
          .slotsBlock { position:relative; z-index:1; margin-top:16px; display:grid; gap:9px; }
          .slotsHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#c7c2d0; font-size:.78rem; }
          .slotsHeading span { min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
          .friendSlot { width:100%; min-height:68px; padding:12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.085); border-radius:16px; background:rgba(255,255,255,.035); color:#fff; text-align:left; }
          .friendSlot.detailed { grid-template-columns:auto minmax(0,1fr); border-color:rgba(91,212,162,.16); background:rgba(42,164,116,.05); }
          .friendSlot.available { border-style:dashed; background:rgba(255,255,255,.022); }
          .slotNumber { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.76rem; font-weight:950; }
          .slotCopy { min-width:0; display:grid; gap:6px; }
          .slotCopy strong { color:#ded9e7; font-size:.74rem; }
          .slotCopy small { color:#837e8e; font-size:.62rem; font-weight:750; }
          .slotState { width:28px; height:28px; display:grid; place-items:center; border-radius:10px; color:#ffd66e; background:rgba(244,183,40,.08); }
          .missionDots { display:flex; align-items:center; gap:9px; }
          .missionDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 10px rgba(244,183,40,.32); }
          .qaPanel { grid-area:controls; min-width:0; min-height:0; box-sizing:border-box; padding:18px; overflow-y:auto; overscroll-behavior:contain; border:1px solid rgba(255,255,255,.09); border-radius:22px; background:#11110f; color:#fff; }
          .qaHeading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
          .qaHeading span { color:#f4b728; font-size:.62rem; font-weight:950; letter-spacing:.1em; }
          .qaHeading h2 { margin:4px 0 0; font-size:1.05rem; letter-spacing:-.03em; }
          .qaHeading b { flex:0 0 auto; padding:6px 8px; border-radius:999px; background:rgba(54,207,130,.1); color:#77e3ad; font-size:.58rem; }
          .qaPanel p { margin:10px 0 0; color:#8e8a82; font-size:.72rem; line-height:1.55; }
          .scenarioPicker { display:none; }
          .scenarioGrid { margin-top:14px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
          .scenarioGrid button { min-height:40px; padding:7px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:#181714; color:#aaa59b; font:inherit; font-size:.65rem; font-weight:850; }
          .scenarioGrid button.selected { border-color:rgba(244,183,40,.45); background:rgba(244,183,40,.12); color:#ffd66e; }
          .previewNavigationGuard :global(.bottomNavigation button) { pointer-events:none !important; }
          @media (max-width:900px) {
            .previewWorkspace { padding:0; grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); grid-template-areas:"controls" "app"; gap:0; }
            .appViewport { width:min(100%,560px); justify-self:center; border-block:0; border-radius:0; }
            .qaPanel { width:100%; padding:10px 12px; display:flex; align-items:center; gap:12px; overflow:visible; border-width:0 0 1px; border-radius:0; }
            .qaHeading { flex:1 1 auto; min-width:0; align-items:center; }
            .qaHeading span,.qaPanel p,.scenarioGrid { display:none; }
            .qaHeading h2 { margin:0; font-size:.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .qaHeading b { font-size:.52rem; }
            .scenarioPicker { flex:0 1 230px; min-width:150px; display:grid; gap:3px; }
            .scenarioPicker>span { color:#8e8a82; font-size:.54rem; font-weight:850; }
            .scenarioPicker select { width:100%; height:38px; padding:0 28px 0 10px; border:1px solid rgba(244,183,40,.32); border-radius:10px; background:#1a1813; color:#ffd66e; font:inherit; font-size:.68rem; font-weight:850; }
          }
          @media (max-width:560px) {
            .topBar { align-items:flex-start; }
            .topActions { flex-direction:column; align-items:flex-end; }
            .missionCard { padding:21px 18px; border-radius:26px; }
            .missionCopy h1 { font-size:clamp(1.9rem,10vw,2.6rem); }
            .qaHeading b { display:none; }
            .scenarioPicker { flex-basis:55%; }
          }
          @media (max-width:360px) {
            .languageSelect { max-width:130px; }
            .accountChip { padding:0 10px; font-size:.65rem; }
          }
        `}</style>
      </div>
    </QaWalletLauncherOverrideProvider>
  );
}
