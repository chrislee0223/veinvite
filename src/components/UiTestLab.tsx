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
import {
  LANGUAGE_OPTIONS,
  type Locale,
} from '@/lib/i18n/locales';

type ScenarioId =
  | 'accepted'
  | 'dapp'
  | 'vot3'
  | 'collapsed-vot3'
  | 'all-missions'
  | 'reward';

type Scenario = {
  id: ScenarioId;
  label: string;
  description: string;
  kind: InviteNotificationKind;
  stage: number;
  collapsedProgress: boolean;
  rewardAmountWei: string | null;
};

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

export function UiTestLab() {
  const [locale, setLocale] = useState<Locale>('ko');
  const [scenarioId, setScenarioId] =
    useState<ScenarioId>('accepted');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);

  const scenario =
    SCENARIOS.find((item) => item.id === scenarioId) ??
    SCENARIOS[0];
  const homeCopy = HOME_COPY[locale];

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
          <div className="topTools">
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
              aria-label="알림 테스트 언어"
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
        </header>

        <section className="missionCard">
          <div className="cardGlow" />
          <span className="missionLabel">
            {homeCopy.inviteMission}
          </span>
          <h1>{homeCopy.emptyTitle}</h1>
          <p>{homeCopy.emptyDescription}</p>

          <div className="statusCard">
            <span className="statusIcon">◇</span>
            <div>
              <small>{homeCopy.rewardLabel}</small>
              <strong>{homeCopy.rewardLocked}</strong>
            </div>
            <span className="statusBadge">
              {homeCopy.locked}
            </span>
          </div>

          <div className="progress">
            <span className="progressStep active">1</span>
            <span className="progressLine" />
            <span className="progressStep">2</span>
            <span className="progressLine" />
            <span className="progressStep">3</span>
          </div>

          <button type="button" className="fakeAction">
            {homeCopy.connectStart}
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </section>

      <section className="testPanel">
        <div className="testHeading">
          <div>
            <span className="testEyebrow">PREVIEW ONLY</span>
            <h2>VeInvite UI Test Lab</h2>
          </div>
          <span className="safeBadge">실데이터 사용 안 함</span>
        </div>

        <p className="testDescription">
          실제 초대·지갑·DB·Sybil 검사·보상 지급을 실행하지 않고,
          Production과 같은 알림 UI만 확인하는 화면입니다.
        </p>

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
              <span className="scenarioArrow" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>

        <div className="testTip">
          언어를 바꾸면 같은 시나리오가 선택한 언어로 즉시 바뀝니다.
          알림을 닫은 뒤 상단 벨을 누르면 다시 열어볼 수 있습니다.
        </div>
      </section>

      <style jsx>{`
        .labScreen { min-height:100svh; box-sizing:border-box; padding:24px 18px 60px; display:grid; grid-template-columns:minmax(320px,520px) minmax(320px,520px); align-items:start; justify-content:center; gap:28px; color:#fff; background:radial-gradient(circle at 38% 12%,rgba(244,183,40,.13),transparent 31%),#080807; }
        .phoneCanvas,.testPanel { width:100%; min-width:0; box-sizing:border-box; }
        .topBar { margin:0 0 24px; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .topTools { min-width:0; display:flex; align-items:center; gap:8px; }
        .languageSelect { max-width:150px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
        .missionCard { position:relative; overflow:hidden; box-sizing:border-box; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
        .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); pointer-events:none; }
        .missionLabel { position:relative; z-index:1; color:#8f86ae; font-size:.68rem; font-weight:900; letter-spacing:.12em; }
        .missionCard h1 { position:relative; z-index:1; margin:28px 0 0; font-size:clamp(2rem,6vw,3rem); line-height:1.06; letter-spacing:-.045em; overflow-wrap:anywhere; }
        .missionCard > p { position:relative; z-index:1; margin:13px 0 0; color:#b7b1c7; font-size:.94rem; font-weight:650; line-height:1.58; }
        .statusCard { position:relative; z-index:1; margin-top:24px; padding:14px 15px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; border:1px solid rgba(255,255,255,.09); border-radius:17px; background:rgba(255,255,255,.045); }
        .statusIcon { width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:rgba(244,183,40,.13); color:#ffd66e; font-size:1.25rem; font-weight:950; }
        .statusCard > div { min-width:0; display:grid; gap:3px; }
        .statusCard small { color:#858097; font-size:.6rem; font-weight:900; letter-spacing:.08em; }
        .statusCard strong { color:#f5f2ff; font-size:.81rem; line-height:1.3; overflow-wrap:anywhere; }
        .statusBadge { min-height:25px; padding:0 9px; display:inline-flex; align-items:center; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#777184; font-size:.56rem; font-weight:950; }
        .progress { position:relative; z-index:1; margin:26px 12px 0; display:grid; grid-template-columns:auto 1fr auto 1fr auto; align-items:center; }
        .progressStep { width:31px; height:31px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.11); border-radius:50%; background:#171927; color:#777282; font-size:.72rem; font-weight:950; }
        .progressStep.active { border-color:#f4b728; color:#ffd66e; box-shadow:0 0 0 4px rgba(244,183,40,.08); }
        .progressLine { height:2px; background:rgba(255,255,255,.09); }
        .fakeAction { position:relative; z-index:1; width:100%; min-height:58px; margin-top:26px; border:0; border-radius:18px; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.96rem; font-weight:950; box-shadow:0 16px 35px rgba(190,126,12,.25); }
        .fakeAction span { font-size:1.55rem; line-height:1; }
        .testPanel { padding:24px; border:1px solid rgba(255,201,61,.18); border-radius:26px; background:rgba(255,255,255,.035); box-shadow:0 22px 70px rgba(0,0,0,.3); }
        .testHeading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .testEyebrow { color:#ffd04a; font-size:.64rem; font-weight:950; letter-spacing:.11em; }
        .testHeading h2 { margin:5px 0 0; font-size:1.45rem; letter-spacing:-.035em; }
        .safeBadge { flex:0 0 auto; min-height:28px; padding:0 10px; display:inline-flex; align-items:center; border:1px solid rgba(77,224,167,.2); border-radius:999px; background:rgba(33,159,111,.08); color:#77efb9; font-size:.62rem; font-weight:900; }
        .testDescription { margin:14px 0 0; color:#9f9aa5; font-size:.82rem; line-height:1.6; }
        .scenarioGrid { margin-top:20px; display:grid; gap:9px; }
        .scenarioButton { width:100%; min-height:66px; padding:10px 12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:rgba(255,255,255,.035); color:#fff; text-align:left; font:inherit; cursor:pointer; transition:border-color .16s ease,background .16s ease; }
        .scenarioButton:hover,.scenarioButton.selected { border-color:rgba(255,205,80,.3); background:rgba(244,183,40,.07); }
        .scenarioNumber { width:34px; height:34px; display:grid; place-items:center; border-radius:11px; background:rgba(244,183,40,.11); color:#ffd04a; font-size:.72rem; font-weight:950; }
        .scenarioCopy { min-width:0; display:grid; gap:4px; }
        .scenarioCopy strong { font-size:.83rem; overflow-wrap:anywhere; }
        .scenarioCopy small { color:#85818a; font-size:.68rem; line-height:1.35; overflow-wrap:anywhere; }
        .scenarioArrow { color:#8b8578; font-size:1.3rem; }
        .testTip { margin-top:18px; padding:13px 14px; border:1px solid rgba(255,205,80,.12); border-radius:14px; background:rgba(244,183,40,.045); color:#989284; font-size:.72rem; line-height:1.55; }
        @media (max-width:900px) {
          .labScreen { grid-template-columns:minmax(0,520px); }
          .testPanel { order:-1; }
        }
        @media (max-width:560px) {
          .labScreen { padding:18px 14px 42px; gap:18px; }
          .topBar { align-items:flex-start; }
          .topTools { max-width:62%; }
          .languageSelect { width:100%; height:34px; border-radius:11px; font-size:.68rem; }
          .missionCard { padding:21px 18px; border-radius:26px; }
          .missionCard h1 { font-size:clamp(1.9rem,9vw,2.45rem); }
          .testPanel { padding:18px; border-radius:22px; }
          .testHeading { display:grid; }
          .safeBadge { width:fit-content; }
        }
      `}</style>
    </main>
  );
}
