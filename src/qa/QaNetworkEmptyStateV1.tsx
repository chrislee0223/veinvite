'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const WORLD_W = 760;
const WORLD_H = 980;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.62;
const ROOT_SCALE = 0.88;

const members = [
  { id: 'a', wallet: '0xA100...001', x: 228, y: 292, network: 18 },
  { id: 'a1', wallet: '0xA110...011', x: 112, y: 500, network: 7 },
  { id: 'a2', wallet: '0xA120...012', x: 228, y: 500, network: 5 },
  { id: 'a3', wallet: '0xA130...013', x: 344, y: 500, network: 3 },
  { id: 'a11', wallet: '0xA111...111', x: 72, y: 706, network: 2 },
  { id: 'a12', wallet: '0xA112...112', x: 154, y: 706, network: 1 },
  { id: 'a21', wallet: '0xA121...121', x: 226, y: 706, network: 1 },
  { id: 'a22', wallet: '0xA122...122', x: 300, y: 706, network: 1 },
  { id: 'a31', wallet: '0xA131...131', x: 374, y: 706, network: 0 },
];

const edges = [
  ['a', 'a1'], ['a', 'a2'], ['a', 'a3'],
  ['a1', 'a11'], ['a1', 'a12'], ['a2', 'a21'], ['a2', 'a22'], ['a3', 'a31'],
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}

export function QaNetworkEmptyStateV1() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>({ x: 0, y: 20, scale: ROOT_SCALE });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);

  const secondGenerationProgress = smoothStep(0.88, 1.08, view.scale);
  const thirdGenerationProgress = smoothStep(1.04, 1.34, view.scale);

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
    const timer = window.setTimeout(() => setShowHint(false), 5600);
    return () => window.clearTimeout(timer);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontal = Math.max(80, (WORLD_W * scale - stageSize.width) / 2 + 80);
    const vertical = Math.max(40, WORLD_H * scale - stageSize.height + 110);
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
    const target = event.target as HTMLElement;
    if (target.closest('[data-network-control="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    setShowHint(false);
    if (pointersRef.current.size === 1) previousPointRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      previousPointRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
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
      const [a, b] = [...pointersRef.current.values()];
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
      previousPointRef.current = [...pointersRef.current.values()][0];
      pinchDistanceRef.current = null;
      return;
    }
    if (pointersRef.current.size === 0) {
      previousPointRef.current = null;
      pinchDistanceRef.current = null;
    }
  };

  const selected = members.find((member) => member.id === selectedId) ?? null;
  const rootToActivePath = 'M380 136 C350 190 302 220 228 258';
  const rootToEmptyPath = 'M380 136 C414 190 466 220 532 258';

  return (
    <main className="qaPage">
      <section className="notice">
        <div>
          <strong>NETWORK EMPTY STATE · QA</strong>
          <span>샘플 데이터 · Production과 완전히 분리</span>
        </div>
        <small>한쪽은 성장 중 · 한쪽은 초대 가능 슬롯</small>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div>
            <span>NETWORK</span>
            <h1>My Network</h1>
          </div>
          <div className="totals"><b>19</b><span>Members</span><i /><b>1</b><span>Slot Available</span></div>
        </header>

        <div
          ref={stageRef}
          className="stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
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
                <filter id="slotGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <path d={rootToActivePath} className="mainEdge activeEdge" />
              <path d={rootToEmptyPath} className="mainEdge emptyEdge" />

              <g className="flowParticle">
                <circle r="5.5" fill="#ffd768" opacity="0.18" filter="url(#slotGlow)">
                  <animateMotion dur="2.8s" repeatCount="indefinite" begin="0s" path={rootToEmptyPath} />
                </circle>
                <circle r="2.8" fill="#ffe8a5" filter="url(#slotGlow)">
                  <animateMotion dur="2.8s" repeatCount="indefinite" begin="0s" path={rootToEmptyPath} />
                </circle>
              </g>

              <path d="M228 328 C214 386 164 430 112 466" className="branchEdge" style={{ opacity: 0.20 + secondGenerationProgress * 0.36 }} />
              <path d="M228 328 C228 388 228 430 228 466" className="branchEdge" style={{ opacity: 0.20 + secondGenerationProgress * 0.36 }} />
              <path d="M228 328 C242 386 292 430 344 466" className="branchEdge" style={{ opacity: 0.20 + secondGenerationProgress * 0.36 }} />

              {edges.slice(3).map(([fromId, toId]) => {
                const from = members.find((member) => member.id === fromId)!;
                const to = members.find((member) => member.id === toId)!;
                return <line key={`${fromId}-${toId}`} x1={from.x} y1={from.y + 34} x2={to.x} y2={to.y - 34} className="branchEdge" style={{ opacity: thirdGenerationProgress * 0.52 }} />;
              })}
            </svg>

            <button type="button" className="person root" style={{ left: 380, top: 108 }} data-network-control="true" onClick={() => setSelectedId(null)}>
              <span className="avatar">●</span><b>YOU</b><small>1 Direct · 1 Available</small>
            </button>

            <button type="button" className="person active" style={{ left: 228, top: 292 }} data-network-control="true" onClick={() => setSelectedId('a')}>
              <span className="avatar">●</span><b>0xA100...001</b><small>18 network</small>
            </button>

            <div className="growthSummary" style={{ left: 228, top: 390, opacity: 1 - secondGenerationProgress }} aria-hidden="true">
              <span className="stack"><i /><i /><i /></span><b>+18</b><small>growing network</small>
            </div>

            <button type="button" className="emptySlot" style={{ left: 532, top: 292 }} data-network-control="true" onClick={() => setSelectedId('empty')}>
              <span className="slotPlus">+</span><b>Available</b><small>Your next invite</small>
              <span className="slotPulse" aria-hidden="true" />
            </button>

            {members.slice(1, 4).map((member, index) => {
              const progress = clamp(secondGenerationProgress * 1.18 - index * 0.08, 0, 1);
              return <button key={member.id} type="button" className="person child" style={{ left: member.x, top: member.y, opacity: progress, transform: `translate(-50%,-50%) scale(${0.72 + progress * 0.28})`, pointerEvents: progress > 0.45 ? 'auto' : 'none' }} data-network-control="true" onClick={() => setSelectedId(member.id)}>
                <span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small>
              </button>;
            })}

            {members.slice(4).map((member, index) => {
              const progress = clamp(thirdGenerationProgress * 1.18 - index * 0.06, 0, 1);
              return <button key={member.id} type="button" className="person child mini" style={{ left: member.x, top: member.y, opacity: progress, transform: `translate(-50%,-50%) scale(${0.72 + progress * 0.28})`, pointerEvents: progress > 0.45 ? 'auto' : 'none' }} data-network-control="true" onClick={() => setSelectedId(member.id)}>
                <span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small>
              </button>;
            })}

            <div className="deeperHint" style={{ left: 228, top: 826, opacity: thirdGenerationProgress }} aria-hidden="true"><span>•••</span><b>more generations</b></div>
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
        <span><b>왼쪽</b> 성장 중인 네트워크</span>
        <span><b>오른쪽</b> 아직 비어 있는 초대 자리</span>
        <span><b>빛 흐름</b> YOU → 빈 슬롯 방향 안내</span>
      </section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem;line-height:1.35}.notice small{text-align:right;max-width:220px}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{height:62px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.045)}.topBar>div:first-child{display:grid;gap:2px}.topBar>div:first-child span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.topBar h1{margin:0;font-size:.91rem;color:#f5f1e8}.totals{display:flex;align-items:baseline;gap:4px;color:#6f6a62;font-size:.46rem;white-space:nowrap}.totals b{color:#d8d1c5;font-size:.66rem}.totals i{width:1px;height:9px;margin:0 3px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(560px,72svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.06),transparent 33%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.06) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.45),transparent 86%)}.hud{position:absolute;z-index:6;top:10px;left:10px;display:flex;align-items:center;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.72);backdrop-filter:blur(8px);pointer-events:none}.hud span{font-size:.49rem;color:#aaa296}.hud small{font-size:.47rem;color:#786c51}.gestureHint{position:absolute;z-index:7;top:42px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:11px;background:rgba(12,11,8,.88);box-shadow:0 10px 30px rgba(0,0,0,.24);pointer-events:none;animation:hintOut 5.6s ease forwards}.gestureHint b{color:#d6ac48;font-size:.8rem}.gestureHint span{font-size:.53rem;line-height:1.35;color:#938a7b}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.mainEdge,.branchEdge{fill:none;stroke-linecap:round}.mainEdge{stroke-width:1.5}.activeEdge{stroke:rgba(225,194,115,.42)}.emptyEdge{stroke:rgba(244,183,40,.34);stroke-dasharray:3 5}.branchEdge{stroke:rgba(209,196,161,.34);stroke-width:1.25}.flowParticle{pointer-events:none}.person,.emptySlot{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;outline:0;font:inherit}.person{width:80px;min-height:72px;padding:0;background:transparent;color:#e9e3d8;display:grid;justify-items:center;gap:4px}.avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#17150f;border:1px solid rgba(226,193,111,.34);color:#d8b75c;font-size:.48rem;box-shadow:0 5px 18px rgba(0,0,0,.24)}.person b{font-size:.52rem;font-weight:700;white-space:nowrap}.person small{font-size:.45rem;color:#7f786f}.person.root .avatar{width:44px;height:44px;background:#201b10;border-color:rgba(244,183,40,.58);box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 24px rgba(0,0,0,.28)}.person.root b{font-size:.64rem;color:#f2d98f}.person.active .avatar{border-color:rgba(244,183,40,.64);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 8px 24px rgba(0,0,0,.3)}.emptySlot{width:96px;height:96px;border-radius:50%;border:1.5px dashed rgba(244,183,40,.52);background:rgba(244,183,40,.035);color:#e7c46c;display:grid;place-items:center;align-content:center;gap:4px;box-shadow:0 0 0 7px rgba(244,183,40,.018)}.slotPlus{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(244,183,40,.09);font-size:1.22rem;line-height:1;color:#f2ca65}.emptySlot b{font-size:.57rem}.emptySlot small{font-size:.43rem;color:#887a5b}.slotPulse{position:absolute;inset:-1px;border-radius:50%;border:1px solid rgba(244,183,40,.28);animation:slotPulse 2.8s ease-out infinite;pointer-events:none}.growthSummary{position:absolute;z-index:2;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:2px;pointer-events:none;transition:opacity .08s linear}.growthSummary .stack{position:relative;width:34px;height:24px}.growthSummary .stack i{position:absolute;width:25px;height:18px;border:1px solid rgba(207,190,151,.2);border-radius:50%;background:#11100c}.growthSummary .stack i:nth-child(1){left:0;top:5px}.growthSummary .stack i:nth-child(2){left:5px;top:2px}.growthSummary .stack i:nth-child(3){left:9px;top:0;border-color:rgba(244,183,40,.3)}.growthSummary b{font-size:.6rem;color:#cdb36f}.growthSummary small{font-size:.43rem;color:#746d62}.deeperHint{position:absolute;z-index:2;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;color:#766f62;pointer-events:none}.deeperHint span{font-size:.75rem;letter-spacing:.18em}.deeperHint b{font-size:.43rem;font-weight:600}.slotCard{position:absolute;z-index:12;left:12px;right:12px;bottom:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(16,15,12,.96);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(12px)}.slotCard>div{display:flex;align-items:center;gap:9px}.slotCard>div>div{display:grid;gap:2px;min-width:0}.slotCard strong{font-size:.65rem;color:#efe8db}.slotCard small{font-size:.49rem;color:#817a70}.slotCard button{margin-left:auto;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8e877c}.slotCard p{margin:9px 0 0;font-size:.5rem;line-height:1.45;color:#91887a}.cardPlus,.cardAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(244,183,40,.08);border:1px solid rgba(244,183,40,.2);color:#d8b457}.controls{position:absolute;z-index:10;right:10px;bottom:10px;display:grid;gap:6px}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.88);color:#bcb3a5;font-size:.75rem;box-shadow:0 8px 24px rgba(0,0,0,.2)}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}@keyframes slotPulse{0%,45%{transform:scale(.98);opacity:0}58%{opacity:.75}100%{transform:scale(1.13);opacity:0}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}@media(max-width:430px){.notice small{display:none}.topBar{padding:0 11px}.totals span:last-child{display:none}.tips{grid-template-columns:1fr}.tips span{padding:6px}.stage{height:clamp(560px,73svh,700px)}}@media(prefers-reduced-motion:reduce){.slotPulse,.gestureHint{animation:none}.flowParticle{display:none}.emptySlot{box-shadow:0 0 0 7px rgba(244,183,40,.025),0 0 22px rgba(244,183,40,.055)}}
      `}</style>
    </main>
  );
}
