'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'direct50' | 'hundred' | 'fiveHundred';
type Scenario = { id: ScenarioId; label: string; note: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type GraphNode = { id: string; children: string[]; parent: string | null };
type LineStyle = 'minimal' | 'soft';
type RingItem = { id: string; kind: 'person' | 'slot'; x: number; y: number; index: number };
type Travel = { id: string; x: number; y: number; mode: 'in' | 'out' };
type Phase = 'idle' | 'depart' | 'arrive';
type GateDemo = { slotId: string; centerId: string; phase: 'joining' | 'complete' } | null;

const ROOT = 'root';
const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available only', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: '첫 초대', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'five', label: '5명', note: '작은 네트워크', direct: 5, total: 12, depth: 3, fanout: 2, openSlots: 2 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'direct50', label: '직접 50', note: 'wide stress', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', note: '중형', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', note: '대형', direct: 40, total: 500, depth: 7, fanout: 5, openSlots: 2 },
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shortId(id: string) {
  if (id === ROOT) return 'YOU';
  return `0x…${(stableHash(id) & 0xffff).toString(16).padStart(4, '0')}`;
}

function fakeAddress(id: string) {
  if (id === ROOT) return 'Connected wallet (YOU)';
  let value = '';
  for (let i = 0; i < 5; i += 1) value += stableHash(`${id}:${i}`).toString(16).padStart(8, '0');
  return `0x${value.slice(0, 40)}`;
}

function makeGraph(s: Scenario) {
  const graph = new Map<string, GraphNode>();
  graph.set(ROOT, { id: ROOT, children: [], parent: null });
  if (!s.total || !s.direct) return graph;
  let nextId = 1;
  const roots: string[] = [];
  const depthMap = new Map<string, number>([[ROOT, 0]]);
  for (let i = 0; i < Math.min(s.direct, s.total); i += 1) {
    const id = `n${nextId++}`;
    roots.push(id);
    graph.set(id, { id, children: [], parent: ROOT });
    depthMap.set(id, 1);
  }
  graph.set(ROOT, { id: ROOT, children: roots, parent: null });
  const queue = [...roots];
  let cursor = 0;
  while (nextId <= s.total && cursor < queue.length) {
    const parent = queue[cursor++];
    const depth = depthMap.get(parent) ?? 1;
    if (depth >= s.depth || s.fanout <= 0) continue;
    const seed = Number(parent.replace('n', '')) || 1;
    const wanted = Math.max(1, Math.min(s.fanout, 1 + (seed % Math.max(1, s.fanout))));
    for (let i = 0; i < wanted && nextId <= s.total; i += 1) {
      const id = `n${nextId++}`;
      graph.set(id, { id, children: [], parent });
      graph.get(parent)?.children.push(id);
      depthMap.set(id, depth + 1);
      queue.push(id);
    }
  }
  while (nextId <= s.total && roots.length) {
    const parent = roots[(nextId - 1) % roots.length];
    const id = `n${nextId++}`;
    graph.set(id, { id, children: [], parent });
    graph.get(parent)?.children.push(id);
  }
  return graph;
}

function descendants(graph: Map<string, GraphNode>, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  return (graph.get(id)?.children ?? []).reduce((sum, child) => sum + 1 + descendants(graph, child, seen), 0);
}

function lineage(graph: Map<string, GraphNode>, id: string) {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    path.unshift(cursor);
    cursor = graph.get(cursor)?.parent ?? null;
  }
  return path[0] === ROOT ? path : [ROOT, ...path];
}

function slotsFor(id: string, scenario: Scenario) {
  if (id === ROOT) return Math.max(1, Math.min(2, scenario.openSlots || 2));
  return 1 + (stableHash(`${scenario.id}:${id}:slots`) % 2);
}

function personBases(compact: boolean) {
  return compact
    ? [
        { x: -108, y: -42 }, { x: -106, y: 74 }, { x: -50, y: 150 }, { x: 56, y: 144 },
      ]
    : [
        { x: -238, y: -56 }, { x: -214, y: 82 }, { x: -112, y: 178 },
        { x: 98, y: 164 }, { x: 214, y: 76 }, { x: 242, y: -38 },
      ];
}

function organicPoint(id: string, index: number, compact: boolean) {
  const bases = personBases(compact);
  const base = bases[index % bases.length];
  const hash = stableHash(id);
  const scale = 0.92 + ((hash >>> 9) % 19) / 100;
  const jitterX = ((hash % 29) - 14) * (compact ? 0.42 : 1.35);
  const jitterY = (((hash >>> 5) % 27) - 13) * (compact ? 0.5 : 1.1);
  const xRaw = base.x * scale + jitterX;
  const yRaw = base.y * (0.95 + ((hash >>> 15) % 13) / 100) + jitterY;
  if (compact) return { x: Math.max(-112, Math.min(112, xRaw)), y: Math.max(-62, Math.min(158, yRaw)) };
  return { x: Math.max(-262, Math.min(262, xRaw)), y: Math.max(-82, Math.min(192, yRaw)) };
}

function slotPoints(count: number, compact: boolean) {
  if (count <= 1) return [{ x: 0, y: compact ? 84 : 98 }];
  return compact
    ? [{ x: -60, y: 62 }, { x: 66, y: 48 }]
    : [{ x: -108, y: 62 }, { x: 118, y: 48 }];
}

function pathFor(item: RingItem, style: LineStyle) {
  const { x, y } = item;
  if (style === 'minimal') return `M 0 0 C ${x * 0.24} ${y * 0.22}, ${x * 0.76} ${y * 0.78}, ${x} ${y}`;
  const bend = Math.sign(x || 1) * Math.min(30, Math.abs(x) * 0.16);
  return `M 0 0 C ${bend} ${y * 0.2}, ${x - bend} ${y * 0.8}, ${x} ${y}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function QaNetworkRadialPlaygroundV28() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [centerId, setCenterId] = useState(ROOT);
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  const [lineStyle, setLineStyle] = useState<LineStyle>('soft');
  const [debug, setDebug] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [travel, setTravel] = useState<Travel | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [gateDemo, setGateDemo] = useState<GateDemo>(null);
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [newArrival, setNewArrival] = useState<string | null>(null);
  const [pageMotion, setPageMotion] = useState<'left' | 'right' | null>(null);
  const [zoom, setZoom] = useState(1);
  const timers = useRef<number[]>([]);
  const extraCounter = useRef(1);

  const minZoom = compact ? 0.58 : 0.48;
  const maxZoom = compact ? 1.04 : 1.16;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => () => clearTimers(), []);
  useEffect(() => setZoom((current) => clamp(current, minZoom, maxZoom)), [minZoom, maxZoom]);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const baseGraph = useMemo(() => makeGraph(scenario), [scenario]);
  const graph = useMemo(() => {
    const copy = new Map<string, GraphNode>();
    baseGraph.forEach((node, id) => copy.set(id, { id, parent: node.parent, children: [...node.children] }));
    Object.entries(extras).forEach(([parent, ids]) => ids.forEach((id) => {
      if (!copy.has(id)) copy.set(id, { id, parent, children: [] });
    }));
    Object.entries(extras).forEach(([parent, ids]) => {
      const owner = copy.get(parent);
      if (!owner) return;
      ids.forEach((id) => { if (!owner.children.includes(id)) owner.children.push(id); });
    });
    return copy;
  }, [baseGraph, extras]);

  const center = graph.get(centerId) ?? graph.get(ROOT)!;
  const slotCount = slotsFor(center.id, scenario);
  const ringCap = compact ? 6 : 8;
  const peoplePerPage = Math.max(1, ringCap - slotCount);
  const pageCount = Math.max(1, Math.ceil(center.children.length / peoplePerPage));
  const safePage = Math.min(page, pageCount - 1);
  const visibleChildren = center.children.slice(safePage * peoplePerPage, safePage * peoplePerPage + peoplePerPage);
  const crumbs = lineage(graph, center.id);
  const parentId = center.parent;

  const personItems = useMemo<RingItem[]>(() => visibleChildren.map((id, index) => {
    const point = organicPoint(id, index, compact);
    return { id, kind: 'person', x: point.x, y: point.y, index };
  }), [visibleChildren, compact]);

  const slotItems = useMemo<RingItem[]>(() => slotPoints(slotCount, compact).map((point, index) => ({
    id: `slot-${index}`, kind: 'slot', x: point.x, y: point.y, index,
  })), [slotCount, compact]);

  const ringItems = [...personItems, ...slotItems];
  const childCount = center.children.length;
  const totalBelow = descendants(graph, center.id);
  const completed = Math.min(childCount, Math.floor(childCount * (0.52 + ((stableHash(center.id) % 28) / 100))));
  const busy = phase !== 'idle' || Boolean(gateDemo);
  const zoomClass = zoom < 0.64 ? 'zoom-far' : zoom < 0.8 ? 'zoom-mid' : 'zoom-near';

  const resetMotion = () => {
    clearTimers();
    setPhase('idle');
    setTravel(null);
    setGateDemo(null);
    setPageMotion(null);
    setNewArrival(null);
  };

  const setZoomSafe = (value: number) => setZoom(clamp(value, minZoom, maxZoom));
  const bumpZoom = (amount: number) => setZoom((current) => clamp(current + amount, minZoom, maxZoom));
  const onWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((current) => clamp(current + step, minZoom, maxZoom));
  };

  const enterNode = (item: RingItem) => {
    if (busy || item.kind !== 'person' || !graph.has(item.id)) return;
    clearTimers();
    setInfoOpen(false);
    setTravel({ id: item.id, x: item.x, y: item.y, mode: 'in' });
    setPhase('depart');
    later(() => {
      setCenterId(item.id);
      setPage(0);
      setTravel(null);
      setPhase('arrive');
    }, 500);
    later(() => setPhase('idle'), 840);
  };

  const goParent = () => {
    if (busy || !parentId) return;
    const parent = graph.get(parentId);
    if (!parent) return;
    const parentSlots = slotsFor(parentId, scenario);
    const parentPpp = Math.max(1, (compact ? 6 : 8) - parentSlots);
    const childIndex = parent.children.indexOf(center.id);
    const targetPage = Math.max(0, Math.floor(Math.max(0, childIndex) / parentPpp));
    const localIndex = Math.max(0, childIndex) % parentPpp;
    const target = organicPoint(center.id, localIndex, compact);
    clearTimers();
    setInfoOpen(false);
    setTravel({ id: center.id, x: target.x, y: target.y, mode: 'out' });
    setPhase('depart');
    later(() => {
      setCenterId(parentId);
      setPage(targetPage);
      setTravel(null);
      setPhase('arrive');
    }, 500);
    later(() => setPhase('idle'), 840);
  };

  const goToCrumb = (id: string) => {
    if (busy || id === center.id || !graph.has(id)) return;
    clearTimers();
    setInfoOpen(false);
    setCenterId(id);
    setPage(0);
    setPhase('arrive');
    later(() => setPhase('idle'), 340);
  };

  const goRoot = () => {
    resetMotion();
    setInfoOpen(false);
    setCenterId(ROOT);
    setPage(0);
  };

  const changeScenario = (id: ScenarioId) => {
    resetMotion();
    setScenarioId(id);
    setCenterId(ROOT);
    setPage(0);
    setExtras({});
    setInfoOpen(false);
  };

  const changePage = (direction: 'left' | 'right') => {
    if (busy || pageCount <= 1) return;
    setPageMotion(direction);
    setPage((current) => direction === 'right' ? (current + 1) % pageCount : (current - 1 + pageCount) % pageCount);
    later(() => setPageMotion(null), 320);
  };

  const simulateGate = (slotId: string) => {
    if (busy) return;
    clearTimers();
    const owner = center.id;
    const nextId = `g-${scenario.id}-${extraCounter.current++}`;
    setGateDemo({ slotId, centerId: owner, phase: 'joining' });
    later(() => setGateDemo({ slotId, centerId: owner, phase: 'complete' }), 560);
    later(() => {
      setExtras((current) => ({ ...current, [owner]: [...(current[owner] ?? []), nextId] }));
      setNewArrival(nextId);
      setPage(Math.floor(childCount / peoplePerPage));
      setGateDemo(null);
      setPhase('arrive');
    }, 930);
    later(() => {
      setNewArrival(null);
      setPhase('idle');
    }, 1380);
  };

  return (
    <main className="page">
      <section className="labHeader">
        <div>
          <strong>RADIAL NETWORK PLAYGROUND · V28</strong>
          <span>Inner Available gates · deeper zoom-out · stronger organic layout · semantic detail</span>
        </div>
        <div className="headerActions">
          <button type="button" className={debug ? 'active' : ''} onClick={() => setDebug((value) => !value)}>Debug</button>
          <button type="button" onClick={goRoot}>◎ YOU</button>
        </div>
      </section>

      <section className="scenarioBar" aria-label="Network scenarios">
        {SCENARIOS.map((item) => (
          <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => changeScenario(item.id)}>
            <b>{item.label}</b><small>{item.note}</small>
          </button>
        ))}
      </section>

      <section className="controlBar">
        <div className="crumbs" aria-label="Network path">
          {crumbs.map((id, index) => (
            <span key={id}>{index ? <i>›</i> : null}<button type="button" className={id === center.id ? 'current' : ''} onClick={() => goToCrumb(id)} disabled={busy || id === center.id}>{shortId(id)}</button></span>
          ))}
        </div>
        <div className="lineSwitch" aria-label="Line style">
          <button type="button" className={lineStyle === 'minimal' ? 'active' : ''} onClick={() => setLineStyle('minimal')}>Minimal</button>
          <button type="button" className={lineStyle === 'soft' ? 'active' : ''} onClick={() => setLineStyle('soft')}>Soft</button>
        </div>
      </section>

      <section className="networkShell">
        <div className="networkTop">
          <div className="identity"><b>{shortId(center.id)}</b><span>Direct {childCount}</span><span>Network {totalBelow}</span><span>Completed {completed}</span></div>
          <div className="navActions">
            <div className="zoomControls" aria-label="Network zoom">
              <button type="button" onClick={() => bumpZoom(-0.1)} disabled={zoom <= minZoom + 0.01}>−</button>
              <button type="button" className="zoomValue" onClick={() => setZoomSafe(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => bumpZoom(0.1)} disabled={zoom >= maxZoom - 0.01}>+</button>
            </div>
            <button type="button" className={infoOpen ? 'active' : ''} onClick={() => setInfoOpen((value) => !value)}>ⓘ</button>
            {parentId ? <button type="button" onClick={goParent} disabled={busy}>← Inviter</button> : null}
            {pageCount > 1 ? <div className="pager"><button type="button" onClick={() => changePage('left')} disabled={busy}>‹</button><span>{safePage + 1}/{pageCount}</span><button type="button" onClick={() => changePage('right')} disabled={busy}>›</button></div> : null}
          </div>
        </div>

        <div className={`stage phase-${phase} ${pageMotion ? `page-${pageMotion}` : ''}`} onWheel={onWheelZoom}>
          {infoOpen ? (
            <aside className="infoCard">
              <div><b>{shortId(center.id)}</b><button type="button" onClick={() => setInfoOpen(false)}>×</button></div>
              <code>{fakeAddress(center.id)}</code>
              <dl><div><dt>Direct</dt><dd>{childCount}</dd></div><div><dt>Network</dt><dd>{totalBelow}</dd></div><div><dt>Completed</dt><dd>{completed}</dd></div><div><dt>Available</dt><dd>{slotCount}</dd></div></dl>
              <small>Live version: full wallet + VeChain Explorer link</small>
            </aside>
          ) : null}

          <div className={`scene ${zoomClass}`} style={{ '--sceneScale': zoom } as CSSProperties}>
            <div className="waterGlow" />

            {parentId ? <button type="button" className="parentNode" onClick={goParent} disabled={busy} aria-label={`Go to inviter ${shortId(parentId)}`}><span className="miniCircle">●</span><b>{shortId(parentId)}</b><small>Invited by</small></button> : null}

            <svg className="edges" viewBox="-360 -285 720 620" aria-hidden="true">
              <defs>
                <linearGradient id="base28" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgba(231,204,126,.145)"/><stop offset="1" stopColor="rgba(231,204,126,.04)"/></linearGradient>
                <filter id="blur28" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
                {slotItems.map((slot, index) => (
                  <radialGradient key={`gradient-${slot.id}`} id={`gateGlow28-${index}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={compact ? 50 : 70}>
                    <stop offset="0" stopColor="rgba(255,207,78,.84)"/><stop offset=".38" stopColor="rgba(244,183,40,.27)"/><stop offset="1" stopColor="rgba(244,183,40,0)"/>
                    <animate attributeName="cx" values={`0;${slot.x * .5};${slot.x}`} dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/>
                    <animate attributeName="cy" values={`0;${slot.y * .5};${slot.y}`} dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/>
                  </radialGradient>
                ))}
              </defs>
              {ringItems.map((item) => <path key={`${item.id}-base`} d={pathFor(item, lineStyle)} className={`spoke ${item.kind === 'slot' ? 'slotSpoke' : ''}`}/>)}
              {slotItems.map((slot, index) => <path key={`${slot.id}-glow`} d={pathFor(slot, lineStyle)} className="gateGlowPath" stroke={`url(#gateGlow28-${index})`} filter="url(#blur28)"><animate attributeName="opacity" values="0;0;.82;.48;0;0" keyTimes="0;.08;.18;.42;.56;1" dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/></path>)}
            </svg>

            <div className="centerWrap"><div className="centerFloat"><span className="centerCircle">●</span><b>{shortId(center.id)}</b><small>{childCount} direct · {totalBelow} network</small></div></div>

            <div className="ringLayer">
              {personItems.map((item, index) => {
                const child = graph.get(item.id);
                const childNetwork = descendants(graph, item.id);
                const hash = stableHash(item.id);
                const style = { '--x': `${item.x}px`, '--y': `${item.y}px`, '--delay': `${index * 42}ms`, '--floatDur': `${5.4 + (hash % 25) / 10}s`, '--floatDelay': `${-((hash >>> 4) % 30) / 10}s` } as CSSProperties;
                return <button key={item.id} type="button" className={`ringNode person ${newArrival === item.id ? 'newArrival' : ''}`} style={style} onClick={() => enterNode(item)} disabled={busy}><span className="floatInner"><span className="ringCircle">●</span><b>{shortId(item.id)}</b><small>{child?.children.length ?? 0} direct · {childNetwork} net</small></span></button>;
              })}
              {slotItems.map((item, index) => {
                const active = gateDemo?.centerId === center.id && gateDemo.slotId === item.id ? gateDemo.phase : null;
                const style = { '--x': `${item.x}px`, '--y': `${item.y}px`, '--gateDelay': `${index * 4}s`, '--floatDur': `${7 + index * .7}s`, '--floatDelay': `${-1.7 - index * .9}s` } as CSSProperties;
                return <button key={item.id} type="button" className={`ringNode slot ${active ?? ''}`} style={style} onClick={() => simulateGate(item.id)} disabled={busy && !active}><span className="floatInner"><span className="slotCircle">{active === 'joining' ? '…' : active === 'complete' ? '✓' : '+'}</span><b>{active === 'joining' ? 'Joining' : active === 'complete' ? 'Completed' : 'Available'}</b><small>{active ? 'Gate demo' : 'Invite gate'}</small></span></button>;
              })}
            </div>

            {travel ? <div className={`traveler ${travel.mode}`} style={{ '--tx': `${travel.x}px`, '--ty': `${travel.y}px` } as CSSProperties}><span className="travelCircle">●</span><b>{shortId(travel.id)}</b></div> : null}
            {!childCount ? <div className="emptyHint"><span>No completed direct yet</span><small>Available stays open as the invitation gateway.</small></div> : null}
          </div>

          <div className="zoomHint">wheel / − + · {Math.round(zoom * 100)}%</div>
          {debug ? <div className="debugPanel"><span>Rendered {ringItems.length + 1 + (parentId ? 1 : 0)}</span><span>People/page {peoplePerPage}</span><span>Available {slotCount}</span><span>Direct {childCount}</span><span>Pages {pageCount}</span><span>Zoom {Math.round(zoom * 100)}%</span><span>{zoomClass}</span></div> : null}
        </div>
      </section>

      <section className="rules">
        <span><b>Organic, not random</b>같은 유저는 같은 위치를 유지하되 간격·높이를 더 자연스럽게</span>
        <span><b>Available = inner gate</b>사람 링보다 안쪽의 고정 초대 게이트 · 페이지가 바뀌어도 유지</span>
        <span><b>Deeper zoom-out</b>축소할수록 보조 정보가 사라지고 네트워크 구조만 남음</span>
        <span><b>Quiet motion</b>미세한 부유 + Available 선의 넓고 흐린 빛만 번갈아 이동</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}
        .labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:min(calc(100vw - 20px),920px);margin-left:auto;margin-right:auto;box-sizing:border-box}
        button{font:inherit}.labHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}
        .headerActions,.lineSwitch,.navActions,.pager,.zoomControls{display:flex;align-items:center;gap:5px}.headerActions button,.lineSwitch button,.navActions>button,.pager button,.zoomControls button{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0e0e0c;color:#918a7e;font-size:.48rem}.headerActions button.active,.lineSwitch button.active,.navActions>button.active{border-color:rgba(244,183,40,.32);background:rgba(244,183,40,.08);color:#ddb958}button:disabled{cursor:default;opacity:.45}.zoomControls{padding:2px 3px;border:1px solid rgba(255,255,255,.05);border-radius:9px}.zoomControls button{height:24px;padding:0 7px}.zoomControls .zoomValue{min-width:42px;color:#b39b5e}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:78px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.41rem;color:#6e685f}
        .controlBar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 9px}.crumbs{display:flex;gap:4px;align-items:center;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.crumbs::-webkit-scrollbar{display:none}.crumbs span{display:flex;gap:4px;align-items:center}.crumbs i{font-style:normal;color:#5b554d;font-size:.44rem}.crumbs button{border:0;background:transparent;color:#8d8578;font-size:.46rem;padding:3px 1px}.crumbs button.current{color:#c4a654}.crumbs button:not(.current):hover{color:#d6ba6b}
        .networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.networkTop{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.05)}.identity{display:flex;flex-wrap:wrap;align-items:center;gap:5px 9px}.identity b{font-size:.56rem;letter-spacing:.04em;color:#c6a858}.identity span{font-size:.42rem;color:#777065}.pager{padding:2px 3px;border:1px solid rgba(255,255,255,.05);border-radius:9px}.pager span{min-width:28px;text-align:center;font-size:.43rem;color:#7d756a}
        .stage{height:min(72svh,680px);min-height:540px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 53%,rgba(244,183,40,.032),transparent 34%),#080807;overscroll-behavior:contain}.scene{--sceneScale:1;position:absolute;inset:0;transform:scale(var(--sceneScale));transform-origin:50% 50%;transition:transform 180ms cubic-bezier(.2,.78,.2,1)}.waterGlow{position:absolute;inset:18% 12% 10%;background:radial-gradient(ellipse at 50% 62%,rgba(219,183,79,.025),transparent 58%);filter:blur(16px);pointer-events:none}
        .edges{position:absolute;left:50%;top:50%;width:720px;height:620px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:2;transition:opacity 180ms ease}.spoke{fill:none;stroke:url(#base28);stroke-width:1;stroke-linecap:round}.slotSpoke{stroke:rgba(213,177,73,.18)}.gateGlowPath{fill:none;stroke-width:8;stroke-linecap:round;opacity:0}
        .centerWrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8}.centerFloat{width:132px;display:grid;justify-items:center;gap:5px;animation:centerFloat28 7.6s ease-in-out infinite}.centerCircle{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:#0d0d0b;border:1px solid rgba(244,183,40,.66);color:#e5b943;font-size:.72rem;box-shadow:0 0 38px rgba(244,183,40,.045)}.centerFloat b{font-size:.62rem}.centerFloat small{font-size:.42rem;color:#756e63;white-space:nowrap}
        .ringLayer{position:absolute;left:50%;top:50%;z-index:6;transition:opacity 180ms ease}.ringNode{--x:0px;--y:0px;position:absolute;left:0;top:0;width:110px;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));display:grid;justify-items:center;color:#d8d2c5;border:0;background:transparent;animation:bloom28 430ms cubic-bezier(.18,.8,.24,1) both;animation-delay:var(--delay,0ms)}.floatInner{display:grid;justify-items:center;gap:4px;animation:float28 var(--floatDur,6.4s) ease-in-out infinite;animation-delay:var(--floatDelay,-1s)}.ringCircle,.slotCircle,.miniCircle,.travelCircle{border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.ringCircle{width:52px;height:52px;border:1px solid rgba(210,174,65,.37);color:#d9b34a;font-size:.62rem;transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease}.ringNode b{font-size:.48rem;white-space:nowrap}.ringNode small{font-size:.39rem;color:#6d665c;white-space:nowrap}.person:hover .ringCircle,.person:focus-visible .ringCircle{border-color:rgba(244,183,40,.72);box-shadow:0 0 24px rgba(244,183,40,.08);transform:scale(1.04)}
        .slot{opacity:.82}.slotCircle{width:46px;height:46px;border:1px dashed rgba(226,181,62,.5);color:#c79f36;font-size:.9rem;animation:gatePulse28 8s ease-in-out infinite;animation-delay:var(--gateDelay,0s)}.slot b{color:#a3936e}.slot small{color:#675f53}.slot.joining .slotCircle{border-style:solid;animation:joining28 .9s ease-in-out infinite}.slot.complete .slotCircle{border-style:solid;border-color:rgba(138,205,123,.68);color:#8fca80;box-shadow:0 0 22px rgba(115,189,101,.1)}.newArrival .ringCircle{animation:newArrival28 650ms cubic-bezier(.16,.8,.2,1) both}
        .parentNode{position:absolute;left:50%;top:calc(50% - 224px);transform:translateX(-50%);display:grid;justify-items:center;gap:2px;color:#8c8478;z-index:7;border:0;background:transparent}.parentNode:after{content:'';position:absolute;top:48px;width:1px;height:60px;background:linear-gradient(rgba(217,181,78,.13),rgba(217,181,78,.01))}.miniCircle{width:32px;height:32px;border:1px solid rgba(220,188,92,.25);color:#a78a3e;font-size:.4rem}.parentNode b{font-size:.43rem}.parentNode small{font-size:.36rem;color:#5f5951}
        .traveler{--tx:0px;--ty:0px;position:absolute;left:50%;top:50%;width:110px;display:grid;justify-items:center;gap:4px;z-index:30;color:#e8dfcb;pointer-events:none}.travelCircle{width:56px;height:56px;border:1px solid rgba(244,183,40,.72);color:#e5b943;box-shadow:0 0 34px rgba(244,183,40,.09)}.traveler b{font-size:.49rem}.traveler.in{animation:travelIn28 500ms cubic-bezier(.18,.78,.18,1) both}.traveler.out{animation:travelOut28 500ms cubic-bezier(.18,.78,.18,1) both}
        .phase-depart .ringLayer,.phase-depart .edges{opacity:.12}.phase-depart .centerWrap{animation:centerYield28 500ms cubic-bezier(.18,.78,.18,1) both}.phase-arrive .centerWrap{animation:centerArrive28 330ms cubic-bezier(.18,.78,.18,1) both}.phase-arrive .ringNode{animation:bloom28 430ms cubic-bezier(.18,.8,.24,1) both;animation-delay:var(--delay,0ms)}.page-left .ringLayer,.page-right .ringLayer{animation:pageFade28 300ms ease both}
        .emptyHint{position:absolute;left:50%;top:calc(50% + 112px);transform:translateX(-50%);display:grid;justify-items:center;gap:3px;color:#716a60;z-index:3}.emptyHint span{font-size:.47rem}.emptyHint small{font-size:.39rem;color:#58534c}
        .scene.zoom-mid .ringNode small,.scene.zoom-mid .centerFloat small,.scene.zoom-mid .parentNode small{display:none}.scene.zoom-far .ringNode small,.scene.zoom-far .centerFloat small,.scene.zoom-far .parentNode small,.scene.zoom-far .emptyHint small{display:none}.scene.zoom-far .spoke{opacity:.75}.scene.zoom-far .centerCircle{box-shadow:none}.scene.zoom-far .waterGlow{opacity:.55}
        .infoCard{position:absolute;right:10px;top:10px;width:220px;padding:10px;border:1px solid rgba(244,183,40,.14);border-radius:12px;background:rgba(12,12,10,.94);backdrop-filter:blur(12px);z-index:40;box-shadow:0 16px 48px rgba(0,0,0,.28)}.infoCard>div:first-child{display:flex;align-items:center;justify-content:space-between}.infoCard b{font-size:.55rem;color:#c7a957}.infoCard button{border:0;background:transparent;color:#777065;font-size:.8rem}.infoCard code{display:block;margin-top:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.38rem;color:#696258}.infoCard dl{margin:9px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.infoCard dl div{padding:6px;border:1px solid rgba(255,255,255,.04);border-radius:8px}.infoCard dt{font-size:.36rem;color:#5e584f}.infoCard dd{margin:2px 0 0;font-size:.48rem;color:#aaa294}.infoCard>small{display:block;margin-top:8px;font-size:.35rem;color:#58534b}
        .zoomHint{position:absolute;right:10px;bottom:10px;padding:5px 7px;border:1px solid rgba(255,255,255,.04);border-radius:8px;background:rgba(12,12,10,.6);font-size:.38rem;color:#5f594f;z-index:42;pointer-events:none}.debugPanel{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:72%;z-index:45}.debugPanel span{padding:5px 7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(12,12,10,.84);font-size:.4rem;color:#777067}
        .rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding-top:9px}.rules span{display:grid;gap:3px;padding:9px 10px;border:1px solid rgba(255,255,255,.05);border-radius:11px;background:#0b0b09;color:#70695f;font-size:.45rem;line-height:1.5}.rules b{color:#a58c4c;font-size:.48rem}
        @keyframes float28{0%,100%{transform:translate3d(0,-1px,0) rotate(-.25deg)}35%{transform:translate3d(1.4px,2.5px,0) rotate(.3deg)}70%{transform:translate3d(-1.2px,.5px,0) rotate(-.12deg)}}
        @keyframes centerFloat28{0%,100%{transform:translateY(0)}50%{transform:translateY(1.8px)}}
        @keyframes bloom28{0%{opacity:0;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%)) scale(.84)}100%{opacity:1;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%)) scale(1)}}
        @keyframes gatePulse28{0%,56%,100%{box-shadow:0 0 0 rgba(244,183,40,0);border-color:rgba(226,181,62,.45)}66%{box-shadow:0 0 19px rgba(244,183,40,.075);border-color:rgba(244,196,65,.7)}74%{box-shadow:0 0 0 rgba(244,183,40,0);border-color:rgba(226,181,62,.45)}}
        @keyframes joining28{0%,100%{transform:scale(1);box-shadow:0 0 0 rgba(244,183,40,0)}50%{transform:scale(1.05);box-shadow:0 0 22px rgba(244,183,40,.1)}}
        @keyframes newArrival28{0%{opacity:0;transform:translateY(8px) scale(.74)}65%{opacity:1;transform:translateY(-1px) scale(1.05)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes travelIn28{0%{transform:translate(calc(var(--tx) - 50%),calc(var(--ty) - 50%)) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(1.2);opacity:1}}
        @keyframes travelOut28{0%{transform:translate(-50%,-50%) scale(1.2);opacity:1}100%{transform:translate(calc(var(--tx) - 50%),calc(var(--ty) - 50%)) scale(1);opacity:1}}
        @keyframes centerYield28{0%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-82%) scale(.72);opacity:.08}}
        @keyframes centerArrive28{0%{transform:translate(-50%,-50%) scale(1.12);opacity:.35}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
        @keyframes pageFade28{0%{opacity:.3;transform:translateX(7px)}100%{opacity:1;transform:translateX(0)}}
        @media(max-width:640px){.labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:calc(100vw - 12px)}.labHeader{padding:8px 9px}.labHeader span{display:none}.networkTop{align-items:flex-start;flex-direction:column;padding:7px 9px}.navActions{width:100%;justify-content:flex-end;flex-wrap:wrap}.stage{height:64svh;min-height:500px}.edges{width:620px;height:540px}.centerCircle{width:68px;height:68px}.centerFloat{width:116px}.centerFloat b{font-size:.58rem}.ringNode{width:100px}.ringCircle{width:49px;height:49px}.slotCircle{width:43px;height:43px}.parentNode{top:calc(50% - 190px)}.infoCard{left:8px;right:8px;top:auto;bottom:8px;width:auto}.rules{grid-template-columns:1fr 1fr}.zoomHint{right:8px;bottom:8px}}
        @media(prefers-reduced-motion:reduce){.scene,.floatInner,.centerFloat,.slotCircle,.ringNode,.traveler,.phase-depart .centerWrap,.phase-arrive .centerWrap,.page-left .ringLayer,.page-right .ringLayer,.newArrival .ringCircle{animation:none!important;transition:none!important}.gateGlowPath{display:none}.slotSpoke{stroke:rgba(213,177,73,.2)}}
      `}</style>
    </main>
  );
}
