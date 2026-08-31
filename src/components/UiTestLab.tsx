'use client';

import {
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
  isCjkLocale,
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

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

export function UiTestLab() {
  const [locale, setLocale] = useState<Locale>('ko');
  const [homePreviewId, setHomePreviewId] =
    useState<HomePreviewId>('empty');
  const [scenarioId, setScenarioId] =
    useState<ScenarioId>('accepted');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [walletConnected, setWalletConnected] = useState(true);

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

  return (
    <main className="labScreen">
      <section className="phoneCanvas">
        <header className="topBar">
          <Brand />

          <div className="topActions">
            <div className="utilityActions">
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

              <select
                className="languageSelect"
                value={locale}
                aria-label="UI 테스트 언어"
                onChange={(event) =>
                  setLocale(event.target.value as Locale)
                }
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option
                    key={option.locale}
                    value={option.locale}
                  >
                    {option.nativeName}
                  </option>
                ))}
              </select>
            </div>

            {walletConnected ? (
              <button
                type="button"
                className="accountChip"
                aria-label={t.walletAria}
              >
                <span className="accountDot" />
                {TEST_WALLET.slice(0, 6)}···{TEST_WALLET.slice(-4)}
              </button>
            ) : null}
          </div>
        </header>

        <section className="missionCard">
          <div className="cardGlow" />

          <div className="missionHeader">
            <span className="badge">{badge}</span>
            <span className="missionLabel">
              {t.inviteMission}
            </span>
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

          <div
            className="progressTrack"
            aria-label={statusText}
          >
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
              label={
                stageIndex >= 1
                  ? t.linkCreated
                  : t.createLink
              }
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
            <button
              type="button"
              className="primaryAction"
            >
              {walletConnected
                ? t.createInvite
                : t.connectStart}
              <span aria-hidden="true">›</span>
            </button>
          ) : null}

          {waitingForFriend ? (
            <>
              <div className="actionStack">
                <button
                  type="button"
                  className="primaryAction"
                >
                  {t.shareInvite}
                  <span aria-hidden="true">›</span>
                </button>
                <button
                  type="button"
                  className="secondaryAction"
                >
                  {t.copyLink}
                </button>
              </div>
              <button
                type="button"
                className="cancelLink"
              >
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
          <PreviewNavButton
            label={nav.home}
            icon="home"
            active
          />
          <PreviewNavButton
            label={nav.guide}
            icon="guide"
          />
          <PreviewNavButton
            label={nav.leaderboard}
            icon="leaderboard"
          />
          <PreviewNavButton
            label={nav.settings}
            icon="settings"
          />
        </nav>
      </section>

      <section className="testPanel">
        <div className="testHeading">
          <div>
            <span className="testEyebrow">
              UI SYNC · 2026.08.31
            </span>
            <h2>VeInvite UI Test Lab</h2>
          </div>
          <span className="safeBadge">
            실데이터 사용 안 함
          </span>
        </div>

        <p className="testDescription">
          최신 Production 홈 UI 구조와 알림 UI를 테스트
          데이터로 확인합니다. 실제 초대·지갑 연결·DB·Sybil
          검사·보상 지급은 실행하지 않습니다.
        </p>

        <div className="syncNote">
          <strong>최신 UI 반영</strong>
          <span>
            상태 배지 · 단계별 진행 문구 · 지갑 칩 · 보상 상태 ·
            하단 내비게이션
          </span>
        </div>

        <div className="controlGroup">
          <div className="controlHeading">
            <div>
              <strong>지갑 표시</strong>
              <small>
                상단 지갑 칩과 첫 CTA를 함께 확인
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
              <small>
                메인 카드의 실제 상태별 UI 확인
              </small>
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
                onClick={() =>
                  setHomePreviewId(item.id)
                }
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
                선택 즉시 Production 알림 UI 열기
              </small>
            </div>
          </div>

          <div className="scenarioGrid">
            {SCENARIOS.map((item, index) => (
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
                <span className="scenarioNumber">
                  {index + 1}
                </span>
                <span className="scenarioCopy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <span
                  className="scenarioArrow"
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="testTip">
          언어를 바꾸면 홈 카드와 알림 문구가 같은 언어로
          즉시 바뀝니다. 알림을 닫은 뒤 상단 벨을 누르면
          다시 열어볼 수 있습니다. 하단 메뉴는 현재
          Production 내비게이션 디자인 확인용 미리보기입니다.
        </div>
      </section>

      <style jsx>{`
        .labScreen {
          min-height: 100svh;
          box-sizing: border-box;
          padding: 24px 18px 60px;
          display: grid;
          grid-template-columns: minmax(320px, 520px) minmax(320px, 460px);
          align-items: start;
          justify-content: center;
          gap: 28px;
          color: #fff;
          background:
            radial-gradient(
              circle at 38% 12%,
              rgba(244, 183, 40, .13),
              transparent 31%
            ),
            #080807;
        }
        .phoneCanvas,
        .testPanel {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .topBar {
          margin: 0 0 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .topActions {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .utilityActions {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .languageSelect {
          max-width: 155px;
          height: 40px;
          padding: 0 28px 0 11px;
          border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 13px;
          background: #141625;
          color: #fff;
          font: inherit;
          font-size: .76rem;
          font-weight: 800;
          cursor: pointer;
        }
        .accountChip {
          min-height: 40px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 13px;
          background: #141625;
          color: #fff;
          font: inherit;
          font-size: .72rem;
          font-weight: 850;
        }
        .accountDot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #f4b728;
          box-shadow: 0 0 14px rgba(244, 183, 40, .68);
        }
        .missionCard {
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
          padding: 24px;
          border: 1px solid rgba(255, 201, 61, .28);
          border-radius: 30px;
          background:
            linear-gradient(
              155deg,
              rgba(54, 40, 14, .98),
              rgba(16, 16, 14, .99) 66%
            );
          box-shadow:
            0 28px 80px rgba(0, 0, 0, .44),
            inset 0 1px 0 rgba(255, 255, 255, .08);
        }
        .cardGlow {
          position: absolute;
          top: -110px;
          right: -90px;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          background: rgba(244, 183, 40, .22);
          filter: blur(4px);
          pointer-events: none;
        }
        .missionHeader {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .missionHeader .missionLabel {
          order: -1;
        }
        .badge {
          width: fit-content;
          max-width: 62%;
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 11px;
          border: 1px solid rgba(255, 205, 80, .3);
          border-radius: 999px;
          background: rgba(244, 183, 40, .12);
          color: #ffd66e;
          font-size: .66rem;
          font-weight: 950;
          letter-spacing: .05em;
          overflow-wrap: anywhere;
        }
        .missionLabel {
          color: #8f86ae;
          font-size: .68rem;
          font-weight: 900;
          letter-spacing: .12em;
        }
        .missionCopy {
          position: relative;
          z-index: 1;
          margin-top: 24px;
        }
        .missionCopy h1 {
          max-width: 100%;
          margin: 0;
          font-size: clamp(2.05rem, 8vw, 3.05rem);
          line-height: 1.04;
          letter-spacing: -.05em;
          text-wrap: balance;
          overflow-wrap: anywhere;
          hyphens: auto;
        }
        .missionCopy.cjkCopy h1 {
          font-size: clamp(2rem, 7vw, 2.85rem);
          line-height: 1.1;
          letter-spacing: -.035em;
        }
        .missionCopy p {
          max-width: 410px;
          margin: 13px 0 0;
          color: #b7b1c7;
          font-size: .94rem;
          font-weight: 650;
          line-height: 1.58;
          overflow-wrap: anywhere;
        }
        .rewardObjective {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          padding: 14px 15px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 17px;
          background: rgba(255, 255, 255, .045);
        }
        .rewardObjective.unlocked {
          border-color: rgba(82, 225, 164, .22);
          background: rgba(37, 170, 115, .09);
        }
        .rewardIcon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: rgba(244, 183, 40, .13);
          color: #ffd66e;
          font-size: 1.25rem;
          font-weight: 950;
        }
        .rewardObjective.unlocked .rewardIcon {
          background: rgba(52, 212, 142, .16);
          color: #75efb8;
        }
        .rewardCopy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .rewardCopy small {
          color: #858097;
          font-size: .6rem;
          font-weight: 900;
          letter-spacing: .08em;
          overflow-wrap: anywhere;
        }
        .rewardCopy strong {
          color: #f5f2ff;
          font-size: .81rem;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }
        .rewardState {
          min-height: 25px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 999px;
          color: #777184;
          font-size: .56rem;
          font-weight: 950;
          letter-spacing: .04em;
        }
        .rewardObjective.unlocked .rewardState {
          border-color: rgba(82, 225, 164, .2);
          color: #77efb9;
        }
        .inviteCodeCard {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 16px;
          background: rgba(255, 255, 255, .045);
        }
        .inviteCodeCard span {
          color: #8f899e;
          font-size: .72rem;
          font-weight: 800;
        }
        .inviteCodeCard strong {
          color: #ffd66e;
          font-size: 1rem;
          letter-spacing: .08em;
          overflow-wrap: anywhere;
        }
        .progressTrack {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin-top: 25px;
        }
        .progressLine {
          position: absolute;
          top: 15px;
          left: 16.66%;
          right: 16.66%;
          height: 2px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          background: rgba(255, 255, 255, .09);
        }
        .lineFill {
          height: 2px;
          background: transparent;
        }
        .lineFill.stageOne,
        .lineFill.stageTwo {
          background: #f4b728;
          box-shadow: 0 0 12px rgba(244, 183, 40, .45);
        }
        .primaryAction,
        .secondaryAction {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 58px;
          border-radius: 18px;
          font: inherit;
          font-size: .96rem;
          font-weight: 950;
          overflow-wrap: anywhere;
        }
        .primaryAction {
          margin-top: 24px;
          border: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px 16px;
          background:
            linear-gradient(135deg, #ffd24d, #efa718);
          color: #17120a;
          box-shadow:
            0 16px 35px rgba(190, 126, 12, .25),
            inset 0 1px 0 rgba(255, 255, 255, .22);
        }
        .primaryAction span {
          font-size: 1.55rem;
          line-height: 1;
        }
        .secondaryAction {
          border: 1px solid rgba(255, 255, 255, .11);
          background: rgba(255, 255, 255, .045);
          color: #fff;
        }
        .actionStack {
          display: grid;
          gap: 11px;
        }
        .liveStatus {
          position: relative;
          z-index: 1;
          min-height: 58px;
          margin-top: 24px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid rgba(255, 201, 61, .24);
          border-radius: 18px;
          background: rgba(244, 183, 40, .08);
          color: #ffd66e;
          text-align: center;
        }
        .pulseDot {
          flex: 0 0 auto;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #f4b728;
          box-shadow: 0 0 18px rgba(244, 183, 40, .72);
          animation: pulse 1.6s ease-in-out infinite;
        }
        .completePanel {
          position: relative;
          z-index: 1;
          margin-top: 24px;
          padding: 16px;
          display: flex;
          align-items: flex-start;
          gap: 13px;
          border: 1px solid rgba(90, 222, 166, .2);
          border-radius: 18px;
          background: rgba(40, 170, 118, .08);
        }
        .completeIcon {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(64, 222, 156, .18);
          color: #77efb9;
          font-weight: 950;
        }
        .completePanel > div {
          min-width: 0;
          flex: 1;
        }
        .completePanel strong {
          font-size: .9rem;
          overflow-wrap: anywhere;
        }
        .completePanel p {
          margin: 4px 0 0;
          color: #9eaa9f;
          font-size: .75rem;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .cancelLink {
          position: relative;
          z-index: 1;
          display: block;
          margin: 18px auto 0;
          border: 0;
          background: transparent;
          color: #8d879a;
          font: inherit;
          font-size: .74rem;
          font-weight: 800;
        }
        .previewNavigation {
          width: 100%;
          min-height: 70px;
          box-sizing: border-box;
          margin: 18px auto 0;
          padding: 6px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border: 1px solid rgba(255, 205, 80, .16);
          border-radius: 23px;
          background: rgba(22, 22, 20, .96);
          box-shadow: 0 18px 55px rgba(0, 0, 0, .5);
          backdrop-filter: blur(18px);
        }
        .testPanel {
          position: sticky;
          top: 20px;
          max-height: calc(100svh - 40px);
          overflow: auto;
          padding: 24px;
          border: 1px solid rgba(255, 201, 61, .18);
          border-radius: 26px;
          background: rgba(255, 255, 255, .035);
          box-shadow: 0 22px 70px rgba(0, 0, 0, .3);
        }
        .testHeading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .testEyebrow {
          color: #ffd04a;
          font-size: .64rem;
          font-weight: 950;
          letter-spacing: .11em;
        }
        .testHeading h2 {
          margin: 5px 0 0;
          font-size: 1.45rem;
          letter-spacing: -.035em;
        }
        .safeBadge {
          flex: 0 0 auto;
          min-height: 28px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(77, 224, 167, .2);
          border-radius: 999px;
          background: rgba(33, 159, 111, .08);
          color: #77efb9;
          font-size: .62rem;
          font-weight: 900;
        }
        .testDescription {
          margin: 14px 0 0;
          color: #9f9aa5;
          font-size: .82rem;
          line-height: 1.6;
        }
        .syncNote {
          margin-top: 16px;
          padding: 13px 14px;
          display: grid;
          gap: 4px;
          border: 1px solid rgba(255, 205, 80, .14);
          border-radius: 14px;
          background: rgba(244, 183, 40, .055);
        }
        .syncNote strong {
          color: #ffd04a;
          font-size: .75rem;
        }
        .syncNote span {
          color: #9b9589;
          font-size: .68rem;
          line-height: 1.45;
        }
        .controlGroup {
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, .07);
        }
        .controlHeading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .controlHeading > div {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .controlHeading strong {
          font-size: .82rem;
        }
        .controlHeading small {
          color: #817d86;
          font-size: .67rem;
          line-height: 1.4;
        }
        .toggleButton {
          flex: 0 0 auto;
          min-height: 30px;
          padding: 0 10px;
          border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 999px;
          background: rgba(255, 255, 255, .035);
          color: #817d86;
          font: inherit;
          font-size: .58rem;
          font-weight: 950;
        }
        .toggleButton.on {
          border-color: rgba(255, 205, 80, .25);
          background: rgba(244, 183, 40, .09);
          color: #ffd45f;
        }
        .homeStateGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .homeStateButton {
          min-width: 0;
          min-height: 62px;
          padding: 10px 11px;
          display: grid;
          align-content: center;
          gap: 4px;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 14px;
          background: rgba(255, 255, 255, .03);
          color: #fff;
          text-align: left;
          font: inherit;
        }
        .homeStateButton.selected {
          border-color: rgba(255, 205, 80, .3);
          background: rgba(244, 183, 40, .08);
        }
        .homeStateButton strong {
          font-size: .75rem;
        }
        .homeStateButton small {
          color: #7f7b83;
          font-size: .63rem;
          line-height: 1.35;
        }
        .scenarioGrid {
          margin-top: 12px;
          display: grid;
          gap: 8px;
        }
        .scenarioButton {
          width: 100%;
          min-height: 62px;
          padding: 9px 11px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 15px;
          background: rgba(255, 255, 255, .035);
          color: #fff;
          text-align: left;
          font: inherit;
          transition:
            border-color .16s ease,
            background .16s ease;
        }
        .scenarioButton:hover,
        .scenarioButton.selected {
          border-color: rgba(255, 205, 80, .3);
          background: rgba(244, 183, 40, .07);
        }
        .scenarioNumber {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(244, 183, 40, .11);
          color: #ffd04a;
          font-size: .69rem;
          font-weight: 950;
        }
        .scenarioCopy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .scenarioCopy strong {
          font-size: .78rem;
          overflow-wrap: anywhere;
        }
        .scenarioCopy small {
          color: #85818a;
          font-size: .65rem;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }
        .scenarioArrow {
          color: #8b8578;
          font-size: 1.3rem;
        }
        .testTip {
          margin-top: 18px;
          padding: 13px 14px;
          border: 1px solid rgba(255, 205, 80, .12);
          border-radius: 14px;
          background: rgba(244, 183, 40, .045);
          color: #989284;
          font-size: .7rem;
          line-height: 1.55;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: .55;
            transform: scale(.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }
        @media (max-width: 900px) {
          .labScreen {
            grid-template-columns: minmax(0, 520px);
          }
          .testPanel {
            position: static;
            max-height: none;
            order: -1;
          }
        }
        @media (max-width: 560px) {
          .labScreen {
            padding: 18px 14px 42px;
            gap: 18px;
          }
          .topBar {
            align-items: flex-start;
          }
          .topActions {
            max-width: 58%;
            align-items: flex-end;
            flex-direction: column-reverse;
            gap: 7px;
          }
          .utilityActions {
            width: 100%;
          }
          .utilityActions .languageSelect {
            min-width: 0;
            width: auto;
            flex: 1;
          }
          .languageSelect {
            width: 100%;
            max-width: 155px;
            height: 34px;
            border-radius: 11px;
            font-size: .68rem;
          }
          .accountChip {
            min-height: 34px;
            padding: 0 10px;
            border-radius: 11px;
            font-size: .66rem;
          }
          .missionCard {
            padding: 21px 18px;
            border-radius: 26px;
          }
          .missionHeader {
            align-items: flex-start;
          }
          .missionCopy {
            margin-top: 30px;
          }
          .missionCopy h1 {
            font-size: clamp(1.9rem, 10vw, 2.6rem);
          }
          .missionCopy.cjkCopy h1 {
            font-size: clamp(1.9rem, 9vw, 2.4rem);
          }
          .testPanel {
            padding: 18px;
            border-radius: 22px;
          }
          .testHeading {
            display: grid;
          }
          .safeBadge {
            width: fit-content;
          }
          .homeStateGrid {
            grid-template-columns: 1fr;
          }
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
  state: 'idle' | 'active' | 'waiting' | 'complete';
}) {
  return (
    <div className={`step ${state}`}>
      <span className="stepCircle">
        {state === 'complete' ? '✓' : number}
      </span>
      <span className="stepLabel">{label}</span>

      <style jsx>{`
        .step {
          position: relative;
          z-index: 2;
          min-width: 0;
          display: grid;
          justify-items: center;
          gap: 8px;
          color: #777282;
        }
        .stepCircle {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, .11);
          border-radius: 50%;
          background: #171927;
          color: #777282;
          font-size: .72rem;
          font-weight: 950;
        }
        .stepLabel {
          max-width: 100%;
          text-align: center;
          font-size: .65rem;
          line-height: 1.25;
          font-weight: 850;
          overflow-wrap: anywhere;
        }
        .step.active,
        .step.waiting,
        .step.complete {
          color: #ffd66e;
        }
        .step.active .stepCircle {
          border-color: #ffd24d;
          background: #f4b728;
          color: #17120a;
          box-shadow: 0 0 22px rgba(244, 183, 40, .38);
        }
        .step.waiting .stepCircle {
          border-color: #f4b728;
          color: #ffd66e;
          box-shadow:
            0 0 0 4px rgba(244, 183, 40, .08),
            0 0 20px rgba(244, 183, 40, .24);
        }
        .step.complete .stepCircle {
          border-color: rgba(244, 183, 40, .46);
          background: rgba(244, 183, 40, .14);
          color: #ffd66e;
        }
      `}</style>
    </div>
  );
}

function PreviewNavButton({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: 'home' | 'guide' | 'leaderboard' | 'settings';
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
          min-width: 0;
          min-height: 56px;
          padding: 6px 3px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 4px;
          border: 0;
          border-radius: 17px;
          background: transparent;
          color: #77736c;
          font: inherit;
          font-size: .6rem;
          font-weight: 850;
        }
        button span {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        button.active {
          background: rgba(255, 201, 61, .1);
          color: #ffd45f;
        }
        button :global(svg) {
          width: 21px;
          height: 21px;
        }
        @media (max-width: 360px) {
          button {
            font-size: .53rem;
          }
        }
      `}</style>
    </button>
  );
}

function PreviewNavIcon({
  name,
}: {
  name: 'home' | 'guide' | 'leaderboard' | 'settings';
}) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (name === 'guide') {
    return (
      <svg {...common}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </svg>
    );
  }

  if (name === 'leaderboard') {
    return (
      <svg {...common}>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
        <path d="M7 6H4v1a4 4 0 0 0 4 4" />
        <path d="M17 6h3v1a4 4 0 0 1-4 4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2.4V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.4h4.05v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.1v4.05H21a1.7 1.7 0 0 0-1.6 1.05Z" />
    </svg>
  );
}
