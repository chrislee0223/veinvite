'use client';

import { useEffect, useMemo, useState } from 'react';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'direct50' | 'hundred' | 'fiveHundred';
type Scenario = {
  id: ScenarioId;
  label: string;
  note: string;
  direct: number;
  total: number;
  depth: number;
  fanout: number;
  openSlots: number;
};
type GraphNode = { id: string; children: string[]; parent: string | null };
type LineStyle = 'minimal' | 'soft';

type RingItem = {
  id: string;
  kind: 'person' | 'slot';
  x: number;
  y: number;
  angle: number;
};

const ROOT = 'root';
const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available 2', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: '첫 초대', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'five', label: '5명', note: '작은 네트워크', direct: 5, total: 12, depth: 3, fanout: 2, openSlots: 1 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'direct50', label: '직접 50', note: 'wide stress', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', note: '중형', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', note: '대형', direct: 40, total: 500, depth: 7, fanout: 5, openSlots: 2 },
];

function shortId(id: string) {
  if (id === ROOT) return 'YOU';
  return `0x…${id.replace('n', '').padStart(4, '0')}`;
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

function anglesFor(count: number) {
  const presets: Record<number, number[]> = {
    1: [90],
    2: [155, 25],
    3: [190, 90, 350],
    4: [200, 145, 35, 340],
    5: [205, 155, 90, 25, 335],
    6: [205, 160, 115, 65, 20, 335],
    7: [210, 170, 130, 90, 50, 10, 330],
    8: [215, 180, 145, 110, 70, 35, 0, 325],
  };
  return presets[Math.max(1, Math.min(8, count))] ?? presets[8];
}

function pointOnRing(angle: number, rx: number, ry: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * rx, y: Math.sin(rad) * ry };
}

function pathFor(item: RingItem, style: LineStyle) {
  const endX = item.x;
  const endY = item.y;
  if (style === 'minimal') {
    const c1x = endX * 0.22;
    const c1y = endY * 0.28;
    const c2x = endX * 0.78;
    const c2y = endY * 0.72;
    return `M 0 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
  }
  const bend = Math.sign(endX || 1) * Math.min(34, Math.abs(endX) * 0.2);
  return `M 0 0 C ${bend} ${endY * 0.24}, ${endX - bend} ${endY * 0.76}, ${endX} ${endY}`;
}

export function QaNetworkRadialPlaygroundV26() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [centerId, setCenterId] = useState(ROOT);
  const [history, setHistory] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  const [lineStyle, setLineStyle] = useState<LineStyle>('minimal');
  const [debug, setDebug] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const graph = useMemo(() => makeGraph(scenario), [scenario]);
  const center = graph.get(centerId) ?? graph.get(ROOT)!;
  const atRoot = center.id === ROOT;
  const slotCount = atRoot ? Math.min(2, scenario.openSlots) : 0;
  const ringCap = compact ? 6 : 8;
  const peoplePerPage = Math.max(1, ringCap - slotCount);
  const pageCount = Math.max(1, Math.ceil(center.children.length / peoplePerPage));
  const safePage = Math.min(page, pageCount - 1);
  const visibleChildren = center.children.slice(safePage * peoplePerPage, safePage * peoplePerPage + peoplePerPage);

  const ringItems = useMemo(() => {
    const raw = [
      ...visibleChildren.map((id) => ({ id, kind: 'person' as const })),
      ...Array.from({ length: slotCount }, (_, index) => ({ id: `slot-${index}`, kind: 'slot' as const })),
    ];
    const angles = anglesFor(raw.length);
    const rx = compact ? 145 : 218;
    const ry = compact ? 132 : 184;
    return raw.map((item, index) => {
      const angle = angles[index] ?? 90;
      const point = pointOnRing(angle, rx, ry);
      return { ...item, angle, ...point } as RingItem;
    });
  }, [visibleChildren, slotCount, compact]);

  const parentId = center.parent;
  const crumbs = [...history, centerId].filter((id, index, arr) => arr.indexOf(id) === index);

  const enterNode = (id: string) => {
    if (transitioning || id.startsWith('slot-')) return;
    if (!graph.has(id)) return;
    setTransitioning(true);
    window.setTimeout(() => {
      setHistory((current) => [...current, centerId]);
      setCenterId(id);
      setPage(0);
      window.setTimeout(() => setTransitioning(false), 170);
    }, 150);
  };

  const goBack = () => {
    if (transitioning || !history.length) return;
    setTransitioning(true);
    window.setTimeout(() => {
      setHistory((current) => {
        const next = [...current];
        const previous = next.pop() ?? ROOT;
        setCenterId(previous);
        setPage(0);
        return next;
      });
      window.setTimeout(() => setTransitioning(false), 170);
    }, 150);
  };

  const goRoot = () => {
    setCenterId(ROOT);
    setHistory([]);
    setPage(0);
    setTransitioning(false);
  };

  const changeScenario = (id: ScenarioId) => {
    setScenarioId(id);
    setCenterId(ROOT);
    setHistory([]);
    setPage(0);
    setTransitioning(false);
  };

  const childCount = center.children.length;
  const totalBelow = descendants(graph, center.id);

  return (
    <main className="page">
      <section className="labHeader">
        <div>
          <strong>RADIAL NETWORK PLAYGROUND · V26</strong>
          <span>Tap a person → move that user to the center → inspect only one relationship layer</span>
        </div>
        <div className="headerActions">
          <button type="button" className={debug ? 'active' : ''} onClick={() => setDebug((value) => !value)}>Debug</button>
          <button type="button" onClick={goRoot}>◎ YOU</button>
        </div>
      </section>

      <section className="scenarioBar" aria-label="Network scenarios">
        {SCENARIOS.map((item) => (
          <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => changeScenario(item.id)}>
            <b>{item.label}</b>
            <small>{item.note}</small>
          </button>
        ))}
      </section>

      <section className="controlBar">
        <div className="crumbs">
          {crumbs.length ? crumbs.map((id, index) => (
            <span key={`${id}-${index}`}>{index ? '›' : ''} {shortId(id)}</span>
          )) : <span>YOU</span>}
        </div>
        <div className="lineSwitch" aria-label="Line style">
          <button type="button" className={lineStyle === 'minimal' ? 'active' : ''} onClick={() => setLineStyle('minimal')}>Minimal</button>
          <button type="button" className={lineStyle === 'soft' ? 'active' : ''} onClick={() => setLineStyle('soft')}>Soft</button>
        </div>
      </section>

      <section className="networkShell">
        <div className="networkTop">
          <div>
            <b>{atRoot ? 'YOUR NETWORK' : `${shortId(center.id)} NETWORK`}</b>
            <span>{childCount} direct · {totalBelow} downstream</span>
          </div>
          <div className="navActions">
            {history.length ? <button type="button" onClick={goBack}>← Back</button> : null}
            {pageCount > 1 ? (
              <div className="pager">
                <button type="button" onClick={() => setPage((current) => (current - 1 + pageCount) % pageCount)}>‹</button>
                <span>{safePage + 1}/{pageCount}</span>
                <button type="button" onClick={() => setPage((current) => (current + 1) % pageCount)}>›</button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`stage ${transitioning ? 'transitioning' : ''}`}>
          <div className="orbitGuide" />

          {parentId ? (
            <>
              <div className="parentLine" />
              <button type="button" className="parentNode" onClick={goBack} aria-label={`Back to ${shortId(parentId)}`}>
                <span className="miniCircle">●</span>
                <b>{shortId(parentId)}</b>
                <small>previous</small>
              </button>
            </>
          ) : null}

          <svg className="edges" viewBox="-360 -260 720 560" aria-hidden="true">
            <defs>
              <linearGradient id="radialBase26" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgba(228,199,112,.19)" />
                <stop offset="1" stopColor="rgba(228,199,112,.07)" />
              </linearGradient>
              <radialGradient id="slotGlow26" cx="50%" cy="50%" r="60%">
                <stop offset="0" stopColor="rgba(244,183,40,.78)" />
                <stop offset=".42" stopColor="rgba(244,183,40,.22)" />
                <stop offset="1" stopColor="rgba(244,183,40,0)" />
              </radialGradient>
              <filter id="blur26" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            {ringItems.map((item) => (
              <path key={`${item.id}-base`} d={pathFor(item, lineStyle)} className={`spoke ${item.kind === 'slot' ? 'slotSpoke' : ''}`} />
            ))}
            {ringItems.filter((item) => item.kind === 'slot').map((item) => (
              <path key={`${item.id}-glow`} d={pathFor(item, lineStyle)} className="slotFlow" pathLength="1" />
            ))}
          </svg>

          <div className="centerWrap">
            <button type="button" className="centerNode">
              <span className="centerCircle">●</span>
              <b>{shortId(center.id)}</b>
              <small>{childCount} direct · {totalBelow} network</small>
            </button>
          </div>

          <div className="ringLayer">
            {ringItems.map((item) => (
              item.kind === 'person' ? (
                <button
                  key={item.id}
                  type="button"
                  className="ringNode person"
                  style={{ '--x': `${item.x}px`, '--y': `${item.y}px` } as React.CSSProperties}
                  onClick={() => enterNode(item.id)}
                >
                  <span className="ringCircle">●</span>
                  <b>{shortId(item.id)}</b>
                  <small>{graph.get(item.id)?.children.length ?? 0} direct</small>
                </button>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className="ringNode slot"
                  style={{ '--x': `${item.x}px`, '--y': `${item.y}px` } as React.CSSProperties}
                >
                  <span className="slotCircle">+</span>
                  <b>Available</b>
                  <small>Invite slot</small>
                </button>
              )
            ))}
          </div>

          {!ringItems.length ? (
            <div className="leafState">
              <b>No direct connections</b>
              <span>{atRoot ? 'Available invite slots would appear around YOU.' : 'This branch ends here.'}</span>
            </div>
          ) : null}

          {debug ? (
            <div className="debugPanel">
              <span>Rendered {ringItems.length + 1 + (parentId ? 1 : 0)}</span>
              <span>Ring cap {ringCap}</span>
              <span>Direct {childCount}</span>
              <span>Pages {pageCount}</span>
              <span>Crossing 0 by radial rule</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rules">
        <span><b>1 · One layer only</b>한 번에 현재 중심 사용자의 direct만 표시</span>
        <span><b>2 · Tap to travel</b>사람을 누르면 그 사람이 중앙으로 이동하고 새 direct가 주변에 나타남</span>
        <span><b>3 · Top reserved</b>위쪽은 이전 사용자/Back 경로용으로 비워 방향을 잃지 않게 함</span>
        <span><b>4 · Scale-safe</b>100명·500명도 모든 선을 한 번에 그리지 않고 페이지 단위로 탐색</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}
        .labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:min(calc(100vw - 20px),920px);margin-left:auto;margin-right:auto;box-sizing:border-box}
        .labHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}
        .labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}
        .headerActions,.lineSwitch,.navActions,.pager{display:flex;align-items:center;gap:5px}.headerActions button,.lineSwitch button,.navActions button,.pager button{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0e0e0c;color:#918a7e;font-size:.48rem}.headerActions button.active,.lineSwitch button.active{border-color:rgba(244,183,40,.32);background:rgba(244,183,40,.08);color:#ddb958}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:78px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.41rem;color:#6e685f}
        .controlBar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 9px}.crumbs{display:flex;gap:5px;align-items:center;overflow:hidden;white-space:nowrap}.crumbs span{font-size:.46rem;color:#8d8578}.crumbs span:last-child{color:#c4a654}
        .networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.networkTop{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.05)}.networkTop>div:first-child{display:grid;gap:1px}.networkTop b{font-size:.54rem;letter-spacing:.07em;color:#c6a858}.networkTop span{font-size:.43rem;color:#736d63}.pager{padding:2px 3px;border:1px solid rgba(255,255,255,.05);border-radius:9px}.pager span{min-width:28px;text-align:center;font-size:.43rem;color:#7d756a}
        .stage{height:min(70svh,650px);min-height:500px;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgba(244,183,40,.034),transparent 34%),#080807}
        .orbitGuide{position:absolute;left:50%;top:50%;width:min(66vw,460px);height:min(48vw,350px);transform:translate(-50%,-43%);border:1px solid rgba(255,255,255,.018);border-radius:50%;pointer-events:none}
        .edges{position:absolute;left:50%;top:50%;width:720px;height:560px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none}.spoke{fill:none;stroke:url(#radialBase26);stroke-width:1.05;stroke-linecap:round}.slotSpoke{stroke:rgba(210,169,58,.18)}.slotFlow{fill:none;stroke:rgba(244,183,40,.42);stroke-width:3.6;stroke-linecap:round;stroke-dasharray:.14 .86;animation:flow26 5.4s linear infinite;filter:url(#blur26);opacity:.7}
        .centerWrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8}.centerNode{width:128px;display:grid;justify-items:center;gap:5px;color:#f0eadc}.centerCircle{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:#0d0d0b;border:1px solid rgba(244,183,40,.66);color:#e5b943;font-size:.72rem;box-shadow:0 0 38px rgba(244,183,40,.045)}.centerNode b{font-size:.62rem}.centerNode small{font-size:.42rem;color:#756e63;white-space:nowrap}
        .ringLayer{position:absolute;left:50%;top:50%;z-index:6}.ringNode{--x:0px;--y:0px;position:absolute;left:0;top:0;width:106px;display:grid;justify-items:center;gap:4px;color:#d8d2c5;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));transition:transform 260ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease}.ringCircle,.slotCircle,.miniCircle{border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.ringCircle{width:52px;height:52px;border:1px solid rgba(210,174,65,.37);color:#d9b34a;font-size:.62rem}.ringNode b{font-size:.48rem;white-space:nowrap}.ringNode small{font-size:.39rem;color:#6d665c;white-space:nowrap}.ringNode:hover .ringCircle{border-color:rgba(244,183,40,.7);box-shadow:0 0 24px rgba(244,183,40,.065)}
        .slot{opacity:.78}.slotCircle{width:46px;height:46px;border:1px dashed rgba(226,181,62,.5);color:#c79f36;font-size:.9rem;animation:slotBreath26 4.8s ease-in-out infinite}.slot b{color:#a3936e}.slot small{color:#675f53}
        .parentNode{position:absolute;left:50%;top:53px;transform:translateX(-50%);display:grid;justify-items:center;gap:2px;color:#8c8478;z-index:7}.miniCircle{width:32px;height:32px;border:1px solid rgba(220,188,92,.25);color:#a78a3e;font-size:.4rem}.parentNode b{font-size:.43rem}.parentNode small{font-size:.36rem;color:#5f5951}.parentLine{position:absolute;left:50%;top:88px;width:1px;height:64px;background:linear-gradient(rgba(217,181,78,.14),rgba(217,181,78,.03));z-index:2}
        .leafState{position:absolute;left:50%;top:calc(50% + 115px);transform:translateX(-50%);display:grid;justify-items:center;gap:4px;color:#777067}.leafState b{font-size:.5rem}.leafState span{font-size:.41rem;color:#5d5750}
        .debugPanel{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:70%;z-index:20}.debugPanel span{padding:5px 7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(12,12,10,.82);font-size:.4rem;color:#777067}
        .transitioning .ringLayer,.transitioning .edges{opacity:.12;transition:opacity 150ms ease}.transitioning .centerWrap{transform:translate(-50%,-50%) scale(1.05);transition:transform 150ms ease}.ringLayer,.edges{transition:opacity 170ms ease}.centerWrap{transition:transform 170ms ease}
        .rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding-top:9px}.rules span{display:grid;gap:3px;padding:9px 10px;border:1px solid rgba(255,255,255,.05);border-radius:11px;background:#0b0b09;color:#70695f;font-size:.45rem;line-height:1.5}.rules b{color:#a58c4c;font-size:.48rem}
        @keyframes flow26{0%{stroke-dashoffset:.82;opacity:.08}20%{opacity:.72}52%{opacity:.42}78%,100%{stroke-dashoffset:-1.2;opacity:.08}}
        @keyframes slotBreath26{0%,72%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}84%{box-shadow:0 0 22px rgba(244,183,40,.11)}}
        @media(prefers-reduced-motion:reduce){.slotFlow{display:none}.slotCircle{animation:none}.ringNode,.transitioning .ringLayer,.transitioning .edges,.centerWrap{transition:none}}
        @media(max-width:640px){.labHeader{align-items:flex-start;flex-direction:column}.headerActions{width:100%;justify-content:flex-end}.controlBar{align-items:flex-start}.stage{height:62svh;min-height:500px}.edges{width:520px;height:440px}.orbitGuide{width:290px;height:255px}.ringNode{width:92px}.ringCircle{width:48px;height:48px}.centerCircle{width:66px;height:66px}.parentNode{top:42px}.parentLine{top:77px;height:62px}.rules{grid-template-columns:1fr 1fr}}
        @media(max-width:410px){.stage{min-height:470px}.rules{grid-template-columns:1fr}.crumbs{max-width:58vw}.lineSwitch button{padding:0 7px}}
      `}</style>
    </main>
  );
}
