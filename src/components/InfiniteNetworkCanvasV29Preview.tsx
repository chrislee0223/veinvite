'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useGetAvatar, useVechainDomain } from '@vechain/vechain-kit';

import { Brand } from './Brand';
import { AppBottomNavigation } from './AppBottomNavigation';
import type { SupportedLocale } from '@/lib/i18n/locales';

type Scenario = 'balanced' | 'wide' | 'deep';
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Tone = 'focus' | 'near' | 'dim' | 'normal';

type Node = {
  id: string;
  wallet: string;
  status: Status;
  children: Node[];
};

type Stats = { network: number; direct: number; qualified: number; growth: number };

type PersonVisual = {
  kind: 'person';
  key: string;
  id: string;
  x: number;
  y: number;
  parentId: string | null;
  parentX: number;
  parentY: number;
  depth: number;
  stagger: number;
};

type ClusterVisual = {
  kind: 'cluster';
  key: string;
  parentId: string;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  remaining: number;
  depth: number;
  stagger: number;
};

type Visual = PersonVisual | ClusterVisual;

type Edge = {
  key: string;
  fromId: string;
  toKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fresh: boolean;
  stagger: number;
};

type Pager = {
  parentId: string;
  x: number;
  y: number;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
};

type SavedState = {
  scenario: Scenario;
  expanded: string[];
  selectedId: string | null;
  explorerParentId: string | null;
  pageByParent: Array<[string, number]>;
  view: View;
};

const ROOT_ID = 'you';
const SESSION_KEY = 'veinvite-network-v29-preview';
const PLANE_W = 3000;
const PLANE_H = 2600;
const CENTER_X = PLANE_W / 2;
const ROOT_Y = 146;
const LEVEL_GAP = 106;
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.52;
const LOAD_MS = 170;
const FRESH_MS = 1080;
const AUTO_BLOOM_MS = 660;

function fullWallet(index: number) {
  return `0x${index.toString(16).padStart(40, '0')}`;
}

function shortWallet(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-3).toUpperCase()}`;
}

function statusFor(index: number): Status {
  if (index % 6 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'REWARDED';
  return 'QUALIFIED';
}

function makeNode(index: number, id: string): Node {
  return { id, wallet: fullWallet(index), status: statusFor(index), children: [] };
}

function buildBranch(seed: number, id: string, direct: number, depth: number): Node {
  let cursor = seed;
  const root = makeNode(cursor++, id);
  if (depth <= 0) return root;
  root.children = Array.from({ length: direct }, (_, index) => {
    const child = makeNode(cursor++, `${id}-${index + 1}`);
    if (depth > 1 && index < Math.min(4, direct)) {
      const nextDirect = Math.max(2, Math.min(6, direct - index + 1));
      child.children = Array.from({ length: nextDirect }, (_, childIndex) => {
        const grand = makeNode(cursor++, `${child.id}-${childIndex + 1}`);
        if (depth > 2 && childIndex < 3) {
          grand.children = Array.from(
            { length: 2 + ((childIndex + index) % 2) },
            (_, grandIndex) => makeNode(cursor++, `${grand.id}-${grandIndex + 1}`),
          );
        }
        return grand;
      });
    }
    return child;
  });
  return root;
}

function buildBalanced(): Node {
  return {
    id: ROOT_ID,
    wallet: fullWallet(999),
    status: 'REWARDED',
    children: [
      buildBranch(20, 'a', 6, 3),
      buildBranch(80, 'b', 4, 3),
      buildBranch(140, 'c', 14, 3),
      buildBranch(240, 'd', 3, 2),
      buildBranch(300, 'e', 8, 2),
    ],
  };
}

function buildWide(): Node {
  let cursor = 500;
  const root: Node = { id: ROOT_ID, wallet: fullWallet(999), status: 'REWARDED', children: [] };
  root.children = Array.from({ length: 100 }, (_, index) => {
    const child = makeNode(cursor++, `wide-${index + 1}`);
    if (index < 22) {
      child.children = Array.from(
        { length: 2 + (index % 6) },
        (_, childIndex) => makeNode(cursor++, `${child.id}-${childIndex + 1}`),
      );
    }
    return child;
  });
  return root;
}

function buildDeep(): Node {
  const root: Node = { id: ROOT_ID, wallet: fullWallet(999), status: 'REWARDED', children: [] };
  let current = root;
  for (let index = 1; index <= 50; index += 1) {
    const child = makeNode(900 + index, `deep-${index}`);
    if (index % 7 === 0) child.children.push(makeNode(1400 + index, `side-${index}`));
    current.children.push(child);
    current = child;
  }
  return root;
}

function scenarioRoot(scenario: Scenario) {
  if (scenario === 'wide') return buildWide();
  if (scenario === 'deep') return buildDeep();
  return buildBalanced();
}

function flatten(root: Node) {
  const result: Node[] = [];
  const visit = (node: Node) => {
    result.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

function computeStats(root: Node) {
  const map = new Map<string, Stats>();
  const visit = (node: Node): Stats => {
    let network = 0;
    let qualified = 0;
    let growth = 0;
    node.children.forEach((child, index) => {
      const childStats = visit(child);
      network += 1 + childStats.network;
      qualified += (child.status === 'IN_PROGRESS' ? 0 : 1) + childStats.qualified;
      growth += ((index + node.id.length) % 4 === 0 ? 1 : 0) + childStats.growth;
    });
    const value = { network, direct: node.children.length, qualified, growth };
    map.set(node.id, value);
    return value;
  };
  visit(root);
  return map;
}

function buildParentMap(root: Node) {
  const map = new Map<string, string | null>();
  const visit = (node: Node, parent: string | null) => {
    map.set(node.id, parent);
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return map;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pathToRoot(id: string | null, parentMap: Map<string, string | null>) {
  const result = new Set<string>();
  let current = id;
  while (current) {
    result.add(current);
    current = parentMap.get(current) ?? null;
  }
  return result;
}

function topBranch(id: string, parentMap: Map<string, string | null>) {
  let current = id;
  let parent = parentMap.get(current) ?? null;
  while (parent && parent !== ROOT_ID) {
    current = parent;
    parent = parentMap.get(current) ?? null;
  }
  return current === ROOT_ID ? ROOT_ID : current;
}

function isDescendantOf(id: string, ancestor: string | null, parentMap: Map<string, string | null>) {
  if (!ancestor) return false;
  if (id === ancestor) return true;
  let current = parentMap.get(id) ?? null;
  while (current) {
    if (current === ancestor) return true;
    current = parentMap.get(current) ?? null;
  }
  return false;
}

function NeutralGlyph({ root = false }: { root?: boolean }) {
  const size = root ? 38 : 30;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        border: root ? '1px solid rgba(244,183,40,.50)' : '1px solid rgba(207,191,154,.20)',
        background: root
          ? 'radial-gradient(circle at 38% 32%,rgba(244,183,40,.12),transparent 45%),#15140f'
          : 'radial-gradient(circle at 38% 32%,rgba(208,187,138,.055),transparent 45%),#141411',
        boxShadow: root
          ? '0 0 0 4px rgba(244,183,40,.045),0 0 22px rgba(244,183,40,.11)'
          : '0 5px 14px rgba(0,0,0,.20)',
      }}
    >
      <svg width={root ? 18 : 15} height={root ? 18 : 15} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="6.2" r="3" fill={root ? 'rgba(226,188,92,.78)' : 'rgba(174,164,141,.58)'} />
        <path d="M4.7 16.1c.45-3.05 2.34-4.56 5.3-4.56s4.85 1.51 5.3 4.56" stroke={root ? 'rgba(226,188,92,.78)' : 'rgba(174,164,141,.58)'} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function NetworkAvatar({ address, root = false }: { address: string; root?: boolean }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoadProfile, setShouldLoadProfile] = useState(root);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { data: domainInfo } = useVechainDomain(shouldLoadProfile ? address : undefined);
  const domain = domainInfo?.domain ?? '';
  const { data: profileAvatarUrl } = useGetAvatar(domain || undefined);
  const size = root ? 38 : 30;

  useEffect(() => {
    const node = hostRef.current;
    if (!node || shouldLoadProfile) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoadProfile(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadProfile(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoadProfile]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [profileAvatarUrl]);

  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'block', width: size, height: size }}>
      <NeutralGlyph root={root} />
      {profileAvatarUrl && !broken ? (
        <img
          src={profileAvatarUrl}
          alt=""
          loading={root ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: size,
            height: size,
            objectFit: 'cover',
            borderRadius: '50%',
            border: root ? '1px solid rgba(244,183,40,.55)' : '1px solid rgba(207,191,154,.20)',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 260ms ease',
          }}
        />
      ) : null}
    </span>
  );
}

function NeutralStack() {
  return (
    <span className="neutralStack" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ zIndex: 4 - index }}><NeutralGlyph /></span>
      ))}
    </span>
  );
}

function layoutVisible({
  root,
  expanded,
  selectedId,
  parentMap,
  explorerParentId,
  pageByParent,
  freshIds,
  freshParentId,
  isMobile,
}: {
  root: Node;
  expanded: Set<string>;
  selectedId: string | null;
  parentMap: Map<string, string | null>;
  explorerParentId: string | null;
  pageByParent: Map<string, number>;
  freshIds: Set<string>;
  freshParentId: string | null;
  isMobile: boolean;
}) {
  const visuals: Visual[] = [];
  const edges: Edge[] = [];
  const pagers: Pager[] = [];
  const pageSize = isMobile ? 5 : 8;
  const previewSize = isMobile ? 4 : 5;
  const largeThreshold = isMobile ? 6 : 12;
  const activeTop = selectedId ? topBranch(selectedId, parentMap) : null;

  const childEntries = (node: Node): Array<Node | 'cluster'> => {
    if (!expanded.has(node.id) || node.children.length < 1) return [];
    if (node.children.length <= largeThreshold) return [...node.children];
    if (explorerParentId === node.id) {
      const pageCount = Math.ceil(node.children.length / pageSize);
      const page = clamp(pageByParent.get(node.id) ?? 0, 0, pageCount - 1);
      return [...node.children.slice(page * pageSize, page * pageSize + pageSize)];
    }
    return [...node.children.slice(0, previewSize), 'cluster'];
  };

  const place = (
    node: Node,
    x: number,
    y: number,
    parent: { id: string; x: number; y: number } | null,
    depth: number,
    stagger = 0,
  ) => {
    visuals.push({
      kind: 'person', key: node.id, id: node.id, x, y,
      parentId: parent?.id ?? null,
      parentX: parent?.x ?? x,
      parentY: parent?.y ?? y,
      depth, stagger,
    });

    const entries = childEntries(node);
    if (entries.length < 1) return;
    const centerIndex = (entries.length - 1) / 2;
    const step = node.id === ROOT_ID
      ? (isMobile ? 68 : 136)
      : Math.max(isMobile ? 54 : 58, (isMobile ? 64 : 68) - depth * 3);

    entries.forEach((entry, index) => {
      const offset = index - centerIndex;
      let childX = x + offset * step;
      if (node.id === ROOT_ID && entry !== 'cluster' && activeTop && activeTop !== ROOT_ID) {
        const childIndex = root.children.findIndex((child) => child.id === entry.id);
        const activeIndex = root.children.findIndex((child) => child.id === activeTop);
        if (childIndex < activeIndex) childX -= isMobile ? 44 : 82;
        if (childIndex > activeIndex) childX += isMobile ? 44 : 82;
      }
      const fanDrop = Math.min(10, Math.abs(offset) * (node.id === ROOT_ID ? 3 : 4));
      const childY = y + LEVEL_GAP + fanDrop;
      const childStagger = Math.round(Math.abs(offset) * 38);

      if (entry === 'cluster') {
        const hidden = node.children.slice(previewSize);
        visuals.push({
          kind: 'cluster', key: `cluster:${node.id}`, parentId: node.id,
          x: childX, y: childY, parentX: x, parentY: y,
          remaining: hidden.length, depth: depth + 1, stagger: childStagger,
        });
        edges.push({
          key: `${node.id}->cluster:${node.id}`, fromId: node.id, toKey: `cluster:${node.id}`,
          x1: x, y1: y + 22, x2: childX, y2: childY - 22,
          fresh: freshParentId === node.id, stagger: childStagger,
        });
        return;
      }

      edges.push({
        key: `${node.id}->${entry.id}`, fromId: node.id, toKey: entry.id,
        x1: x, y1: y + 22, x2: childX, y2: childY - 22,
        fresh: freshIds.has(entry.id), stagger: childStagger,
      });
      place(entry, childX, childY, { id: node.id, x, y }, depth + 1, childStagger);
    });

    if (explorerParentId === node.id && node.children.length > largeThreshold) {
      const pageCount = Math.ceil(node.children.length / pageSize);
      const page = clamp(pageByParent.get(node.id) ?? 0, 0, pageCount - 1);
      const start = page * pageSize;
      pagers.push({
        parentId: node.id, x, y: y + 55, page, pageCount,
        start: start + 1,
        end: Math.min(node.children.length, start + pageSize),
        total: node.children.length,
      });
    }
  };

  place(root, CENTER_X, ROOT_Y, null, 0);
  return { visuals, edges, pagers, pageSize, largeThreshold };
}

export function InfiniteNetworkCanvasV29Preview() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const bloomTimerRef = useRef<number | null>(null);
  const freshTimerRef = useRef<number | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  const [locale] = useState<SupportedLocale>('en');
  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [explorerParentId, setExplorerParentId] = useState<string | null>(null);
  const [pageByParent, setPageByParent] = useState<Map<string, number>>(new Map());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [freshParentId, setFreshParentId] = useState<string | null>(null);
  const [loadingParentId, setLoadingParentId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1.12 });
  const [stageWidth, setStageWidth] = useState(1000);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const parentMap = useMemo(() => buildParentMap(root), [root]);
  const rootStats = stats.get(ROOT_ID)!;
  const isMobile = stageWidth < 640;
  const zoomMode = view.scale < 0.82 ? 'minimal' : view.scale < 0.99 ? 'compact' : 'full';

  const layout = useMemo(() => layoutVisible({
    root, expanded, selectedId, parentMap, explorerParentId, pageByParent,
    freshIds, freshParentId, isMobile,
  }), [root, expanded, selectedId, parentMap, explorerParentId, pageByParent, freshIds, freshParentId, isMobile]);

  const focusPath = useMemo(() => pathToRoot(selectedId, parentMap), [selectedId, parentMap]);
  const selectedTop = useMemo(() => selectedId ? topBranch(selectedId, parentMap) : null, [selectedId, parentMap]);

  const toneFor = useCallback((id: string): Tone => {
    if (!selectedId) return 'normal';
    if (focusPath.has(id) || isDescendantOf(id, selectedId, parentMap)) return 'focus';
    if (selectedTop && topBranch(id, parentMap) === selectedTop) return 'near';
    return 'dim';
  }, [selectedId, focusPath, selectedTop, parentMap]);

  const edgeTone = useCallback((edge: Edge): Tone => {
    if (!selectedId) return 'normal';
    const from = toneFor(edge.fromId);
    const to = edge.toKey.startsWith('cluster:') ? from : toneFor(edge.toKey);
    if (from === 'focus' && to === 'focus') return 'focus';
    if (from === 'dim' || to === 'dim') return 'dim';
    return 'near';
  }, [selectedId, toneFor]);

  const clearFreshSoon = useCallback(() => {
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => {
      setFreshIds(new Set());
      setFreshParentId(null);
    }, FRESH_MS);
  }, []);

  const performExpand = useCallback((nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node || node.children.length < 1) return;
    const previewSize = isMobile ? 4 : 5;
    const threshold = isMobile ? 6 : 12;
    const visible = node.children.length > threshold ? node.children.slice(0, previewSize) : node.children;
    setExpanded((current) => new Set(current).add(nodeId));
    setFreshParentId(nodeId);
    setFreshIds(new Set(visible.map((child) => child.id)));
    setLoadingParentId(null);
    clearFreshSoon();
  }, [byId, isMobile, clearFreshSoon]);

  const activateNode = useCallback((nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node) return;
    setSelectedId(nodeId);
    if (node.children.length < 1 || expanded.has(nodeId) || loadingParentId === nodeId) return;
    if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
    setLoadingParentId(nodeId);
    bloomTimerRef.current = window.setTimeout(() => performExpand(nodeId), LOAD_MS);
  }, [byId, expanded, loadingParentId, performExpand]);

  const collapseBranch = useCallback((nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(nodeId);
      return next;
    });
    setExplorerParentId((current) => current === nodeId ? null : current);
    setSelectedId(nodeId);
  }, []);

  const openSiblingExplorer = useCallback((parentId: string) => {
    setSelectedId(parentId);
    setExplorerParentId(parentId);
    setPageByParent((current) => new Map(current).set(parentId, current.get(parentId) ?? 0));
  }, []);

  const changeSiblingPage = useCallback((parentId: string, direction: number) => {
    const node = byId.get(parentId);
    if (!node) return;
    const pageSize = isMobile ? 5 : 8;
    const pageCount = Math.ceil(node.children.length / pageSize);
    const currentPage = pageByParent.get(parentId) ?? 0;
    const nextPage = clamp(currentPage + direction, 0, pageCount - 1);
    if (nextPage === currentPage) return;
    const nextChildren = node.children.slice(nextPage * pageSize, nextPage * pageSize + pageSize);
    setPageByParent((current) => new Map(current).set(parentId, nextPage));
    setSelectedId(parentId);
    setFreshParentId(parentId);
    setFreshIds(new Set(nextChildren.map((child) => child.id)));
    clearFreshSoon();
  }, [byId, isMobile, pageByParent, clearFreshSoon]);

  const clearWorkspace = useCallback(() => {
    setExpanded(new Set());
    setSelectedId(null);
    setExplorerParentId(null);
    setPageByParent(new Map());
    setFreshIds(new Set());
    setFreshParentId(null);
    setLoadingParentId(null);
    setView({ x: 0, y: 0, scale: 1.12 });
  }, []);

  const replayRootBloom = useCallback(() => {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* preview only */ }
    clearWorkspace();
    setRestored(false);
    setReplayKey((value) => value + 1);
  }, [clearWorkspace]);

  const changeScenario = useCallback((next: Scenario) => {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* preview only */ }
    clearWorkspace();
    setScenario(next);
    setRestored(false);
    setReplayKey((value) => value + 1);
  }, [clearWorkspace]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageWidth(stage.clientWidth || 1000);
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
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedState;
        setScenario(parsed.scenario);
        setExpanded(new Set(parsed.expanded ?? []));
        setSelectedId(parsed.selectedId ?? null);
        setExplorerParentId(parsed.explorerParentId ?? null);
        setPageByParent(new Map(parsed.pageByParent ?? []));
        setView(parsed.view ?? { x: 0, y: 0, scale: 1.12 });
        setRestored(true);
      }
    } catch {
      setRestored(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || restored) return;
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    autoTimerRef.current = window.setTimeout(() => performExpand(ROOT_ID), AUTO_BLOOM_MS);
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    };
  }, [ready, restored, scenario, replayKey, performExpand]);

  useEffect(() => {
    if (!ready) return;
    const state: SavedState = {
      scenario,
      expanded: Array.from(expanded),
      selectedId,
      explorerParentId,
      pageByParent: Array.from(pageByParent.entries()),
      view,
    };
    try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* preview only */ }
  }, [ready, scenario, expanded, selectedId, explorerParentId, pageByParent, view]);

  useEffect(() => () => {
    if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
  }, []);

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
    stageRef.current?.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      lastPinchRef.current = { center: midpoint(a, b), distance: distance(a, b) };
      lastSingleRef.current = null;
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = lastSingleRef.current;
      if (previous) {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        dragDistanceRef.current += Math.hypot(dx, dy);
        setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
      }
      lastSingleRef.current = current;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const nextCenter = midpoint(a, b);
      const nextDistance = distance(a, b);
      const previous = lastPinchRef.current;
      if (previous && previous.distance > 0) {
        const ratio = nextDistance / previous.distance;
        setView((value) => ({
          x: value.x + nextCenter.x - previous.center.x,
          y: value.y + nextCenter.y - previous.center.y,
          scale: clamp(value.scale * ratio, MIN_SCALE, MAX_SCALE),
        }));
      }
      lastPinchRef.current = { center: nextCenter, distance: nextDistance };
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = Array.from(pointersRef.current.values())[0];
      lastPinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      lastSingleRef.current = null;
      lastPinchRef.current = null;
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setView((value) => ({ ...value, scale: clamp(value.scale * factor, MIN_SCALE, MAX_SCALE) }));
  };

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedStats = selected ? stats.get(selected.id) ?? null : null;
  const loadingVisual = loadingParentId
    ? layout.visuals.find((visual) => visual.kind === 'person' && visual.id === loadingParentId) as PersonVisual | undefined
    : undefined;

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <div className="topActions">
          <button type="button" className="bellButton" aria-label="Notifications"><BellIcon /><span /></button>
          <button type="button" className="accountChip"><i />0x7A3...F91</button>
        </div>
      </header>

      <section className="networkSurface">
        <div className="networkHeader">
          <div><span>NETWORK</span><strong>My Network</strong></div>
          <div className="summary"><b>{rootStats.network}</b> Network<i /><b className="growth">+{rootStats.growth}</b> Round</div>
        </div>

        <div
          ref={stageRef}
          className="networkStage"
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
            if (dragDistanceRef.current > 6) return;
            setSelectedId(null);
            setExplorerParentId(null);
          }}
        >
          <div className="ambientGlow" aria-hidden="true" />

          <div className="previewCorner" data-network-interactive="true">
            <button type="button" className="previewToggle" onClick={() => setPreviewMenuOpen((open) => !open)}>•••</button>
            {previewMenuOpen ? (
              <div className="previewMenu">
                <small>PREVIEW ONLY · NEUTRAL PROFILE</small>
                <button type="button" onClick={replayRootBloom}>↻ Replay bloom</button>
                <button type="button" className={scenario === 'balanced' ? 'active' : ''} onClick={() => changeScenario('balanced')}>Balanced</button>
                <button type="button" className={scenario === 'wide' ? 'active' : ''} onClick={() => changeScenario('wide')}>Direct 100</button>
                <button type="button" className={scenario === 'deep' ? 'active' : ''} onClick={() => changeScenario('deep')}>Deep 50</button>
              </div>
            ) : null}
          </div>

          <div
            className={`world zoom-${zoomMode}`}
            style={{
              width: `${PLANE_W}px`, height: `${PLANE_H}px`, marginLeft: `${-PLANE_W / 2}px`,
              transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
            }}
          >
            <svg className="edges" width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} aria-hidden="true">
              {layout.edges.map((edge) => (
                <line
                  key={edge.key}
                  className={`tone-${edgeTone(edge)} ${edge.fresh ? 'freshEdge' : ''}`}
                  x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                  pathLength={1}
                  style={{ '--stagger': `${edge.stagger}ms` } as CSSProperties}
                />
              ))}
            </svg>

            {layout.visuals.map((visual) => {
              if (visual.kind === 'cluster') {
                return (
                  <button
                    key={visual.key}
                    type="button"
                    data-network-interactive="true"
                    className={`clusterNode tone-${toneFor(visual.parentId)} ${freshParentId === visual.parentId ? 'freshNode' : ''}`}
                    style={{
                      left: `${visual.x}px`, top: `${visual.y}px`,
                      '--from-x': `${visual.parentX - visual.x}px`, '--from-y': `${visual.parentY - visual.y}px`,
                      '--stagger': `${visual.stagger}ms`,
                    } as CSSProperties}
                    onClick={() => openSiblingExplorer(visual.parentId)}
                  >
                    <NeutralStack />
                    <strong>+{visual.remaining}</strong>
                    <small>more direct</small>
                  </button>
                );
              }

              const node = byId.get(visual.id)!;
              const nodeStats = stats.get(node.id)!;
              const isRoot = node.id === ROOT_ID;
              const isSelected = selectedId === node.id;
              const isExpanded = expanded.has(node.id);
              const branchCount = 1 + nodeStats.network;
              return (
                <div
                  key={visual.key}
                  className={`personNode tone-${toneFor(node.id)} ${isSelected ? 'selectedNode' : ''} ${isRoot ? 'rootNode' : ''} ${freshIds.has(node.id) ? 'freshNode' : ''}`}
                  style={{
                    left: `${visual.x}px`, top: `${visual.y}px`,
                    '--from-x': `${visual.parentX - visual.x}px`, '--from-y': `${visual.parentY - visual.y}px`,
                    '--stagger': `${visual.stagger}ms`,
                  } as CSSProperties}
                >
                  <button type="button" className="personTap" data-network-interactive="true" onClick={() => activateNode(node.id)}>
                    <span className="avatarWrap"><NetworkAvatar address={node.wallet} root={isRoot} /></span>
                    <span className="nodeCopy">
                      <strong>{isRoot ? 'YOU' : shortWallet(node.wallet)}</strong>
                      <small>{isRoot ? `${nodeStats.direct} Direct` : branchCount.toLocaleString('en-US')}</small>
                    </span>
                  </button>
                  {node.children.length > 0 && !isRoot ? (
                    <button
                      type="button"
                      className={`branchHint ${isExpanded ? 'open' : ''}`}
                      data-network-interactive="true"
                      aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'}
                      onClick={() => isExpanded ? collapseBranch(node.id) : activateNode(node.id)}
                    ><span /></button>
                  ) : null}
                </div>
              );
            })}

            {layout.pagers.map((pager) => (
              <div key={pager.parentId} className="siblingPager" data-network-interactive="true" style={{ left: `${pager.x}px`, top: `${pager.y}px` }}>
                <button type="button" disabled={pager.page === 0} onClick={() => changeSiblingPage(pager.parentId, -1)}>‹</button>
                <span><b>{pager.start}–{pager.end}</b> / {pager.total} direct</span>
                <button type="button" disabled={pager.page >= pager.pageCount - 1} onClick={() => changeSiblingPage(pager.parentId, 1)}>›</button>
                <button type="button" className="pagerClose" onClick={() => setExplorerParentId(null)}>×</button>
              </div>
            ))}

            {loadingVisual ? (
              <div className="branchLoader" style={{ left: `${loadingVisual.x}px`, top: `${loadingVisual.y + 57}px` }}><i /><i /><i /></div>
            ) : null}
          </div>

          {selected && selectedStats && selected.id !== ROOT_ID ? (
            <div className="inspector" data-network-interactive="true">
              <div className="inspectorIdentity">
                <NetworkAvatar address={selected.wallet} />
                <div><strong>{shortWallet(selected.wallet)}</strong><small>{selected.status === 'IN_PROGRESS' ? 'In progress' : selected.status === 'QUALIFIED' ? 'Qualified' : 'Rewarded'}</small></div>
              </div>
              <code>{selected.wallet}</code>
              <div className="inspectorMetrics"><span><b>{selectedStats.network}</b>Network below</span><span><b>{selectedStats.direct}</b>Direct</span><span><b>{selectedStats.qualified}</b>Qualified</span></div>
            </div>
          ) : null}

          <div className="stageControls" data-network-interactive="true">
            <button type="button" aria-label="Center me" onClick={() => setView({ x: 0, y: 0, scale: 1.12 })}>◎</button>
            <button type="button" aria-label="Zoom in" onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + .1, MIN_SCALE, MAX_SCALE) }))}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - .1, MIN_SCALE, MAX_SCALE) }))}>−</button>
          </div>
        </div>
      </section>

      <AppBottomNavigation activeTab="guide" locale={locale} onChange={() => {}} />

      <style jsx>{`
        .screen{min-height:100svh;box-sizing:border-box;padding:22px 18px 116px;color:#fff;background:radial-gradient(circle at 50% 14%,rgba(244,183,40,.13),transparent 31%),#080807}.topBar{width:min(100%,520px);margin:0 auto 8px;display:flex;align-items:center;justify-content:space-between;gap:14px}.topActions{display:flex;align-items:center;gap:8px}.bellButton,.accountChip{height:40px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#141625;color:#fff;font:inherit}.bellButton{position:relative;width:40px;display:grid;place-items:center}.bellButton :global(svg){width:18px;height:18px}.bellButton span{position:absolute;right:8px;top:8px;width:6px;height:6px;border-radius:50%;background:#f4b728}.accountChip{padding:0 13px;display:flex;align-items:center;gap:7px;font-size:.7rem;font-weight:850}.accountChip i{width:7px;height:7px;border-radius:50%;background:#f4b728}
        .networkSurface{width:min(calc(100vw - 28px),1180px);margin:0 auto}.networkHeader{width:min(100%,1120px);min-height:50px;margin:0 auto;padding:0 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px}.networkHeader>div:first-child{display:grid;gap:3px}.networkHeader span{color:#8e8062;font-size:.55rem;font-weight:950;letter-spacing:.14em}.networkHeader strong{color:#f8f4ea;font-size:.9rem}.summary{display:flex;align-items:baseline;gap:5px;color:#77736c;font-size:.57rem}.summary b{color:#ddd7ca;font-size:.72rem}.summary .growth{color:#f4b728}.summary i{width:1px;height:10px;margin:0 4px;background:rgba(255,255,255,.1)}
        .networkStage{position:relative;height:clamp(555px,calc(100svh - 184px),780px);overflow:hidden;touch-action:none;cursor:grab;user-select:none;background:transparent}.networkStage:active{cursor:grabbing}.ambientGlow{position:absolute;left:50%;top:4%;width:760px;height:390px;transform:translateX(-50%);pointer-events:none;background:radial-gradient(ellipse,rgba(244,183,40,.035),transparent 68%)}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke-width:1;stroke-linecap:round;transition:stroke 250ms ease,opacity 280ms ease}.edges line.tone-normal{stroke:rgba(220,214,202,.115)}.edges line.tone-focus{stroke:rgba(244,183,40,.35)}.edges line.tone-near{stroke:rgba(220,214,202,.09)}.edges line.tone-dim{stroke:rgba(220,214,202,.025);opacity:.48}.edges line.freshEdge{stroke:rgba(244,183,40,.58);stroke-dasharray:1;stroke-dashoffset:1;animation:drawEdge 540ms cubic-bezier(.22,1,.36,1) var(--stagger) forwards,settleEdge 850ms ease 430ms forwards}
        .personNode,.clusterNode{position:absolute;z-index:3;transform:translate(-50%,-50%);transition:left 500ms cubic-bezier(.22,1,.36,1),top 500ms cubic-bezier(.22,1,.36,1),opacity 260ms ease,filter 260ms ease}.personNode{width:86px;min-height:76px;display:flex;flex-direction:column;align-items:center}.tone-focus{opacity:1;z-index:7}.tone-near{opacity:.62;z-index:4}.tone-dim{opacity:.30;filter:saturate(.65);z-index:2}.tone-normal{opacity:1}.personTap{border:0;background:transparent;color:inherit;font:inherit;padding:4px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}.avatarWrap{position:relative;display:block;border-radius:50%}.selectedNode .avatarWrap{box-shadow:0 0 0 4px rgba(244,183,40,.065),0 0 22px rgba(244,183,40,.10)}.nodeCopy{display:grid;gap:1px;min-height:25px}.nodeCopy strong{max-width:82px;overflow:hidden;color:#c9c3b8;font-size:.62rem;font-weight:850;line-height:1.15;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.rootNode .nodeCopy strong{color:#e5bd58;font-size:.68rem}.nodeCopy small{color:#706a60;font-size:.50rem;font-weight:760;line-height:1.08}.branchHint{width:26px;height:16px;margin-top:-4px;border:0;background:transparent;display:grid;place-items:start center;cursor:pointer}.branchHint span{position:relative;width:1px;height:7px;background:rgba(170,158,133,.26);transition:height 180ms ease,background 180ms ease}.branchHint span:after{content:'';position:absolute;left:50%;bottom:-3px;width:4px;height:4px;border-right:1px solid rgba(170,158,133,.34);border-bottom:1px solid rgba(170,158,133,.34);transform:translateX(-50%) rotate(45deg)}.branchHint.open span{height:5px;background:rgba(214,178,84,.40)}.branchHint.open span:after{transform:translateX(-50%) rotate(225deg);bottom:-5px}.freshNode{animation:bloomWhole 760ms cubic-bezier(.16,1.04,.30,1) var(--stagger) both}.freshNode .avatarWrap{animation:freshHalo 1000ms ease var(--stagger) both}.freshNode .nodeCopy{animation:labelIn 480ms ease calc(var(--stagger) + 240ms) both}
        .clusterNode{width:78px;min-height:62px;border:0;background:transparent;color:inherit;font:inherit;padding:4px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer}.clusterNode strong{color:#b99b55;font-size:.66rem;font-weight:950}.clusterNode small{color:#696256;font-size:.44rem;font-weight:820}.neutralStack{height:29px;width:54px;display:flex;justify-content:center;align-items:center}.neutralStack>span{width:30px;height:30px;margin-left:-10px;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.30)}.neutralStack>span:first-child{margin-left:0}.neutralStack :global(svg){transform:scale(.78)}
        .siblingPager{position:absolute;z-index:12;transform:translate(-50%,-50%);height:29px;padding:0 5px;display:flex;align-items:center;gap:3px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(15,15,13,.91);box-shadow:0 10px 30px rgba(0,0,0,.25);backdrop-filter:blur(12px)}.siblingPager button{width:26px;height:23px;border:0;border-radius:8px;background:transparent;color:#9c917b;font:inherit;cursor:pointer}.siblingPager button:disabled{opacity:.25}.siblingPager span{min-width:88px;color:#766f63;font-size:.48rem;text-align:center}.siblingPager span b{color:#d2b15f}.siblingPager .pagerClose{width:22px;color:#605b53}.branchLoader{position:absolute;z-index:13;transform:translate(-50%,-50%);display:flex;gap:5px;pointer-events:none}.branchLoader i{width:4px;height:4px;border-radius:50%;background:#b89648;opacity:.3;animation:loaderPulse .78s ease-in-out infinite}.branchLoader i:nth-child(2){animation-delay:.11s}.branchLoader i:nth-child(3){animation-delay:.22s}
        .zoom-compact .nodeCopy small{display:none}.zoom-compact .nodeCopy strong{font-size:.58rem;color:#989186}.zoom-minimal .personNode{width:54px;min-height:54px}.zoom-minimal .nodeCopy,.zoom-minimal .branchHint{display:none}.zoom-minimal .tone-dim{opacity:.18}
        .inspector{position:absolute;z-index:20;right:18px;top:18px;width:224px;padding:13px 14px;border:1px solid rgba(255,255,255,.07);border-radius:17px;background:rgba(17,17,15,.91);backdrop-filter:blur(16px);box-shadow:0 18px 50px rgba(0,0,0,.24)}.inspectorIdentity{display:flex;align-items:center;gap:9px}.inspectorIdentity>div{display:grid;gap:2px}.inspectorIdentity strong{color:#e5ded2;font-size:.67rem;direction:ltr}.inspectorIdentity small{color:#8e8064;font-size:.46rem;font-weight:850}.inspector code{display:block;margin-top:8px;padding:6px 7px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.025);color:#625f59;font-size:.43rem;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.inspectorMetrics{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.inspectorMetrics span{padding:6px 4px;border-radius:9px;background:rgba(255,255,255,.024);color:#66615a;font-size:.43rem;text-align:center}.inspectorMetrics b{display:block;margin-bottom:1px;color:#cfc6b7;font-size:.6rem}
        .stageControls{position:absolute;z-index:22;right:14px;bottom:14px;display:flex;gap:6px}.stageControls button,.previewToggle{width:36px;height:36px;border:1px solid rgba(255,255,255,.075);border-radius:12px;background:rgba(16,16,14,.82);color:#8d887f;font:inherit;font-size:.72rem;cursor:pointer;backdrop-filter:blur(10px)}.previewCorner{position:absolute;z-index:23;left:14px;bottom:14px}.previewMenu{position:absolute;left:0;bottom:44px;width:172px;padding:9px;display:grid;gap:5px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(16,16,14,.95);box-shadow:0 18px 50px rgba(0,0,0,.35)}.previewMenu small{padding:3px 5px 5px;color:#655d4e;font-size:.41rem;font-weight:950;letter-spacing:.06em}.previewMenu button{min-height:31px;padding:0 9px;border:0;border-radius:9px;background:transparent;color:#8f8a81;font:inherit;font-size:.57rem;font-weight:800;text-align:left;cursor:pointer}.previewMenu button:hover,.previewMenu button.active{background:rgba(244,183,40,.07);color:#e1c062}
        @keyframes drawEdge{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0;opacity:1}}@keyframes settleEdge{from{stroke:rgba(244,183,40,.58)}to{stroke:rgba(220,214,202,.115)}}@keyframes bloomWhole{0%{transform:translate(-50%,-50%) translate(var(--from-x),var(--from-y)) scale(.52);opacity:0}66%{transform:translate(-50%,-50%) translate(0,0) scale(1.045);opacity:1}100%{transform:translate(-50%,-50%) translate(0,0) scale(1);opacity:1}}@keyframes freshHalo{0%{box-shadow:0 0 0 0 rgba(244,183,40,.34)}65%{box-shadow:0 0 0 7px rgba(244,183,40,0)}100%{box-shadow:none}}@keyframes labelIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}@keyframes loaderPulse{0%,100%{opacity:.22;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
        @media(max-width:700px){.screen{padding:18px 14px 114px}.topBar{margin-bottom:5px}.bellButton{width:34px;height:34px;border-radius:11px}.accountChip{height:34px;padding:0 10px;border-radius:11px;font-size:.64rem}.networkSurface{width:100%}.networkHeader{min-height:47px;padding:0 5px}.networkStage{height:calc(100svh - 168px);min-height:520px}.summary{font-size:.5rem}.summary b{font-size:.63rem}.personNode{width:78px}.nodeCopy strong{font-size:.58rem}.nodeCopy small{font-size:.46rem}.tone-near{opacity:.52}.tone-dim{opacity:.22}.inspector{right:9px;top:auto;bottom:56px;left:9px;width:auto}.stageControls{right:9px;bottom:9px}.previewCorner{left:9px;bottom:9px}.ambientGlow{width:460px}.edges line.tone-normal{stroke:rgba(220,214,202,.10)}}
        @media(prefers-reduced-motion:reduce){.freshNode,.freshNode .avatarWrap,.freshNode .nodeCopy,.edges line.freshEdge,.branchLoader i{animation:none!important}.personNode,.clusterNode,.edges line{transition:none!important}}
      `}</style>
    </main>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 8.8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 20a2.2 2.2 0 0 1-4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
