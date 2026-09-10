'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerInfo = { point: Point; interactive: boolean };
type Member = { id: string; wallet: string; x: number; y: number; network: number };

const WORLD_W = 760;
const WORLD_H = 1000;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.62;
const ROOT_VIEW: View = { x: 0, y: 42, scale: 0.88 };
const ROOT = { x: 380, y: 120 };
const COLLAPSED_COUNT = 15;
const REVEALED_COUNT = 5;
const REMAINING_COUNT = COLLAPSED_COUNT - REVEALED_COUNT;
const EXPAND_AT = 1.30;
const COLLAPSE_AT = 1.14;

const members: Member[] = [
  { id: 'a', wallet: '0xA100...001', x: 226, y: 286, network: 18 },
  { id: 'a1', wallet: '0xA110...011', x: 110, y: 470, network: 7 },
  { id: 'a2', wallet: '0xA120...012', x: 226, y: 470, network: 5 },
  { id: 'a3', wallet: '0xA130...013', x: 342, y: 470, network: 3 },
  { id: 'a11', wallet: '0xA111...111', x: 70, y: 690, network: 2 },
  { id: 'a12', wallet: '0xA112...112', x: 152, y: 690, network: 1 },
  { id: 'a21', wallet: '0xA121...121', x: 224, y: 690, network: 1 },
  { id: 'a22', wallet: '0xA122...122', x: 298, y: 690, network: 1 },
  { id: 'a31', wallet: '0xA131...131', x: 372, y: 690, network: 0 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}

export function QaNetworkEmptyStateV8() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>(ROOT_VIEW);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [history, setHistory] = useState<View[]>([]);
  const [continuationExpanded, setContinuationExpanded] = useState(false);

  const secondGenerationProgress = smoothStep(0.78, 1.04, view.scale);

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
    const timer = window.setTimeout(() => setShowHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
  }, []);

  // Hysteresis: expand later than we collapse so a tiny pinch around the boundary
  // never makes +N and the detailed network flicker against each other.
  useEffect(() => {
    if (!continuationExpanded && view.scale >= EXPAND_AT) setContinuationExpanded(true);
    if (continuationExpanded && view.scale <= COLLAPSE_AT) setContinuationExpanded(false);
  }, [continuationExpanded, view.scale]);

  const stopCameraAnimation = useCallback(() => {
    if (cameraTimerRef.current) {
      window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    setCameraMoving(false);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(170, WORLD_W * scale * 0.58);
    const minY = Math.min(-170, stageSize.height * 0.46 - WORLD_H * scale);
    const maxY = Math.max(210, stageSize.height * 0.42);
    return {
      scale,
      x: clamp(next.x, -horizontalReach, horizontalReach),
      y: clamp(next.y, minY, maxY),
    };
  }, [stageSize.height]);

  const animateTo = useCallback((next: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(clampView(next));
    cameraTimerRef.current = window.setTimeout(() => {
      cameraTimerRef.current = null;
      setCameraMoving(false);
    }, 470);
  }, [clampView]);

  const focusWorldPoint = useCallback((point: Point, scale: number, anchorY = stageSize.height * 0.42) => {
    const x = -(point.x - WORLD_W / 2) * scale;
    const y = anchorY - point.y * scale;
    animateTo({ x, y, scale });
  }, [animateTo, stageSize.height]);

  const returnToYou = useCallback(() => {
    setHistory([]);
    setSelectedId(null);
    setContinuationExpanded(false);
    animateTo(ROOT_VIEW);
  }, [animateTo]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      if (previous.scale <= COLLAPSE_AT) setContinuationExpanded(false);
      animateTo(previous);
      return current.slice(0, -1);
    });
    setSelectedId(null);
  }, [animateTo]);

  const openContinuation = useCallback(() => {
    if (continuationExpanded) return;
    setHistory((current) => [...current.slice(-3), view]);
    setSelectedId(null);
    setShowHint(false);
    setContinuationExpanded(true);
    focusWorldPoint({ x: 226, y: 610 }, Math.max(1.36, view.scale), stageSize.height * 0.40);
  }, [continuationExpanded, focusWorldPoint, stageSize.height, view]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShowHint(false);
    stopCameraAnimation();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return clampView({ scale, x: px - worldX * scale, y: py - worldY * scale });
    });
  }, [clampView, stopCameraAnimation]);

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
    stopCameraAnimation();
    if (!interactive) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* browser fallback */ }
    }
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
      setView((current) => clampView({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }));
      previousPointRef.current = point;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistanceRef.current) zoomAroundPoint((a.x + b.x) / 2, (a.y + b.y) / 2, view.scale * (distance / pinchDistanceRef.current));
      pinchDistanceRef.current = distance;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* browser fallback */ }
    if (pointersRef.current.size === 1) {
      previousPointRef.current = [...pointersRef.current.values()][0].point;
      pinchDistanceRef.current = null;
    } else if (pointersRef.current.size === 0) {
      previousPointRef.current = null;
      pinchDistanceRef.current = null;
    }
  };

  const selected = members.find((member) => member.id === selectedId) ?? null;

  const sharedStem = 'M380 160 C380 171 380 181 380 191';
  const activeBranch = 'M380 191 C352 195 323 208 292 226 C268 239 247 244 226 247';
  const emptyBranch = 'M380 191 C408 195 437 208 468 226 C492 239 513 244 534 247';
  const emptyFlowPath = `${sharedStem} C408 195 437 208 468 226 C492 239 513 244 534 247`;

  const secondGenStem = 'M226 326 C226 337 226 347 226 356';
  const secondGenPaths = [
    'M226 356 C205 365 184 382 163 402 C144 420 127 429 110 431',
    'M226 356 C226 379 226 405 226 431',
    'M226 356 C247 365 268 382 289 402 C308 420 325 429 342 431',
  ];

  // Collapsed summary deliberately uses a different visual language from family edges.
  // It vanishes before detailed person-to-person edges become readable.
  const continuationCollectors = [
    'M110 510 C135 526 168 538 202 547',
    'M226 510 C226 524 226 537 226 547',
    'M342 510 C317 526 284 538 250 547',
  ];
  const continuationStem = 'M226 547 C226 557 226 565 226 573';

  // Expanded layer: short parent stems and local fan-outs prevent long crossing curves.
  const detailStems = [
    'M110 510 C110 522 110 533 110 543',
    'M226 510 C226 522 226 533 226 543',
    'M342 510 C342 522 342 533 342 543',
  ];
  const detailBranches = [
    'M110 543 C102 560 86 594 70 646',
    'M110 543 C118 560 136 594 152 646',
    'M226 543 C226 569 225 608 224 646',
    'M226 543 C244 563 278 601 298 646',
    'M342 543 C350 566 362 606 372 646',
  ];

  return (
    <main className="qaPage">
      <section className="notice">
        <div><strong>NETWORK EMPTY STATE · QA V8</strong><span>누적 QA · Production과 완전히 분리</span></div>
        <small>Collapsed ↔ expanded transition</small>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock"><span>NETWORK</span><h1>My Network</h1></div>
          <div className="totals" aria-label="Network summary"><span className="metric"><b>19</b><em>Members</em></span><i /><span className="metric"><b>1</b><em>Open slot</em></span></div>
        </header>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{view.scale < 1.06 ? '전체 구조' : continuationExpanded ? '상세 보기' : '세대 보기'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>핀치·휠로 확대하거나<br />+N을 눌러 아래 세대를 확인하세요</span></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''} ${continuationExpanded ? 'expanded' : 'collapsed'}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <filter id="maskBlurV8" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="25" /></filter>
                <filter id="lineGlowV8" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <mask id="movingLightMaskV8" maskUnits="userSpaceOnUse" x="328" y="116" width="266" height="178">
                  <rect x="328" y="116" width="266" height="178" fill="black" />
                  <circle r="44" fill="white" filter="url(#maskBlurV8)"><animateMotion dur="5.3s" repeatCount="indefinite" path={emptyFlowPath} keyPoints="0;0;1;1" keyTimes="0;0.09;0.65;1" calcMode="linear" /></circle>
                </mask>
              </defs>

              <path d={sharedStem} className="mainEdge stemEdge" vectorEffect="non-scaling-stroke" />
              <path d={activeBranch} className="mainEdge activeEdge" vectorEffect="non-scaling-stroke" />
              <path d={emptyBranch} className="mainEdge emptyEdge" vectorEffect="non-scaling-stroke" />
              <g className="flowIllumination" mask="url(#movingLightMaskV8)"><path d={emptyFlowPath} className="litGlow" vectorEffect="non-scaling-stroke" /><path d={emptyFlowPath} className="litCore" vectorEffect="non-scaling-stroke" /></g>

              <path d={secondGenStem} className="branchEdge branchStem" style={{ opacity: 0.31 + secondGenerationProgress * 0.19 }} vectorEffect="non-scaling-stroke" />
              {secondGenPaths.map((path, index) => <path key={path} d={path} className="branchEdge" style={{ opacity: 0.25 + secondGenerationProgress * 0.21 - index * 0.012 }} vectorEffect="non-scaling-stroke" />)}

              <g className="collectorGroup">
                {continuationCollectors.map((path) => <path key={path} d={path} className="collectorEdge" vectorEffect="non-scaling-stroke" />)}
                <path d={continuationStem} className="collectorStem" vectorEffect="non-scaling-stroke" />
              </g>

              <g className="detailEdgeGroup">
                {detailStems.map((path) => <path key={path} d={path} className="detailStem" vectorEffect="non-scaling-stroke" />)}
                {detailBranches.map((path, index) => <path key={path} d={path} className="detailBranch" style={{ transitionDelay: `${110 + index * 28}ms` }} vectorEffect="non-scaling-stroke" />)}
              </g>
            </svg>

            <button type="button" className="person root" style={{ left: ROOT.x, top: ROOT.y }} data-network-control="true" onClick={() => setSelectedId(null)}><span className="avatar">●</span><b>YOU</b><small>1 Direct · 1 Open Slot</small></button>
            <button type="button" className="person active" style={{ left: 226, top: 286 }} data-network-control="true" onClick={() => setSelectedId('a')}><span className="avatar">●</span><b>0xA100...001</b><small>18 network</small></button>
            <button type="button" className="emptySlot" style={{ left: 534, top: 286 }} data-network-control="true" onClick={() => setSelectedId('empty')}><span className="slotAvatar"><i>+</i></span><b>Available</b><small>Next invite</small><span className="slotArrival" aria-hidden="true" /></button>

            {members.slice(1, 4).map((member, index) => {
              const progress = clamp(0.68 + secondGenerationProgress * 0.4 - index * 0.035, 0, 1);
              return <button key={member.id} type="button" className="person child" style={{ left: member.x, top: member.y, opacity: progress, transform: `translate(-50%,-50%) scale(${0.88 + progress * 0.12})`, pointerEvents: progress > 0.5 ? 'auto' : 'none' }} data-network-control="true" onClick={() => setSelectedId(member.id)}><span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small></button>;
            })}

            <button type="button" className="continuation continuationPrimary" style={{ left: 226, top: 608, pointerEvents: continuationExpanded ? 'none' : 'auto' }} data-network-control="true" onClick={openContinuation} aria-label={`${COLLAPSED_COUNT} more people below. Expand network`}>
              <span className="continuationIcon" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M14 6v5M7 19v-3c0-2 1.6-3.5 3.5-3.5h7C19.4 12.5 21 14 21 16v3" /><circle cx="14" cy="5" r="2.2" /><circle cx="7" cy="21" r="2.2" /><circle cx="21" cy="21" r="2.2" /></svg></span>
              <b>+{COLLAPSED_COUNT}</b><small>more below</small>
            </button>

            {members.slice(4).map((member, index) => (
              <button key={member.id} type="button" className="person child mini detailPerson" style={{ left: member.x, top: member.y, opacity: continuationExpanded ? 1 : 0, transform: `translate(-50%,-50%) scale(${continuationExpanded ? 1 : 0.88})`, pointerEvents: continuationExpanded ? 'auto' : 'none', transitionDelay: `${100 + index * 34}ms` }} data-network-control="true" onClick={() => setSelectedId(member.id)}><span className="avatar">●</span><b>{member.wallet}</b><small>{member.network} network</small></button>
            ))}

            <div className="remainingSummary" style={{ left: 226, top: 824, opacity: continuationExpanded ? 1 : 0, transform: `translate(-50%,-50%) scale(${continuationExpanded ? 1 : 0.9})` }} aria-label={`${REMAINING_COUNT} additional people remain collapsed below`}>
              <span className="remainingLine" aria-hidden="true" />
              <b>+{REMAINING_COUNT}</b><small>more below</small>
            </div>
          </div>

          {selectedId === 'empty' ? <aside className="slotCard" data-network-control="true"><div><span className="cardPlus">+</span><div><strong>Available invite slot</strong><small>Your next invited friend will appear here.</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div><p>초대가 확정되면 같은 위치에서 빈 슬롯이 실제 사용자 노드로 자연스럽게 전환됩니다.</p><button type="button" className="inviteCta">Invite a friend</button></aside> : null}
          {selected ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{selected.wallet}</strong><small>{selected.network} network members</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div><p>실제 사용자 노드입니다. 확대 시 요약 연결선은 사라지고 실제 사람 간 연결선만 남습니다.</p></aside> : null}

          <div className="controls" data-network-control="true">
            <button type="button" className="youButton" aria-label="Return to YOU" onClick={returnToYou}><span>◎</span><b>YOU</b></button>
            <button type="button" className="zoomControl" aria-label="확대" onClick={() => setView((current) => clampView({ ...current, scale: current.scale + 0.16 }))}>+</button>
            <button type="button" className="zoomControl" aria-label="축소" onClick={() => setView((current) => clampView({ ...current, scale: current.scale - 0.16 }))}>−</button>
          </div>
        </div>
      </section>

      <section className="tips"><span><b>Crossfade</b>+15·요약선이 먼저 사라짐</span><span><b>Real edges</b>실제 사람 선만 뒤이어 등장</span><span><b>Hysteresis</b>줌 경계에서 깜빡임 방지</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem}.notice small{text-align:right}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px;min-width:0}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem;color:#f5f1e8}.totals{display:flex;align-items:center;gap:7px;flex:0 0 auto}.metric{display:flex;align-items:baseline;gap:3px;white-space:nowrap}.metric b{color:#d8d1c5;font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.43rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}
        .stage{position:relative;height:clamp(560px,72svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 20%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.05) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 88%)}.hud{position:absolute;z-index:7;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.76);pointer-events:none}.hud span{font-size:.49rem;color:#aaa296}.hud small{font-size:.47rem;color:#786c51}.backNetwork{position:absolute;z-index:9;top:10px;right:10px;height:29px;padding:0 10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(12,12,9,.9);color:#c5bdaf;font-size:.5rem}.backNetwork span{margin-left:3px}.gestureHint{position:absolute;z-index:7;top:42px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:11px;background:rgba(12,11,8,.88);pointer-events:none;animation:hintOut 5s ease forwards}.gestureHint b{color:#d6ac48}.gestureHint span{font-size:.53rem;line-height:1.35;color:#938a7b}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform .44s cubic-bezier(.22,.78,.22,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.mainEdge,.branchEdge,.collectorEdge,.collectorStem,.detailStem,.detailBranch,.litGlow,.litCore{fill:none;stroke-linecap:round;stroke-linejoin:round}.mainEdge{stroke-width:1.25}.stemEdge{stroke:rgba(231,205,140,.28)}.activeEdge{stroke:rgba(225,194,115,.33)}.emptyEdge{stroke:rgba(244,183,40,.14)}.branchEdge{stroke:rgba(209,196,161,.26);stroke-width:1.02}.branchStem{stroke:rgba(220,202,158,.29)}.collectorGroup{opacity:1;transition:opacity .18s ease}.world.expanded .collectorGroup{opacity:0}.collectorEdge{stroke:rgba(198,184,148,.17);stroke-width:.8}.collectorStem{stroke:rgba(206,187,143,.22);stroke-width:.84;stroke-dasharray:1.2 5}.detailEdgeGroup{opacity:0;transition:opacity .26s ease .10s}.world.expanded .detailEdgeGroup{opacity:1}.detailStem,.detailBranch{stroke:rgba(215,201,167,.27);stroke-width:.92;transition:opacity .22s ease}.detailStem{stroke:rgba(220,205,169,.31)}.flowIllumination{opacity:0;animation:illuminationCycle 5.3s ease-in-out infinite}.litGlow{stroke:rgba(244,183,40,.28);stroke-width:5;filter:url(#lineGlowV8)}.litCore{stroke:rgba(255,232,165,.88);stroke-width:1.28}
        .person,.emptySlot,.continuation{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;outline:0;font:inherit}.person{width:82px;min-height:72px;padding:0;background:transparent;color:#e9e3d8;display:grid;justify-items:center;gap:4px}.avatar,.slotAvatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#17150f;border:1px solid rgba(226,193,111,.34);color:#d8b75c;font-size:.48rem}.person b,.emptySlot b{font-size:.52rem;font-weight:700;white-space:nowrap}.person small,.emptySlot small{font-size:.45rem;color:#7f786f;white-space:nowrap}.person.root{width:118px}.person.root .avatar{width:44px;height:44px;background:#201b10;border-color:rgba(244,183,40,.58);box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 24px rgba(0,0,0,.28)}.person.root b{font-size:.64rem;color:#f2d98f}.person.root small{transform:translateY(-1px)}.person.active .avatar{border-color:rgba(244,183,40,.64);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 8px 24px rgba(0,0,0,.3)}.emptySlot{width:84px;min-height:76px;padding:0;background:transparent;color:#e7c46c;display:grid;justify-items:center;gap:4px}.slotAvatar{position:relative;border-style:dashed;border-color:rgba(244,183,40,.5);background:rgba(244,183,40,.028);box-shadow:0 0 0 6px rgba(244,183,40,.014)}.slotAvatar i{font-style:normal;font-size:1.1rem;color:#f2ca65}.slotArrival{position:absolute;top:0;left:50%;width:44px;height:44px;transform:translate(-50%,0);border-radius:50%;border:1px solid rgba(244,183,40,.28);opacity:0;pointer-events:none;animation:slotArrivalV8 5.3s ease-in-out infinite}
        .continuation{width:108px;min-height:76px;padding:5px;background:transparent;color:#cdb36f;display:grid;justify-items:center;gap:2px}.continuationPrimary{opacity:1;transition:opacity .18s ease,transform .20s ease}.world.expanded .continuationPrimary{opacity:0;transform:translate(-50%,-50%) scale(.9)}.continuationIcon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.2);background:linear-gradient(145deg,rgba(244,183,40,.05),rgba(244,183,40,.012));box-shadow:0 0 0 4px rgba(244,183,40,.012)}.continuationIcon svg{width:21px;height:21px;fill:none;stroke:#c9aa58;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}.continuationIcon svg circle{fill:#c9aa58;stroke:none}.continuation b{font-size:.64rem;color:#d6b65f}.continuation small{font-size:.42rem;color:#746c60}.continuation:active .continuationIcon{transform:scale(.96)}.detailPerson{transition:opacity .24s ease,transform .28s cubic-bezier(.22,.78,.22,1)}.remainingSummary{position:absolute;z-index:2;width:92px;display:grid;justify-items:center;gap:2px;color:#a99058;pointer-events:none;transition:opacity .24s ease .30s,transform .28s ease .30s}.remainingSummary .remainingLine{width:1px;height:18px;margin-bottom:2px;background:linear-gradient(to bottom,rgba(196,182,146,.04),rgba(196,182,146,.22));border-radius:1px}.remainingSummary b{font-size:.61rem}.remainingSummary small{font-size:.41rem;color:#716a60}
        .slotCard{position:absolute;z-index:12;left:12px;right:12px;bottom:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(16,15,12,.96);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(12px)}.slotCard>div{display:flex;align-items:center;gap:9px}.slotCard>div>div{display:grid;gap:2px;min-width:0}.slotCard strong{font-size:.65rem;color:#efe8db}.slotCard small{font-size:.49rem;color:#817a70}.slotCard>div>button{margin-left:auto;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8e877c}.slotCard p{margin:9px 0 0;font-size:.5rem;line-height:1.45;color:#91887a}.cardPlus,.cardAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(244,183,40,.08);border:1px solid rgba(244,183,40,.2);color:#d8b457}.inviteCta{margin-top:10px;width:100%;height:32px;border:1px solid rgba(244,183,40,.18);border-radius:9px;background:rgba(244,183,40,.08);color:#d8b457;font-size:.52rem;font-weight:700}
        .controls{position:absolute;z-index:10;right:10px;bottom:max(10px,env(safe-area-inset-bottom));display:grid;gap:6px;justify-items:end}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.9);color:#bcb3a5;font-size:.75rem}.controls .youButton{width:auto;min-width:58px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border-color:rgba(244,183,40,.12);color:#ceb668}.youButton span{font-size:.72rem}.youButton b{font-size:.48rem;letter-spacing:.04em}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}
        @keyframes illuminationCycle{0%,7%{opacity:0}12%,62%{opacity:1}70%,100%{opacity:0}}@keyframes slotArrivalV8{0%,59%{transform:translate(-50%,0) scale(.97);opacity:0}66%{opacity:.46}74%{transform:translate(-50%,0) scale(1.1);opacity:0}100%{opacity:0}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}
        @media(max-width:430px){.notice small{display:none}.topBar{padding:8px 11px}.metric em{font-size:.39rem}.totals{gap:5px}.tips{grid-template-columns:1fr}.tips span{padding:6px}.stage{height:clamp(560px,73svh,700px)}.controls .zoomControl{display:none}}
        @media(prefers-reduced-motion:reduce){.gestureHint,.flowIllumination,.slotArrival{animation:none}.flowIllumination{display:none}.world.cameraMoving,.collectorGroup,.detailEdgeGroup,.continuationPrimary,.detailPerson,.remainingSummary{transition:none}.slotAvatar{box-shadow:0 0 0 6px rgba(244,183,40,.02),0 0 18px rgba(244,183,40,.04)}}
      `}</style>
    </main>
  );
}
