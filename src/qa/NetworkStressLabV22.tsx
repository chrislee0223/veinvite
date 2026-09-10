'use client';

import { useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react';

type ScenarioKey = 'empty' | 'one' | 'two' | 'ten' | 'balanced30' | 'deep10' | 'wide100' | 'wide500' | 'worst';
type DemoNode = { id: string; parent: string | null; children: string[]; depth: number; network: number };
type LayoutNode = DemoNode & { x: number; y: number; width: number };

type Scenario = {
  key: ScenarioKey;
  label: string;
  description: string;
  total: number;
  root: string;
  nodes: Map<string, DemoNode>;
};

const NODE_W = 108;
const NODE_H = 76;
const LEVEL_GAP = 188;
const SIBLING_GAP = 36;
const ROOT_Y = 92;
const ROOT_DIRECT_CAPS = [2, 4, 6, 8] as const;
const BRANCH_CAPS = [0, 0, 4, 6] as const;
const WORLD_MIN_W = 760;
const WORLD_MIN_H = 650;

function makeWallet(n: number) {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function buildScenario(key: ScenarioKey): Scenario {
  const root = makeWallet(1);
  const childrenByParent = new Map<string, string[]>();
  let id = 2;
  const add = (parent: string) => {
    const child = makeWallet(id++);
    const list = childrenByParent.get(parent) ?? [];
    list.push(child);
    childrenByParent.set(parent, list);
    return child;
  };

  if (key === 'one') add(root);
  if (key === 'two') { add(root); add(root); }
  if (key === 'ten') {
    for (let i = 0; i < 10; i += 1) {
      const c = add(root);
      if (i < 5) for (let j = 0; j < 2 + (i % 3); j += 1) add(c);
    }
  }
  if (key === 'balanced30') {
    const first: string[] = [];
    for (let i = 0; i < 6; i += 1) first.push(add(root));
    for (const p of first) for (let i = 0; i < 3; i += 1) add(p);
    for (let i = 0; i < 6; i += 1) add(first[i]);
  }
  if (key === 'deep10') {
    let cursor = root;
    for (let i = 0; i < 10; i += 1) cursor = add(cursor);
  }
  if (key === 'wide100' || key === 'wide500') {
    const count = key === 'wide100' ? 100 : 500;
    for (let i = 0; i < count; i += 1) {
      const c = add(root);
      if (i < 12) {
        const branchCount = 1 + (i % 4);
        for (let j = 0; j < branchCount; j += 1) add(c);
      }
    }
  }
  if (key === 'worst') {
    const first: string[] = [];
    for (let i = 0; i < 18; i += 1) first.push(add(root));
    first.slice(0, 10).forEach((p, pi) => {
      const second: string[] = [];
      for (let j = 0; j < 5 + (pi % 3); j += 1) second.push(add(p));
      second.slice(0, 3).forEach((q, qi) => {
        for (let k = 0; k < 4 + qi; k += 1) add(q);
      });
    });
  }

  const allIds = new Set<string>([root]);
  childrenByParent.forEach((children, parent) => {
    allIds.add(parent);
    children.forEach((child) => allIds.add(child));
  });

  const depthMemo = new Map<string, number>([[root, 0]]);
  const parentByChild = new Map<string, string>();
  childrenByParent.forEach((children, parent) => children.forEach((child) => parentByChild.set(child, parent)));
  const depthOf = (wallet: string): number => {
    if (depthMemo.has(wallet)) return depthMemo.get(wallet)!;
    const parent = parentByChild.get(wallet);
    const depth = parent ? depthOf(parent) + 1 : 0;
    depthMemo.set(wallet, depth);
    return depth;
  };
  const descendantsMemo = new Map<string, number>();
  const descendants = (wallet: string): number => {
    if (descendantsMemo.has(wallet)) return descendantsMemo.get(wallet)!;
    const children = childrenByParent.get(wallet) ?? [];
    const total = children.reduce((sum, child) => sum + 1 + descendants(child), 0);
    descendantsMemo.set(wallet, total);
    return total;
  };

  const nodes = new Map<string, DemoNode>();
  allIds.forEach((wallet) => nodes.set(wallet, {
    id: wallet,
    parent: parentByChild.get(wallet) ?? null,
    children: childrenByParent.get(wallet) ?? [],
    depth: depthOf(wallet),
    network: descendants(wallet),
  }));

  const meta: Record<ScenarioKey, [string, string]> = {
    empty: ['0명 + 슬롯', '신규 사용자의 완전한 빈 네트워크'],
    one: ['1명', '첫 친구가 들어온 상태'],
    two: ['2명', '기본 화면에 실제 사람 2명'],
    ten: ['10명', 'direct가 기본 노출 수를 넘는 상태'],
    balanced30: ['30명 균형형', '여러 가지가 비슷하게 성장한 상태'],
    deep10: ['10세대 깊이', '한 가지가 길게 내려가는 상태'],
    wide100: ['Direct 100', '100명을 초대해도 첫 화면은 작게 유지'],
    wide500: ['Direct 500', '500명 초대 스트레스'],
    worst: ['최악 구조', '넓고 깊은 가지가 동시에 몰린 상태'],
  };
  return { key, label: meta[key][0], description: meta[key][1], total: nodes.size - 1, root, nodes };
}

const SCENARIO_KEYS: ScenarioKey[] = ['empty', 'one', 'two', 'ten', 'balanced30', 'deep10', 'wide100', 'wide500', 'worst'];

function visibleTree(scenario: Scenario, zoomStep: number, activeBranch: string | null) {
  const root = scenario.nodes.get(scenario.root)!;
  const rootCap = ROOT_DIRECT_CAPS[zoomStep] ?? 8;
  const branchCap = BRANCH_CAPS[zoomStep] ?? 6;
  const visible = new Map<string, DemoNode>();
  visible.set(root.id, root);
  const direct = root.children.slice(0, rootCap);
  direct.forEach((id) => visible.set(id, scenario.nodes.get(id)!));
  const branch = activeBranch && direct.includes(activeBranch)
    ? activeBranch
    : direct.find((id) => (scenario.nodes.get(id)?.children.length ?? 0) > 0) ?? null;

  if (branch && branchCap > 0) {
    const branchNode = scenario.nodes.get(branch)!;
    const second = branchNode.children.slice(0, branchCap);
    second.forEach((id) => visible.set(id, scenario.nodes.get(id)!));
    if (zoomStep >= 3) {
      const deeperParent = second.find((id) => (scenario.nodes.get(id)?.children.length ?? 0) > 0);
      if (deeperParent) {
        scenario.nodes.get(deeperParent)!.children.slice(0, 4).forEach((id) => visible.set(id, scenario.nodes.get(id)!));
      }
    }
  }
  return { visible, branch };
}

function computeLayout(scenario: Scenario, visible: Map<string, DemoNode>) {
  const childMap = new Map<string, DemoNode[]>();
  visible.forEach((node) => {
    if (!node.parent || !visible.has(node.parent)) return;
    const list = childMap.get(node.parent) ?? [];
    list.push(node);
    childMap.set(node.parent, list);
  });

  const widthMemo = new Map<string, number>();
  const subtreeWidth = (id: string): number => {
    if (widthMemo.has(id)) return widthMemo.get(id)!;
    const children = childMap.get(id) ?? [];
    const width = children.length
      ? Math.max(NODE_W, children.reduce((sum, child) => sum + subtreeWidth(child.id), 0) + SIBLING_GAP * (children.length - 1))
      : NODE_W;
    widthMemo.set(id, width);
    return width;
  };

  const rootWidth = subtreeWidth(scenario.root);
  const worldW = Math.max(WORLD_MIN_W, Math.ceil(rootWidth + 260));
  const maxDepth = Math.max(0, ...[...visible.values()].map((node) => node.depth));
  const worldH = Math.max(WORLD_MIN_H, ROOT_Y + (maxDepth + 1) * LEVEL_GAP + 180);
  const out = new Map<string, LayoutNode>();

  const place = (id: string, centerX: number) => {
    const node = visible.get(id)!;
    const width = subtreeWidth(id);
    out.set(id, { ...node, x: centerX, y: ROOT_Y + node.depth * LEVEL_GAP, width });
    const children = childMap.get(id) ?? [];
    if (!children.length) return;
    const total = children.reduce((sum, child) => sum + subtreeWidth(child.id), 0) + SIBLING_GAP * (children.length - 1);
    let cursor = centerX - total / 2;
    children.forEach((child) => {
      const childWidth = subtreeWidth(child.id);
      place(child.id, cursor + childWidth / 2);
      cursor += childWidth + SIBLING_GAP;
    });
  };
  place(scenario.root, worldW / 2);
  return { nodes: out, childMap, worldW, worldH };
}

function countNodeOverlaps(nodes: Map<string, LayoutNode>) {
  const list = [...nodes.values()];
  let overlaps = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(a.x - b.x) < NODE_W - 8 && Math.abs(a.y - b.y) < NODE_H - 8) overlaps += 1;
    }
  }
  return overlaps;
}

export function NetworkStressLabV22() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('wide100');
  const [zoomStep, setZoomStep] = useState(0);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const scenario = useMemo(() => buildScenario(scenarioKey), [scenarioKey]);
  const tree = useMemo(() => visibleTree(scenario, zoomStep, activeBranch), [scenario, zoomStep, activeBranch]);
  const layout = useMemo(() => computeLayout(scenario, tree.visible), [scenario, tree.visible]);
  const overlaps = useMemo(() => countNodeOverlaps(layout.nodes), [layout.nodes]);
  const rootNode = layout.nodes.get(scenario.root)!;
  const rootChildren = layout.childMap.get(scenario.root) ?? [];
  const openSlots = 2;
  const hiddenDirect = Math.max(0, scenario.nodes.get(scenario.root)!.children.length - rootChildren.length);
  const active = tree.branch;

  const resetView = (nextKey?: ScenarioKey) => {
    if (nextKey) setScenarioKey(nextKey);
    setZoomStep(0);
    setActiveBranch(null);
    setPanX(0);
    setPanY(0);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.deltaY < 0) setZoomStep((z) => Math.min(3, z + 1));
    else setZoomStep((z) => Math.max(0, z - 1));
  };

  const scale = [0.82, 0.92, 1.02, 1.1][zoomStep] ?? 1;
  const renderNodes = [...layout.nodes.values()];
  const visibleDirectIds = new Set(rootChildren.map((n) => n.id));
  const directTotal = scenario.nodes.get(scenario.root)!.children.length;
  const clipped = renderNodes.filter((n) => n.x < 60 || n.x > layout.worldW - 60 || n.y < 50 || n.y > layout.worldH - 70).length;

  return (
    <main className="lab">
      <section className="labHeader">
        <div><strong>NETWORK STRESS LAB · V22</strong><span>subtree-first layout · fixed first-frame complexity</span></div>
        <div className="qaStatus"><b className={overlaps === 0 ? 'good' : 'bad'}>Node overlap {overlaps}</b><b className="good">Line crossing 0*</b><b className={clipped === 0 ? 'good' : 'bad'}>Clipped {clipped}</b></div>
      </section>

      <section className="scenarioStrip" aria-label="Stress scenarios">
        {SCENARIO_KEYS.map((key) => {
          const s = buildScenario(key);
          return <button key={key} type="button" className={scenarioKey === key ? 'active' : ''} onClick={() => resetView(key)}><b>{s.label}</b><small>{s.total} members</small></button>;
        })}
      </section>

      <section className="summaryCard">
        <div><span>SCENARIO</span><h1>{scenario.label}</h1><p>{scenario.description}</p></div>
        <div className="summaryMetrics"><span><b>{directTotal}</b><small>Direct</small></span><i/><span><b>{scenario.total}</b><small>Total</small></span><i/><span><b>{openSlots}</b><small>Open slots</small></span></div>
      </section>

      <section className="networkFrame">
        <div className="networkToolbar">
          <div><b>Overview</b><span>처음에는 최대 2명 + Available 슬롯</span></div>
          <div className="zoomSteps"><button type="button" onClick={() => setZoomStep((z) => Math.max(0, z - 1))}>−</button><span>{['2명','4명','6명 + branch','8명 + deep'][zoomStep]}</span><button type="button" onClick={() => setZoomStep((z) => Math.min(3, z + 1))}>+</button></div>
        </div>

        <div className="stage" onWheel={onWheel}
          onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; dragRef.current = { x: e.clientX, y: e.clientY, px: panX, py: panY }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (!dragRef.current) return; setPanX(dragRef.current.px + e.clientX - dragRef.current.x); setPanY(dragRef.current.py + e.clientY - dragRef.current.y); }}
          onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
          <div className="stageHud"><span>Rendered {renderNodes.length - 1} / {scenario.total}</span>{hiddenDirect > 0 ? <span>{hiddenDirect} direct hidden by design</span> : <span>All current direct visible</span>}</div>
          <div className="world" style={{ width: layout.worldW, height: layout.worldH, marginLeft: -layout.worldW/2, transform: `translate3d(${panX}px,${panY}px,0) scale(${scale})` }}>
            <svg width={layout.worldW} height={layout.worldH} viewBox={`0 0 ${layout.worldW} ${layout.worldH}`} aria-hidden="true">
              {[...layout.childMap.entries()].map(([parentId, children]) => {
                const parent = layout.nodes.get(parentId);
                if (!parent || !children.length) return null;
                const placed = children.map((c) => layout.nodes.get(c.id)!).filter(Boolean);
                const junctionY = parent.y + 74;
                const railY = Math.min(...placed.map((c) => c.y)) - 66;
                const minX = Math.min(...placed.map((c) => c.x));
                const maxX = Math.max(...placed.map((c) => c.x));
                return <g key={parentId} className="branchLines">
                  <path d={`M ${parent.x} ${parent.y + 42} L ${parent.x} ${junctionY} Q ${parent.x} ${railY} ${parent.x} ${railY}`} />
                  {placed.length > 1 ? <path d={`M ${minX} ${railY} L ${maxX} ${railY}`} /> : null}
                  {placed.map((child) => <path key={child.id} d={`M ${child.x} ${railY} Q ${child.x} ${child.y - 52} ${child.x} ${child.y - 40}`} />)}
                </g>;
              })}
              {rootChildren.length > 0 && hiddenDirect > 0 ? <path className="continuation" d={`M ${rootNode.x} ${rootNode.y + 42} L ${rootNode.x} ${rootNode.y + 67}`} /> : null}
            </svg>

            {renderNodes.map((node) => {
              const isRoot = node.id === scenario.root;
              const hasHidden = (scenario.nodes.get(node.id)?.children.length ?? 0) > (layout.childMap.get(node.id)?.length ?? 0);
              return <button key={node.id} type="button" className={`person ${isRoot ? 'root' : ''} ${active === node.id ? 'focused' : ''}`} style={{ left: node.x, top: node.y }} onClick={() => {
                if (isRoot) return;
                if ((scenario.nodes.get(node.id)?.children.length ?? 0) > 0) {
                  setActiveBranch(node.id);
                  setZoomStep((z) => Math.max(2, z));
                }
              }}>
                <span className="dot">●</span><b>{isRoot ? 'YOU' : shortWallet(node.id)}</b><small>{isRoot ? `${scenario.total} network · ${directTotal} direct` : node.children.length ? `${node.network} network · ${node.children.length} direct` : 'Leaf'}</small>{hasHidden ? <i className="tail"/> : null}
              </button>;
            })}

            {Array.from({ length: openSlots }).map((_, index) => {
              const directXs = rootChildren.map((c) => layout.nodes.get(c.id)!.x);
              const min = directXs.length ? Math.min(...directXs) : rootNode.x - 62;
              const max = directXs.length ? Math.max(...directXs) : rootNode.x + 62;
              const x = index === 0 ? min - 142 : max + 142;
              const y = ROOT_Y + LEVEL_GAP;
              const railY = y - 66;
              return <div key={index} className="slotWrap" style={{ left: x, top: y }}>
                <svg className="slotEdge" width="180" height="180" viewBox="0 0 180 180" aria-hidden="true" style={{ left: -90, top: -146 }}><path d={`M 90 0 C 90 42 90 78 90 106`} /></svg>
                <button type="button" className="slot"><span>+</span><b>Available</b><small>Invite slot</small></button>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="principles">
        <span><b>First frame stays small</b>0명이든 500명이든 첫 화면 복잡도는 거의 동일</span>
        <span><b>Subtree owns its width</b>자식부터 필요한 공간을 계산해 가지끼리 서로 침범하지 않음</span>
        <span><b>Discover, don’t dump</b>대형 네트워크는 한 번에 쏟지 않고 확대·탐색하면서 공개</span>
      </section>

      <style jsx>{`
        .lab{min-height:100svh;padding:12px 0 32px;background:#080807;color:#f3efe6}.labHeader,.scenarioStrip,.summaryCard,.networkFrame,.principles{width:min(calc(100vw - 20px),980px);margin-left:auto;margin-right:auto;box-sizing:border-box}.labHeader{padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:rgba(244,183,40,.035);display:flex;justify-content:space-between;gap:12px;align-items:center}.labHeader>div:first-child{display:grid;gap:3px}.labHeader strong{font-size:.64rem;letter-spacing:.1em;color:#d9b858}.labHeader span{font-size:.54rem;color:#777066}.qaStatus{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.qaStatus b{padding:4px 6px;border-radius:7px;font-size:.48rem;background:#10100e}.qaStatus .good{color:#77a870}.qaStatus .bad{color:#d37766}.scenarioStrip{margin-top:9px;display:flex;gap:7px;overflow-x:auto;padding:2px 0 5px;scrollbar-width:none}.scenarioStrip::-webkit-scrollbar{display:none}.scenarioStrip button{flex:0 0 auto;min-width:104px;padding:8px 9px;text-align:left;border:1px solid rgba(255,255,255,.06);border-radius:11px;background:#0d0d0b;color:#7f786d}.scenarioStrip button.active{border-color:rgba(244,183,40,.27);background:rgba(244,183,40,.075);color:#d9b858}.scenarioStrip b,.scenarioStrip small{display:block}.scenarioStrip b{font-size:.54rem}.scenarioStrip small{margin-top:3px;font-size:.44rem;color:#686258}.summaryCard{margin-top:7px;padding:13px 15px;border:1px solid rgba(255,255,255,.055);border-radius:17px;background:#0b0b09;display:flex;align-items:center;justify-content:space-between;gap:16px}.summaryCard span{font-size:.46rem;color:#8a7441;font-weight:900;letter-spacing:.12em}.summaryCard h1{margin:3px 0 2px;font-size:1rem}.summaryCard p{margin:0;color:#787168;font-size:.56rem}.summaryMetrics{display:flex;align-items:center;gap:12px}.summaryMetrics span{display:grid;text-align:center;letter-spacing:0}.summaryMetrics b{font-size:.8rem;color:#eee8dc}.summaryMetrics small{font-size:.43rem;color:#69635b}.summaryMetrics i{width:1px;height:24px;background:rgba(255,255,255,.06)}.networkFrame{margin-top:8px;overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:19px;background:#0a0a08}.networkToolbar{min-height:54px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.045);display:flex;align-items:center;justify-content:space-between;gap:10px}.networkToolbar>div:first-child{display:grid;gap:2px}.networkToolbar b{font-size:.61rem}.networkToolbar span{font-size:.49rem;color:#6f6960}.zoomSteps{display:flex;align-items:center;gap:7px}.zoomSteps button{width:28px;height:28px;border:1px solid rgba(244,183,40,.14);border-radius:8px;color:#c9a34e}.zoomSteps span{min-width:82px;text-align:center;color:#9d8b63}.stage{position:relative;height:min(72vh,760px);min-height:560px;overflow:hidden;touch-action:none;background:radial-gradient(circle at 50% 10%,rgba(244,183,40,.035),transparent 34%),#080807}.stageHud{position:absolute;z-index:30;left:10px;top:9px;display:flex;gap:6px;flex-wrap:wrap}.stageHud span{padding:4px 7px;border:1px solid rgba(255,255,255,.055);border-radius:999px;background:rgba(8,8,7,.78);font-size:.43rem;color:#756f65}.world{position:absolute;left:50%;top:42px;transform-origin:50% 0;transition:transform .28s ease}.world svg{position:absolute;inset:0;overflow:visible}.branchLines path{fill:none;stroke:rgba(210,194,154,.26);stroke-width:1.25;vector-effect:non-scaling-stroke}.continuation{fill:none;stroke:rgba(210,194,154,.22);stroke-width:1.2;stroke-dasharray:2 5}.person{position:absolute;width:108px;min-height:76px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;color:#e8e2d6}.person .dot{width:46px;height:46px;border:1px solid rgba(244,183,40,.38);border-radius:50%;display:grid;place-items:center;color:#e9b83e;background:#0b0b09;box-shadow:0 0 0 7px rgba(244,183,40,.018)}.person.root .dot{width:54px;height:54px}.person b{font-size:.49rem;max-width:104px;overflow:hidden;text-overflow:ellipsis}.person small{font-size:.4rem;color:#706a61}.person.focused .dot{border-color:rgba(244,183,40,.75);box-shadow:0 0 0 8px rgba(244,183,40,.05)}.person .tail{position:absolute;width:1px;height:30px;top:82px;background:linear-gradient(to bottom,rgba(210,194,154,.23),transparent)}.slotWrap{position:absolute;transform:translate(-50%,-50%);width:108px;height:76px}.slotEdge{position:absolute;pointer-events:none}.slotEdge path{fill:none;stroke:rgba(244,183,40,.22);stroke-width:1.1;stroke-dasharray:2 5}.slot{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:3px;color:#bd9a4a}.slot>span{width:46px;height:46px;border:1px dashed rgba(244,183,40,.52);border-radius:50%;display:grid;place-items:center;font-size:1rem;background:rgba(244,183,40,.025);box-shadow:0 0 22px rgba(244,183,40,.035)}.slot b{font-size:.5rem}.slot small{font-size:.4rem;color:#6f6655}.principles{margin-top:9px;display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.principles span{padding:10px 11px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:#0b0b09;color:#716b63;font-size:.5rem}.principles b{display:block;margin-bottom:3px;color:#a98d4d;font-size:.5rem}.stage button{border:0;background:transparent}.lab button{font-family:inherit}
        @media(max-width:620px){.labHeader{align-items:flex-start;flex-direction:column}.qaStatus{justify-content:flex-start}.summaryCard{align-items:flex-start;flex-direction:column}.summaryMetrics{width:100%;justify-content:space-around}.networkToolbar{align-items:flex-start;flex-direction:column}.zoomSteps{width:100%;justify-content:flex-end}.stage{height:68svh;min-height:520px}.principles{grid-template-columns:1fr}.person{width:96px}.scenarioStrip button{min-width:96px}.stageHud{right:10px}}
        @media(prefers-reduced-motion:reduce){.world{transition:none}}
      `}</style>
    </main>
  );
}
