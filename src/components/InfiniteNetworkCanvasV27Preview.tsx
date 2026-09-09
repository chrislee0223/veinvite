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
import { getPicassoImage } from '@vechain/vechain-kit/utils';

import { Brand } from './Brand';
import { AppBottomNavigation } from './AppBottomNavigation';
import type { SupportedLocale } from '@/lib/i18n/locales';

type Scenario = 'balanced' | 'wide' | 'deep';
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type ZoomMode = 'full' | 'compact' | 'minimal';
type FocusTone = 'focus' | 'near' | 'dim' | 'normal';

type Node = {
  id: string;
  wallet: string;
  status: Status;
  joinedThisRound: boolean;
  children: Node[];
};

type Stats = {
  network: number;
  direct: number;
  qualified: number;
  growth: number;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

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
  previewWallets: string[];
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

type PagerHud = {
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
const SESSION_KEY = 'veinvite-network-v27-preview';
const PLANE_W = 5000;
const PLANE_H = 3600;
const CENTER_X = PLANE_W / 2;
const ROOT_Y = 174;
const LEVEL_GAP = 148;
const ITEM_GAP = 24;
const NODE_WIDTH = 116;
const CLUSTER_WIDTH = 92;
const MIN_SCALE = 0.62;
const MAX_SCALE = 1.55;
const LOAD_MS = 300;
const FRESH_MS = 1180;
const AUTO_BLOOM_MS = 760;

function fullWallet(index: number) {
  const body = index.toString(16).padStart(40, '0');
  return `0x${body}`;
}

function shortWallet(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-3)}`;
}

function statusFor(index: number): Status {
  if (index % 6 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'REWARDED';
  return 'QUALIFIED';
}

function makeNode(index: number, id: string): Node {
  return {
    id,
    wallet: fullWallet(index),
    status: statusFor(index),
    joinedThisRound: index % 4 === 0 || index % 7 === 0,
    children: [],
  };
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
    joinedThisRound: false,
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
  const root: Node = {
    id: ROOT_ID,
    wallet: fullWallet(999),
    status: 'REWARDED',
    joinedThisRound: false,
    children: [],
  };
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
  const root: Node = {
    id: ROOT_ID,
    wallet: fullWallet(999),
    status: 'REWARDED',
    joinedThisRound: false,
    children: [],
  };
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
    node.children.forEach((child) => {
      const childStats = visit(child);
      network += 1 + childStats.network;
      qualified += (child.status === 'IN_PROGRESS' ? 0 : 1) + childStats.qualified;
      growth += (child.joinedThisRound ? 1 : 0) + childStats.growth;
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

function layoutVisible({
  root,
  expanded,
  explorerParentId,
  pageByParent,
  freshIds,
  freshParentId,
  isMobile,
}: {
  root: Node;
  expanded: Set<string>;
  explorerParentId: string | null;
  pageByParent: Map<string, number>;
  freshIds: Set<string>;
  freshParentId: string | null;
  isMobile: boolean;
}) {
  const visuals = new Map<string, Visual>();
  const widthCache = new Map<string, number>();
  const pagerHuds: PagerHud[] = [];
  const pageSize = isMobile ? 5 : 8;
  const largeThreshold = isMobile ? 6 : 12;

  const entriesFor = (node: Node): Array<Node | 'cluster'> => {
    if (!expanded.has(node.id) || node.children.length < 1) return [];
    if (node.children.length <= largeThreshold) return [...node.children];

    const pageCount = Math.ceil(node.children.length / pageSize);
    const rawPage = pageByParent.get(node.id) ?? 0;
    const page = clamp(rawPage, 0, pageCount - 1);
    const start = page * pageSize;
    const visible = node.children.slice(start, start + pageSize);
    const entries: Array<Node | 'cluster'> = [...visible];
    if (explorerParentId !== node.id) entries.push('cluster');
    return entries;
  };

  const measure = (node: Node): number => {
    const cached = widthCache.get(node.id);
    if (cached !== undefined) return cached;
    const entries = entriesFor(node);
    if (entries.length === 0) {
      widthCache.set(node.id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const widths = entries.map((entry) => (entry === 'cluster' ? CLUSTER_WIDTH : measure(entry)));
    const total = widths.reduce((sum, value) => sum + value, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    const width = Math.max(NODE_WIDTH, total);
    widthCache.set(node.id, width);
    return width;
  };

  const place = (
    node: Node,
    x: number,
    y: number,
    parent: { id: string; x: number; y: number } | null,
    depth: number,
    stagger = 0,
  ) => {
    visuals.set(node.id, {
      kind: 'person',
      key: node.id,
      id: node.id,
      x,
      y,
      parentId: parent?.id ?? null,
      parentX: parent?.x ?? x,
      parentY: parent?.y ?? y,
      depth,
      stagger,
    });

    const entries = entriesFor(node);
    if (entries.length === 0) return;

    const widths = entries.map((entry) => (entry === 'cluster' ? CLUSTER_WIDTH : measure(entry)));
    const total = widths.reduce((sum, value) => sum + value, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    const centerIndex = (entries.length - 1) / 2;
    let cursor = x - total / 2;

    entries.forEach((entry, index) => {
      const width = widths[index];
      const childX = cursor + width / 2;
      const childY = y + LEVEL_GAP + (index % 2 === 0 ? -4 : 5);
      const childStagger = Math.round(Math.abs(index - centerIndex) * 42);

      if (entry === 'cluster') {
        const page = pageByParent.get(node.id) ?? 0;
        const start = page * pageSize;
        const visibleEnd = Math.min(node.children.length, start + pageSize);
        const remaining = Math.max(0, node.children.length - visibleEnd);
        const previewWallets = node.children.slice(visibleEnd, visibleEnd + 3).map((child) => child.wallet);
        visuals.set(`cluster:${node.id}`, {
          kind: 'cluster',
          key: `cluster:${node.id}`,
          parentId: node.id,
          x: childX,
          y: childY,
          parentX: x,
          parentY: y,
          remaining,
          previewWallets,
          depth: depth + 1,
          stagger: childStagger,
        });
      } else {
        place(entry, childX, childY, { id: node.id, x, y }, depth + 1, childStagger);
      }
      cursor += width + ITEM_GAP;
    });

    if (explorerParentId === node.id && node.children.length > largeThreshold) {
      const pageCount = Math.ceil(node.children.length / pageSize);
      const page = clamp(pageByParent.get(node.id) ?? 0, 0, pageCount - 1);
      const start = page * pageSize;
      pagerHuds.push({
        parentId: node.id,
        x,
        y: y + 69,
        page,
        pageCount,
        start: start + 1,
        end: Math.min(node.children.length, start + pageSize),
        total: node.children.length,
      });
    }
  };

  place(root, CENTER_X, ROOT_Y, null, 0);

  const list = Array.from(visuals.values());
  const edges: Edge[] = [];
  list.forEach((visual) => {
    if (visual.kind === 'person' && visual.parentId) {
      edges.push({
        key: `${visual.parentId}->${visual.id}`,
        fromId: visual.parentId,
        toKey: visual.id,
        x1: visual.parentX,
        y1: visual.parentY + 24,
        x2: visual.x,
        y2: visual.y - 24,
        fresh: freshIds.has(visual.id),
        stagger: visual.stagger,
      });
    }
    if (visual.kind === 'cluster') {
      edges.push({
        key: `${visual.parentId}->${visual.key}`,
        fromId: visual.parentId,
        toKey: visual.key,
        x1: visual.parentX,
        y1: visual.parentY + 24,
        x2: visual.x,
        y2: visual.y - 22,
        fresh: freshParentId === visual.parentId,
        stagger: visual.stagger,
      });
    }
  });

  return { visuals: list, edges, pagerHuds, pageSize, largeThreshold };
}

function ProfileAvatar({ address, root = false }: { address: string; root?: boolean }) {
  const image = useMemo(() => getPicassoImage(address), [address]);
  return (
    <span className={`profileAvatar ${root ? 'rootAvatar' : ''}`} aria-hidden="true">
      <img src={image} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

function AvatarStack({ wallets }: { wallets: string[] }) {
  return (
    <span className="avatarStack" aria-hidden="true">
      {(wallets.length ? wallets : [fullWallet(2001), fullWallet(2002), fullWallet(2003)]).slice(0, 3).map((address, index) => (
        <span key={`${address}-${index}`} style={{ zIndex: 4 - index }}>
          <img src={getPicassoImage(address)} alt="" />
        </span>
      ))}
    </span>
  );
}

export function InfiniteNetworkCanvasV27Preview() {
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
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
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
  const zoomMode: ZoomMode = view.scale < 0.79 ? 'minimal' : view.scale < 0.96 ? 'compact' : 'full';

  const layout = useMemo(
    () => layoutVisible({
      root,
      expanded,
      explorerParentId,
      pageByParent,
      freshIds,
      freshParentId,
      isMobile,
    }),
    [root, expanded, explorerParentId, pageByParent, freshIds, freshParentId, isMobile],
  );

  const focusPath = useMemo(() => pathToRoot(selectedId, parentMap), [selectedId, parentMap]);
  const selectedTopBranch = useMemo(
    () => (selectedId ? topBranch(selectedId, parentMap) : null),
    [selectedId, parentMap],
  );

  const toneFor = useCallback((id: string): FocusTone => {
    if (!selectedId) return 'normal';
    if (focusPath.has(id) || isDescendantOf(id, selectedId, parentMap)) return 'focus';
    if (selectedTopBranch && topBranch(id, parentMap) === selectedTopBranch) return 'near';
    return 'dim';
  }, [selectedId, focusPath, selectedTopBranch, parentMap]);

  const edgeTone = useCallback((edge: Edge): FocusTone => {
    if (!selectedId) return 'normal';
    const fromTone = toneFor(edge.fromId);
    const toTone = edge.toKey.startsWith('cluster:') ? fromTone : toneFor(edge.toKey);
    if (fromTone === 'focus' && toTone === 'focus') return 'focus';
    if (fromTone === 'dim' || toTone === 'dim') return 'dim';
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
    const pageSize = isMobile ? 5 : 8;
    const page = pageByParent.get(nodeId) ?? 0;
    const start = page * pageSize;
    const visible = node.children.length > (isMobile ? 6 : 12)
      ? node.children.slice(start, start + pageSize)
      : node.children;
    setExpanded((current) => new Set(current).add(nodeId));
    setFreshParentId(nodeId);
    setFreshIds(new Set(visible.map((child) => child.id)));
    setLoadingParentId(null);
    clearFreshSoon();
  }, [byId, isMobile, pageByParent, clearFreshSoon]);

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
    setExplorerParentId((current) => (current === nodeId ? null : current));
    setPageByParent((current) => {
      const next = new Map(current);
      next.set(nodeId, 0);
      return next;
    });
    setSelectedId(nodeId);
  }, []);

  const openSiblingExplorer = useCallback((parentId: string) => {
    setSelectedId(parentId);
    setExplorerParentId(parentId);
    setPageByParent((current) => {
      const next = new Map(current);
      if (!next.has(parentId)) next.set(parentId, 0);
      return next;
    });
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

  const closeSiblingExplorer = useCallback((parentId: string) => {
    setExplorerParentId(null);
    setPageByParent((current) => new Map(current).set(parentId, 0));
  }, []);

  const clearWorkspace = useCallback(() => {
    setExpanded(new Set());
    setSelectedId(null);
    setExplorerParentId(null);
    setPageByParent(new Map());
    setFreshIds(new Set());
    setFreshParentId(null);
    setLoadingParentId(null);
    setView({ x: 0, y: 0, scale: 1 });
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
    setRestored(false);
    setScenario(next);
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
        if (parsed?.scenario && parsed?.view) {
          setScenario(parsed.scenario);
          setExpanded(new Set(parsed.expanded ?? []));
          setSelectedId(parsed.selectedId ?? null);
          setExplorerParentId(parsed.explorerParentId ?? null);
          setPageByParent(new Map(parsed.pageByParent ?? []));
          setView(parsed.view);
          setRestored(true);
        }
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
          <div className="stageGlow" aria-hidden="true" />
          <div className="safeAreaMark" aria-hidden="true" />

          <div className="previewCorner" data-network-interactive="true">
            <button type="button" className="previewToggle" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPreviewMenuOpen((open) => !open)}>•••</button>
            {previewMenuOpen ? (
              <div className="previewMenu">
                <small>PREVIEW ONLY · SESSION MEMORY ON</small>
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
              width: `${PLANE_W}px`,
              height: `${PLANE_H}px`,
              marginLeft: `${-PLANE_W / 2}px`,
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            }}
          >
            <svg className="edges" width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} aria-hidden="true">
              {layout.edges.map((edge) => {
                const tone = edgeTone(edge);
                return (
                  <line
                    key={edge.key}
                    className={`tone-${tone} ${edge.fresh ? 'freshEdge' : ''}`}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    pathLength={1}
                    style={{ '--stagger': `${edge.stagger}ms` } as CSSProperties}
                  />
                );
              })}
            </svg>

            {layout.visuals.map((visual) => {
              if (visual.kind === 'cluster') {
                const tone = toneFor(visual.parentId);
                return (
                  <button
                    key={visual.key}
                    type="button"
                    data-network-interactive="true"
                    className={`clusterNode tone-${tone} ${freshParentId === visual.parentId ? 'freshNode' : ''}`}
                    style={{
                      left: `${visual.x}px`,
                      top: `${visual.y}px`,
                      '--from-x': `${visual.parentX - visual.x}px`,
                      '--from-y': `${visual.parentY - visual.y}px`,
                      '--stagger': `${visual.stagger}ms`,
                    } as CSSProperties}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openSiblingExplorer(visual.parentId)}
                  >
                    <AvatarStack wallets={visual.previewWallets} />
                    <strong>+{visual.remaining}</strong>
                    <small>more direct</small>
                  </button>
                );
              }

              const node = byId.get(visual.id)!;
              const nodeStats = stats.get(node.id)!;
              const isRoot = node.id === ROOT_ID;
              const hasChildren = node.children.length > 0;
              const isExpanded = expanded.has(node.id);
              const isSelected = selectedId === node.id;
              const fresh = freshIds.has(node.id);
              const tone = toneFor(node.id);
              const branch = isRoot ? nodeStats.network : 1 + nodeStats.network;

              return (
                <button
                  key={visual.key}
                  type="button"
                  data-network-interactive="true"
                  className={`personNode tone-${tone} ${isRoot ? 'rootNode' : ''} ${isSelected ? 'selectedNode' : ''} ${fresh ? 'freshNode' : ''}`}
                  style={{
                    left: `${visual.x}px`,
                    top: `${visual.y}px`,
                    '--from-x': `${visual.parentX - visual.x}px`,
                    '--from-y': `${visual.parentY - visual.y}px`,
                    '--stagger': `${visual.stagger}ms`,
                  } as CSSProperties}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => activateNode(node.id)}
                  aria-label={isRoot ? 'You' : `${shortWallet(node.wallet)}, ${branch} branch`}
                >
                  <span className="nodeBody">
                    <ProfileAvatar address={node.wallet} root={isRoot} />
                    {node.joinedThisRound && !isRoot ? <span className="roundPulse" /> : null}
                    {zoomMode !== 'minimal' ? (
                      <span className="nodeCopy">
                        <strong>{isRoot ? 'YOU' : zoomMode === 'full' ? shortWallet(node.wallet) : branch}</strong>
                        {zoomMode === 'full' ? <small>{isRoot ? `${branch} network` : `${branch} branch`}</small> : null}
                      </span>
                    ) : null}
                  </span>
                  {hasChildren && zoomMode !== 'minimal' ? (
                    <span
                      className={`branchControl ${isExpanded ? 'open' : ''}`}
                      role="button"
                      tabIndex={-1}
                      aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isExpanded) collapseBranch(node.id);
                        else activateNode(node.id);
                      }}
                    >{isExpanded ? '⌃' : '⌄'}</span>
                  ) : null}
                </button>
              );
            })}

            {layout.pagerHuds.map((pager) => (
              <div
                key={`pager:${pager.parentId}`}
                className="siblingPager"
                data-network-interactive="true"
                style={{ left: `${pager.x}px`, top: `${pager.y}px` }}
              >
                <button type="button" disabled={pager.page === 0} onPointerDown={(event) => event.stopPropagation()} onClick={() => changeSiblingPage(pager.parentId, -1)}>‹</button>
                <span><b>{pager.start}–{pager.end}</b> / {pager.total} direct</span>
                <button type="button" disabled={pager.page >= pager.pageCount - 1} onPointerDown={(event) => event.stopPropagation()} onClick={() => changeSiblingPage(pager.parentId, 1)}>›</button>
                <button type="button" className="pagerClose" onPointerDown={(event) => event.stopPropagation()} onClick={() => closeSiblingExplorer(pager.parentId)}>×</button>
              </div>
            ))}

            {loadingVisual ? (
              <div
                className="branchLoader"
                aria-label="Loading branch"
                style={{ left: `${loadingVisual.x}px`, top: `${loadingVisual.y + 72}px` }}
              ><i /><i /><i /></div>
            ) : null}
          </div>

          {selected && selectedStats && selected.id !== ROOT_ID ? (
            <div className="inspector" data-network-interactive="true">
              <div className="inspectorIdentity"><ProfileAvatar address={selected.wallet} /><div><strong>{shortWallet(selected.wallet)}</strong><small>{selected.status === 'IN_PROGRESS' ? 'In progress' : selected.status === 'QUALIFIED' ? 'Qualified' : 'Rewarded'}</small></div></div>
              <code>{selected.wallet}</code>
              <div className="inspectorMetrics"><span><b>{selectedStats.network}</b>Network</span><span><b>{selectedStats.direct}</b>Direct</span><span><b>{selectedStats.qualified}</b>Qualified</span></div>
            </div>
          ) : null}

          <div className="stageControls" data-network-interactive="true">
            <span className="zoomHint">{zoomMode}</span>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView({ x: 0, y: 0, scale: 1 })}>◎</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + 0.1, MIN_SCALE, MAX_SCALE) }))}>+</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - 0.1, MIN_SCALE, MAX_SCALE) }))}>−</button>
          </div>
        </div>
      </section>

      <AppBottomNavigation activeTab="guide" locale={locale} onChange={() => {}} />

      <style jsx>{`
        .screen{min-height:100svh;box-sizing:border-box;padding:22px 18px 116px;color:#fff;background:radial-gradient(circle at 50% 15%,rgba(244,183,40,.14),transparent 31%),#080807}.topBar{width:min(100%,520px);margin:0 auto 9px;display:flex;align-items:center;justify-content:space-between;gap:14px}.topActions{display:flex;align-items:center;gap:8px}.bellButton,.accountChip{height:40px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#141625;color:#fff;font:inherit}.bellButton{position:relative;width:40px;display:grid;place-items:center}.bellButton :global(svg){width:18px;height:18px}.bellButton span{position:absolute;right:8px;top:8px;width:6px;height:6px;border-radius:50%;background:#f4b728;box-shadow:0 0 9px rgba(244,183,40,.65)}.accountChip{padding:0 13px;display:flex;align-items:center;gap:7px;font-size:.7rem;font-weight:850}.accountChip i{width:8px;height:8px;border-radius:50%;background:#f4b728;box-shadow:0 0 12px rgba(244,183,40,.55)}
        .networkSurface{width:min(calc(100vw - 28px),1180px);margin:0 auto}.networkHeader{width:min(100%,1120px);min-height:52px;margin:0 auto;padding:0 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px}.networkHeader>div:first-child{display:grid;gap:3px}.networkHeader span{color:#8e8062;font-size:.55rem;font-weight:950;letter-spacing:.14em}.networkHeader strong{color:#f8f4ea;font-size:.9rem}.summary{display:flex;align-items:baseline;gap:5px;color:#77736c;font-size:.57rem;white-space:nowrap}.summary b{color:#ddd7ca;font-size:.72rem}.summary .growth{color:#f4b728}.summary i{width:1px;height:10px;margin:0 4px;background:rgba(255,255,255,.1)}
        .networkStage{position:relative;height:clamp(555px,calc(100svh - 186px),780px);overflow:hidden;touch-action:none;cursor:grab;user-select:none;border-radius:30px;background:radial-gradient(circle at 50% 27%,rgba(244,183,40,.052),transparent 27%)}.networkStage:active{cursor:grabbing}.stageGlow{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom,rgba(255,255,255,.012),transparent 20%,transparent 82%,rgba(0,0,0,.12))}.safeAreaMark{position:absolute;left:50%;top:18px;width:1px;height:70px;opacity:0;pointer-events:none}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke-width:1;stroke-linecap:round;transition:stroke 260ms ease,opacity 280ms ease}.edges line.tone-normal{stroke:rgba(224,218,207,.065)}.edges line.tone-focus{stroke:rgba(244,183,40,.25)}.edges line.tone-near{stroke:rgba(224,218,207,.075)}.edges line.tone-dim{stroke:rgba(224,218,207,.025);opacity:.55}.edges line.freshEdge{stroke:rgba(244,183,40,.48);stroke-dasharray:1;stroke-dashoffset:1;animation:drawEdge 560ms cubic-bezier(.22,1,.36,1) var(--stagger) forwards,settleEdge 850ms ease 420ms forwards}
        .personNode,.clusterNode{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:left 500ms cubic-bezier(.22,1,.36,1),top 500ms cubic-bezier(.22,1,.36,1),opacity 280ms ease,filter 280ms ease}.personNode{width:108px;min-height:92px;padding:7px 4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center}.tone-focus{opacity:1;z-index:7}.tone-near{opacity:.58;z-index:4}.tone-dim{opacity:.27;filter:saturate(.62);z-index:2}.tone-normal{opacity:1}.nodeBody{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;transition:transform 280ms ease}.tone-dim .nodeBody{transform:scale(.985)}.profileAvatar{position:relative;width:34px;height:34px;overflow:hidden;border-radius:50%;border:1px solid rgba(255,205,80,.15);background:#171613;box-shadow:0 6px 18px rgba(0,0,0,.22);display:block}.profileAvatar img{width:100%;height:100%;display:block;object-fit:contain;border-radius:inherit}.rootAvatar{width:42px;height:42px;border-color:rgba(255,205,80,.5);box-shadow:0 0 0 5px rgba(244,183,40,.055),0 0 28px rgba(244,183,40,.13)}.selectedNode .profileAvatar{border-color:rgba(255,205,80,.68);box-shadow:0 0 0 4px rgba(244,183,40,.06),0 0 25px rgba(244,183,40,.12)}.nodeCopy{display:grid;gap:1px;min-height:28px}.nodeCopy strong{max-width:103px;overflow:hidden;color:#beb8ad;font-size:.62rem;font-weight:850;line-height:1.1;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.rootNode .nodeCopy strong{color:#e8c057;font-size:.7rem}.nodeCopy small{color:#625e57;font-size:.49rem;font-weight:760;line-height:1.05}.roundPulse{position:absolute;right:31px;top:7px;width:5px;height:5px;border-radius:50%;background:#f4b728;box-shadow:0 0 9px rgba(244,183,40,.72)}.branchControl{width:24px;height:16px;margin-top:-2px;display:grid;place-items:center;color:#514c43;font-size:.66rem;line-height:1;transition:color 180ms ease,transform 220ms ease}.selectedNode .branchControl{color:#9b7f43}.branchControl.open{transform:translateY(-1px)}.freshNode{animation:bloomWhole 780ms cubic-bezier(.16,1.04,.30,1) var(--stagger) both}.freshNode .nodeCopy{animation:labelIn 520ms ease calc(var(--stagger) + 260ms) both}
        .clusterNode{width:88px;min-height:70px;padding:7px 4px;display:flex;flex-direction:column;align-items:center;gap:2px}.clusterNode strong{color:#d6b052;font-size:.68rem;font-weight:950}.clusterNode small{color:#6c6454;font-size:.45rem;font-weight:820}.avatarStack{height:31px;width:58px;display:flex;justify-content:center;align-items:center}.avatarStack>span{width:27px;height:27px;margin-left:-9px;overflow:hidden;border:1px solid rgba(255,205,80,.2);border-radius:50%;background:#151411;box-shadow:0 5px 12px rgba(0,0,0,.35)}.avatarStack>span:first-child{margin-left:0}.avatarStack img{width:100%;height:100%;display:block;object-fit:contain;border-radius:inherit}.clusterNode:hover .avatarStack>span{border-color:rgba(255,205,80,.4)}
        .siblingPager{position:absolute;z-index:12;transform:translate(-50%,-50%);height:30px;padding:0 5px;display:flex;align-items:center;gap:3px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:rgba(15,15,13,.9);box-shadow:0 10px 30px rgba(0,0,0,.25);backdrop-filter:blur(12px);white-space:nowrap}.siblingPager button{width:26px;height:24px;border:0;border-radius:8px;background:transparent;color:#9c917b;font:inherit;cursor:pointer}.siblingPager button:disabled{opacity:.25;cursor:default}.siblingPager span{min-width:88px;color:#766f63;font-size:.48rem;font-weight:760;text-align:center}.siblingPager span b{color:#d2b15f}.siblingPager .pagerClose{width:22px;color:#605b53}.branchLoader{position:absolute;z-index:13;transform:translate(-50%,-50%);display:flex;gap:5px;pointer-events:none}.branchLoader i{width:5px;height:5px;border-radius:50%;background:#c99f3f;opacity:.3;animation:loaderPulse .78s ease-in-out infinite}.branchLoader i:nth-child(2){animation-delay:.11s}.branchLoader i:nth-child(3){animation-delay:.22s}
        .zoom-compact .profileAvatar{width:31px;height:31px}.zoom-compact .rootAvatar{width:38px;height:38px}.zoom-compact .nodeCopy strong{font-size:.58rem;color:#8f887c}.zoom-minimal .personNode{width:56px;min-height:56px}.zoom-minimal .profileAvatar{width:27px;height:27px}.zoom-minimal .rootAvatar{width:33px;height:33px}.zoom-minimal .roundPulse,.zoom-minimal .branchControl{display:none}.zoom-minimal .tone-dim{opacity:.18}
        .inspector{position:absolute;z-index:20;right:18px;top:18px;width:224px;padding:13px 14px;border:1px solid rgba(255,255,255,.075);border-radius:17px;background:rgba(17,17,15,.9);backdrop-filter:blur(16px);box-shadow:0 18px 50px rgba(0,0,0,.24)}.inspectorIdentity{display:flex;align-items:center;gap:9px}.inspectorIdentity .profileAvatar{width:30px;height:30px}.inspectorIdentity>div{display:grid;gap:2px}.inspectorIdentity strong{color:#e5ded2;font-size:.67rem;direction:ltr}.inspectorIdentity small{color:#8e8064;font-size:.46rem;font-weight:850}.inspector code{display:block;margin-top:8px;padding:6px 7px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.025);color:#625f59;font-size:.43rem;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.inspectorMetrics{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.inspectorMetrics span{padding:6px 4px;border-radius:9px;background:rgba(255,255,255,.024);color:#66615a;font-size:.43rem;text-align:center}.inspectorMetrics b{display:block;margin-bottom:1px;color:#cfc6b7;font-size:.6rem}
        .stageControls{position:absolute;z-index:22;right:14px;bottom:14px;display:flex;align-items:center;gap:6px}.stageControls button,.previewToggle{width:36px;height:36px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(16,16,14,.84);color:#8d887f;font:inherit;font-size:.72rem;cursor:pointer;backdrop-filter:blur(10px)}.zoomHint{padding:0 7px;color:#514c43;font-size:.43rem;font-weight:850;text-transform:uppercase}.previewCorner{position:absolute;z-index:23;left:14px;bottom:14px}.previewMenu{position:absolute;left:0;bottom:44px;width:170px;padding:9px;display:grid;gap:5px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(16,16,14,.95);box-shadow:0 18px 50px rgba(0,0,0,.35);backdrop-filter:blur(14px)}.previewMenu small{padding:3px 5px 5px;color:#655d4e;font-size:.41rem;font-weight:950;letter-spacing:.07em}.previewMenu button{min-height:31px;padding:0 9px;border:0;border-radius:9px;background:transparent;color:#8f8a81;font:inherit;font-size:.57rem;font-weight:800;text-align:left;cursor:pointer}.previewMenu button:hover,.previewMenu button.active{background:rgba(244,183,40,.07);color:#e1c062}
        @keyframes drawEdge{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0;opacity:1}}@keyframes settleEdge{from{stroke:rgba(244,183,40,.48)}to{stroke:rgba(224,218,207,.065)}}@keyframes bloomWhole{0%{transform:translate(-50%,-50%) translate(var(--from-x),var(--from-y)) scale(.46);opacity:0}68%{transform:translate(-50%,-50%) translate(0,0) scale(1.06);opacity:1}100%{transform:translate(-50%,-50%) translate(0,0) scale(1);opacity:1}}@keyframes labelIn{0%{opacity:0;transform:translateY(3px)}100%{opacity:1;transform:translateY(0)}}@keyframes loaderPulse{0%,100%{opacity:.22;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
        @media(max-width:700px){.screen{padding:18px 14px 114px}.topBar{margin-bottom:5px}.bellButton{width:34px;height:34px;border-radius:11px}.accountChip{height:34px;padding:0 10px;border-radius:11px;font-size:.64rem}.networkSurface{width:100%}.networkHeader{min-height:47px;padding:0 5px}.networkStage{height:calc(100svh - 170px);min-height:520px;border-radius:23px}.summary{font-size:.5rem}.summary b{font-size:.63rem}.personNode{width:92px}.profileAvatar{width:31px;height:31px}.rootAvatar{width:39px;height:39px}.nodeCopy strong{font-size:.58rem}.nodeCopy small{font-size:.46rem}.tone-near{opacity:.5}.tone-dim{opacity:.21}.inspector{right:9px;top:auto;bottom:57px;left:9px;width:auto}.stageControls{right:9px;bottom:9px}.previewCorner{left:9px;bottom:9px}.zoomHint{display:none}.siblingPager{height:29px}.siblingPager span{min-width:78px}.safeAreaMark{height:86px}}
        @media(prefers-reduced-motion:reduce){.personNode,.clusterNode,.freshNode,.freshNode .nodeCopy,.edges line,.branchLoader i{animation:none!important;transition:none!important}}
      `}</style>
    </main>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}
