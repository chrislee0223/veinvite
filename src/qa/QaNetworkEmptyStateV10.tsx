'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerInfo = { point: Point; interactive: boolean };
type Member = { id: string; wallet: string; x: number; y: number; network: number; depth: number; parentId?: string; group?: string };
type HistoryEntry = { view: View; focusGroup: string | null };

const WORLD_W = 980;
const WORLD_H = 1140;
const MIN_SCALE = 0.70;
const MAX_SCALE = 1.76;
const ROOT_VIEW: View = { x: 0, y: 42, scale: 0.86 };
const ROOT = { x: 490, y: 120 };
const ACTIVE = { x: 315, y: 286 };
const EMPTY = { x: 665, y: 286 };
const DETAIL_EXPAND_AT = 1.26;
const DETAIL_COLLAPSE_AT = 1.10;
const DEEP_EXPAND_AT = 1.50;
const DEEP_COLLAPSE_AT = 1.36;

const generation2: Member[] = [
  { id: 'a1', wallet: '0xA110...011', x: 105, y: 470, network: 8, depth: 2, parentId: 'a', group: 'a1' },
  { id: 'a2', wallet: '0xA120...012', x: 210, y: 470, network: 7, depth: 2, parentId: 'a', group: 'a2' },
  { id: 'a3', wallet: '0xA130...013', x: 315, y: 470, network: 7, depth: 2, parentId: 'a', group: 'a3' },
  { id: 'a4', wallet: '0xA140...014', x: 420, y: 470, network: 6, depth: 2, parentId: 'a', group: 'a4' },
  { id: 'a5', wallet: '0xA150...015', x: 525, y: 470, network: 5, depth: 2, parentId: 'a', group: 'a5' },
];

const generation3: Member[] = [
  { id: 'b11', wallet: '0xB111...101', x: 54, y: 690, network: 2, depth: 3, parentId: 'a1', group: 'a1' },
  { id: 'b12', wallet: '0xB112...102', x: 105, y: 690, network: 0, depth: 3, parentId: 'a1', group: 'a1' },
  { id: 'b13', wallet: '0xB113...103', x: 156, y: 690, network: 1, depth: 3, parentId: 'a1', group: 'a1' },
  { id: 'b21', wallet: '0xB121...201', x: 177, y: 690, network: 0, depth: 3, parentId: 'a2', group: 'a2' },
  { id: 'b22', wallet: '0xB122...202', x: 216, y: 690, network: 0, depth: 3, parentId: 'a2', group: 'a2' },
  { id: 'b23', wallet: '0xB123...203', x: 255, y: 690, network: 1, depth: 3, parentId: 'a2', group: 'a2' },
  { id: 'b24', wallet: '0xB124...204', x: 294, y: 690, network: 0, depth: 3, parentId: 'a2', group: 'a2' },
  { id: 'b31', wallet: '0xB131...301', x: 315, y: 690, network: 2, depth: 3, parentId: 'a3', group: 'a3' },
  { id: 'b32', wallet: '0xB132...302', x: 354, y: 690, network: 0, depth: 3, parentId: 'a3', group: 'a3' },
  { id: 'b33', wallet: '0xB133...303', x: 393, y: 690, network: 0, depth: 3, parentId: 'a3', group: 'a3' },
  { id: 'b34', wallet: '0xB134...304', x: 432, y: 690, network: 1, depth: 3, parentId: 'a3', group: 'a3' },
  { id: 'b41', wallet: '0xB141...401', x: 453, y: 690, network: 0, depth: 3, parentId: 'a4', group: 'a4' },
  { id: 'b42', wallet: '0xB142...402', x: 504, y: 690, network: 2, depth: 3, parentId: 'a4', group: 'a4' },
  { id: 'b43', wallet: '0xB143...403', x: 555, y: 690, network: 0, depth: 3, parentId: 'a4', group: 'a4' },
  { id: 'b51', wallet: '0xB151...501', x: 576, y: 690, network: 0, depth: 3, parentId: 'a5', group: 'a5' },
  { id: 'b52', wallet: '0xB152...502', x: 615, y: 690, network: 2, depth: 3, parentId: 'a5', group: 'a5' },
  { id: 'b53', wallet: '0xB153...503', x: 654, y: 690, network: 0, depth: 3, parentId: 'a5', group: 'a5' },
  { id: 'b54', wallet: '0xB154...504', x: 693, y: 690, network: 0, depth: 3, parentId: 'a5', group: 'a5' },
];

const generation4: Member[] = [
  { id: 'c111', wallet: '0xC111...111', x: 34, y: 900, network: 0, depth: 4, parentId: 'b11', group: 'a1' },
  { id: 'c112', wallet: '0xC112...112', x: 74, y: 900, network: 0, depth: 4, parentId: 'b11', group: 'a1' },
  { id: 'c131', wallet: '0xC131...131', x: 156, y: 900, network: 0, depth: 4, parentId: 'b13', group: 'a1' },
  { id: 'c231', wallet: '0xC231...231', x: 255, y: 900, network: 0, depth: 4, parentId: 'b23', group: 'a2' },
  { id: 'c311', wallet: '0xC311...311', x: 295, y: 900, network: 0, depth: 4, parentId: 'b31', group: 'a3' },
  { id: 'c312', wallet: '0xC312...312', x: 335, y: 900, network: 0, depth: 4, parentId: 'b31', group: 'a3' },
  { id: 'c341', wallet: '0xC341...341', x: 432, y: 900, network: 0, depth: 4, parentId: 'b34', group: 'a3' },
  { id: 'c421', wallet: '0xC421...421', x: 484, y: 900, network: 0, depth: 4, parentId: 'b42', group: 'a4' },
  { id: 'c422', wallet: '0xC422...422', x: 524, y: 900, network: 0, depth: 4, parentId: 'b42', group: 'a4' },
  { id: 'c521', wallet: '0xC521...521', x: 595, y: 900, network: 0, depth: 4, parentId: 'b52', group: 'a5' },
  { id: 'c522', wallet: '0xC522...522', x: 635, y: 900, network: 0, depth: 4, parentId: 'b52', group: 'a5' },
];

const activeMember: Member = { id: 'a', wallet: '0xA100...001', x: ACTIVE.x, y: ACTIVE.y, network: 33, depth: 1, group: 'a' };
const members = [activeMember, ...generation2, ...generation3, ...generation4];
const memberById = new Map(members.map((member) => [member.id, member]));
const childrenByParent = new Map<string, Member[]>();
for (const member of members) {
  if (!member.parentId) continue;
  const list = childrenByParent.get(member.parentId) ?? [];
  list.push(member);
  childrenByParent.set(member.parentId, list);
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}
function continuationPath(x: number, startY: number, length = 62) {
  const endY = startY + length;
  return `M${x} ${startY} C${x} ${startY + 14} ${x} ${endY - 11} ${x} ${endY}`;
}
function childEdge(parent: Member, child: Member) {
  const sy = parent.y + 40;
  const ey = child.y - 40;
  const mid = sy + (ey - sy) * 0.42;
  return `M${parent.x} ${sy} C${parent.x} ${mid} ${child.x} ${mid} ${child.x} ${ey}`;
}

export function QaNetworkEmptyStateV10() {
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [deepExpanded, setDeepExpanded] = useState(false);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);

  const secondGenerationProgress = smoothStep(0.76, 1.02, view.scale);
  const showG2Labels = view.scale >= 0.96;
  const showG3Labels = view.scale >= 1.38;
  const showG4Labels = view.scale >= 1.58;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => { if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current); }, []);

  useEffect(() => {
    if (!detailsExpanded && view.scale >= DETAIL_EXPAND_AT) setDetailsExpanded(true);
    if (detailsExpanded && view.scale <= DETAIL_COLLAPSE_AT) {
      setDetailsExpanded(false);
      setDeepExpanded(false);
    }
  }, [detailsExpanded, view.scale]);

  useEffect(() => {
    if (!focusGroup) { if (deepExpanded) setDeepExpanded(false); return; }
    if (!deepExpanded && view.scale >= DEEP_EXPAND_AT) setDeepExpanded(true);
    if (deepExpanded && view.scale <= DEEP_COLLAPSE_AT) setDeepExpanded(false);
  }, [deepExpanded, focusGroup, view.scale]);

  const stopCameraAnimation = useCallback(() => {
    if (cameraTimerRef.current) { window.clearTimeout(cameraTimerRef.current); cameraTimerRef.current = null; }
    setCameraMoving(false);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(220, WORLD_W * scale * 0.62);
    const minY = Math.min(-220, stageSize.height * 0.46 - WORLD_H * scale);
    const maxY = Math.max(220, stageSize.height * 0.42);
    return { scale, x: clamp(next.x, -horizontalReach, horizontalReach), y: clamp(next.y, minY, maxY) };
  }, [stageSize.height]);

  const animateTo = useCallback((next: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(clampView(next));
    cameraTimerRef.current = window.setTimeout(() => { cameraTimerRef.current = null; setCameraMoving(false); }, 470);
  }, [clampView]);

  const focusWorldPoint = useCallback((point: Point, scale: number, anchorY = stageSize.height * 0.40) => {
    animateTo({ x: -(point.x - WORLD_W / 2) * scale, y: anchorY - point.y * scale, scale });
  }, [animateTo, stageSize.height]);

  const returnToYou = useCallback(() => {
    setHistory([]); setSelectedId(null); setFocusGroup(null); setDetailsExpanded(false); setDeepExpanded(false); animateTo(ROOT_VIEW);
  }, [animateTo]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setFocusGroup(previous.focusGroup);
      if (previous.view.scale <= DETAIL_COLLAPSE_AT) setDetailsExpanded(false);
      if (previous.view.scale <= DEEP_COLLAPSE_AT) setDeepExpanded(false);
      animateTo(previous.view);
      return current.slice(0, -1);
    });
    setSelectedId(null);
  }, [animateTo]);

  const focusSelectedBranch = useCallback((member: Member) => {
    const group = member.depth === 2 ? member.id : member.group;
    if (!group || group === 'a') return;
    const root = generation2.find((item) => item.id === group);
    if (!root) return;
    setHistory((current) => [...current.slice(-4), { view, focusGroup }]);
    setFocusGroup(group);
    setSelectedId(null);
    setShowHint(false);
    setDetailsExpanded(true);
    focusWorldPoint({ x: root.x, y: 600 }, Math.max(1.40, view.scale), stageSize.height * 0.40);
  }, [focusGroup, focusWorldPoint, stageSize.height, view]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShowHint(false); stopCameraAnimation();
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
    setShowHint(false); stopCameraAnimation();
    if (!interactive) { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fallback */ } }
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
      if (!previous) { previousPointRef.current = point; return; }
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
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* fallback */ }
    if (pointersRef.current.size === 1) { previousPointRef.current = [...pointersRef.current.values()][0].point; pinchDistanceRef.current = null; }
    else if (pointersRef.current.size === 0) { previousPointRef.current = null; pinchDistanceRef.current = null; }
  };

  const selected = selectedId ? memberById.get(selectedId) ?? null : null;
  const detailEdges = useMemo(() => generation3.map((child) => ({ child, parent: memberById.get(child.parentId || '')! })).filter((item) => item.parent), []);
  const deepEdges = useMemo(() => generation4.map((child) => ({ child, parent: memberById.get(child.parentId || '')! })).filter((item) => item.parent), []);
  const activeStem = 'M315 326 C315 340 315 350 315 360';
  const rootStem = 'M490 162 C490 174 490 184 490 194';
  const activeBranch = 'M490 194 C454 198 416 211 379 230 C353 243 333 248 315 249';
  const emptyBranch = 'M490 194 C526 198 564 211 601 230 C627 243 647 248 665 249';
  const emptyFlowPath = `${rootStem} C526 198 564 211 601 230 C627 243 647 248 665 249`;

  return (
    <main className="qaPage">
      <section className="notice"><div><strong>NETWORK STRESS TEST · QA V10</strong><span>v9 누적 · 34-member dense fixture</span></div><small>No +N · semantic zoom</small></section>
      <section className="networkShell">
        <header className="topBar"><div className="titleBlock"><span>NETWORK</span><h1>My Network</h1></div><div className="totals"><span className="metric"><b>34</b><em>Members</em></span><i /><span className="metric"><b>1</b><em>Open slot</em></span></div></header>
        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{focusGroup ? `${focusGroup.toUpperCase()} 가지` : detailsExpanded ? '상세 보기' : '전체 구조'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>선이 이어진 곳은 아래 세대가 있습니다.<br />확대하면 필요한 정보만 단계적으로 나타납니다.</span></div> : null}
          <div className={`world ${cameraMoving ? 'cameraMoving' : ''} ${detailsExpanded ? 'expanded' : 'collapsed'} ${deepExpanded ? 'deepExpanded' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <filter id="maskBlurV10" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="25" /></filter>
                <filter id="lineGlowV10" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <linearGradient id="continuationFadeV10" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(211,198,165,.31)" /><stop offset="55%" stopColor="rgba(211,198,165,.18)" /><stop offset="100%" stopColor="rgba(211,198,165,0)" /></linearGradient>
                <mask id="movingLightMaskV10" maskUnits="userSpaceOnUse" x="430" y="118" width="300" height="180"><rect x="430" y="118" width="300" height="180" fill="black" /><circle r="44" fill="white" filter="url(#maskBlurV10)"><animateMotion dur="5.3s" repeatCount="indefinite" path={emptyFlowPath} keyPoints="0;0;1;1" keyTimes="0;0.09;0.65;1" calcMode="linear" /></circle></mask>
              </defs>
              <path d={rootStem} className="mainEdge stemEdge" vectorEffect="non-scaling-stroke" /><path d={activeBranch} className="mainEdge activeEdge" vectorEffect="non-scaling-stroke" /><path d={emptyBranch} className="mainEdge emptyEdge" vectorEffect="non-scaling-stroke" />
              <g className="flowIllumination" mask="url(#movingLightMaskV10)"><path d={emptyFlowPath} className="litGlow" vectorEffect="non-scaling-stroke" /><path d={emptyFlowPath} className="litCore" vectorEffect="non-scaling-stroke" /></g>
              <path d={activeStem} className="branchEdge branchStem" style={{ opacity: 0.30 + secondGenerationProgress * 0.2 }} vectorEffect="non-scaling-stroke" />
              {generation2.map((child, index) => {
                const endY = child.y - 40; const mid = 360 + (endY - 360) * 0.42; const path = `M315 360 C315 ${mid} ${child.x} ${mid} ${child.x} ${endY}`;
                const dim = focusGroup && focusGroup !== child.id ? 0.30 : 1;
                return <path key={child.id} d={path} className="branchEdge" style={{ opacity: (0.22 + secondGenerationProgress * 0.24 - index * 0.006) * dim }} vectorEffect="non-scaling-stroke" />;
              })}
              <g className="level2ContinuationGroup">{generation2.map((member) => <path key={member.id} d={continuationPath(member.x, member.y + 40)} className="continuationTail" style={{ opacity: focusGroup && focusGroup !== member.id ? .25 : 1 }} vectorEffect="non-scaling-stroke" />)}</g>
              <g className="detailEdgeGroup">{detailEdges.map(({ parent, child }, index) => {
                const dim = focusGroup && focusGroup !== child.group ? 0.24 : 1;
                return <path key={child.id} d={childEdge(parent, child)} className="detailBranch" style={{ opacity: dim, transitionDelay: `${90 + index * 12}ms` }} vectorEffect="non-scaling-stroke" />;
              })}</g>
              <g className="level3ContinuationGroup">{generation3.filter((member) => (childrenByParent.get(member.id)?.length ?? 0) > 0).map((member) => {
                const hidden = !(deepExpanded && focusGroup === member.group);
                return <path key={member.id} d={continuationPath(member.x, member.y + 38, 58)} className="continuationTail deepTail" style={{ opacity: hidden ? (focusGroup && focusGroup !== member.group ? .22 : .82) : 0 }} vectorEffect="non-scaling-stroke" />;
              })}</g>
              <g className="deepEdgeGroup">{deepEdges.filter(({ child }) => focusGroup && child.group === focusGroup).map(({ parent, child }, index) => <path key={child.id} d={childEdge(parent, child)} className="deepBranch" style={{ transitionDelay: `${100 + index * 24}ms` }} vectorEffect="non-scaling-stroke" />)}</g>
            </svg>
            <button type="button" className="person root" style={{ left: ROOT.x, top: ROOT.y }} data-network-control="true" onClick={() => setSelectedId(null)}><span className="avatar">●</span><b>YOU</b><small>1 Direct · 1 Open Slot</small></button>
            <button type="button" className="person active" style={{ left: ACTIVE.x, top: ACTIVE.y }} data-network-control="true" onClick={() => setSelectedId('a')}><span className="avatar">●</span><b>{activeMember.wallet}</b><small>{activeMember.network} network</small></button>
            <button type="button" className="emptySlot" style={{ left: EMPTY.x, top: EMPTY.y }} data-network-control="true" onClick={() => setSelectedId('empty')}><span className="slotAvatar"><i>+</i></span><b>Available</b><small>Next invite</small><span className="slotArrival" aria-hidden="true" /></button>
            {generation2.map((member, index) => {
              const progress = clamp(0.64 + secondGenerationProgress * 0.46 - index * 0.02, 0, 1);
              const dim = focusGroup && focusGroup !== member.id ? .34 : 1;
              return <button key={member.id} type="button" className="person child g2" style={{ left: member.x, top: member.y, opacity: progress * dim, transform: `translate(-50%,-50%) scale(${0.88 + progress * .12})` }} data-network-control="true" onClick={() => setSelectedId(member.id)}><span className="avatar">●</span>{showG2Labels ? <><b>{member.wallet}</b><small>{member.network} network</small></> : null}</button>;
            })}
            {generation3.map((member, index) => {
              const dim = focusGroup && focusGroup !== member.group ? .26 : 1;
              const visible = detailsExpanded ? 1 : 0;
              const showLabel = showG3Labels && (!focusGroup || focusGroup === member.group);
              return <button key={member.id} type="button" className="person child mini g3" style={{ left: member.x, top: member.y, opacity: visible * dim, transform: `translate(-50%,-50%) scale(${detailsExpanded ? 1 : .82})`, pointerEvents: detailsExpanded ? 'auto' : 'none', transitionDelay: `${130 + index * 12}ms` }} data-network-control="true" onClick={() => setSelectedId(member.id)}><span className="avatar">●</span>{showLabel ? <><b>{member.wallet}</b><small>{member.network ? `${member.network} network` : 'Leaf'}</small></> : null}</button>;
            })}
            {generation4.filter((member) => focusGroup && member.group === focusGroup).map((member, index) => <button key={member.id} type="button" className="person child mini g4" style={{ left: member.x, top: member.y, opacity: deepExpanded ? 1 : 0, transform: `translate(-50%,-50%) scale(${deepExpanded ? 1 : .82})`, pointerEvents: deepExpanded ? 'auto' : 'none', transitionDelay: `${150 + index * 24}ms` }} data-network-control="true" onClick={() => setSelectedId(member.id)}><span className="avatar">●</span>{showG4Labels ? <><b>{member.wallet}</b><small>Leaf</small></> : null}</button>)}
          </div>
          {selectedId === 'empty' ? <aside className="slotCard" data-network-control="true"><div><span className="cardPlus">+</span><div><strong>Available invite slot</strong><small>Your next invited friend will appear here.</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div><p>Available은 초대 가능 상태만 뜻하며, 실제 하위 세대 continuation 선과 시각 효과를 분리했습니다.</p><button type="button" className="inviteCta">Invite a friend</button></aside> : null}
          {selected ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{selected.wallet}</strong><small>{selected.network} network members</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div><p>{(childrenByParent.get(selected.id)?.length ?? 0) > 0 ? '아래 세대가 있는 노드입니다. 선이 이어지는 방향을 확대하면 실제 구조가 나타납니다.' : '현재 QA 데이터에서는 더 아래 세대가 없는 leaf 노드입니다.'}</p>{selected.depth >= 2 && selected.depth <= 3 && selected.group ? <button type="button" className="branchCta" onClick={() => focusSelectedBranch(selected)}>이 가지 자세히 보기</button> : null}</aside> : null}
          <div className="controls" data-network-control="true"><button type="button" className="youButton" aria-label="Return to YOU" onClick={returnToYou}><span>◎</span><b>YOU</b></button><button type="button" className="zoomControl" aria-label="확대" onClick={() => setView((current) => clampView({ ...current, scale: current.scale + .16 }))}>+</button><button type="button" className="zoomControl" aria-label="축소" onClick={() => setView((current) => clampView({ ...current, scale: current.scale - .16 }))}>−</button></div>
        </div>
      </section>
      <section className="tips"><span><b>34-node stress</b>밀집 상태에서도 자동 접힘 유지</span><span><b>Semantic labels</b>줌에 따라 주소·숫자를 단계적으로 노출</span><span><b>Branch focus</b>선택한 가지를 강조하고 주변은 약하게</span></section>
      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}.totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.43rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(560px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 20%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.05) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 88%)}.hud{position:absolute;z-index:7;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.76);pointer-events:none}.hud span{font-size:.49rem;color:#aaa296}.hud small{font-size:.47rem;color:#786c51}.backNetwork{position:absolute;z-index:9;top:10px;right:10px;height:29px;padding:0 10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(12,12,9,.9);color:#c5bdaf;font-size:.5rem}.gestureHint{position:absolute;z-index:7;top:42px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:11px;background:rgba(12,11,8,.88);pointer-events:none;animation:hintOut 5s ease forwards}.gestureHint b{color:#d6ac48}.gestureHint span{font-size:.53rem;line-height:1.35;color:#938a7b}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform .44s cubic-bezier(.22,.78,.22,1)}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.mainEdge,.branchEdge,.detailBranch,.deepBranch,.continuationTail,.litGlow,.litCore{fill:none;stroke-linecap:round;stroke-linejoin:round}.mainEdge{stroke-width:1.25}.stemEdge{stroke:rgba(231,205,140,.28)}.activeEdge{stroke:rgba(225,194,115,.33)}.emptyEdge{stroke:rgba(244,183,40,.14)}.branchEdge{stroke:rgba(209,196,161,.26);stroke-width:1.0}.branchStem{stroke:rgba(220,202,158,.29)}.flowIllumination{opacity:0;animation:illuminationCycle 5.3s ease-in-out infinite}.litGlow{stroke:rgba(244,183,40,.28);stroke-width:5;filter:url(#lineGlowV10)}.litCore{stroke:rgba(255,232,165,.88);stroke-width:1.28}.continuationTail{stroke:url(#continuationFadeV10);stroke-width:.88}.level2ContinuationGroup{opacity:1;transition:opacity .18s ease}.world.expanded .level2ContinuationGroup{opacity:0}.detailEdgeGroup{opacity:0;transition:opacity .20s ease .08s}.world.expanded .detailEdgeGroup{opacity:1}.detailBranch,.deepBranch{stroke:rgba(215,201,167,.27);stroke-width:.84;stroke-dasharray:180;stroke-dashoffset:180;transition:stroke-dashoffset .34s cubic-bezier(.22,.78,.22,1),opacity .18s ease}.world.expanded .detailBranch{stroke-dashoffset:0}.level3ContinuationGroup{opacity:0;transition:opacity .22s ease .24s}.world.expanded .level3ContinuationGroup{opacity:1}.deepEdgeGroup{opacity:0;transition:opacity .22s ease .08s}.world.deepExpanded .deepEdgeGroup{opacity:1}.world.deepExpanded .deepBranch{stroke-dashoffset:0}.person,.emptySlot{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;outline:0;font:inherit}.person{width:82px;min-height:70px;padding:0;background:transparent;color:#e9e3d8;display:grid;justify-items:center;gap:3px}.avatar,.slotAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#17150f;border:1px solid rgba(226,193,111,.34);color:#d8b75c;font-size:.47rem}.person b,.emptySlot b{font-size:.50rem;font-weight:700;white-space:nowrap}.person small,.emptySlot small{font-size:.43rem;color:#7f786f;white-space:nowrap}.person.root{width:118px}.person.root .avatar{width:44px;height:44px;background:#201b10;border-color:rgba(244,183,40,.58);box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 24px rgba(0,0,0,.28)}.person.root b{font-size:.64rem;color:#f2d98f}.person.active .avatar{border-color:rgba(244,183,40,.64);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 8px 24px rgba(0,0,0,.3)}.person.g3,.person.g4{width:58px;min-height:56px;transition:opacity .24s ease,transform .28s cubic-bezier(.22,.78,.22,1)}.person.g3 .avatar,.person.g4 .avatar{width:28px;height:28px}.person.g3 b,.person.g4 b{font-size:.40rem}.person.g3 small,.person.g4 small{font-size:.36rem}.emptySlot{width:84px;min-height:76px;padding:0;background:transparent;color:#e7c46c;display:grid;justify-items:center;gap:4px}.slotAvatar{position:relative;border-style:dashed;border-color:rgba(244,183,40,.5);background:rgba(244,183,40,.028);box-shadow:0 0 0 6px rgba(244,183,40,.014)}.slotAvatar i{font-style:normal;font-size:1.1rem;color:#f2ca65}.slotArrival{position:absolute;top:0;left:50%;width:44px;height:44px;transform:translate(-50%,0);border-radius:50%;border:1px solid rgba(244,183,40,.28);opacity:0;pointer-events:none;animation:slotArrivalV10 5.3s ease-in-out infinite}.slotCard{position:absolute;z-index:12;left:12px;right:12px;bottom:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(16,15,12,.96);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(12px)}.slotCard>div{display:flex;align-items:center;gap:9px}.slotCard>div>div{display:grid;gap:2px;min-width:0}.slotCard strong{font-size:.65rem}.slotCard small{font-size:.49rem;color:#817a70}.slotCard>div>button{margin-left:auto;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8e877c}.slotCard p{margin:9px 0 0;font-size:.5rem;line-height:1.45;color:#91887a}.cardPlus,.cardAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(244,183,40,.08);border:1px solid rgba(244,183,40,.2);color:#d8b457}.inviteCta,.branchCta{margin-top:10px;width:100%;height:32px;border:1px solid rgba(244,183,40,.18);border-radius:9px;background:rgba(244,183,40,.08);color:#d8b457;font-size:.52rem;font-weight:700}.controls{position:absolute;z-index:10;right:10px;bottom:max(10px,env(safe-area-inset-bottom));display:grid;gap:6px;justify-items:end}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.9);color:#bcb3a5;font-size:.75rem}.controls .youButton{width:auto;min-width:58px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border-color:rgba(244,183,40,.12);color:#ceb668}.youButton b{font-size:.48rem}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}@keyframes illuminationCycle{0%,7%{opacity:0}12%,62%{opacity:1}70%,100%{opacity:0}}@keyframes slotArrivalV10{0%,59%{transform:translate(-50%,0) scale(.97);opacity:0}66%{opacity:.46}74%{transform:translate(-50%,0) scale(1.1);opacity:0}100%{opacity:0}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}@media(max-width:430px){.notice small{display:none}.topBar{padding:8px 11px}.metric em{font-size:.39rem}.tips{grid-template-columns:1fr}.tips span{padding:6px}.stage{height:clamp(560px,73svh,700px)}.controls .zoomControl{display:none}}@media(prefers-reduced-motion:reduce){.gestureHint,.flowIllumination,.slotArrival{animation:none}.flowIllumination{display:none}.world.cameraMoving,.level2ContinuationGroup,.detailEdgeGroup,.level3ContinuationGroup,.deepEdgeGroup,.detailBranch,.deepBranch,.person.g3,.person.g4{transition:none}.detailBranch,.deepBranch{stroke-dashoffset:0}.slotAvatar{box-shadow:0 0 0 6px rgba(244,183,40,.02),0 0 18px rgba(244,183,40,.04)}}
      `}</style>
    </main>
  );
}
