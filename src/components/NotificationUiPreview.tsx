'use client';

import { useMemo, useState } from 'react';

import { Brand } from './Brand';
import {
  InviteNotificationSurface,
  type InviteNotificationKind,
  type InviteNotificationPayload,
} from './InviteNotificationSurface';
import {
  TransientSnackbar,
  type TransientFeedback,
  type TransientFeedbackKind,
} from './TransientSnackbar';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { LANGUAGE_OPTIONS, type Locale } from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { SETTINGS_COPY } from '@/lib/i18n/settingsCopy';

type Scenario = {
  id: string;
  label: string;
  description: string;
  kind: InviteNotificationKind;
  stage: number;
  collapsedProgress?: boolean;
  rewardAmountWei?: string | null;
};

type IssueScenario = {
  id: string;
  label: string;
  trigger: string;
  condition: string;
  kind: TransientFeedbackKind;
  message: (locale: Locale) => string;
};

const SCENARIOS: Scenario[] = [
  { id: 'accepted', label: '1. 초대 수락', description: '친구가 초대를 수락하고 미션을 시작했을 때', kind: 'INVITE_ACCEPTED', stage: 1 },
  { id: 'dapp', label: '2. dApp 미션 완료', description: '서로 다른 VeBetterDAO dApp 3개 조건을 채웠을 때', kind: 'DAPP_MISSION_COMPLETED', stage: 2 },
  { id: 'vot3', label: '3. VOT3 전환 완료', description: 'B3TR → VOT3 전환을 완료했을 때', kind: 'VOT3_CONVERTED', stage: 3 },
  { id: 'collapsed', label: '3-A. 여러 단계 동시 확인', description: '앱을 보지 않는 사이 dApp + VOT3가 함께 진행됐을 때', kind: 'VOT3_CONVERTED', stage: 3, collapsedProgress: true },
  { id: 'complete', label: '4. 모든 미션 완료', description: '친구가 마지막 미션까지 모두 완료했을 때', kind: 'ALL_MISSIONS_COMPLETED', stage: 4 },
  { id: 'reward', label: '5. 보상 지급 완료', description: 'B3TR 보상이 실제 지급됐을 때의 강조형 알림', kind: 'REWARD_PAID', stage: 5, rewardAmountWei: '147740500000000000000' },
  { id: 'ineligible', label: '6. 참여 조건 미충족', description: '초대한 친구가 참여 조건에 맞지 않아 초대 슬롯이 다시 열렸을 때', kind: 'INVITE_INELIGIBLE', stage: 6 },
];

const ISSUE_SCENARIOS: IssueScenario[] = [
  {
    id: 'load-error',
    label: '초대 정보 불러오기 실패',
    trigger: '홈 화면 진입 또는 새로고침 — 별도 클릭 없이 자동 조회',
    condition: '초대 목록 API 또는 네트워크 응답이 실패했을 때',
    kind: 'error',
    message: (locale) => HOME_COPY[locale].loadError,
  },
  {
    id: 'create-error',
    label: '초대 만들기 실패',
    trigger: '홈 → “초대 만들기” 클릭',
    condition: '초대 생성 요청이 실패하거나 서버가 오류를 반환했을 때',
    kind: 'error',
    message: (locale) => HOME_COPY[locale].createError,
  },
  {
    id: 'cancel-error',
    label: '초대 취소 실패',
    trigger: '홈 → “초대 취소” → 확인창에서 “초대 취소” 클릭',
    condition: '초대 취소 요청이 실패했을 때',
    kind: 'error',
    message: (locale) => HOME_COPY[locale].cancelError,
  },
  {
    id: 'wallet-error',
    label: '지갑 변경/연결 해제 실패',
    trigger: '설정 → “다른 지갑 연결” 또는 “지갑 연결 해제” → 확인',
    condition: '지갑 변경·연결 해제 작업이 중단되거나 실패했을 때',
    kind: 'error',
    message: (locale) => SETTINGS_COPY[locale].actionError,
  },
  {
    id: 'copy-success',
    label: '초대 링크 복사 완료',
    trigger: '홈 → “링크 복사” 클릭',
    condition: '클립보드 복사가 정상 완료됐을 때',
    kind: 'success',
    message: (locale) => HOME_COPY[locale].copied,
  },
  {
    id: 'cancel-success',
    label: '초대 취소 완료',
    trigger: '홈 → “초대 취소” → 확인창에서 “초대 취소” 클릭',
    condition: '취소가 정상 완료되어 초대 슬롯이 다시 열렸을 때',
    kind: 'success',
    message: (locale) => HOME_COPY[locale].cancelled,
  },
];

export function NotificationUiPreview() {
  const [locale, setLocale] = useState<Locale>('ko');
  const [scenarioId, setScenarioId] = useState('accepted');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<'normal' | 'busy' | 'error'>('normal');
  const [feedback, setFeedback] = useState<TransientFeedback | null>(null);
  const [feedbackId, setFeedbackId] = useState(0);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const notification = useMemo<InviteNotificationPayload | null>(() => {
    if (!enabled) return null;
    return {
      inviteCode: 'TEST234',
      kind: scenario.kind,
      stage: scenario.stage,
      eventAt: '2026-09-01T00:00:00.000Z',
      rewardAmountWei: scenario.rewardAmountWei ?? null,
      acknowledgedStage: unread ? 0 : scenario.stage,
      collapsedProgress: Boolean(scenario.collapsedProgress),
    };
  }, [enabled, scenario, unread]);

  const openScenario = (item: Scenario) => {
    setScenarioId(item.id);
    setEnabled(true);
    setUnread(true);
    setMode('normal');
    setOpen(true);
  };

  const showFeedback = (item: IssueScenario) => {
    const nextId = feedbackId + 1;
    setFeedbackId(nextId);
    setFeedback({
      id: nextId,
      kind: item.kind,
      text: item.message(locale),
    });
  };

  return (
    <section className="notificationPreview">
      <header className="intro">
        <span>NOTIFICATION UI / UX LAB</span>
        <h2>실제 참여 없이 모든 알림 확인</h2>
        <p>Production과 같은 알림 컴포넌트에 테스트 데이터만 넣습니다. 지갑·DB·Sybil 검사·온체인 조회·보상 지급은 실행하지 않습니다.</p>
      </header>

      <div className="previewGuide">
        <strong>두 종류로 나눠서 확인하면 됩니다.</strong>
        <p><b>미션·보상 알림</b>은 친구의 상태 변화가 확인되면 자동 생성되고, <b>클릭/오류 피드백</b>은 사용자가 버튼을 누른 뒤 성공 또는 실패 결과에 따라 화면 하단에 표시됩니다.</p>
      </div>

      <div className="layout">
        <div className="phone">
          <div className="fakeHeader">
            <Brand />
            <div className="actions">
              <span className="wallet"><i />0x1234···5678</span>
              <InviteNotificationSurface
                locale={locale}
                notification={notification}
                unreadCount={enabled && unread ? 1 : 0}
                open={open}
                busy={mode === 'busy'}
                errorMessage={mode === 'error' ? NOTIFICATION_COPY[locale].acknowledgementError : ''}
                onOpen={() => setOpen(true)}
                onClose={() => {
                  if (mode === 'busy') return;
                  setOpen(false);
                  setUnread(false);
                }}
              />
            </div>
          </div>

          <div className="fakeCard">
            <small>현재 테스트</small>
            <strong>{scenario.label}</strong>
            <p>{scenario.description}</p>
            <div className="productionTrigger">
              <b>실제 앱에서는</b>
              <span>사용자 클릭으로 만드는 알림이 아니라, 해당 미션·보상 상태가 서버에서 확인되면 자동으로 알림 종에 들어옵니다.</span>
            </div>
            <button type="button" disabled={!enabled} onClick={() => setOpen(true)}>선택한 알림 다시 열기</button>
          </div>

          <p className="responsiveNote">일반 진행 알림은 모바일에서 하단 시트, 보상 지급 알림은 중앙 강조 모달로 표시됩니다. 아래 “클릭/오류 피드백”은 실제 앱과 같은 하단 스낵바로 화면에 직접 뜹니다.</p>
        </div>

        <aside className="controls">
          <section>
            <strong>언어</strong>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label="알림 테스트 언어">
              {LANGUAGE_OPTIONS.map((option) => <option key={option.locale} value={option.locale}>{option.nativeName}</option>)}
            </select>
          </section>

          <section>
            <strong>미션·보상 자동 알림</strong>
            <p className="sectionHelp">아래 항목을 누르면 해당 상태가 발생한 것처럼 실제 알림창을 바로 엽니다.</p>
            <div className="scenarioGrid">
              {SCENARIOS.map((item) => (
                <button key={item.id} type="button" className={scenarioId === item.id ? 'selected' : ''} onClick={() => openScenario(item)}>
                  <b>{item.label}</b><small>{item.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <strong>알림 종 상태</strong>
            <div className="buttonRow">
              <button type="button" onClick={() => { setEnabled(true); setUnread(true); setOpen(false); }}>읽지 않음</button>
              <button type="button" onClick={() => { setEnabled(true); setUnread(false); setOpen(false); }}>읽음</button>
              <button type="button" onClick={() => { setEnabled(false); setUnread(false); setOpen(false); }}>알림 없음</button>
            </div>
          </section>

          <section>
            <strong>알림창 자체의 예외 상태</strong>
            <p className="sectionHelp">알림 확인 처리 중이거나 확인 저장에 실패한 경우를 재현합니다.</p>
            <div className="buttonRow">
              <button type="button" onClick={() => setMode('normal')}>정상</button>
              <button type="button" onClick={() => { setEnabled(true); setMode('busy'); setOpen(true); }}>처리 중</button>
              <button type="button" onClick={() => { setEnabled(true); setMode('error'); setOpen(true); }}>오류 표시</button>
            </div>
          </section>
        </aside>
      </div>

      <section className="issuePreviewSection">
        <header>
          <span>CLICK / ERROR FEEDBACK</span>
          <h3>어떤 클릭을 했을 때 어떤 알림이 뜨는지</h3>
          <p>각 카드에 실제 앱의 클릭 경로와 발생 조건을 적었습니다. “미리보기 띄우기”를 누르면 Production과 같은 하단 알림이 표시됩니다.</p>
        </header>
        <div className="issueGrid">
          {ISSUE_SCENARIOS.map((item) => (
            <article key={item.id} className={`issueCard ${item.kind}`}>
              <div className="issueTitleRow">
                <strong>{item.label}</strong>
                <span>{item.kind === 'error' ? '오류' : item.kind === 'success' ? '완료' : '안내'}</span>
              </div>
              <dl>
                <div><dt>실제 클릭</dt><dd>{item.trigger}</dd></div>
                <div><dt>표시 조건</dt><dd>{item.condition}</dd></div>
                <div><dt>알림 문구</dt><dd>{item.message(locale)}</dd></div>
              </dl>
              <button type="button" onClick={() => showFeedback(item)}>미리보기 띄우기</button>
            </article>
          ))}
        </div>
      </section>

      <TransientSnackbar
        feedback={feedback}
        closeLabel={NOTIFICATION_COPY[locale].closeAria}
        onDismiss={() => setFeedback(null)}
      />

      <style jsx>{`
        .notificationPreview{width:min(calc(100% - 32px),1120px);box-sizing:border-box;margin:34px auto 0;padding:24px;border:1px solid rgba(255,205,80,.14);border-radius:28px;background:rgba(255,255,255,.025);color:#f8f6ef}.intro>span,.issuePreviewSection header>span{color:#f4b728;font-size:.68rem;font-weight:950;letter-spacing:.11em}.intro h2{margin:7px 0 0;font-size:clamp(1.45rem,4vw,2rem);letter-spacing:-.04em}.intro p{max-width:760px;margin:9px 0 0;color:#9d988f;font-size:.82rem;line-height:1.65}.previewGuide{margin-top:16px;padding:14px 15px;border:1px solid rgba(244,183,40,.14);border-radius:16px;background:rgba(244,183,40,.045)}.previewGuide strong{font-size:.78rem}.previewGuide p{margin:5px 0 0;color:#9d988f;font-size:.72rem;line-height:1.55}.previewGuide b{color:#e9ca72}.layout{margin-top:22px;display:grid;grid-template-columns:minmax(320px,500px) minmax(320px,1fr);gap:24px;align-items:start}.phone{position:relative;min-height:540px;box-sizing:border-box;padding:20px 18px 24px;border:1px solid rgba(255,255,255,.08);border-radius:34px;background:#080807;overflow:hidden}.fakeHeader{display:flex;align-items:center;justify-content:space-between;gap:12px}.actions{min-width:0;display:flex;align-items:center;gap:8px}.wallet{height:40px;padding:0 11px;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141310;font-size:.68rem;font-weight:850}.wallet i{width:8px;height:8px;border-radius:50%;background:#f4b728}.fakeCard{margin-top:24px;padding:22px;border:1px solid rgba(255,205,80,.2);border-radius:25px;background:linear-gradient(155deg,rgba(48,35,13,.95),rgba(16,16,14,.98) 68%)}.fakeCard small{color:#f4b728;font-size:.66rem;font-weight:950}.fakeCard strong{display:block;margin-top:8px;font-size:1.15rem}.fakeCard p{margin:7px 0 0;color:#9d988f;font-size:.8rem;line-height:1.55}.productionTrigger{margin-top:14px;padding:11px 12px;display:grid;gap:4px;border-radius:14px;background:rgba(255,255,255,.035)}.productionTrigger b{color:#d6c88f;font-size:.63rem}.productionTrigger span{color:#817d75;font-size:.68rem;line-height:1.48}.fakeCard button{width:100%;min-height:48px;margin-top:18px;border:0;border-radius:15px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.82rem;font-weight:950}.responsiveNote{margin:15px 0 0;padding:14px;border-radius:16px;background:rgba(255,255,255,.035);color:#87837c;font-size:.71rem;line-height:1.55}.controls{display:grid;gap:14px}.controls section{padding:17px;border:1px solid rgba(255,255,255,.07);border-radius:20px;background:rgba(255,255,255,.025)}.controls section>strong{display:block;font-size:.84rem}.sectionHelp{margin:6px 0 0;color:#77736c;font-size:.66rem;line-height:1.5}.controls select{width:100%;min-height:44px;margin-top:11px;padding:0 12px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#131311;color:#f8f6ef}.scenarioGrid{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.scenarioGrid button{min-height:72px;padding:10px;display:grid;gap:4px;align-content:center;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#11110f;color:#f8f6ef;text-align:left}.scenarioGrid button.selected{border-color:rgba(244,183,40,.45);background:rgba(244,183,40,.1);color:#ffd66e}.scenarioGrid b{font-size:.72rem}.scenarioGrid small{color:#817d75;font-size:.63rem;line-height:1.4}.buttonRow{margin-top:11px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.buttonRow button{min-height:42px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#11110f;color:#aaa59b;font:inherit;font-size:.7rem;font-weight:850}.issuePreviewSection{margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,.07)}.issuePreviewSection h3{margin:6px 0 0;font-size:clamp(1.25rem,3.3vw,1.65rem);letter-spacing:-.035em}.issuePreviewSection header>p{max-width:760px;margin:7px 0 0;color:#8c877f;font-size:.75rem;line-height:1.58}.issueGrid{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.issueCard{padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#0f0f0d}.issueCard.error{border-color:rgba(255,100,106,.16)}.issueCard.success{border-color:rgba(76,220,155,.14)}.issueTitleRow{display:flex;align-items:center;justify-content:space-between;gap:10px}.issueTitleRow strong{font-size:.78rem}.issueTitleRow span{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.05);color:#8f8a82;font-size:.56rem;font-weight:900}.issueCard.error .issueTitleRow span{background:rgba(255,100,106,.1);color:#ff9ca0}.issueCard.success .issueTitleRow span{background:rgba(76,220,155,.09);color:#79eeb9}.issueCard dl{margin:12px 0 0;display:grid;gap:8px}.issueCard dl>div{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px}.issueCard dt{color:#6f6a63;font-size:.6rem;font-weight:900}.issueCard dd{margin:0;color:#a49f96;font-size:.66rem;line-height:1.45;overflow-wrap:anywhere}.issueCard button{width:100%;min-height:40px;margin-top:13px;border:1px solid rgba(244,183,40,.18);border-radius:12px;background:rgba(244,183,40,.07);color:#e4c46c;font:inherit;font-size:.67rem;font-weight:900}.notificationPreview button{cursor:pointer}.notificationPreview button:disabled{opacity:.4;cursor:not-allowed}@media(max-width:820px){.notificationPreview{padding:18px 16px}.layout{grid-template-columns:1fr}.issueGrid{grid-template-columns:1fr}}@media(max-width:420px){.notificationPreview{width:calc(100% - 32px);padding:16px 0;border-right:0;border-left:0;border-radius:0}.intro,.previewGuide,.controls,.issuePreviewSection{margin-left:16px;margin-right:16px}.phone{padding:18px 16px 22px;border-right:0;border-left:0;border-radius:0}.wallet{height:34px;padding:0 8px;font-size:.62rem}.scenarioGrid,.buttonRow{grid-template-columns:1fr}.issueCard dl>div{grid-template-columns:1fr;gap:3px}}
      `}</style>
    </section>
  );
}
