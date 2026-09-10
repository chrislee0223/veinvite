'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerInfo = { point: Point; interactive: boolean };

const WORLD_W = 760;
const WORLD_H = 900;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.62;
const ROOT_SCALE = 0.88;

const members = [
  { id: 'a', wallet: '0xA100...001', x: 226, y: 286, network: 18 },
  { id: 'a1', wallet: '0xA110...011', x: 110, y: 470, network: 7 },
  { id: 'a2', wallet: '0xA120...012', x: 226, y: 470, network: 5 },
  { id: 'a3', wallet: '0xA130...013', x: 342, y: 470, network: 3 },
  { id: 'a11', wallet: '0xA111...111', x: 70, y: 654, network: 2 },
  { id: 'a12', wallet: '0xA112...112', x: 152, y: 654, network: 1 },
  { id: 'a21', wallet: '0xA121...121', x: 224, y: 654, network: 1 },
  { id: 'a22', wallet: '0xA122...122', x: 298, y: 654, network: 1 },
  { id: 'a31', wallet: '0xA131...131', x: 372, y: 654, network: 0 },
];

const deeperEdges = [
  ['a1', 'a11'], ['a1', 'a12'], ['a2', 'a21'], ['a2', 'a22'], ['a3', 'a31'],
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}

export function QaNetworkEmptyStateV2() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>({ x: 0, y: 20, scale: ROOT_SCALE });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);

  const secondGenerationProgress = smoothStep(0.78, 1.04, view.scale);
  const thirdGenerationProgress = smoothStep(1.02, 1.34, view.scale);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 5400);
    return () => window.clearTimeout(timer);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontal = Math.max(80, (WORLD_W * scale - stageSize.width) / 2 + 80);
    const vertical = Math.max(40, WORLD_H * scale - stageSize.height + 96);
    return {
      scale,
      x: clamp(next.x, -horizontal, horizontal),
      y: clamp(next.y, -vertical, 96),
    };
  }, [stageSize.height, stageSize.width]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShowHint(false);
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return clampView({
        scale,
        x: px - worldX * scale,
        y: py - worldY * scale,
      });
    });
  }, [clampView]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = clamp(Math.exp(-event.deltaY * 0.0018), 0.94, 1.06);
    zoomAroundPoint(event.clientX, event.clientY, view.scale * factor);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interactive = Boolean((event.target as HTMLElement).closest('[data-network-control="true"]'));
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { point, interactive });
    setShowHint(false);
    if (pointersRef.current.size === 1) previousPointRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      previousPointRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const existing = pointersRef.current.get(event.pointerId);
    if (!existing) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { ...existing, point });

    if (pointersRef.current.size === 1) {
      if (existing.interactive) return;
      const previous = previousPointRef.current;
      if (!previous) {
        previousPointRef.current = point;
        return;
      }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }));
      previousPointRef.current = point;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      if (pinchDistanceRef.current) {
        zoomAroundPoint(centerX, centerY, view.scale * (distance / pinchDistanceRef.current));
      }
      pinchDistanceRef.current = distance;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      previousPointRef.current = [...pointersRef.current.values()][0].point;
      pinchDistanceRef.current = null;
      return;
    }
    if (pointersRef.current.size === 0) {
      previousPointRef.current = null;
      pinchDistanceRef.current = null;
    }
  };

  const selected = members.find((member) => member.id === selectedId) ?? null;
  const rootToActivePath = 'M380 136 C348 188 298 216 226 252';
  const rootToEmptyPath = 'M380 136 C414 188 466 216 534 252';

  return (
    <main className="qaPage">
      <section className="notice">
        <div>
          <strong>NETWORK EMPTY STATE · QA V2</strong>
          <span>샘플 데이터 · Production과 완전히 분리</span>
        </div>
        <small>성장한 가지 + 다음 초대 슬롯</small>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock">
            <span>NETWORK</span>
            <h1>My Network</h1>
          </div>
          <div className="totals" aria-label="Network summary">
            <span className="metric"><b>19</b><em>Members</em></span>
            <i />
            <span className="metric"><b>1</b><em>Open slot</em></span>
          </div>
        </header>

        <div
          ref={stageRef}
          className="stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
        >
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{view.scale < 1.06 ? '전체 구조' : view.scale < 1.34 ? '세대 보기' : '상세 보기'}</span><small>{Math.round(view.scale * 100)}%</small></div>

          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>핀치·휠로 확대하면<br />성장한 가지가 더 펼쳐집니다</span></div> : null}

          <div
            className="world"
            style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}
          >
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <filter id="softFlowGlow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur stdDeviation="4.8" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <path d={rootToActivePath} className="mainEdge activeEdge" />
              <path d={rootToEmptyPath} className="mainEdge emptyEdge" />
              <path d={rootToEmptyPath} pathLength="240" className="flowGlowWide" />
              <path d={rootToEmptyPath} pathLength="240" className="flowGlowCore" />

              <path d="M226 322 C210 370 162 412 110 436" className="branchEdge secondEdge" style={{ opacity: 0.28 + secondGenerationProgress * 0.28 }} />
              <path d="M226 322 C226 372 226 408 226 436" className="branchEdge secondEdge" style={{ opacity: 0.28 + secondGenerationProgress * 0.28 }} />
              <path d="M226 322 C242 370 292 412 342 436" className="branchEdge secondEdge" style={{ opacity: 0.28 + secondGenerationProgress * 0.28 }} />

              {deeperEdges.map(([fromId, toId]) => {
                const from = members.find((member) => member.id === fromId)!;
                const to = members.find((member) => member.id === toId)!;
                return <line key={`${fromId}-${toId}`} x1={from.x} y1={from.y + 33} x2={to.x} y2={to.y - 32} className="branchEdge" style={{ opacity: thirdGenerationProgress * 0.52 }} />;
              })}
            </svg>

            <button type="button" className="person root" style={{ left: 380, top: 108 }} data-network-control="true" onClick={() => setSelectedId(null)}>
              <span className="avatar">●</span><b>YOU</b><small>1 Direct · 1 Open Slot</small>
            </button>

            <button type="button" className="person active" style={{ left: 226, top: 286 }} data-network-control="true" onClick={() => setSelectedId('a')}>
              <span className="avatar">●</span><b>0xA100...001</b><small>18 network</small>
            </button>

            <button type="button" className="emptySlot" style={{ left: 534, top: 286 }} data-network-control="true" onClick={() => setSelectedId('empty')}>
              <span className="slotAvatar"><i>+</i></span>
              <b>Available</b>
              <small>Next invite</small>
              <span className="slotBreath" aria-hidden="true" />
            </button>

            {members.slice(1, 4).map((member, index) => {
              const progress = clamp(0.58 + secondGenerationProgress * 0.52 - index * 0.045, 0, 1);
              return <button key={member.id} type="button" className="person child" style={{ left: member.x, top: member.y, opacity: progress, transform: `translate(-50%,-50%) scale(${0.84 + progress * 0.16})`, pointerEvents: progress > 0.52 ? 'auto' : 'none' }} data-network-control="true" onClick={() => setSelectedId(member.id)}>
                <span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small>
              </button>;
            })}

            <div className="growthSummary" style={{ left: 226, top: 560, opacity: 1 - thirdGenerationProgress * 0.9 }} aria-hidden="true">
              <span className="stack"><i /><i /><i /></span><b>+15</b><small>deeper network</small>
            </div>

            {members.slice(4).map((member, index) => {
              const progress = clamp(thirdGenerationProgress * 1.18 - index * 0.06, 0, 1);
              return <button key={member.id} type="button" className="person child mini" style={{ left: member.x, top: member.y, opacity: progress, transform: `translate(-50%,-50%) scale(${0.72 + progress * 0.28})`, pointerEvents: progress > 0.45 ? 'auto' : 'none' }} data-network-control="true" onClick={() => setSelectedId(member.id)}>
                <span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small>
              </button>;
            })}

            <div className="deeperHint" style={{ left: 226, top: 786, opacity: thirdGenerationProgress }} aria-hidden="true"><span>•••</span><b>more generations</b></div>
          </div>

          {selectedId === 'empty' ? <aside className="slotCard" data-network-control="true">
            <div><span className="cardPlus">+</span><div><strong>Available invite slot</strong><small>Your next invited friend will appear here.</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div>
            <p>초대가 확정되면 이 자리에서 빈 슬롯이 실제 사용자 노드로 자연스럽게 전환됩니다.</p>
          </aside> : null}

          {selected ? <aside className="slotCard" data-network-control="true">
            <div><span className="cardAvatar">●</span><div><strong>{selected.wallet}</strong><small>{selected.network} network members</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div>
            <p>이쪽은 이미 여러 세대로 성장한 가지입니다. 확대하면 다음 세대가 더 펼쳐집니다.</p>
          </aside> : null}

          <div className="controls" data-network-control="true">
            <button type="button" aria-label="초기 위치" onClick={() => setView({ x: 0, y: 20, scale: ROOT_SCALE })}>◎</button>
            <button type="button" aria-label="확대" onClick={() => setView((current) => clampView({ ...current, scale: current.scale + 0.16 }))}>+</button>
            <button type="button" aria-label="축소" onClick={() => setView((current) => clampView({ ...current, scale: current.scale - 0.16 }))}>−</button>
          </div>
        </div>
      </section>

      <section className="tips">
        <span><b>왼쪽</b> 이미 성장한 네트워크</span>
        <span><b>오른쪽</b> 다음 친구가 들어올 자리</span>
        <span><b>빛 흐름</b> 선 자체가 은은하게 살아 움직임</span>
      </section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem;line-height:1.35}.notice small{text-align:right;max-width:220px}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{height:62px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px;min-width:0}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.topBar h1{margin:0;font-size:.91rem;color:#f5f1e8;white-space:nowrap}.totals{display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0;color:#6f6a62;white-space:nowrap}.metric{display:flex;align-items:baseline;gap:3px;min-width:0}.metric b{color:#d8d1c5;font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.45rem}.totals>i{width:1px;height:12px;flex:0 0 1px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(550px,69svh,680px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.06),transparent 33%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.055) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.45),transparent 88%)}.hud{position:absolute;z-index:6;top:10px;left:10px;display:flex;align-items:center;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.72);backdrop-filter:blur(8px);pointer-events:none}.hud span{font-size:.49rem;color:#aaa296}.hud small{font-size:.47rem;color:#786c51}.gestureHint{position:absolute;z-index:7;top:42px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:11px;background:rgba(12,11,8,.88);box-shadow:0 10px 30px rgba(0,0,0,.24);pointer-events:none;animation:hintOut 5.4s ease forwards}.gestureHint b{color:#d6ac48;font-size:.8rem}.gestureHint span{font-size:.53rem;line-height:1.35;color:#938a7b}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.mainEdge,.branchEdge,.flowGlowWide,.flowGlowCore{fill:none;stroke-linecap:round}.mainEdge{stroke-width:1.45}.activeEdge{stroke:rgba(225,194,115,.40)}.emptyEdge{stroke:rgba(218,181,83,.26)}.flowGlowWide{stroke:rgba(244,183,40,.26);stroke-width:8;stroke-dasharray:54 186;filter:url(#softFlowGlow);animation:flowStream 3.5s linear infinite}.flowGlowCore{stroke:rgba(255,226,147,.78);stroke-width:2.1;stroke-dasharray:38 202;filter:url(#softFlowGlow);animation:flowStream 3.5s linear infinite}.branchEdge{stroke:rgba(209,196,161,.32);stroke-width:1.2}.person,.emptySlot{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;outline:0;font:inherit}.person{width:80px;min-height:72px;padding:0;background:transparent;color:#e9e3d8;display:grid;justify-items:center;gap:4px}.avatar,.slotAvatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#17150f;border:1px solid rgba(226,193,111,.34);color:#d8b75c;font-size:.48rem;box-shadow:0 5px 18px rgba(0,0,0,.24)}.person b,.emptySlot b{font-size:.52rem;font-weight:700;white-space:nowrap}.person small,.emptySlot small{font-size:.45rem;color:#7f786f;white-space:nowrap}.person.root .avatar{width:44px;height:44px;background:#201b10;border-color:rgba(244,183,40,.58);box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 24px rgba(0,0,0,.28)}.person.root b{font-size:.64rem;color:#f2d98f}.person.root small{font-size:.47rem;color:#93866c;margin-top:1px}.person.active .avatar{border-color:rgba(244,183,40,.64);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 8px 24px rgba(0,0,0,.3)}.emptySlot{width:80px;min-height:76px;padding:0;background:transparent;color:#e7c46c;display:grid;justify-items:center;gap:4px}.slotAvatar{position:relative;border-style:dashed;border-color:rgba(244,183,40,.58);background:rgba(244,183,40,.045);box-shadow:0 0 0 5px rgba(244,183,40,.025)}.slotAvatar i{font-style:normal;font-size:1.12rem;line-height:1;color:#efc85f}.slotBreath{position:absolute;left:50%;top:18px;width:48px;height:48px;transform:translate(-50%,-50%);border-radius:50%;border:1px dashed rgba(244,183,40,.16);pointer-events:none;animation:slotBreath 3.5s ease-in-out infinite}.growthSummary{position:absolute;z-index:2;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:2px;pointer-events:none;transition:opacity .08s linear}.growthSummary .stack{position:relative;width:34px;height:24px}.growthSummary .stack i{position:absolute;width:25px;height:18px;border:1px solid rgba(207,190,151,.2);border-radius:50%;background:#11100c}.growthSummary .stack i:nth-child(1){left:0;top:5px}.growthSummary .stack i:nth-child(2){left:5px;top:2px}.growthSummary .stack i:nth-child(3){left:9px;top:0;border-color:rgba(244,183,40,.3)}.growthSummary b{font-size:.6rem;color:#cdb36f}.growthSummary small{font-size:.43rem;color:#746d62}.deeperHint{position:absolute;z-index:2;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;color:#766f62;pointer-events:none}.deeperHint span{font-size:.75rem;letter-spacing:.18em}.deeperHint b{font-size:.43rem;font-weight:600}.slotCard{position:absolute;z-index:12;left:12px;right:12px;bottom:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(16,15,12,.96);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(12px)}.slotCard>div{display:flex;align-items:center;gap:9px}.slotCard>div>div{display:grid;gap:2px;min-width:0}.slotCard strong{font-size:.65rem;color:#efe8db}.slotCard small{font-size:.49rem;color:#817a70}.slotCard button{margin-left:auto;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8e877c}.slotCard p{margin:9px 0 0;font-size:.5rem;line-height:1.45;color:#91887a}.cardPlus,.cardAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(244,183,40,.08);border:1px solid rgba(244,183,40,.2);color:#d8b457}.controls{position:absolute;z-index:10;right:10px;bottom:10px;display:grid;gap:6px}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.88);color:#bcb3a5;font-size:.75rem;box-shadow:0 8px 24px rgba(0,0,0,.2)}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}@keyframes flowStream{0%{stroke-dashoffset:240;opacity:.22}14%{opacity:.62}72%{opacity:.72}100%{stroke-dashoffset:0;opacity:.22}}@keyframes slotBreath{0%,58%,100%{opacity:.18;box-shadow:0 0 0 rgba(244,183,40,0)}72%{opacity:.58;box-shadow:0 0 18px rgba(244,183,40,.12)}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}@media(max-width:430px){.notice small{display:none}.topBar{padding:0 11px;gap:7px}.totals{gap:5px}.metric{gap:2px}.metric b{font-size:.62rem}.metric em{font-size:.4rem}.totals>i{margin:0 1px}.tips{grid-template-columns:1fr}.tips span{padding:6px}.stage{height:clamp(550px,70svh,660px)}}@media(max-width:360px){.metric em{display:none}.totals{gap:6px}}@media(prefers-reduced-motion:reduce){.flowGlowWide,.flowGlowCore,.slotBreath,.gestureHint{animation:none}.flowGlowWide{display:none}.flowGlowCore{stroke-dasharray:none;opacity:.2}.slotAvatar{box-shadow:0 0 0 5px rgba(244,183,40,.025),0 0 18px rgba(244,183,40,.05)}}
      `}</style>
    </main>
  );
}
