'use client';

import { useMemo, useState } from 'react';

import { Brand } from './Brand';

type DemoState = 'progress' | 'final' | 'claimable' | 'queued' | 'paid';

const STEPS = ['dApp 1/3', 'dApp 2/3', 'dApp 3/3', 'VOT3', '투표'];

function ProgressDots({ completed, current }: { completed: number; current: number | null }) {
  return (
    <div className="dots" aria-label={`5단계 중 ${completed}단계 완료`}>
      {STEPS.map((label, index) => {
        const done = index < completed;
        const active = current === index;
        return (
          <span
            key={label}
            className={`dot ${done ? 'done' : ''} ${active ? 'current' : ''}`}
            title={label}
          />
        );
      })}
      <style jsx>{`
        .dots { display:flex; align-items:center; gap:9px; }
        .dot { width:9px; height:9px; border-radius:50%; background:rgba(255,255,255,.13); box-shadow:inset 0 0 0 1px rgba(255,255,255,.04); }
        .dot.done { background:#f4b728; box-shadow:0 0 10px rgba(244,183,40,.35); }
        .dot.current { position:relative; background:#f4b728; }
        .dot.current::after { content:''; position:absolute; inset:-5px; border:1px solid rgba(244,183,40,.48); border-radius:50%; animation:stagePulse 1.8s ease-in-out infinite; }
        @keyframes stagePulse { 0%,100% { transform:scale(.82); opacity:.3; } 50% { transform:scale(1.08); opacity:.9; } }
        @media (prefers-reduced-motion: reduce) { .dot.current::after { animation:none; opacity:.65; } }
      `}</style>
    </div>
  );
}

function FriendSlot({ state, onShare }: { state: DemoState; onShare: () => void }) {
  const isActive = state === 'progress' || state === 'final';
  const completed = state === 'progress' ? 2 : 5;
  const current = state === 'progress' ? 2 : null;

  if (!isActive) {
    return (
      <button type="button" className="slot available" onClick={onShare}>
        <span className="slotNumber">1</span>
        <span className="slotBody">
          <strong>친구 초대하기</strong>
          <small>영구 초대 링크 공유 ↗</small>
        </span>
        <span className="shareIcon">↗</span>
        <style jsx>{slotStyles}</style>
      </button>
    );
  }

  return (
    <div className={`slot ${state === 'final' ? 'final' : 'active'}`}>
      <span className="slotNumber">1</span>
      <div className="slotBody">
        <div className="slotTop">
          <strong>{state === 'final' ? '최종 확인 중' : '친구가 미션을 진행 중이에요'}</strong>
          <small>0x84A2…19F3</small>
        </div>
        <ProgressDots completed={completed} current={current} />
        <span className="stageText">
          {state === 'final' ? '모든 미션 완료 · 최종 검증 중' : 'dApp 2/3 완료 · 다음 단계 dApp 3/3'}
        </span>
      </div>
      <style jsx>{slotStyles}</style>
    </div>
  );
}

const slotStyles = `
  .slot { width:100%; box-sizing:border-box; min-height:92px; padding:13px; display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:12px; border:1px solid rgba(91,212,162,.17); border-radius:17px; background:rgba(42,164,116,.05); color:#fff; text-align:left; }
  button.slot { font:inherit; cursor:pointer; }
  .slot.final { border-color:rgba(255,205,80,.22); background:rgba(244,183,40,.055); }
  .slot.available { min-height:72px; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; border-style:dashed; border-color:rgba(255,255,255,.11); background:rgba(255,255,255,.022); }
  .slotNumber { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.76rem; font-weight:950; }
  .available .slotNumber { background:rgba(255,255,255,.045); color:#8d8797; }
  .slotBody { min-width:0; display:grid; gap:8px; }
  .slotTop { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .slotBody strong { color:#e6e1e9; font-size:.75rem; line-height:1.35; overflow-wrap:anywhere; }
  .slotBody small { color:#817c89; font-size:.61rem; font-weight:750; direction:ltr; }
  .stageText { color:#8f9b91; font-size:.65rem; line-height:1.4; }
  .final .stageText { color:#b3a681; }
  .shareIcon { width:30px; height:30px; display:grid; place-items:center; border-radius:10px; background:rgba(244,183,40,.08); color:#ffd66e; font-weight:900; }
`;

export function ProgressClaimV2Preview() {
  const [state, setState] = useState<DemoState>('progress');
  const [toast, setToast] = useState('');

  const rewardVisible = ['claimable', 'queued', 'paid'].includes(state);
  const statusText = useMemo(() => {
    if (state === 'paid') return '81.6 B3TR 지급 완료';
    if (state === 'queued') return '81.6 B3TR · 지급 처리 중';
    return '81.6 B3TR';
  }, [state]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <span className="previewBadge">PREVIEW</span>
      </header>

      <div className="demoTabs" aria-label="미리보기 상태 선택">
        <button type="button" className={state === 'progress' ? 'selected' : ''} onClick={() => setState('progress')}>진행 중</button>
        <button type="button" className={state === 'final' ? 'selected' : ''} onClick={() => setState('final')}>최종 확인</button>
        <button type="button" className={state === 'claimable' ? 'selected' : ''} onClick={() => setState('claimable')}>보상 가능</button>
        <button type="button" className={state === 'queued' ? 'selected' : ''} onClick={() => setState('queued')}>처리 중</button>
        <button type="button" className={state === 'paid' ? 'selected' : ''} onClick={() => setState('paid')}>지급 완료</button>
      </div>

      <section className="missionCard">
        <div className="cardGlow" />
        <h1>친구를 초대하고<br />VeBetterDAO를 함께 시작하세요</h1>

        <div className="permanentLinkCard">
          <div className="linkPreview">veinvite.app/r/CHRIS7X</div>
          <button type="button" onClick={() => flash('초대 링크가 복사됐어요')}>영구 초대 링크 공유</button>
        </div>

        <div className="slotsBlock">
          <div className="slotsHeading"><strong>친구 슬롯 2개</strong><span>{state === 'progress' || state === 'final' ? '1/2' : '0/2'}</span></div>
          <FriendSlot state={state} onShare={() => flash('초대 링크가 복사됐어요')} />
          <button type="button" className="secondSlot" onClick={() => flash('초대 링크가 복사됐어요')}>
            <span>2</span>
            <div><strong>친구 초대하기</strong><small>영구 초대 링크 공유 ↗</small></div>
            <b>↗</b>
          </button>
        </div>

        {state === 'final' ? (
          <div className="verificationPanel">
            <span>◷</span>
            <div><strong>모든 미션을 확인했어요</strong><p>온체인 기록과 최종 자격을 확인한 뒤 보상이 확정돼요. 확인이 끝나면 이 슬롯도 다시 열려요.</p></div>
          </div>
        ) : null}

        {rewardVisible ? (
          <section className="rewardPanel">
            <div className="rewardHeading">
              <div><span className="gift">◆</span><div><strong>받을 보상</strong><small>{state === 'paid' ? '지급 내역' : '받을 보상 1건'}</small></div></div>
              <span className={`lockBadge ${state === 'paid' ? 'paid' : ''}`}>{state === 'paid' ? '완료 ✓' : '확정 🔒'}</span>
            </div>
            <div className="rewardItem">
              <div className="rewardMeta"><small>친구 0x84A2…19F3</small><strong>{statusText}</strong><span>{state === 'paid' ? '온체인 지급이 최종 확인됐어요.' : '확정된 금액은 이후 예상 보상이 바뀌어도 변하지 않아요.'}</span></div>
              {state === 'claimable' ? (
                <button type="button" className="claimButton" onClick={() => { setState('queued'); flash('보상 지급을 요청했어요'); }}>보상 받기</button>
              ) : state === 'queued' ? (
                <button type="button" className="claimButton pending" disabled>지급 처리 중</button>
              ) : null}
            </div>
          </section>
        ) : null}

        {state === 'claimable' ? (
          <div className="successNotice"><span>✓</span><div><strong>친구 초대가 완료됐어요</strong><p>81.6 B3TR 보상이 확정됐고 친구 슬롯 1을 다시 사용할 수 있어요.</p></div></div>
        ) : null}
      </section>

      <section className="explainCard">
        <strong>이번 Preview에서 확인할 흐름</strong>
        <p>5단계 진행 → 최종 확인 → 완료 순간 보상 금액 확정·예약 → 슬롯 즉시 재사용 → 사용자가 보상 받기 → 온체인 최종 지급</p>
      </section>

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 90px; color:#fff; background:radial-gradient(circle at 50% 12%,rgba(244,183,40,.14),transparent 30%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 18px; display:flex; align-items:center; justify-content:space-between; }
        .previewBadge { padding:6px 9px; border:1px solid rgba(244,183,40,.26); border-radius:999px; color:#ffd66e; background:rgba(244,183,40,.08); font-size:.58rem; font-weight:950; letter-spacing:.08em; }
        .demoTabs { width:min(100%,520px); margin:0 auto 12px; display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; }
        .demoTabs::-webkit-scrollbar { display:none; }
        .demoTabs button { flex:0 0 auto; min-height:34px; padding:0 11px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(255,255,255,.035); color:#8f8a94; font:inherit; font-size:.62rem; font-weight:850; cursor:pointer; }
        .demoTabs button.selected { border-color:rgba(244,183,40,.32); background:rgba(244,183,40,.12); color:#ffd66e; }
        .missionCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; margin:0 auto; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
        .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); filter:blur(4px); pointer-events:none; }
        h1 { position:relative; z-index:1; margin:0; font-size:clamp(1.9rem,8vw,2.8rem); line-height:1.08; letter-spacing:-.045em; text-wrap:balance; }
        .permanentLinkCard { position:relative; z-index:1; margin-top:18px; padding:13px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; border:1px solid rgba(255,205,80,.19); border-radius:17px; background:rgba(255,205,80,.05); }
        .linkPreview { min-width:0; padding:10px; overflow:hidden; border-radius:11px; background:rgba(3,4,5,.42); color:#9e98a5; font-size:.65rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; }
        .permanentLinkCard button { padding:0 12px; border:0; border-radius:11px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.64rem; font-weight:950; cursor:pointer; }
        .slotsBlock { position:relative; z-index:1; margin-top:16px; display:grid; gap:9px; }
        .slotsHeading { display:flex; align-items:center; justify-content:space-between; color:#c7c2d0; font-size:.77rem; }
        .slotsHeading span { padding:4px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; font-size:.63rem; font-weight:950; }
        .secondSlot { width:100%; box-sizing:border-box; min-height:72px; padding:12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px dashed rgba(255,255,255,.11); border-radius:16px; background:rgba(255,255,255,.022); color:#fff; font:inherit; text-align:left; cursor:pointer; }
        .secondSlot > span { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(255,255,255,.045); color:#8d8797; font-size:.76rem; font-weight:950; }
        .secondSlot div { min-width:0; display:grid; gap:3px; }
        .secondSlot strong { color:#ded9e7; font-size:.74rem; }
        .secondSlot small { color:#837e8e; font-size:.62rem; }
        .secondSlot b { width:28px; height:28px; display:grid; place-items:center; border-radius:10px; color:#ffd66e; background:rgba(244,183,40,.08); }
        .verificationPanel,.successNotice { position:relative; z-index:1; margin-top:16px; padding:14px; display:flex; align-items:flex-start; gap:11px; border:1px solid rgba(255,205,80,.18); border-radius:17px; background:rgba(244,183,40,.055); }
        .verificationPanel > span,.successNotice > span { flex:0 0 auto; width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:rgba(244,183,40,.13); color:#ffd66e; font-weight:950; }
        .verificationPanel strong,.successNotice strong { font-size:.8rem; }
        .verificationPanel p,.successNotice p { margin:4px 0 0; color:#9b927c; font-size:.68rem; line-height:1.48; }
        .successNotice { border-color:rgba(90,222,166,.2); background:rgba(40,170,118,.08); }
        .successNotice > span { background:rgba(64,222,156,.18); color:#77efb9; }
        .successNotice p { color:#91a398; }
        .rewardPanel { position:relative; z-index:1; margin-top:16px; padding:15px; border:1px solid rgba(90,222,166,.19); border-radius:18px; background:linear-gradient(145deg,rgba(35,139,99,.12),rgba(255,255,255,.025)); }
        .rewardHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .rewardHeading > div { display:flex; align-items:center; gap:9px; }
        .rewardHeading > div > div { display:grid; gap:2px; }
        .rewardHeading strong { font-size:.83rem; }
        .rewardHeading small { color:#84948a; font-size:.61rem; }
        .gift { width:32px; height:32px; display:grid; place-items:center; border-radius:11px; background:rgba(64,222,156,.13); color:#77efb9; font-size:.7rem; }
        .lockBadge { padding:5px 8px; border:1px solid rgba(244,183,40,.18); border-radius:999px; color:#ffd66e; background:rgba(244,183,40,.07); font-size:.58rem; font-weight:900; }
        .lockBadge.paid { color:#77efb9; border-color:rgba(64,222,156,.17); background:rgba(64,222,156,.07); }
        .rewardItem { margin-top:12px; padding:13px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; border:1px solid rgba(255,255,255,.07); border-radius:14px; background:rgba(5,8,7,.36); }
        .rewardMeta { min-width:0; display:grid; gap:3px; }
        .rewardMeta small { color:#777e79; font-size:.59rem; direction:ltr; }
        .rewardMeta strong { color:#e4eee8; font-size:.94rem; }
        .rewardMeta span { color:#7e8b82; font-size:.6rem; line-height:1.4; }
        .claimButton { min-height:38px; padding:0 12px; border:0; border-radius:11px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.65rem; font-weight:950; cursor:pointer; white-space:nowrap; }
        .claimButton.pending { border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); color:#9b979f; }
        .explainCard { width:min(100%,520px); box-sizing:border-box; margin:12px auto 0; padding:16px; border:1px solid rgba(255,255,255,.07); border-radius:18px; background:rgba(255,255,255,.025); }
        .explainCard strong { font-size:.74rem; color:#d8d3dc; }
        .explainCard p { margin:6px 0 0; color:#817c87; font-size:.65rem; line-height:1.55; }
        .toast { position:fixed; z-index:50; left:50%; bottom:28px; transform:translateX(-50%); max-width:calc(100vw - 36px); padding:11px 14px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#161812; color:#eee9df; box-shadow:0 18px 60px rgba(0,0,0,.45); font-size:.7rem; font-weight:800; }
        @media (max-width:420px) { .screen { padding:18px 14px 80px; } .missionCard { padding:20px 17px; border-radius:26px; } .permanentLinkCard { grid-template-columns:1fr; } .permanentLinkCard button { min-height:38px; } .rewardItem { grid-template-columns:1fr; } .claimButton { width:100%; } }
      `}</style>
    </main>
  );
}
