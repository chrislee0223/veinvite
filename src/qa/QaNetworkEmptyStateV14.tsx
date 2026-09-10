'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QaNetworkEmptyStateV13 } from '@/qa/QaNetworkEmptyStateV13';

type SlotId = 'slot-left-1' | 'slot-right-1';
type SlotAnchor = {
  id: SlotId;
  side: 'left' | 'right';
  x: number;
  y: number;
  path: string;
  wallet: string;
};

type PortalTargets = {
  world: HTMLElement | null;
  topBar: HTMLElement | null;
  notice: HTMLElement | null;
  qaActions: HTMLElement | null;
};

const WORLD_W = 1540;
const WORLD_H = 1840;
const ROOT_X = WORLD_W / 2;
const ROOT_Y = 128;
const NODE_Y = 330;
const SLOT_GAP = 150;
const SERVER_SLOT_IDS: SlotId[] = ['slot-left-1', 'slot-right-1'];
const FILL_SEQUENCE: SlotId[] = ['slot-right-1', 'slot-left-1'];

function syntheticWallet(id: SlotId) {
  return id === 'slot-left-1'
    ? `0x${'f14a'.padStart(40, '0')}`
    : `0x${'f14b'.padStart(40, '0')}`;
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function makeAnchor(id: SlotId, memberXs: number[]): SlotAnchor {
  const minMember = memberXs.length ? Math.min(...memberXs) : ROOT_X - 190;
  const maxMember = memberXs.length ? Math.max(...memberXs) : ROOT_X + 190;
  const side = id === 'slot-left-1' ? 'left' : 'right';
  const x = side === 'left' ? minMember - SLOT_GAP : maxMember + SLOT_GAP;
  const bend = side === 'left' ? -58 : 58;
  const path = `M${ROOT_X} ${ROOT_Y + 44} C${ROOT_X + bend} 202 ${x - bend * .45} 234 ${x} ${NODE_Y - 38}`;
  return { id, side, x, y: NODE_Y, path, wallet: syntheticWallet(id) };
}

function gradientVector(anchor: SlotAnchor) {
  return { dx: anchor.x - ROOT_X, dy: anchor.y - (ROOT_Y + 44) };
}

export function QaNetworkEmptyStateV14() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lockedAnchorsRef = useRef<SlotAnchor[] | null>(null);
  const [targets, setTargets] = useState<PortalTargets>({ world: null, topBar: null, notice: null, qaActions: null });
  const [isOwnView, setIsOwnView] = useState(true);
  const [baseMembers, setBaseMembers] = useState(85);
  const [anchors, setAnchors] = useState<SlotAnchor[]>(() => SERVER_SLOT_IDS.map((id) => makeAnchor(id, [ROOT_X - 190, ROOT_X, ROOT_X + 190])));
  const [availableSlotIds, setAvailableSlotIds] = useState<SlotId[]>(SERVER_SLOT_IDS);
  const [transitioningSlot, setTransitioningSlot] = useState<SlotId | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  const filledSlotIds = useMemo(() => SERVER_SLOT_IDS.filter((id) => !availableSlotIds.includes(id)), [availableSlotIds]);
  const availableAnchors = useMemo(() => anchors.filter((slot) => availableSlotIds.includes(slot.id)), [anchors, availableSlotIds]);
  const filledAnchors = useMemo(() => anchors.filter((slot) => filledSlotIds.includes(slot.id)), [anchors, filledSlotIds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sync = () => {
      const world = host.querySelector('.world') as HTMLElement | null;
      const topBar = host.querySelector('.topBar') as HTMLElement | null;
      const notice = host.querySelector('.notice') as HTMLElement | null;
      const qaActions = host.querySelector('.qaActions') as HTMLElement | null;
      setTargets({ world, topBar, notice, qaActions });

      const own = (host.querySelector('.titleBlock h1')?.textContent ?? '').trim() === 'My Network';
      setIsOwnView(own);

      if (own) {
        const metricText = host.querySelector('.totals .metric b')?.textContent?.trim();
        const parsed = Number(metricText);
        if (Number.isFinite(parsed) && parsed > 0) setBaseMembers(parsed);

        if (world && !lockedAnchorsRef.current) {
          const xs = Array.from(world.querySelectorAll('.person.child'))
            .map((node) => node as HTMLElement)
            .filter((node) => Math.abs((Number.parseFloat(node.style.top) || 0) - NODE_Y) < 2)
            .map((node) => Number.parseFloat(node.style.left))
            .filter((value) => Number.isFinite(value));
          if (xs.length >= 1) {
            const next = SERVER_SLOT_IDS.map((id) => makeAnchor(id, xs));
            lockedAnchorsRef.current = next;
            setAnchors(next);
          }
        }
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    const timer = window.setInterval(sync, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!transitioningSlot) return;
    const timer = window.setTimeout(() => setTransitioningSlot(null), 900);
    return () => window.clearTimeout(timer);
  }, [transitioningSlot]);

  useEffect(() => {
    if (!inviteNotice) return;
    const timer = window.setTimeout(() => setInviteNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [inviteNotice]);

  const advanceLifecycle = () => {
    if (availableSlotIds.length === 0) {
      setAvailableSlotIds(SERVER_SLOT_IDS);
      setTransitioningSlot(null);
      return;
    }
    const nextToFill = FILL_SEQUENCE.find((id) => availableSlotIds.includes(id));
    if (!nextToFill) return;
    setTransitioningSlot(nextToFill);
    setAvailableSlotIds((current) => current.filter((id) => id !== nextToFill));
  };

  const lifecycleLabel = availableSlotIds.length === 2
    ? 'fill RIGHT'
    : availableSlotIds.length === 1
      ? 'fill LEFT'
      : 'reset 2 slots';

  const worldPortal = targets.world && isOwnView ? createPortal(
    <>
      <svg className="v14SlotEdges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
        <defs>
          <filter id="v14FlowBlur" x="-160%" y="-160%" width="420%" height="420%">
            <feGaussianBlur stdDeviation="5.5" />
          </filter>
          {availableAnchors.map((slot, index) => {
            const { dx, dy } = gradientVector(slot);
            return (
              <linearGradient key={`gradient-${slot.id}`} id={`v14Flow-${slot.id}`} gradientUnits="userSpaceOnUse" x1={ROOT_X} y1={ROOT_Y + 44} x2={slot.x} y2={slot.y - 38}>
                <stop offset="0" stopColor="rgba(250,200,74,0)" />
                <stop offset=".30" stopColor="rgba(250,200,74,0)" />
                <stop offset=".48" stopColor="rgba(250,200,74,.16)" />
                <stop offset=".56" stopColor="rgba(250,200,74,.62)" />
                <stop offset=".66" stopColor="rgba(250,200,74,.16)" />
                <stop offset=".84" stopColor="rgba(250,200,74,0)" />
                <stop offset="1" stopColor="rgba(250,200,74,0)" />
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  values={`${-dx * .78} ${-dy * .78};${-dx * .78} ${-dy * .78};0 0;${dx * .78} ${dy * .78};${dx * .78} ${dy * .78}`}
                  keyTimes="0;0.18;0.46;0.66;1"
                  dur="8s"
                  begin={`${index * 4}s`}
                  repeatCount="indefinite"
                />
              </linearGradient>
            );
          })}
        </defs>

        {availableAnchors.map((slot) => (
          <g key={`edge-${slot.id}`}>
            <path d={slot.path} className="v14AvailableBase" vectorEffect="non-scaling-stroke" />
            <path d={slot.path} className="v14SlotFlow" stroke={`url(#v14Flow-${slot.id})`} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {filledAnchors.map((slot) => (
          <path key={`filled-edge-${slot.id}`} d={slot.path} className={`v14FilledEdge ${transitioningSlot === slot.id ? 'arriving' : ''}`} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {availableAnchors.map((slot, index) => (
        <button
          key={slot.id}
          type="button"
          className="v14EmptySlot"
          style={{ left: slot.x, top: slot.y, ['--slot-delay' as string]: `${3.9 + index * 4}s` }}
          onClick={() => setInviteNotice(`${slot.side === 'left' ? 'Left' : 'Right'} slot · 실제 앱에서는 친구 초대하기로 연결`)}
          aria-label={`${slot.side} available invite slot`}
        >
          <span className="v14SlotAvatar"><i>+</i></span>
          <b>Available</b>
          <small>Invite slot</small>
        </button>
      ))}

      {filledAnchors.map((slot) => (
        <button
          key={`member-${slot.id}`}
          type="button"
          className={`v14FilledMember ${transitioningSlot === slot.id ? 'arriving' : ''}`}
          style={{ left: slot.x, top: slot.y }}
          aria-label={`${shortWallet(slot.wallet)} newly joined member`}
        >
          <span className="v14MemberAvatar">●</span>
          <b>{shortWallet(slot.wallet)}</b>
          <small>New direct · same slot</small>
        </button>
      ))}
    </>,
    targets.world,
  ) : null;

  const totalsPortal = targets.topBar && isOwnView ? createPortal(
    <div className="v14Totals" aria-label="v14 dynamic totals">
      <span><b>{baseMembers + filledSlotIds.length}</b><em>Members</em></span><i />
      <span><b>{availableSlotIds.length}</b><em>Open slots</em></span>
    </div>,
    targets.topBar,
  ) : null;

  const noticePortal = targets.notice ? createPortal(
    <div className="v14NoticeCopy">
      <strong>SLOT LIFECYCLE · QA V14</strong>
      <span>v13 누적 · stable slot IDs · same-position Available → member</span>
    </div>,
    targets.notice,
  ) : null;

  const actionPortal = targets.qaActions ? createPortal(
    <button type="button" className="v14LifecycleButton" onClick={advanceLifecycle}>{lifecycleLabel}</button>,
    targets.qaActions,
  ) : null;

  return (
    <div ref={hostRef} className={`v14Host ${isOwnView ? 'ownView' : 'otherView'}`}>
      <QaNetworkEmptyStateV13 />
      {worldPortal}
      {totalsPortal}
      {noticePortal}
      {actionPortal}
      {inviteNotice ? <div className="v14InviteToast" role="status">{inviteNotice}</div> : null}
      <section className="v14Tips">
        <span><b>Stable slot IDs</b>RIGHT가 먼저 채워져도 LEFT는 제자리 유지</span>
        <span><b>2 → 1 → 0 → reset</b>실제 슬롯 상태 전 구간을 한 버튼으로 검증</span>
        <span><b>Same-position morph</b>Available이 있던 좌표와 같은 선에서 실제 사람으로 전환</span>
      </section>

      <style jsx global>{`
        .v14Host .notice{position:relative}.v14Host .notice>div:first-child:not(.v14NoticeCopy){display:none}.v14NoticeCopy{order:-1;display:grid;gap:2px}.v14NoticeCopy strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.v14NoticeCopy span{color:#7f786d;font-size:.5rem}.v14Host .qaActions>button:not(.v14LifecycleButton){display:none}.v14LifecycleButton{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.2)!important;border-radius:8px;background:rgba(244,183,40,.075)!important;color:#d2ae55!important;font-size:.45rem!important;white-space:nowrap}.v14Host.ownView .topBar>.totals{display:none}.v14Host .topBar{position:relative}.v14Totals{margin-left:auto;display:flex;align-items:center;gap:7px}.v14Totals span{display:flex;align-items:baseline;gap:3px}.v14Totals b{font-size:.66rem}.v14Totals em{font-style:normal;color:#6f6a62;font-size:.42rem}.v14Totals>i{width:1px;height:12px;background:rgba(255,255,255,.08)}
        .v14Host.ownView .world>.edges .availableBase,.v14Host.ownView .world>.edges .availableGlow,.v14Host.ownView .world>.emptySlot{display:none!important}.v14SlotEdges{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:1}.v14AvailableBase{fill:none;stroke:rgba(244,183,40,.085);stroke-width:.85;stroke-linecap:round}.v14SlotFlow{fill:none;stroke-width:2.7;stroke-linecap:round;filter:url(#v14FlowBlur);opacity:.9}.v14FilledEdge{fill:none;stroke:rgba(211,198,165,.31);stroke-width:1.05;stroke-linecap:round;transition:stroke .45s ease,opacity .45s ease}.v14FilledEdge.arriving{animation:v14EdgeSettle .9s ease-out}.v14EmptySlot,.v14FilledMember{position:absolute;z-index:3;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;border:0;background:transparent;text-align:center;white-space:nowrap}.v14EmptySlot{min-width:68px;opacity:.74;color:#a79a79}.v14SlotAvatar{width:32px;height:32px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.25);border-radius:50%;background:rgba(244,183,40,.018);animation:v14SlotBreath 8s ease-in-out infinite;animation-delay:var(--slot-delay)}.v14SlotAvatar i{font-style:normal;color:#a88d4a;font-size:.78rem}.v14EmptySlot b{font-size:.43rem}.v14EmptySlot small{font-size:.36rem;color:#5e594f}.v14FilledMember{min-width:86px;color:#d8d2c7}.v14MemberAvatar{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.28);border-radius:50%;background:#11100d;color:#d9b34f;font-size:.6rem;box-shadow:0 5px 22px rgba(0,0,0,.32)}.v14FilledMember b{font-size:.49rem}.v14FilledMember small{font-size:.4rem;color:#746f67}.v14FilledMember.arriving{animation:v14MemberArrive .9s cubic-bezier(.2,.72,.25,1)}
        .v14InviteToast{position:fixed;z-index:9998;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 72px));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 34px);padding:8px 11px;border:1px solid rgba(244,183,40,.14);border-radius:11px;background:rgba(14,14,11,.96);color:#bdb4a5;font-size:.48rem;box-shadow:0 12px 42px rgba(0,0,0,.35);animation:v14Toast 2.4s ease forwards}.v14Host>.qaPage>.tips{display:none}.v14Tips{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin:8px auto 28px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.v14Tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.v14Tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}
        @keyframes v14MemberArrive{0%{opacity:0;transform:translate(-50%,-50%) scale(.78);filter:brightness(1.7)}55%{opacity:1;transform:translate(-50%,-50%) scale(1.06);filter:brightness(1.35)}100%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:none}}@keyframes v14EdgeSettle{0%{opacity:.2;stroke:rgba(250,200,74,.55)}100%{opacity:1;stroke:rgba(211,198,165,.31)}}@keyframes v14SlotBreath{0%,42%,100%{box-shadow:none;border-color:rgba(244,183,40,.25)}52%{box-shadow:0 0 16px rgba(244,183,40,.13);border-color:rgba(244,183,40,.38)}62%{box-shadow:none;border-color:rgba(244,183,40,.25)}}@keyframes v14Toast{0%{opacity:0;transform:translate(-50%,8px)}12%,78%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-4px)}}
        @media(max-width:430px){.v14Tips{grid-template-columns:1fr}.v14Tips span{padding:6px}.v14LifecycleButton{font-size:.42rem!important}.v14Totals em{font-size:.39rem}}@media(prefers-reduced-motion:reduce){.v14SlotFlow{display:none}.v14SlotAvatar,.v14FilledMember.arriving,.v14FilledEdge.arriving,.v14InviteToast{animation:none}}
      `}</style>
    </div>
  );
}

export default QaNetworkEmptyStateV14;
