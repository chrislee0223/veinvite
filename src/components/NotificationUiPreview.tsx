'use client';

import { useMemo, useState } from 'react';

import { Brand } from './Brand';
import {
  InviteNotificationSurface,
  type InviteNotificationKind,
  type InviteNotificationPayload,
} from './InviteNotificationSurface';
import { LANGUAGE_OPTIONS, type Locale } from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';

type Scenario = {
  id: string;
  label: string;
  description: string;
  kind: InviteNotificationKind;
  stage: number;
  collapsedProgress?: boolean;
  rewardAmountWei?: string | null;
};

const SCENARIOS: Scenario[] = [
  { id: 'accepted', label: '1. 초대 수락', description: '친구가 초대를 수락하고 미션을 시작했을 때', kind: 'INVITE_ACCEPTED', stage: 1 },
  { id: 'dapp', label: '2. dApp 미션 완료', description: '서로 다른 VeBetterDAO dApp 3개 조건을 채웠을 때', kind: 'DAPP_MISSION_COMPLETED', stage: 2 },
  { id: 'vot3', label: '3. VOT3 전환 완료', description: 'B3TR → VOT3 전환을 완료했을 때', kind: 'VOT3_CONVERTED', stage: 3 },
  { id: 'collapsed', label: '3-A. 여러 단계 동시 확인', description: '앱을 보지 않는 사이 dApp + VOT3가 함께 진행됐을 때', kind: 'VOT3_CONVERTED', stage: 3, collapsedProgress: true },
  { id: 'complete', label: '4. 모든 미션 완료', description: '친구가 마지막 미션까지 모두 완료했을 때', kind: 'ALL_MISSIONS_COMPLETED', stage: 4 },
  { id: 'reward', label: '5. 보상 지급 완료', description: 'B3TR 보상이 실제 지급됐을 때의 강조형 알림', kind: 'REWARD_PAID', stage: 5, rewardAmountWei: '147740500000000000000' },
];

export function NotificationUiPreview() {
  const [locale, setLocale] = useState<Locale>('ko');
  const [scenarioId, setScenarioId] = useState('accepted');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<'normal' | 'busy' | 'error'>('normal');

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

  return (
    <section className="notificationPreview">
      <header className="intro">
        <span>NOTIFICATION UI / UX LAB</span>
        <h2>실제 참여 없이 모든 알림 확인</h2>
        <p>Production과 같은 알림 컴포넌트에 테스트 데이터만 넣습니다. 지갑·DB·Sybil 검사·온체인 조회·보상 지급은 실행하지 않습니다.</p>
      </header>

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
            <button type="button" disabled={!enabled} onClick={() => setOpen(true)}>선택한 알림 다시 열기</button>
          </div>

          <p className="responsiveNote">일반 진행 알림은 모바일에서 하단 시트, 보상 지급 알림은 중앙 강조 모달로 표시됩니다.</p>
        </div>

        <aside className="controls">
          <section>
            <strong>언어</strong>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label="알림 테스트 언어">
              {LANGUAGE_OPTIONS.map((option) => <option key={option.locale} value={option.locale}>{option.nativeName}</option>)}
            </select>
          </section>

          <section>
            <strong>알림 시나리오</strong>
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
            <strong>예외 UI</strong>
            <div className="buttonRow">
              <button type="button" onClick={() => setMode('normal')}>정상</button>
              <button type="button" onClick={() => { setEnabled(true); setMode('busy'); setOpen(true); }}>처리 중</button>
              <button type="button" onClick={() => { setEnabled(true); setMode('error'); setOpen(true); }}>오류 표시</button>
            </div>
          </section>
        </aside>
      </div>

      <style jsx>{`
        .notificationPreview{width:min(calc(100% - 32px),1120px);box-sizing:border-box;margin:34px auto 0;padding:24px;border:1px solid rgba(255,205,80,.14);border-radius:28px;background:rgba(255,255,255,.025);color:#f8f6ef}.intro>span{color:#f4b728;font-size:.68rem;font-weight:950;letter-spacing:.11em}.intro h2{margin:7px 0 0;font-size:clamp(1.45rem,4vw,2rem);letter-spacing:-.04em}.intro p{max-width:760px;margin:9px 0 0;color:#9d988f;font-size:.82rem;line-height:1.65}.layout{margin-top:22px;display:grid;grid-template-columns:minmax(320px,500px) minmax(320px,1fr);gap:24px;align-items:start}.phone{position:relative;min-height:540px;box-sizing:border-box;padding:20px 18px 24px;border:1px solid rgba(255,255,255,.08);border-radius:34px;background:#080807;overflow:hidden}.fakeHeader{display:flex;align-items:center;justify-content:space-between;gap:12px}.actions{min-width:0;display:flex;align-items:center;gap:8px}.wallet{height:40px;padding:0 11px;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141310;font-size:.68rem;font-weight:850}.wallet i{width:8px;height:8px;border-radius:50%;background:#f4b728}.fakeCard{margin-top:24px;padding:22px;border:1px solid rgba(255,205,80,.2);border-radius:25px;background:linear-gradient(155deg,rgba(48,35,13,.95),rgba(16,16,14,.98) 68%)}.fakeCard small{color:#f4b728;font-size:.66rem;font-weight:950}.fakeCard strong{display:block;margin-top:8px;font-size:1.15rem}.fakeCard p{margin:7px 0 0;color:#9d988f;font-size:.8rem;line-height:1.55}.fakeCard button{width:100%;min-height:48px;margin-top:18px;border:0;border-radius:15px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.82rem;font-weight:950}.responsiveNote{margin:15px 0 0;padding:14px;border-radius:16px;background:rgba(255,255,255,.035);color:#87837c;font-size:.71rem;line-height:1.55}.controls{display:grid;gap:14px}.controls section{padding:17px;border:1px solid rgba(255,255,255,.07);border-radius:20px;background:rgba(255,255,255,.025)}.controls section>strong{display:block;font-size:.84rem}.controls select{width:100%;min-height:44px;margin-top:11px;padding:0 12px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#131311;color:#f8f6ef}.scenarioGrid{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.scenarioGrid button{min-height:72px;padding:10px;display:grid;gap:4px;align-content:center;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#11110f;color:#f8f6ef;text-align:left}.scenarioGrid button.selected{border-color:rgba(244,183,40,.45);background:rgba(244,183,40,.1);color:#ffd66e}.scenarioGrid b{font-size:.72rem}.scenarioGrid small{color:#817d75;font-size:.63rem;line-height:1.4}.buttonRow{margin-top:11px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.buttonRow button{min-height:42px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#11110f;color:#aaa59b;font:inherit;font-size:.7rem;font-weight:850}.notificationPreview button{cursor:pointer}.notificationPreview button:disabled{opacity:.4;cursor:not-allowed}@media(max-width:820px){.notificationPreview{padding:18px 16px}.layout{grid-template-columns:1fr}}@media(max-width:420px){.notificationPreview{width:calc(100% - 32px);padding:16px 0;border-right:0;border-left:0;border-radius:0}.intro,.controls{padding:0 16px}.phone{padding:18px 16px 22px;border-right:0;border-left:0;border-radius:0}.wallet{height:34px;padding:0 8px;font-size:.62rem}.scenarioGrid,.buttonRow{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
