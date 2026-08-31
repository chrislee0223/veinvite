'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Brand } from './Brand';
import {
  InviteNotificationSurface,
  type InviteNotificationKind,
  type InviteNotificationPayload,
} from './InviteNotificationSurface';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { NAV_COPY } from '@/lib/i18n/navCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isCjkLocale,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';

type HomePreviewId =
  | 'empty'
  | 'ready'
  | 'joined'
  | 'review'
  | 'complete';

type ScenarioId =
  | 'accepted'
  | 'dapp'
  | 'vot3'
  | 'collapsed-vot3'
  | 'all-missions'
  | 'reward';

type LocaleSource = 'settings' | 'browser' | 'fallback' | 'manual';

type HomePreview = {
  id: HomePreviewId;
  label: string;
  description: string;
};

type Scenario = {
  id: ScenarioId;
  label: string;
  description: string;
  kind: InviteNotificationKind;
  stage: number;
  collapsedProgress: boolean;
  rewardAmountWei: string | null;
};

const HOME_PREVIEWS: HomePreview[] = [
  {
    id: 'empty',
    label: '초대 가능',
    description: '아직 활성 초대가 없는 기본 홈',
  },
  {
    id: 'ready',
    label: '친구 대기',
    description: '초대 링크 생성 후 친구 참여 대기',
  },
  {
    id: 'joined',
    label: '친구 참여',
    description: '친구가 참여해 미션이 진행 중인 상태',
  },
  {
    id: 'review',
    label: '최종 확인',
    description: '미션 완료 후 최종 검증 중인 상태',
  },
  {
    id: 'complete',
    label: '완료',
    description: '활성화 완료 + 보상 상태 표시',
  },
];

const SCENARIOS: Scenario[] = [
  {
    id: 'accepted',
    label: '미션 시작',
    description: '초대 링크가 수락된 직후',
    kind: 'INVITE_ACCEPTED',
    stage: 1,
    collapsedProgress: false,
    rewardAmountWei: null,
  },
  {
    id: 'dapp',
    label: 'dApp 미션 완료',
    description: '서로 다른 dApp 3개에서 B3TR 획득 완료',
    kind: 'DAPP_MISSION_COMPLETED',
    stage: 2,
    collapsedProgress: false,
    rewardAmountWei: null,
  },
  {
    id: 'vot3',
    label: 'VOT3 전환 완료',
    description: 'B3TR → VOT3 전환 완료',
    kind: 'VOT3_CONVERTED',
    stage: 3,
    collapsedProgress: false,
    rewardAmountWei: null,
  },
  {
    id: 'collapsed-vot3',
    label: '여러 단계 한 번에',
    description: '접속하지 않은 사이 dApp + VOT3까지 완료',
    kind: 'VOT3_CONVERTED',
    stage: 3,
    collapsedProgress: true,
    rewardAmountWei: null,
  },
  {
    id: 'all-missions',
    label: '모든 미션 완료',
    description: '거버넌스 투표까지 완료, 최종 확인 중',
    kind: 'ALL_MISSIONS_COMPLETED',
    stage: 4,
    collapsedProgress: false,
    rewardAmountWei: null,
  },
  {
    id: 'reward',
    label: '보상 지급 완료',
    description: '최종 검증 + 실제 지급 완료 알림',
    kind: 'REWARD_PAID',
    stage: 5,
    collapsedProgress: false,
    rewardAmountWei: '123450000000000000000',
  },
];

const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

const LOCALE_SOURCE_LABEL: Record<LocaleSource, string> = {
  settings: 'Settings 저장값',
  browser: '브라우저/기기 감지',
  fallback: '영어 기본값',
  manual: '테스트 수동 선택',
};

export function UiTestLab() {
  const [locale, setLocale] = useState<Locale>('en');
  const [localeSource, setLocaleSource] =
    useState<LocaleSource>('fallback');
  const [homePreviewId, setHomePreviewId] =
    useState<HomePreviewId>('empty');
  const [scenarioId, setScenarioId] =
    useState<ScenarioId>('accepted');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [walletConnected, setWalletConnected] = useState(true);

  const applyAutomaticLocale = () => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (isLocale(saved)) {
      setLocale(saved);
      setLocaleSource('settings');
      document.documentElement.lang = saved;
      return;
    }

    const detected = resolveBrowserLocale(
      window.navigator.languages,
      'en',
    );
    const hasSupportedBrowserLanguage =
      window.navigator.languages.some((language) => {
        const base = language
          .trim()
          .toLowerCase()
          .replace('_', '-')
          .split('-')[0];
        return isLocale(base);
      });

    setLocale(detected);
    setLocaleSource(
      hasSupportedBrowserLanguage ? 'browser' : 'fallback',
    );
    document.documentElement.lang = detected;
  };

  useEffect(() => {
    applyAutomaticLocale();
    // This test page intentionally resolves language only on first mount,
    // matching the app's initial language priority without changing saved data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const homePreview =
    HOME_PREVIEWS.find((item) => item.id === homePreviewId) ??
    HOME_PREVIEWS[0];
  const scenario =
    SCENARIOS.find((item) => item.id === scenarioId) ??
    SCENARIOS[0];

  const t = HOME_COPY[locale];
  const nav = NAV_COPY[locale];

  const waitingForFriend = homePreview.id === 'ready';
  const activating = homePreview.id === 'joined';
  const underReview = homePreview.id === 'review';
  const displayCompleted = homePreview.id === 'complete';
  const active = waitingForFriend || activating || underReview;

  const stageIndex = waitingForFriend
    ? 1
    : activating || underReview
      ? 2
      : displayCompleted
        ? 3
        : 0;

  const badge = waitingForFriend
    ? t.inviteReadyBadge
    : activating
      ? t.friendJoinedBadge
      : underReview
        ? t.reviewBadge
        : displayCompleted
          ? t.completeBadge
          : t.inviteAvailable;

  const title = waitingForFriend
    ? t.inviteReadyTitle
    : activating
      ? t.friendJoinedTitle
      : underReview
        ? t.reviewTitle
        : displayCompleted
          ? t.completeTitle
          : t.emptyTitle;

  const description = waitingForFriend
    ? t.inviteReadyDescription
    : activating
      ? t.friendJoinedDescription
      : underReview
        ? t.reviewDescription
        : displayCompleted
          ? t.completeDescription
          : t.emptyDescription;

  const statusText = waitingForFriend
    ? t.waiting
    : activating
      ? t.inProgress
      : underReview
        ? t.checking
        : displayCompleted
          ? t.completed
          : t.noActive;

  const notification = useMemo<InviteNotificationPayload>(
    () => ({
      inviteCode: 'TEST234',
      kind: scenario.kind,
      stage: scenario.stage,
      eventAt: '2026-08-31T00:00:00.000Z',
      rewardAmountWei: scenario.rewardAmountWei,
      acknowledgedStage: 0,
      collapsedProgress: scenario.collapsedProgress,
    }),
    [scenario],
  );

  const showScenario = (nextScenario: Scenario) => {
    setScenarioId(nextScenario.id);
    setUnread(true);
    setOpen(true);
  };

  const manuallySetLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setLocaleSource('manual');
    document.documentElement.lang = nextLocale;
  };

  return (
    <main className="labScreen">
      <section className="phoneCanvas">
        <header className="topBar">
          <Brand />

          <div className="topActions">
            {walletConnected ? (
              <button
                type="button"
                className="accountChip"
                aria-label={t.walletAria}
              >
                <span className="accountDot" />
                <span className="walletText">
                  {TEST_WALLET.slice(0, 6)}···{TEST_WALLET.slice(-4)}
                </span>
              </button>
            ) : null}

            <InviteNotificationSurface
              locale={locale}
              notification={notification}
              unreadCount={unread ? 1 : 0}
              open={open}
              onOpen={() => setOpen(true)}
              onClose={() => {
                setOpen(false);
                setUnread(false);
              }}
            />
          </div>
        </header>

        <section className="missionCard">
          <div className="cardGlow" />

          <div className="missionHeader">
            <span className="badge">{badge}</span>
            <span className="missionLabel">{t.inviteMission}</span>
          </div>

          <div
            className={
              isCjkLocale(locale)
                ? 'missionCopy cjkCopy'
                : 'missionCopy'
            }
          >
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          <div
            className={
              displayCompleted
                ? 'rewardObjective unlocked'
                : 'rewardObjective'
            }
          >
            <span className="rewardIcon">
              {displayCompleted ? '✓' : '◇'}
            </span>
            <div className="rewardCopy">
              <small>{t.rewardLabel}</small>
              <strong>
                {displayCompleted
                  ? t.rewardUnlocked
                  : t.rewardLocked}
              </strong>
            </div>
            <span className="rewardState">
              {displayCompleted ? t.unlocked : t.locked}
            </span>
          </div>

          {active ? (
            <div className="inviteCodeCard">
              <span>{t.codeLabel}</span>
              <strong>TEST234</strong>
            </div>
          ) : null}

          <div className="progressTrack" aria-label={statusText}>
            <div className="progressLine">
              <span
                className={
                  stageIndex >= 1
                    ? 'lineFill stageOne'
                    : 'lineFill'
                }
              />
              <span
                className={
                  stageIndex >= 2
                    ? 'lineFill stageTwo'
                    : 'lineFill'
                }
              />
            </div>

            <ProgressStep
              number="1"
              label={stageIndex >= 1 ? t.linkCreated : t.createLink}
              state={stageIndex >= 1 ? 'complete' : 'idle'}
            />
            <ProgressStep
              number="2"
              label={
                stageIndex === 1
                  ? t.waitingForFriendStep
                  : t.friendJoins
              }
              state={
                stageIndex >= 2
                  ? 'complete'
                  : stageIndex === 1
                    ? 'waiting'
                    : 'idle'
              }
            />
            <ProgressStep
              number="3"
              label={t.activation}
              state={
                stageIndex >= 3
                  ? 'complete'
                  : stageIndex === 2
                    ? 'active'
                    : 'idle'
              }
            />
          </div>

          {homePreview.id === 'empty' ? (
            <button type="button" className="primaryAction">
              {walletConnected ? t.createInvite : t.connectStart}
              <span aria-hidden="true">›</span>
            </button>
          ) : null}

          {waitingForFriend ? (
            <>
              <div className="actionStack">
                <button type="button" className="primaryAction">
                  {t.shareInvite}
                  <span aria-hidden="true">›</span>
                </button>
                <button type="button" className="secondaryAction">
                  {t.copyLink}
                </button>
              </div>
              <button type="button" className="cancelLink">
                {t.cancelInvite}
              </button>
            </>
          ) : null}

          {activating || underReview ? (
            <div className="liveStatus">
              <span className="pulseDot" />
              <strong>{statusText}</strong>
            </div>
          ) : null}

          {displayCompleted ? (
            <div className="completePanel">
              <span className="completeIcon">✓</span>
              <div>
                <strong>{t.rewardPending}</strong>
                <p>{t.rewardDescription}</p>
              </div>
            </div>
          ) : null}
        </section>

        <nav
          className="previewNavigation"
          aria-label={nav.ariaLabel}
        >
          <PreviewNavButton label={nav.home} icon="home" active />
          <PreviewNavButton label={nav.guide} icon="guide" />
          <PreviewNavButton
            label={nav.leaderboard}
            icon="leaderboard"
          />
          <PreviewNavButton label={nav.settings} icon="settings" />
        </nav>
      </section>

      <section className="testPanel">
        <div className="testHeading">
          <div>
            <span className="testEyebrow">UI SYNC · 2026.08.31</span>
            <h2>VeInvite UI Test Lab</h2>
          </div>
          <span className="safeBadge">실데이터 사용 안 함</span>
        </div>

        <p className="testDescription">
          실제 앱에 반영하기 전 최신 홈 UI와 언어 동작을 테스트합니다.
          지갑 연결·초대·DB·Sybil 검사·보상 지급은 실행하지 않습니다.
        </p>

        <div className="syncNote">
          <strong>이번 변경 미리보기</strong>
          <span>
            상단 언어 선택 제거 · 지갑 주소 왼쪽 · 알림 종 오른쪽 ·
            저장 언어 우선 · 브라우저/기기 언어 자동 감지 · 영어 fallback
          </span>
        </div>

        <div className="controlGroup">
          <div className="controlHeading">
            <div>
              <strong>언어 동작</strong>
              <small>
                실제 상단에는 언어 메뉴가 없고 Settings에서만 변경합니다.
              </small>
            </div>
            <span className="sourceBadge">
              {LOCALE_SOURCE_LABEL[localeSource]}
            </span>
          </div>

          <div className="languageTestRow">
            <select
              value={locale}
              aria-label="테스트 미리보기 언어"
              onChange={(event) =>
                manuallySetLocale(event.target.value as Locale)
              }
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.nativeName}
                </option>
              ))}
            </select>
            <button type="button" onClick={applyAutomaticLocale}>
              자동 감지로 복원
            </button>
          </div>

          <p className="languagePriority">
            우선순위: Settings에서 직접 선택한 언어 → 브라우저/기기 언어 →
            지원하지 않는 언어는 English
          </p>
        </div>

        <div className="controlGroup">
          <div className="controlHeading">
            <div>
              <strong>지갑 표시</strong>
              <small>
                로그인 상태에 따른 상단 헤더와 첫 CTA를 함께 확인합니다.
              </small>
            </div>
            <button
              type="button"
              className={
                walletConnected
                  ? 'toggleButton on'
                  : 'toggleButton'
              }
              aria-pressed={walletConnected}
              onClick={() =>
                setWalletConnected((current) => !current)
              }
            >
              {walletConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </button>
          </div>
        </div>

        <div className="controlGroup">
          <div className="controlHeading">
            <div>
              <strong>홈 상태</strong>
              <small>메인 카드의 실제 상태별 UI를 확인합니다.</small>
            </div>
          </div>

          <div className="homeStateGrid">
            {HOME_PREVIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  homePreviewId === item.id
                    ? 'homeStateButton selected'
                    : 'homeStateButton'
                }
                onClick={() => setHomePreviewId(item.id)}
              >
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="controlGroup">
          <div className="controlHeading">
            <div>
              <strong>알림 시나리오</strong>
              <small>
                선택하면 Production과 같은 알림 패널을 바로 엽니다.
              </small>
            </div>
          </div>

          <div className="scenarioList">
            {SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  scenarioId === item.id
                    ? 'scenarioButton selected'
                    : 'scenarioButton'
                }
                onClick={() => showScenario(item)}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>

        <div className="reviewNote">
          <strong>확인 포인트</strong>
          <span>
            모바일에서 지갑 칩과 알림 종이 겹치지 않는지, 알림 종이 항상
            우측 끝에 보이는지, 긴 번역 문구에서도 카드와 하단 메뉴가
            깨지지 않는지 확인하세요.
          </span>
        </div>
      </section>

      <style jsx>{`
        .labScreen {
          min-height:100svh;
          box-sizing:border-box;
          padding:24px 18px 60px;
          display:grid;
          grid-template-columns:minmax(320px,560px) minmax(360px,520px);
          justify-content:center;
          align-items:start;
          gap:34px;
          color:#fff;
          background:radial-gradient(circle at 31% 13%,rgba(244,183,40,.15),transparent 27%),#080807;
        }
        .phoneCanvas {
          position:relative;
          min-width:0;
          min-height:760px;
          padding:20px 18px 104px;
          box-sizing:border-box;
          border:1px solid rgba(255,255,255,.08);
          border-radius:38px;
          background:radial-gradient(circle at 50% 13%,rgba(244,183,40,.12),transparent 30%),#080807;
          box-shadow:0 28px 90px rgba(0,0,0,.45);
          overflow:hidden;
        }
        .topBar {
          width:min(100%,520px);
          min-height:48px;
          margin:0 auto 24px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
        }
        .topActions {
          min-width:0;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:9px;
        }
        .accountChip {
          min-width:0;
          min-height:40px;
          padding:0 12px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:#141310;
          color:#fff;
          font:inherit;
          font-size:.7rem;
          font-weight:850;
          cursor:pointer;
        }
        .accountDot {
          flex:0 0 auto;
          width:8px;
          height:8px;
          border-radius:50%;
          background:#f4b728;
          box-shadow:0 0 13px rgba(244,183,40,.68);
        }
        .walletText {
          min-width:0;
          white-space:nowrap;
        }
        .missionCard {
          position:relative;
          overflow:hidden;
          width:min(100%,520px);
          box-sizing:border-box;
          margin:0 auto;
          padding:24px;
          border:1px solid rgba(255,201,61,.28);
          border-radius:30px;
          background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%);
          box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08);
        }
        .cardGlow {
          position:absolute;
          top:-110px;
          right:-90px;
          width:250px;
          height:250px;
          border-radius:50%;
          background:rgba(244,183,40,.22);
          filter:blur(4px);
          pointer-events:none;
        }
        .missionHeader {
          position:relative;
          z-index:1;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
        }
        .missionHeader .missionLabel { order:-1; }
        .badge {
          width:fit-content;
          max-width:62%;
          display:inline-flex;
          align-items:center;
          min-height:28px;
          padding:0 11px;
          border:1px solid rgba(255,205,80,.3);
          border-radius:999px;
          background:rgba(244,183,40,.12);
          color:#ffd66e;
          font-size:.66rem;
          font-weight:950;
          letter-spacing:.05em;
          overflow-wrap:anywhere;
        }
        .missionLabel {
          color:#8f86ae;
          font-size:.68rem;
          font-weight:900;
          letter-spacing:.12em;
        }
        .missionCopy {
          position:relative;
          z-index:1;
          margin-top:24px;
        }
        .missionCopy h1 {
          max-width:100%;
          margin:0;
          font-size:clamp(2.05rem,8vw,3.05rem);
          line-height:1.04;
          letter-spacing:-.05em;
          text-wrap:balance;
          overflow-wrap:anywhere;
          hyphens:auto;
        }
        .missionCopy.cjkCopy h1 {
          font-size:clamp(2rem,7vw,2.85rem);
          line-height:1.1;
          letter-spacing:-.035em;
        }
        .missionCopy p {
          max-width:410px;
          margin:13px 0 0;
          color:#b7b1c7;
          font-size:.94rem;
          font-weight:650;
          line-height:1.58;
          overflow-wrap:anywhere;
        }
        .rewardObjective {
          position:relative;
          z-index:1;
          margin-top:22px;
          padding:14px 15px;
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto;
          align-items:center;
          gap:12px;
          border:1px solid rgba(255,255,255,.09);
          border-radius:17px;
          background:rgba(255,255,255,.045);
        }
        .rewardObjective.unlocked {
          border-color:rgba(82,225,164,.22);
          background:rgba(37,170,115,.09);
        }
        .rewardIcon {
          width:38px;
          height:38px;
          display:grid;
          place-items:center;
          border-radius:13px;
          background:rgba(244,183,40,.13);
          color:#ffd66e;
          font-size:1.25rem;
          font-weight:950;
        }
        .rewardObjective.unlocked .rewardIcon {
          background:rgba(52,212,142,.16);
          color:#75efb8;
        }
        .rewardCopy {
          min-width:0;
          display:grid;
          gap:3px;
        }
        .rewardCopy small {
          color:#858097;
          font-size:.6rem;
          font-weight:900;
          letter-spacing:.08em;
          overflow-wrap:anywhere;
        }
        .rewardCopy strong {
          color:#f5f2ff;
          font-size:.81rem;
          line-height:1.3;
          overflow-wrap:anywhere;
        }
        .rewardState {
          min-height:25px;
          padding:0 9px;
          display:inline-flex;
          align-items:center;
          border:1px solid rgba(255,255,255,.08);
          border-radius:999px;
          color:#777184;
          font-size:.56rem;
          font-weight:950;
          letter-spacing:.04em;
        }
        .rewardObjective.unlocked .rewardState {
          border-color:rgba(82,225,164,.2);
          color:#77efb9;
        }
        .inviteCodeCard {
          position:relative;
          z-index:1;
          margin-top:22px;
          padding:14px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          border:1px solid rgba(255,255,255,.09);
          border-radius:16px;
          background:rgba(255,255,255,.045);
        }
        .inviteCodeCard span {
          color:#8f899e;
          font-size:.72rem;
          font-weight:800;
        }
        .inviteCodeCard strong {
          color:#ffd66e;
          font-size:1rem;
          letter-spacing:.08em;
        }
        .progressTrack {
          position:relative;
          z-index:1;
          display:grid;
          grid-template-columns:repeat(3,1fr);
          margin-top:25px;
        }
        .progressLine {
          position:absolute;
          top:15px;
          left:16.66%;
          right:16.66%;
          height:2px;
          display:grid;
          grid-template-columns:1fr 1fr;
          background:rgba(255,255,255,.09);
        }
        .lineFill { height:2px; background:transparent; }
        .lineFill.stageOne,.lineFill.stageTwo {
          background:#f4b728;
          box-shadow:0 0 12px rgba(244,183,40,.45);
        }
        .primaryAction,.secondaryAction {
          position:relative;
          z-index:1;
          width:100%;
          min-height:58px;
          border-radius:18px;
          font:inherit;
          font-size:.96rem;
          font-weight:950;
          cursor:pointer;
          overflow-wrap:anywhere;
        }
        .primaryAction {
          margin-top:24px;
          border:0;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:10px;
          padding:10px 16px;
          background:linear-gradient(135deg,#ffd24d,#efa718);
          color:#17120a;
          box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22);
        }
        .primaryAction span { font-size:1.55rem; line-height:1; }
        .secondaryAction {
          border:1px solid rgba(255,255,255,.11);
          background:rgba(255,255,255,.045);
          color:#fff;
        }
        .actionStack { display:grid; gap:11px; }
        .liveStatus {
          position:relative;
          z-index:1;
          min-height:58px;
          margin-top:24px;
          padding:8px 14px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:10px;
          border:1px solid rgba(255,201,61,.24);
          border-radius:18px;
          background:rgba(244,183,40,.08);
          color:#ffd66e;
          text-align:center;
        }
        .pulseDot {
          width:9px;
          height:9px;
          border-radius:50%;
          background:#f4b728;
          box-shadow:0 0 18px rgba(244,183,40,.72);
          animation:pulse 1.6s ease-in-out infinite;
        }
        .completePanel {
          position:relative;
          z-index:1;
          margin-top:24px;
          padding:16px;
          display:flex;
          align-items:flex-start;
          gap:13px;
          border:1px solid rgba(90,222,166,.2);
          border-radius:18px;
          background:rgba(40,170,118,.08);
        }
        .completeIcon {
          flex:0 0 auto;
          width:34px;
          height:34px;
          display:grid;
          place-items:center;
          border-radius:12px;
          background:rgba(52,212,142,.16);
          color:#75efb8;
          font-weight:950;
        }
        .completePanel strong { color:#89f0be; font-size:.86rem; }
        .completePanel p {
          margin:5px 0 0;
          color:#aeb7b1;
          font-size:.76rem;
          line-height:1.5;
        }
        .cancelLink {
          position:relative;
          z-index:1;
          width:100%;
          margin-top:14px;
          border:0;
          background:transparent;
          color:#8d8797;
          font:inherit;
          font-size:.72rem;
          font-weight:800;
          cursor:pointer;
        }
        .previewNavigation {
          position:absolute;
          left:18px;
          right:18px;
          bottom:18px;
          min-height:72px;
          padding:7px;
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:3px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:23px;
          background:rgba(17,17,15,.94);
          box-shadow:0 18px 50px rgba(0,0,0,.42);
          backdrop-filter:blur(18px);
        }
        .testPanel {
          position:sticky;
          top:24px;
          min-width:0;
          box-sizing:border-box;
          padding:25px;
          border:1px solid rgba(255,255,255,.09);
          border-radius:28px;
          background:#11110f;
          box-shadow:0 24px 80px rgba(0,0,0,.3);
        }
        .testHeading {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
        }
        .testEyebrow {
          color:#f4b728;
          font-size:.66rem;
          font-weight:950;
          letter-spacing:.12em;
        }
        .testHeading h2 {
          margin:7px 0 0;
          font-size:1.55rem;
          letter-spacing:-.035em;
        }
        .safeBadge,.sourceBadge {
          flex:0 0 auto;
          padding:7px 9px;
          border-radius:999px;
          font-size:.59rem;
          font-weight:900;
        }
        .safeBadge {
          border:1px solid rgba(82,225,164,.2);
          background:rgba(52,212,142,.08);
          color:#75efb8;
        }
        .sourceBadge {
          border:1px solid rgba(244,183,40,.2);
          background:rgba(244,183,40,.08);
          color:#ffd66e;
        }
        .testDescription {
          margin:18px 0 0;
          color:#a8a4af;
          font-size:.84rem;
          line-height:1.62;
        }
        .syncNote,.reviewNote {
          margin-top:18px;
          padding:14px 15px;
          display:grid;
          gap:5px;
          border-radius:16px;
        }
        .syncNote {
          border:1px solid rgba(244,183,40,.18);
          background:rgba(244,183,40,.065);
        }
        .reviewNote {
          border:1px solid rgba(111,157,255,.17);
          background:rgba(88,126,215,.07);
        }
        .syncNote strong,.reviewNote strong {
          color:#f6d378;
          font-size:.75rem;
        }
        .syncNote span,.reviewNote span {
          color:#a8a4af;
          font-size:.72rem;
          line-height:1.5;
        }
        .controlGroup {
          margin-top:20px;
          padding-top:19px;
          border-top:1px solid rgba(255,255,255,.07);
        }
        .controlHeading {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
        }
        .controlHeading > div {
          min-width:0;
          display:grid;
          gap:4px;
        }
        .controlHeading strong { font-size:.84rem; }
        .controlHeading small {
          color:#7f7a89;
          font-size:.68rem;
          line-height:1.4;
        }
        .toggleButton {
          flex:0 0 auto;
          min-height:34px;
          padding:0 10px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:10px;
          background:#181816;
          color:#88838e;
          font:inherit;
          font-size:.59rem;
          font-weight:950;
          cursor:pointer;
        }
        .toggleButton.on {
          border-color:rgba(244,183,40,.26);
          background:rgba(244,183,40,.1);
          color:#ffd66e;
        }
        .languageTestRow {
          margin-top:13px;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:9px;
        }
        .languageTestRow select,.languageTestRow button {
          min-height:42px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:12px;
          background:#181816;
          color:#fff;
          font:inherit;
          font-size:.73rem;
          font-weight:800;
        }
        .languageTestRow select { min-width:0; padding:0 11px; }
        .languageTestRow button { padding:0 12px; cursor:pointer; }
        .languagePriority {
          margin:10px 0 0;
          color:#7f7a89;
          font-size:.67rem;
          line-height:1.5;
        }
        .homeStateGrid {
          margin-top:13px;
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:9px;
        }
        .homeStateButton,.scenarioButton {
          border:1px solid rgba(255,255,255,.08);
          background:#181816;
          color:#fff;
          font:inherit;
          cursor:pointer;
        }
        .homeStateButton {
          min-height:72px;
          padding:11px;
          display:grid;
          gap:5px;
          text-align:left;
          border-radius:13px;
        }
        .homeStateButton strong,.scenarioButton strong {
          font-size:.74rem;
        }
        .homeStateButton small,.scenarioButton small {
          color:#7f7a89;
          font-size:.63rem;
          line-height:1.38;
        }
        .homeStateButton.selected,.scenarioButton.selected {
          border-color:rgba(244,183,40,.28);
          background:rgba(244,183,40,.08);
        }
        .scenarioList {
          margin-top:13px;
          display:grid;
          gap:8px;
        }
        .scenarioButton {
          min-height:58px;
          padding:10px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          border-radius:13px;
          text-align:left;
        }
        .scenarioButton > span:first-child {
          min-width:0;
          display:grid;
          gap:4px;
        }
        .scenarioButton > span:last-child {
          color:#f4b728;
          font-size:1.2rem;
        }
        @keyframes pulse {
          0%,100% { opacity:.55; transform:scale(.88); }
          50% { opacity:1; transform:scale(1.08); }
        }
        @media (max-width: 940px) {
          .labScreen {
            grid-template-columns:minmax(0,580px);
            gap:22px;
          }
          .testPanel {
            position:static;
            grid-row:1;
          }
          .phoneCanvas { grid-row:2; }
        }
        @media (max-width: 560px) {
          .labScreen {
            padding:0;
            display:block;
            background:#080807;
          }
          .testPanel {
            margin:0;
            border-width:0 0 1px;
            border-radius:0;
            padding:20px 16px;
          }
          .phoneCanvas {
            min-height:760px;
            padding:20px 16px 104px;
            border:0;
            border-radius:0;
            box-shadow:none;
          }
          .topBar { margin-bottom:22px; gap:10px; }
          .topActions { gap:7px; }
          .accountChip {
            min-height:38px;
            max-width:124px;
            padding:0 10px;
            font-size:.64rem;
          }
          .missionCard { padding:21px 18px; border-radius:27px; }
          .missionCopy h1 { font-size:clamp(1.8rem,10vw,2.6rem); }
          .missionCopy.cjkCopy h1 { font-size:clamp(1.75rem,9vw,2.45rem); }
          .rewardObjective {
            grid-template-columns:auto minmax(0,1fr);
          }
          .rewardState {
            grid-column:2;
            justify-self:start;
          }
          .previewNavigation { left:12px; right:12px; bottom:12px; }
          .testHeading { align-items:flex-start; }
          .safeBadge { max-width:92px; text-align:center; line-height:1.25; }
          .controlHeading { align-items:flex-start; }
          .sourceBadge { max-width:108px; text-align:center; line-height:1.25; }
          .languageTestRow { grid-template-columns:1fr; }
        }
        @media (max-width: 390px) {
          .accountChip {
            max-width:108px;
            padding:0 8px;
          }
          .accountDot { width:7px; height:7px; }
          .walletText { font-size:.6rem; }
          .missionHeader { align-items:flex-start; }
          .badge { max-width:58%; }
          .homeStateGrid { grid-template-columns:1fr; }
        }
      `}</style>
    </main>
  );
}

function ProgressStep({
  number,
  label,
  state,
}: {
  number: string;
  label: string;
  state: 'idle' | 'waiting' | 'active' | 'complete';
}) {
  return (
    <div className={`step ${state}`}>
      <span className="stepCircle">
        {state === 'complete' ? '✓' : number}
      </span>
      <span className="stepLabel">{label}</span>

      <style jsx>{`
        .step {
          position:relative;
          z-index:2;
          min-width:0;
          display:grid;
          justify-items:center;
          gap:8px;
          text-align:center;
        }
        .stepCircle {
          width:30px;
          height:30px;
          display:grid;
          place-items:center;
          border:2px solid #3d393c;
          border-radius:50%;
          background:#151412;
          color:#6f6974;
          font-size:.69rem;
          font-weight:950;
        }
        .stepLabel {
          max-width:100%;
          color:#716b78;
          font-size:.61rem;
          font-weight:850;
          line-height:1.3;
          overflow-wrap:anywhere;
        }
        .step.waiting .stepCircle,.step.active .stepCircle {
          border-color:#f4b728;
          color:#ffd66e;
          box-shadow:0 0 15px rgba(244,183,40,.2);
        }
        .step.waiting .stepLabel,.step.active .stepLabel {
          color:#d7bd79;
        }
        .step.complete .stepCircle {
          border-color:#f4b728;
          background:#f4b728;
          color:#17120a;
        }
        .step.complete .stepLabel { color:#cfc8d7; }
      `}</style>
    </div>
  );
}

type PreviewNavIconName =
  | 'home'
  | 'guide'
  | 'leaderboard'
  | 'settings';

function PreviewNavButton({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: PreviewNavIconName;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
    >
      <PreviewNavIcon name={icon} />
      <span>{label}</span>

      <style jsx>{`
        button {
          min-width:0;
          min-height:56px;
          padding:6px 3px;
          display:grid;
          place-items:center;
          align-content:center;
          gap:4px;
          border:0;
          border-radius:16px;
          background:transparent;
          color:#747078;
          font:inherit;
          cursor:default;
        }
        button.active {
          background:rgba(244,183,40,.1);
          color:#f4b728;
        }
        span {
          max-width:100%;
          font-size:.56rem;
          font-weight:850;
          line-height:1.15;
          overflow-wrap:anywhere;
        }
      `}</style>
    </button>
  );
}

function PreviewNavIcon({ name }: { name: PreviewNavIconName }) {
  if (name === 'home') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.8 10.7 12 4l8.2 6.7v8.1a1.2 1.2 0 0 1-1.2 1.2h-4.5v-5.4h-5V20H5a1.2 1.2 0 0 1-1.2-1.2v-8.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'guide') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5.2A2.2 2.2 0 0 1 7.2 3H11v16H7.2A2.2 2.2 0 0 0 5 21.2v-16ZM19 5.2A2.2 2.2 0 0 0 16.8 3H13v16h3.8a2.2 2.2 0 0 1 2.2 2.2v-16Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'leaderboard') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 20v-6h4v6H5Zm5.5 0V9h4v11h-4ZM16 20V4h4v16h-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m19.1 13.2 1.2 1-.1 1.9-1.4.8-.8 1.4.1 1.6-1.7.9-1.3-.9-1.6.4-.8 1.4h-1.9L10 20.3l-1.6-.4-1.3.9-1.7-.9.1-1.6-.8-1.4-1.4-.8-.1-1.9 1.2-1v-1.7l-1.2-1 .1-1.9 1.4-.8.8-1.4-.1-1.6 1.7-.9 1.3.9 1.6-.4.8-1.4h1.9l.8 1.4 1.6.4 1.3-.9 1.7.9-.1 1.6.8 1.4 1.4.8.1 1.9-1.2 1v1.7Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
    </svg>
  );
}
