'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QaNetworkRadialPlaygroundV32 } from './QaNetworkRadialPlaygroundV32';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'direct50' | 'hundred' | 'fiveHundred';
type Scenario = { id: ScenarioId; label: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type GraphNode = { id: string; children: string[]; parent: string | null };
type SearchHit = { id: string; depth: number; path: string[] };
type PinchState = {
  startDistance: number;
  lastStep: number;
  candidate: HTMLButtonElement | null;
  readyEnter: boolean;
  readyBack: boolean;
};

const ROOT = 'root';
const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'five', label: '5명', direct: 5, total: 12, depth: 3, fanout: 2, openSlots: 2 },
  { id: 'balanced30', label: '30명', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'direct50', label: '직접 50', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', direct: 40, total: 500, depth: 7, fanout: 5, openSlots: 2 },
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

function collectBelow(graph: Map<string, GraphNode>, centerId: string) {
  const result: SearchHit[] = [];
  const seen = new Set<string>([centerId]);
  const walk = (parent: string, path: string[], depth: number) => {
    for (const child of graph.get(parent)?.children ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      const nextPath = [...path, child];
      result.push({ id: child, depth, path: nextPath });
      walk(child, nextPath, depth + 1);
    }
  };
  walk(centerId, [centerId], 1);
  return result;
}

function pathFromAncestor(graph: Map<string, GraphNode>, ancestor: string, target: string) {
  const reverse = [target];
  let cursor = graph.get(target)?.parent ?? null;
  while (cursor && cursor !== ancestor) {
    reverse.push(cursor);
    cursor = graph.get(cursor)?.parent ?? null;
  }
  if (cursor !== ancestor) return null;
  reverse.push(ancestor);
  return reverse.reverse();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function QaNetworkRadialPlaygroundV33() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastContextRef = useRef('');
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null);
  const [networkTopTarget, setNetworkTopTarget] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [contextVersion, setContextVersion] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [navBusy, setNavBusy] = useState(false);
  const [zoomCue, setZoomCue] = useState<string | null>(null);

  const readContext = () => {
    const root = rootRef.current;
    const activeLabel = root?.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '30명';
    const scenario = SCENARIOS.find((item) => item.label === activeLabel) ?? SCENARIOS[3];
    const graph = makeGraph(scenario);
    const centerLabel = root?.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
    let centerId = ROOT;
    if (centerLabel !== 'YOU') {
      for (const id of graph.keys()) {
        if (shortId(id) === centerLabel) {
          centerId = id;
          break;
        }
      }
    }
    return { scenario, graph, centerId, centerLabel };
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const sync = () => {
      setNavTarget(root.querySelector<HTMLElement>('.navActions'));
      setNetworkTopTarget(root.querySelector<HTMLElement>('.networkTop'));
      setDebugOpen(Boolean(root.querySelector('.debugPanel')));
      const identity = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      const scenario = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '30명';
      const key = `${scenario}|${identity}`;
      if (lastContextRef.current !== key) {
        lastContextRef.current = key;
        setContextVersion((value) => value + 1);
        setSearchOpen(false);
        setQuery('');
      }
    };
    frame = window.requestAnimationFrame(sync);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const searchResults = useMemo(() => {
    void contextVersion;
    const value = query.trim().toLowerCase();
    if (!value || !rootRef.current) return [] as SearchHit[];
    const { graph, centerId } = readContext();
    return collectBelow(graph, centerId)
      .filter((hit) => {
        const address = fakeAddress(hit.id).toLowerCase();
        const short = shortId(hit.id).toLowerCase();
        return address.includes(value) || short.includes(value) || hit.id.toLowerCase().includes(value);
      })
      .sort((a, b) => a.depth - b.depth || shortId(a.id).localeCompare(shortId(b.id)))
      .slice(0, 8);
  }, [query, contextVersion]);

  const currentPageNumber = () => {
    const text = rootRef.current?.querySelector<HTMLElement>('.pager span')?.textContent ?? '1/1';
    const parsed = Number.parseInt(text.split('/')[0] ?? '1', 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed - 1) : 0;
  };

  const findPersonButton = (id: string) => {
    const label = shortId(id);
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('button.ringNode.person') ?? []);
    return buttons.find((button) => button.querySelector('b')?.textContent?.trim() === label) ?? null;
  };

  const ensureChildPage = async (parentId: string, childId: string, graph: Map<string, GraphNode>) => {
    const root = rootRef.current;
    if (!root) return false;
    const children = graph.get(parentId)?.children ?? [];
    const index = children.indexOf(childId);
    if (index < 0) return false;
    const perPage = window.innerWidth <= 640 ? 8 : 10;
    const targetPage = Math.floor(index / perPage);
    let guard = 0;
    while (currentPageNumber() !== targetPage && guard < 20) {
      const pager = root.querySelector('.pager');
      if (!pager) break;
      const current = currentPageNumber();
      const buttons = pager.querySelectorAll<HTMLButtonElement>('button');
      const button = current < targetPage ? buttons[buttons.length - 1] : buttons[0];
      if (!button || button.disabled) return false;
      button.click();
      await sleep(360);
      guard += 1;
    }
    return currentPageNumber() === targetPage;
  };

  const highlightNode = async (id: string) => {
    await sleep(80);
    const button = findPersonButton(id);
    if (!button) return;
    button.classList.add('searchHit');
    setZoomCue(`Found ${shortId(id)}`);
    window.setTimeout(() => button.classList.remove('searchHit'), 2200);
    window.setTimeout(() => setZoomCue(null), 1500);
  };

  const locateSearchResult = async (targetId: string) => {
    if (navBusy) return;
    const root = rootRef.current;
    if (!root) return;
    setNavBusy(true);
    setSearchOpen(false);
    try {
      const { graph, centerId } = readContext();
      const route = pathFromAncestor(graph, centerId, targetId);
      if (!route || route.length < 2) return;

      const editButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions>button')).find((button) => button.textContent?.includes('Done'));
      if (editButton) {
        editButton.click();
        await sleep(100);
      }

      let activeCenter = centerId;
      for (const nextCenter of route.slice(1, -1)) {
        const ready = await ensureChildPage(activeCenter, nextCenter, graph);
        if (!ready) return;
        const node = findPersonButton(nextCenter);
        if (!node) return;
        node.click();
        await sleep(900);
        activeCenter = nextCenter;
      }

      const targetReady = await ensureChildPage(activeCenter, targetId, graph);
      if (!targetReady) return;
      await highlightNode(targetId);
    } finally {
      setNavBusy(false);
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const wheelState = { enterLabel: '', enterCharge: 0, exitCharge: 0, lastAt: 0, candidate: null as HTMLButtonElement | null };

    const clearCandidate = () => {
      wheelState.candidate?.classList.remove('zoomTarget');
      wheelState.candidate = null;
      wheelState.enterLabel = '';
      wheelState.enterCharge = 0;
    };

    const zoomPercent = () => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      return Number.parseInt(text, 10) || 100;
    };

    const resetZoomSoon = () => {
      window.setTimeout(() => root.querySelector<HTMLButtonElement>('.zoomValue')?.click(), 560);
    };

    const triggerEnter = (button: HTMLButtonElement) => {
      const label = button.querySelector('b')?.textContent?.trim() ?? 'network';
      clearCandidate();
      setZoomCue(`Entering ${label}`);
      window.setTimeout(() => button.click(), 60);
      resetZoomSoon();
      window.setTimeout(() => setZoomCue(null), 1250);
    };

    const triggerBack = () => {
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions>button')).find((button) => button.textContent?.includes('Inviter'));
      if (!inviter || inviter.disabled) return;
      setZoomCue('Returning to previous network');
      inviter.click();
      resetZoomSoon();
      window.setTimeout(() => setZoomCue(null), 1250);
    };

    const personAt = (x: number, y: number) => {
      const direct = document.elementFromPoint(x, y)?.closest('button.ringNode.person') as HTMLButtonElement | null;
      if (direct && root.contains(direct)) return direct;
      let best: HTMLButtonElement | null = null;
      let bestDistance = 88;
      for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button.ringNode.person'))) {
        const rect = button.getBoundingClientRect();
        const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
        if (distance < bestDistance) {
          best = button;
          bestDistance = distance;
        }
      }
      return best;
    };

    const onWheel = (event: globalThis.WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const stage = target?.closest('.stage') as HTMLElement | null;
      if (!stage || !root.contains(stage) || stage.classList.contains('editMode') || Math.abs(event.deltaY) < 1) return;
      const now = Date.now();
      if (now - wheelState.lastAt > 900) {
        clearCandidate();
        wheelState.exitCharge = 0;
      }
      wheelState.lastAt = now;
      const compact = window.innerWidth <= 640;
      const percent = zoomPercent();
      const amount = Math.min(.7, Math.max(.24, Math.abs(event.deltaY) / 140));

      if (event.deltaY < 0) {
        wheelState.exitCharge = 0;
        const button = personAt(event.clientX, event.clientY);
        if (!button || button.disabled) {
          clearCandidate();
          return;
        }
        const label = button.querySelector('b')?.textContent?.trim() ?? '';
        if (wheelState.enterLabel !== label) {
          clearCandidate();
          wheelState.enterLabel = label;
          wheelState.candidate = button;
          button.classList.add('zoomTarget');
        }
        if (percent >= (compact ? 103 : 114)) {
          wheelState.enterCharge += amount;
          if (wheelState.enterCharge >= 1.15) {
            event.preventDefault();
            event.stopImmediatePropagation();
            triggerEnter(button);
          }
        }
        return;
      }

      clearCandidate();
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      if (center === 'YOU') {
        wheelState.exitCharge = 0;
        return;
      }
      if (percent <= (compact ? 60 : 50)) {
        wheelState.exitCharge += amount;
        if (wheelState.exitCharge >= 1.15) {
          event.preventDefault();
          event.stopImmediatePropagation();
          wheelState.exitCharge = 0;
          triggerBack();
        }
      }
    };

    const pinchRef = { current: null as PinchState | null };
    const touchPointers = new Map<number, EventTarget | null>();

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const existing = [...touchPointers.entries()];
      touchPointers.set(event.pointerId, event.target);
      if (existing.length >= 1) {
        for (const [pointerId, target] of existing) {
          if (!(target instanceof Element)) continue;
          try {
            target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'touch' }));
          } catch { /* Safari fallback: touch gesture still owns the interaction */ }
        }
        event.stopPropagation();
      }
    };
    const onPointerRelease = (event: PointerEvent) => touchPointers.delete(event.pointerId);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const [a, b] = [event.touches[0], event.touches[1]];
      const midpointX = (a.clientX + b.clientX) / 2;
      const midpointY = (a.clientY + b.clientY) / 2;
      pinchRef.current = {
        startDistance: Math.max(1, touchDistance(a, b)),
        lastStep: 0,
        candidate: personAt(midpointX, midpointY),
        readyEnter: false,
        readyBack: false,
      };
      pinchRef.current.candidate?.classList.add('zoomTarget');
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      const ratio = touchDistance(a, b) / pinch.startDistance;
      const outward = ratio >= 1;
      const step = outward ? Math.floor((ratio - 1) / .12) : -Math.floor((1 - ratio) / .09);
      if (step !== pinch.lastStep) {
        const direction = step > pinch.lastStep ? 1 : -1;
        const button = root.querySelectorAll<HTMLButtonElement>('.zoomControls button')[direction > 0 ? 2 : 0];
        const count = Math.min(5, Math.abs(step - pinch.lastStep));
        for (let i = 0; i < count; i += 1) button?.click();
        pinch.lastStep = step;
      }
      const editMode = Boolean(root.querySelector('.stage.editMode'));
      if (!editMode && pinch.candidate && ratio > 1.44) pinch.readyEnter = true;
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      if (!editMode && center !== 'YOU' && ratio < .58) pinch.readyBack = true;
    };

    const finishPinch = () => {
      const pinch = pinchRef.current;
      if (!pinch) return;
      pinch.candidate?.classList.remove('zoomTarget');
      pinchRef.current = null;
      if (pinch.readyEnter && pinch.candidate && !pinch.candidate.disabled) triggerEnter(pinch.candidate);
      else if (pinch.readyBack) triggerBack();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) finishPinch();
    };

    root.addEventListener('wheel', onWheel, { capture: true, passive: false });
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointerup', onPointerRelease, true);
    root.addEventListener('pointercancel', onPointerRelease, true);
    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    root.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    root.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });

    return () => {
      clearCandidate();
      root.removeEventListener('wheel', onWheel, true);
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointerup', onPointerRelease, true);
      root.removeEventListener('pointercancel', onPointerRelease, true);
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', onTouchEnd, true);
      root.removeEventListener('touchcancel', onTouchEnd, true);
      touchPointers.clear();
    };
  }, []);

  return (
    <div ref={rootRef} className={`v33Root ${debugOpen ? 'showDebugScenarios' : ''}`}>
      <QaNetworkRadialPlaygroundV32 />

      {navTarget ? createPortal(
        <button type="button" className={searchOpen ? 'v33SearchButton active' : 'v33SearchButton'} onClick={() => setSearchOpen((value) => !value)} disabled={navBusy} aria-label="Search network">
          ⌕ Search
        </button>,
        navTarget,
      ) : null}

      {networkTopTarget && searchOpen ? createPortal(
        <div className="v33SearchPanel">
          <div className="v33SearchHead">
            <div><b>Search this network</b><small>Find a wallet first · then click or zoom to enter</small></div>
            <button type="button" onClick={() => setSearchOpen(false)}>×</button>
          </div>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Wallet address / 0x…" spellCheck={false} />
          <div className="v33SearchResults">
            {!query.trim() ? <div className="v33SearchEmpty">Search by full or short wallet address.</div> : null}
            {query.trim() && !searchResults.length ? <div className="v33SearchEmpty">No matching wallet in this network.</div> : null}
            {searchResults.map((hit) => (
              <button key={hit.id} type="button" onClick={() => void locateSearchResult(hit.id)} disabled={navBusy}>
                <span><b>{shortId(hit.id)}</b><small>{fakeAddress(hit.id)}</small></span>
                <em>{hit.path.slice(1).map(shortId).join(' › ')}</em>
              </button>
            ))}
          </div>
        </div>,
        networkTopTarget,
      ) : null}

      {zoomCue ? <div className="v33ZoomCue">{zoomCue}</div> : null}

      <style jsx global>{`
        .v33Root{position:relative}
        .v33Root .labHeader>div:first-child strong,.v33Root .labHeader>div:first-child span{display:none!important}
        .v33Root .labHeader>div:first-child::before{content:'RADIAL NETWORK PLAYGROUND · V33';font-size:.58rem;letter-spacing:.09em;color:#d9b653;font-weight:700}
        .v33Root .labHeader>div:first-child::after{content:'Search · zoom-to-enter · zoom-out-to-back · personal layout';font-size:.48rem;color:#7e776c}
        .v33Root .scenarioBar{display:none}
        .v33Root.showDebugScenarios .scenarioBar{display:flex}
        .v33Root .networkTop{position:relative}
        .v33Root .v33SearchButton{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0e0e0c;color:#918a7e;font-size:.48rem;white-space:nowrap;order:-1}
        .v33Root .v33SearchButton.active{border-color:rgba(244,183,40,.32);background:rgba(244,183,40,.08);color:#ddb958}
        .v33Root .v33SearchPanel{position:absolute;right:8px;top:calc(100% + 7px);width:min(360px,calc(100vw - 34px));padding:9px;border:1px solid rgba(244,183,40,.18);border-radius:12px;background:rgba(10,10,8,.97);backdrop-filter:blur(16px);box-shadow:0 18px 50px rgba(0,0,0,.42);z-index:90}
        .v33Root .v33SearchHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.v33Root .v33SearchHead>div{display:grid;gap:2px}.v33Root .v33SearchHead b{font-size:.52rem;color:#c8aa57}.v33Root .v33SearchHead small{font-size:.38rem;color:#686157}.v33Root .v33SearchHead>button{border:0;background:transparent;color:#777065;font-size:.8rem;line-height:1}
        .v33Root .v33SearchPanel input{box-sizing:border-box;width:100%;height:34px;margin-top:8px;padding:0 10px;border:1px solid rgba(255,255,255,.08);border-radius:9px;outline:0;background:#0e0e0c;color:#ddd6c8;font-size:.48rem}.v33Root .v33SearchPanel input:focus{border-color:rgba(244,183,40,.36);box-shadow:0 0 0 2px rgba(244,183,40,.045)}
        .v33Root .v33SearchResults{display:grid;gap:4px;margin-top:6px;max-height:272px;overflow:auto}.v33Root .v33SearchResults>button{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border:1px solid rgba(255,255,255,.05);border-radius:9px;background:#0b0b09;color:#aaa397;text-align:left}.v33Root .v33SearchResults>button:hover{border-color:rgba(244,183,40,.2);background:rgba(244,183,40,.04)}.v33Root .v33SearchResults span{display:grid;gap:1px;min-width:0}.v33Root .v33SearchResults b{font-size:.48rem;color:#c4a654}.v33Root .v33SearchResults small{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.34rem;color:#625c53}.v33Root .v33SearchResults em{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;font-size:.34rem;color:#756a51}.v33Root .v33SearchEmpty{padding:12px 8px;text-align:center;font-size:.4rem;color:#665f55}
        .v33Root .ringNode.person.zoomTarget .ringCircle{border-color:rgba(244,183,40,.88)!important;box-shadow:0 0 34px rgba(244,183,40,.16)!important;transform:scale(1.09)!important}.v33Root .ringNode.person.zoomTarget b{color:#e0c36f}
        .v33Root .ringNode.person.searchHit{z-index:28}.v33Root .ringNode.person.searchHit .floatInner{animation:none}.v33Root .ringNode.person.searchHit .ringCircle{animation:v33SearchHit 1.55s ease-in-out 1;border-color:rgba(244,183,40,.95);box-shadow:0 0 40px rgba(244,183,40,.2)}.v33Root .ringNode.person.searchHit b{color:#ead17f}
        .v33ZoomCue{position:fixed;left:50%;bottom:max(26px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:8px 11px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(10,10,8,.94);color:#c9ad61;font-size:.44rem;z-index:120;pointer-events:none;box-shadow:0 12px 36px rgba(0,0,0,.28)}
        @keyframes v33SearchHit{0%,100%{transform:scale(1)}35%{transform:scale(1.13)}65%{transform:scale(1.05)}}
        @media(max-width:640px){.v33Root .labHeader>div:first-child::after{display:none}.v33Root .v33SearchButton{order:0}.v33Root .v33SearchPanel{left:8px;right:8px;top:calc(100% + 6px);width:auto}.v33Root .v33SearchResults small{max-width:155px}.v33Root .v33SearchResults em{max-width:105px}}
        @media(prefers-reduced-motion:reduce){.v33Root .ringNode.person.searchHit .ringCircle{animation:none}}
      `}</style>
    </div>
  );
}
