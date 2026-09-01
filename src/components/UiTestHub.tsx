'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppBottomNavigation, type AppTab } from './AppBottomNavigation';
import { AppGuide } from './AppGuide';
import { AppSettings } from './AppSettings';
import { Brand } from './Brand';
import { InfiniteReferralCanvasPreview } from './InfiniteReferralCanvasPreview';
import { InviteRejectionPreview } from './InviteRejectionPreview';
import { NotificationUiPreview } from './NotificationUiPreview';
import { PublicLeaderboard } from './PublicLeaderboard';
import { UiTestLab } from './UiTestLab';
import {
  LANGUAGE_STORAGE_KEY,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
import type {
  PublicLeaderboardEntry,
  PublicLeaderboardResponse,
} from '@/lib/types';

type PreviewMode = 'public' | 'participant';
type ParticipantView = 'states' | 'notifications' | 'canvas' | 'eligibility';

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const TOKEN_WEI = 10n ** 18n;

const PARTICIPANT_VIEWS: Array<{
  id: ParticipantView;
  label: string;
  description: string;
}> = [
  {
    id: 'states',
    label: '진행 상태',
    description: '초대 후 미션 진행·완료·보상 상태',
  },
  {
    id: 'notifications',
    label: '알림',
    description: '미션 및 보상 알림 시나리오',
  },
  {
    id: 'canvas',
    label: '인피니티 캔버스',
    description: '다음 업데이트용 2-slot 네트워크 화면',
  },
  {
    id: 'eligibility',
    label: '자격 거절',
    description: '기존 활성 사용자 등 참여 불가 화면',
  },
];

function walletForRank(rank: number): string {
  return `0x${rank.toString(16).padStart(40, '0')}`;
}

function buildLeaderboardPreview(): PublicLeaderboardResponse {
  const leaders: PublicLeaderboardEntry[] = Array.from(
    { length: 100 },
    (_, index) => {
      const rank = index + 1;
      const current = rank === 37;
      return {
        rank,
        walletAddress: current ? TEST_WALLET : walletForRank(rank),
        displayName: current
          ? 'Chris'
          : rank === 1
            ? 'Seasick.vet'
            : rank === 2
              ? 'VeFriend'
              : null,
        avatarUrl: null,
        completedReferrals: Math.max(1, 18 - Math.floor((rank - 1) / 6)),
        totalRewardWei: (BigInt(1300 - rank * 8) * TOKEN_WEI).toString(),
        isCurrentWallet: current,
      };
    },
  );

  return {
    generatedAt: '2026-09-01T12:00:00.000Z',
    network: 'mainnet',
    currentRoundId: 114,
    reportingStartRound: 113,
    impact: {
      totalActivatedUsers: 128,
      newUsers: 93,
      returningUsers: 35,
    },
    leaders,
    currentUser: leaders.find((entry) => entry.isCurrentWallet) ?? null,
    viewerProfile: {
      displayName: 'Chris',
      avatarUrl: null,
    },
  };
}

export function UiTestHub() {
  const [mode, setMode] = useState<PreviewMode>('public');
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [participantView, setParticipantView] =
    useState<ParticipantView>('canvas');
  const [locale, setLocale] = useState<Locale>('ko');
  const leaderboardPreview = useMemo(buildLeaderboardPreview, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const initialLocale = isLocale(saved)
      ? saved
      : resolveBrowserLocale(window.navigator.languages, 'ko');
    setLocale(initialLocale);
    document.documentElement.lang = initialLocale;
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(
      new CustomEvent('veinvite-language-change', { detail: nextLocale }),
    );
  };

  const changeTab = (tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showParticipantView = (view: ParticipantView) => {
    setMode('participant');
    setParticipantView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="cleanUiTest">
      <header className="previewHeader">
        <Brand />
        <span className="previewBadge">PREVIEW ONLY</span>
      </header>

      <div className="modeSwitch" role="tablist" aria-label="UI test section">
        <button
          type="button"
          className={mode === 'public' ? 'active' : ''}
          onClick={() => setMode('public')}
        >
          일반 화면
          <small>실제 앱에서 바로 볼 수 있는 화면</small>
        </button>
        <button
          type="button"
          className={mode === 'participant' ? 'active' : ''}
          onClick={() => setMode('participant')}
        >
          참여자 전용
          <small>참여해야 나타나는 상태와 새 기능</small>
        </button>
      </div>

      {mode === 'public' ? (
        <section className="publicPreviewArea">
          {activeTab === 'home' ? (
            <div className="homeSlot">
              <UiTestLab />
            </div>
          ) : activeTab === 'guide' ? (
            <div className="standardAppPage">
              <AppGuide locale={locale} />
            </div>
          ) : activeTab === 'leaderboard' ? (
            <div className="standardAppPage">
              <PublicLeaderboard
                locale={locale}
                wallet={TEST_WALLET}
                previewData={leaderboardPreview}
              />
            </div>
          ) : (
            <div className="standardAppPage">
              <AppSettings
                locale={locale}
                wallet={TEST_WALLET}
                isWalletActionPending={false}
                onLocaleChange={changeLocale}
                onConnect={() => undefined}
                onConnectAnother={async () => undefined}
                onDisconnect={async () => undefined}
              />
            </div>
          )}

          <div className="participantShortcut">
            <div>
              <strong>참여 후 화면도 확인할까요?</strong>
              <span>미션 상태·알림·인피니티 캔버스는 따로 모아뒀어요.</span>
            </div>
            <button type="button" onClick={() => showParticipantView('canvas')}>
              참여자 전용 보기
            </button>
          </div>

          <AppBottomNavigation
            activeTab={activeTab}
            locale={locale}
            onChange={changeTab}
          />
        </section>
      ) : (
        <section className="participantArea">
          <header className="participantHeader">
            <div>
              <span>PARTICIPANT-ONLY PREVIEW</span>
              <h1>참여자 전용 화면</h1>
              <p>
                실제로 초대에 참여하거나 미션이 진행돼야 볼 수 있는 화면만
                따로 모았습니다. Production 데이터와 연결되지 않습니다.
              </p>
            </div>
            <button type="button" onClick={() => setMode('public')}>
              일반 앱으로 돌아가기
            </button>
          </header>

          <nav className="participantTabs" aria-label="참여자 전용 미리보기">
            {PARTICIPANT_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={participantView === view.id ? 'active' : ''}
                onClick={() => setParticipantView(view.id)}
              >
                <strong>{view.label}</strong>
                <small>{view.description}</small>
              </button>
            ))}
          </nav>

          <div className={`participantContent participant-${participantView}`}>
            {participantView === 'states' ? (
              <UiTestLab />
            ) : participantView === 'notifications' ? (
              <NotificationUiPreview />
            ) : participantView === 'canvas' ? (
              <InfiniteReferralCanvasPreview />
            ) : (
              <InviteRejectionPreview />
            )}
          </div>
        </section>
      )}

      <style jsx global>{`
        .cleanUiTest {
          min-height:100vh;
          box-sizing:border-box;
          padding:18px 16px 118px;
          color:#f8f6ef;
          background:
            radial-gradient(circle at 50% -8%,rgba(96,58,120,.18),transparent 31%),
            #080807;
        }
        .cleanUiTest .previewHeader {
          width:min(100%,560px);
          min-height:50px;
          margin:0 auto;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
        }
        .cleanUiTest .previewBadge {
          padding:7px 9px;
          border:1px solid rgba(244,183,40,.2);
          border-radius:999px;
          background:rgba(244,183,40,.08);
          color:#e9c85f;
          font-size:.58rem;
          font-weight:950;
          letter-spacing:.08em;
          white-space:nowrap;
        }
        .cleanUiTest .modeSwitch {
          width:min(100%,560px);
          margin:14px auto 22px;
          padding:4px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:4px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:18px;
          background:rgba(255,255,255,.025);
        }
        .cleanUiTest .modeSwitch > button {
          min-height:58px;
          padding:8px 10px;
          display:grid;
          gap:3px;
          align-content:center;
          border:1px solid transparent;
          border-radius:14px;
          background:transparent;
          color:#7f7a72;
          font:inherit;
          font-size:.75rem;
          font-weight:900;
          cursor:pointer;
        }
        .cleanUiTest .modeSwitch > button small {
          color:#68645e;
          font-size:.58rem;
          font-weight:700;
        }
        .cleanUiTest .modeSwitch > button.active {
          border-color:rgba(244,183,40,.22);
          background:rgba(244,183,40,.09);
          color:#f4cf68;
        }
        .cleanUiTest .modeSwitch > button.active small { color:#a99769; }
        .cleanUiTest .standardAppPage {
          width:min(100%,560px);
          margin:0 auto;
        }
        .cleanUiTest .homeSlot {
          width:min(100%,560px);
          margin:0 auto;
        }
        .cleanUiTest .homeSlot .labScreen {
          display:block;
          width:100%;
          min-height:0;
          margin:0;
          padding:0;
          background:transparent;
        }
        .cleanUiTest .homeSlot .phoneCanvas {
          width:100%;
          margin:0;
          box-shadow:none;
        }
        .cleanUiTest .homeSlot .testPanel,
        .cleanUiTest .homeSlot .previewNavigation {
          display:none !important;
        }
        .cleanUiTest .participantShortcut {
          width:min(100%,560px);
          box-sizing:border-box;
          margin:20px auto 0;
          padding:14px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          border:1px solid rgba(255,255,255,.06);
          border-radius:17px;
          background:rgba(255,255,255,.025);
        }
        .cleanUiTest .participantShortcut > div { min-width:0; display:grid; gap:3px; }
        .cleanUiTest .participantShortcut strong { font-size:.73rem; }
        .cleanUiTest .participantShortcut span { color:#77736c; font-size:.63rem; line-height:1.4; }
        .cleanUiTest .participantShortcut button,
        .cleanUiTest .participantHeader > button {
          flex:0 0 auto;
          min-height:38px;
          padding:0 11px;
          border:1px solid rgba(244,183,40,.2);
          border-radius:12px;
          background:rgba(244,183,40,.08);
          color:#e9ca72;
          font:inherit;
          font-size:.65rem;
          font-weight:900;
          cursor:pointer;
        }
        .cleanUiTest .participantArea {
          width:min(100%,1120px);
          margin:0 auto;
        }
        .cleanUiTest .participantHeader {
          width:min(100%,760px);
          margin:0 auto 14px;
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
        }
        .cleanUiTest .participantHeader span {
          color:#f4b728;
          font-size:.62rem;
          font-weight:950;
          letter-spacing:.11em;
        }
        .cleanUiTest .participantHeader h1 {
          margin:5px 0 0;
          font-size:clamp(1.6rem,5vw,2.3rem);
          letter-spacing:-.045em;
        }
        .cleanUiTest .participantHeader p {
          max-width:560px;
          margin:8px 0 0;
          color:#8f8992;
          font-size:.72rem;
          line-height:1.55;
        }
        .cleanUiTest .participantTabs {
          width:min(100%,760px);
          margin:0 auto 18px;
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:7px;
        }
        .cleanUiTest .participantTabs button {
          min-height:70px;
          padding:9px;
          display:grid;
          gap:3px;
          align-content:center;
          border:1px solid rgba(255,255,255,.07);
          border-radius:15px;
          background:rgba(255,255,255,.025);
          color:#969099;
          font:inherit;
          text-align:left;
          cursor:pointer;
        }
        .cleanUiTest .participantTabs button strong { font-size:.69rem; }
        .cleanUiTest .participantTabs button small { color:#69636d; font-size:.57rem; line-height:1.35; }
        .cleanUiTest .participantTabs button.active {
          border-color:rgba(244,183,40,.28);
          background:rgba(244,183,40,.08);
          color:#f2ca5b;
        }
        .cleanUiTest .participantContent > section,
        .cleanUiTest .participantContent > main {
          margin-top:0;
        }
        .cleanUiTest .participant-states .previewNavigation { display:none !important; }
        .cleanUiTest .participant-states .labScreen { padding-bottom:10px; }
        .cleanUiTest .participant-canvas .infiniteCanvasPreviewSection { margin-top:0; }
        .cleanUiTest .participant-notifications .notificationPreview { margin-top:0; }
        .cleanUiTest .participant-eligibility .rejectionLab { margin-top:0; }
        @media (max-width:760px) {
          .cleanUiTest { padding:12px 10px 116px; }
          .cleanUiTest .participantHeader { display:grid; }
          .cleanUiTest .participantHeader > button { width:fit-content; }
          .cleanUiTest .participantTabs { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:420px) {
          .cleanUiTest .modeSwitch { grid-template-columns:1fr; }
          .cleanUiTest .participantShortcut { align-items:flex-start; flex-direction:column; }
          .cleanUiTest .participantShortcut button { width:100%; }
        }
      `}</style>
    </main>
  );
}
