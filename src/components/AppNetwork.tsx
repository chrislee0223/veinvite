'use client';

import {
  memo,
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

import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_WORKSPACE_COPY } from '@/lib/i18n/networkWorkspaceCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import {
  EMPTY_NETWORK_WORKSPACE_STORE,
  addWorkspaceGroup,
  cloneNetworkFocusWorkspace,
  parseNetworkWorkspaceStore,
  removeWorkspaceGroup,
  serializeNetworkWorkspaceStore,
  withFocusWorkspace,
  withGroupPosition,
  withNodePosition,
  workspaceForFocus,
  type NetworkFocusWorkspace,
  type NetworkWorkspaceStore,
} from '@/lib/networkWorkspace';
import { useWalletLauncher } from './WalletControl';

type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type NavigationDirection = 'forward' | 'back';

type NetworkChild = {
  wallet: string;
  status: MemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type SearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

type NetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    qualified: number;
    thisRound: number | null;
    depth: number;
  };
  round: {
    id: number;
    startAt: string;
    endAt: string;
  } | null;
  children: NetworkChild[];
  searchResults: SearchResult[];
  depthLimitReached: boolean;
};

type PositionedChild = NetworkChild & {
  x: number;
  y: number;
};

type StoredRuntimeState = {
  focusWallet: string;
  view: View;
};

type PinchState = {
  startDistance: number;
  startCenter: Point;
  startView: View;
  worldAnchor: Point;
};

type WorkspaceDrag = {
  pointerId: number;
  kind: 'node' | 'group';
  key: string;
  offset: Point;
};

type GroupDraft = {
  id: string;
  label: string;
  members: string[];
};

const NETWORK_CANVAS_ENABLED =
  process.env.NEXT_PUBLIC_NETWORK_CANVAS_ENABLED !== 'false';
const WORLD_W = 2600;
const WORLD_H = 1900;
const FOCUS_X = WORLD_W / 2;
const FOCUS_Y = 350;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.55;
const SEARCH_DELAY_MS = 280;
const NAVIGATION_MS = 520;
const GROUP_DROP_MS = 160;
const SESSION_PREFIX = 'veinvite-network-runtime-v1:';
const WORKSPACE_PREFIX = 'veinvite-network-workspace-v1:';
const EXPLORER_PAGE_SIZE_DESKTOP = 10;
const EXPLORER_PAGE_SIZE_MOBILE = 6;

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
}

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function runtimeSessionKey(wallet: string): string {
  return `${SESSION_PREFIX}${keyWallet(wallet)}`;
}

function workspaceStorageKey(wallet: string): string {
  return `${WORKSPACE_PREFIX}${keyWallet(wallet)}`;
}

function readStoredRuntimeState(wallet: string): StoredRuntimeState | null {
  try {
    const raw = window.sessionStorage.getItem(runtimeSessionKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRuntimeState>;
    if (!parsed.focusWallet || !validWallet(parsed.focusWallet)) return null;
    if (
      !parsed.view ||
      typeof parsed.view.x !== 'number' ||
      typeof parsed.view.y !== 'number' ||
      typeof parsed.view.scale !== 'number'
    ) {
      return null;
    }
    return {
      focusWallet: parsed.focusWallet,
      view: {
        x: parsed.view.x,
        y: parsed.view.y,
        scale: clamp(parsed.view.scale, MIN_SCALE, MAX_SCALE),
      },
    };
  } catch {
    return null;
  }
}

function readStoredWorkspace(wallet: string): NetworkWorkspaceStore {
  try {
    return parseNetworkWorkspaceStore(window.localStorage.getItem(workspaceStorageKey(wallet)));
  } catch {
    return { version: 1, focus: {} };
  }
}

function newGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function fetchNetwork(
  rootWallet: string,
  options: { focus?: string; query?: string; signal?: AbortSignal } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (options.focus && keyWallet(options.focus) !== keyWallet(rootWallet)) {
    params.set('focus', options.focus);
  }
  if (options.query) params.set('q', options.query);

  const response = await fetch(`/api/network?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null) as NetworkData | { error?: string } | null;
  if (!response.ok) {
    const message = payload && 'error' in payload && payload.error
      ? payload.error
      : 'Failed to load network.';
    throw new Error(message);
  }
  if (
    !payload ||
    !('rootWallet' in payload) ||
    !payload.rootWallet ||
    !payload.focusWallet ||
    !payload.summary ||
    !Array.isArray(payload.children) ||
    !Array.isArray(payload.breadcrumb)
  ) {
    throw new Error('Network response was incomplete.');
  }
  return payload as NetworkData;
}

function centeredView(
  stage: { width: number; height: number },
  scale = 1,
): View {
  return {
    x: stage.width / 2 - FOCUS_X * scale,
    y: Math.max(88, stage.height * 0.32) - FOCUS_Y * scale,
    scale,
  };
}

function statusLabel(status: MemberStatus, locale: Locale): string {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  if (status === 'REWARDED') return t.rewarded;
  if (status === 'QUALIFIED') return t.qualified;
  return t.inProgress;
}

function NetworkGlyph({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.8 6.9 7.2 15" />
      <path d="m13.2 6.9 3.6 8.1" />
      <path d="M8.2 17h7.6" />
    </svg>
  );
}

function NeutralAvatar({ root = false }: { root?: boolean }) {
  const size = root ? 42 : 34;
  return (
    <span className="neutralAvatar" aria-hidden="true" style={{ width: size, height: size }}>
      <svg width={root ? 20 : 16} height={root ? 20 : 16} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="6.1" r="2.7" fill="currentColor" />
        <path d="M5 15.6c1.15-2.25 2.82-3.35 5-3.35s3.85 1.1 5 3.35" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const NetworkIdentity = memo(function NetworkIdentity({
  address,
  root = false,
  showLabel = true,
}: {
  address: string;
  root?: boolean;
  showLabel?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(root);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { data: domainInfo } = useVechainDomain(shouldLoad ? address : undefined);
  const domain = domainInfo?.domain ?? '';
  const { data: avatarUrl } = useGetAvatar(domain);
  const size = root ? 42 : 34;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || shouldLoad) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span className="identity" ref={hostRef}>
      <span className="avatarSlot" style={{ width: size, height: size }}>
        <NeutralAvatar root={root} />
        {avatarUrl && !broken ? (
          <img
            src={avatarUrl}
            alt=""
            loading={root ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            style={{ width: size, height: size, opacity: loaded ? 1 : 0 }}
          />
        ) : null}
      </span>
      {showLabel ? (
        <span className="identityLabel" dir={domain ? 'auto' : 'ltr'} title={domain || address}>
          {domain || shortWallet(address)}
        </span>
      ) : null}
    </span>
  );
});

function goHomeWithoutReload() {
  const button = document.querySelector<HTMLButtonElement>('[data-veinvite-tab="home"]');
  if (button) {
    button.click();
    return;
  }
  window.location.assign('/');
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = y1 + (y2 - y1) * 0.54;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export function AppNetwork({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const w = NETWORK_WORKSPACE_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const groupDropRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef(new Map<string, NetworkData>());
  const abortRef = useRef<AbortController | null>(null);
  const requestSerialRef = useRef(0);
  const pointersRef = useRef(new Map<number, Point>());
  const panPointerRef = useRef<{ id: number; point: Point; allowed: boolean } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const suppressClickRef = useRef(false);
  const pinchReturnIntentRef = useRef(false);
  const wheelReturnDistanceRef = useRef(0);
  const returnViewByChildRef = useRef(new Map<string, View>());
  const viewByFocusRef = useRef(new Map<string, View>());
  const navigationTimerRef = useRef<number | null>(null);
  const initializedWalletRef = useRef<string | null>(null);
  const storedStateRef = useRef<StoredRuntimeState | null>(null);
  const workspaceDragRef = useRef<WorkspaceDrag | null>(null);
  const groupingTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [rootData, setRootData] = useState<NetworkData | null>(null);
  const [focusWallet, setFocusWallet] = useState<string | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [navigationDirection, setNavigationDirection] = useState<NavigationDirection | null>(null);
  const [cameraTransition, setCameraTransition] = useState(false);
  const [workspaceStore, setWorkspaceStore] = useState<NetworkWorkspaceStore>(EMPTY_NETWORK_WORKSPACE_STORE);
  const [editingLayout, setEditingLayout] = useState(false);
  const [draftWorkspace, setDraftWorkspace] = useState<NetworkFocusWorkspace | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draggingWorkspaceKey, setDraggingWorkspaceKey] = useState<string | null>(null);
  const [groupingWallet, setGroupingWallet] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState('');

  const currentData = useMemo(() => {
    if (!focusWallet) return rootData;
    return cacheRef.current.get(keyWallet(focusWallet)) ?? rootData;
  }, [focusWallet, rootData, cacheVersion]);

  const currentFocusKey = currentData ? keyWallet(currentData.focusWallet) : '';
  const isMobile = stageSize.width > 0 && stageSize.width < 560;
  const pageSize = isMobile ? EXPLORER_PAGE_SIZE_MOBILE : EXPLORER_PAGE_SIZE_DESKTOP;
  const committedWorkspace = useMemo(
    () => currentFocusKey ? workspaceForFocus(workspaceStore, currentFocusKey) : cloneNetworkFocusWorkspace(null),
    [workspaceStore, currentFocusKey],
  );
  const activeWorkspace = editingLayout && draftWorkspace ? draftWorkspace : committedWorkspace;

  const positionedChildren = useMemo(() => {
    const children = currentData?.children ?? [];
    const pageCount = Math.max(1, Math.ceil(children.length / pageSize));
    const safePage = clamp(page, 0, pageCount - 1);
    const start = safePage * pageSize;
    const slice = children.slice(start, start + pageSize);
    const count = slice.length;
    const span = isMobile ? Math.min(390, Math.max(120, (count - 1) * 72)) : Math.min(920, Math.max(170, (count - 1) * 112));
    return slice.map((child, index): PositionedChild => {
      const ratio = count <= 1 ? 0.5 : index / (count - 1);
      const defaultX = FOCUS_X - span / 2 + span * ratio;
      const distanceFromCenter = Math.abs(index - (count - 1) / 2);
      const defaultY = FOCUS_Y + (isMobile ? 178 : 188) + Math.min(46, distanceFromCenter * 9);
      const saved = activeWorkspace.positions[keyWallet(child.wallet)];
      return {
        ...child,
        x: saved?.x ?? defaultX,
        y: saved?.y ?? defaultY,
      };
    });
  }, [currentData, page, pageSize, isMobile, activeWorkspace.positions]);

  const stagedGroupMembers = useMemo(() => {
    const keys = new Set<string>();
    activeWorkspace.groups.forEach((group) => group.members.forEach((member) => keys.add(keyWallet(member))));
    groupDraft?.members.forEach((member) => keys.add(keyWallet(member)));
    return keys;
  }, [activeWorkspace.groups, groupDraft]);

  const visibleChildren = useMemo(
    () => positionedChildren.filter((child) => !stagedGroupMembers.has(keyWallet(child.wallet))),
    [positionedChildren, stagedGroupMembers],
  );

  const visibleWalletKeys = useMemo(
    () => new Set(positionedChildren.map((child) => keyWallet(child.wallet))),
    [positionedChildren],
  );

  const visibleGroups = useMemo(
    () => activeWorkspace.groups.filter((group) => group.members.some((member) => visibleWalletKeys.has(keyWallet(member)))),
    [activeWorkspace.groups, visibleWalletKeys],
  );

  const childByWallet = useMemo(() => {
    const map = new Map<string, NetworkChild>();
    currentData?.children.forEach((child) => map.set(keyWallet(child.wallet), child));
    return map;
  }, [currentData]);

  const selectedMember = selectedWallet ? childByWallet.get(selectedWallet) ?? null : null;
  const selectedData = selectedWallet ? cacheRef.current.get(selectedWallet) ?? null : null;
  const selectedIsFocus = Boolean(currentData && selectedWallet === keyWallet(currentData.focusWallet));
  const selectedNetwork = selectedData?.summary.network ?? selectedMember?.network ?? currentData?.summary.network ?? 0;
  const selectedDirect = selectedData?.summary.direct ?? selectedMember?.direct ?? currentData?.summary.direct ?? 0;
  const selectedQualified = selectedData?.summary.qualified ?? selectedMember?.qualified ?? currentData?.summary.qualified ?? 0;
  const selectedRound = selectedData?.summary.thisRound ?? selectedMember?.thisRound ?? currentData?.summary.thisRound ?? null;
  const selectedStatus = selectedMember?.status ?? 'IN_PROGRESS';
  const selectedGroup = selectedGroupId
    ? activeWorkspace.groups.find((group) => group.id === selectedGroupId) ?? null
    : null;

  const pageCount = Math.max(1, Math.ceil((currentData?.children.length ?? 0) / pageSize));
  const safePage = clamp(page, 0, pageCount - 1);
  const emptySlotCount = currentData && keyWallet(currentData.focusWallet) === keyWallet(currentData.rootWallet)
    ? Math.max(0, Math.min(2, 2 - currentData.children.length))
    : 0;

  const clearNavigationTimer = useCallback(() => {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
  }, []);

  const clearWorkspaceTimers = useCallback(() => {
    if (groupingTimerRef.current !== null) {
      window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = null;
    }
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  const beginNavigationMotion = useCallback((direction: NavigationDirection) => {
    clearNavigationTimer();
    setNavigationDirection(direction);
    setCameraTransition(true);
    navigationTimerRef.current = window.setTimeout(() => {
      navigationTimerRef.current = null;
      setNavigationDirection(null);
      setCameraTransition(false);
    }, NAVIGATION_MS);
  }, [clearNavigationTimer]);

  const cancelRequest = useCallback(() => {
    requestSerialRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPendingFocus(null);
    return requestSerialRef.current;
  }, []);

  const rememberPayload = useCallback((payload: NetworkData) => {
    cacheRef.current.set(keyWallet(payload.focusWallet), payload);
    setCacheVersion((value) => value + 1);
  }, []);

  const loadRoot = useCallback(async () => {
    if (!wallet) return;
    const requestWallet = wallet;
    const serial = cancelRequest();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadState('loading');
    setLoadError('');
    setSelectedWallet(null);
    setSearchQuery('');
    setSearchResults([]);
    try {
      const payload = await fetchNetwork(requestWallet, { signal: controller.signal });
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      if (keyWallet(requestWallet) !== keyWallet(wallet)) return;
      cacheRef.current.clear();
      cacheRef.current.set(keyWallet(payload.focusWallet), payload);
      setRootData(payload);

      const stored = storedStateRef.current;
      if (stored && keyWallet(stored.focusWallet) !== keyWallet(payload.rootWallet)) {
        try {
          const restored = await fetchNetwork(requestWallet, {
            focus: stored.focusWallet,
            signal: controller.signal,
          });
          if (controller.signal.aborted || serial !== requestSerialRef.current) return;
          cacheRef.current.set(keyWallet(restored.focusWallet), restored);
          setFocusWallet(restored.focusWallet);
          setView(stored.view);
          initializedWalletRef.current = keyWallet(requestWallet);
        } catch {
          if (controller.signal.aborted || serial !== requestSerialRef.current) return;
          setFocusWallet(payload.rootWallet);
        }
      } else {
        setFocusWallet(payload.rootWallet);
        if (stored) {
          setView(stored.view);
          initializedWalletRef.current = keyWallet(requestWallet);
        }
      }
      setCacheVersion((value) => value + 1);
      setLoadState('ready');
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      setRootData(null);
      setFocusWallet(null);
      setLoadError(error instanceof Error ? error.message : t.loadError);
      setLoadState('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [wallet, cancelRequest, t.loadError]);

  useEffect(() => {
    cacheRef.current.clear();
    returnViewByChildRef.current.clear();
    viewByFocusRef.current.clear();
    initializedWalletRef.current = null;
    storedStateRef.current = wallet ? readStoredRuntimeState(wallet) : null;
    setWorkspaceStore(wallet ? readStoredWorkspace(wallet) : { version: 1, focus: {} });
    setRootData(null);
    setFocusWallet(null);
    setPage(0);
    setSelectedWallet(null);
    setSelectedGroupId(null);
    setEditingLayout(false);
    setDraftWorkspace(null);
    setGroupDraft(null);
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    setGroupingWallet(null);
    setWorkspaceNotice('');
    setView({ x: 0, y: 0, scale: 1 });
    if (!wallet) {
      setLoadState('idle');
      setLoadError('');
      return;
    }
    void loadRoot();
    return () => {
      cancelRequest();
    };
  }, [wallet, loadRoot, cancelRequest]);

  useEffect(() => {
    setEditingLayout(false);
    setDraftWorkspace(null);
    setGroupDraft(null);
    setSelectedGroupId(null);
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    setGroupingWallet(null);
  }, [currentFocusKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize((current) => {
        const width = Math.max(0, Math.round(rect.width));
        const height = Math.max(0, Math.round(rect.height));
        return current.width === width && current.height === height
          ? current
          : { width, height };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [loadState]);

  // Initial placement is the only size-driven camera write. After this guard
  // is satisfied, ResizeObserver can never move the camera or any node.
  useEffect(() => {
    if (!wallet || loadState !== 'ready' || !currentData) return;
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const key = keyWallet(wallet);
    if (initializedWalletRef.current === key) return;
    initializedWalletRef.current = key;
    setView(centeredView(stageSize, 1));
  }, [wallet, loadState, currentData, stageSize]);

  useEffect(() => {
    if (!wallet || !focusWallet || loadState !== 'ready') return;
    try {
      window.sessionStorage.setItem(
        runtimeSessionKey(wallet),
        JSON.stringify({ focusWallet, view } satisfies StoredRuntimeState),
      );
    } catch {
      // Session continuity is optional; runtime state remains fully in memory.
    }
  }, [wallet, focusWallet, view, loadState]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const blockNativeGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    stage.addEventListener('gesturestart', blockNativeGesture, { passive: false });
    stage.addEventListener('gesturechange', blockNativeGesture, { passive: false });
    stage.addEventListener('gestureend', blockNativeGesture, { passive: false });
    return () => {
      stage.removeEventListener('gesturestart', blockNativeGesture);
      stage.removeEventListener('gesturechange', blockNativeGesture);
      stage.removeEventListener('gestureend', blockNativeGesture);
    };
  }, [loadState]);

  useEffect(() => () => {
    cancelRequest();
    clearNavigationTimer();
    clearWorkspaceTimers();
  }, [cancelRequest, clearNavigationTimer, clearWorkspaceTimers]);

  const moveToFocus = useCallback(async (
    targetWallet: string,
    direction: NavigationDirection,
  ) => {
    if (!wallet || !currentData || pendingFocus || editingLayout) return;
    const target = keyWallet(targetWallet);
    const current = keyWallet(currentData.focusWallet);
    if (target === current) return;

    viewByFocusRef.current.set(current, view);
    if (direction === 'forward') {
      returnViewByChildRef.current.set(target, view);
    }

    const serial = cancelRequest();
    const controller = new AbortController();
    abortRef.current = controller;
    setPendingFocus(target);
    try {
      let payload = cacheRef.current.get(target) ?? null;
      if (!payload) {
        payload = await fetchNetwork(wallet, { focus: targetWallet, signal: controller.signal });
      }
      if (controller.signal.aborted || serial !== requestSerialRef.current || !payload) return;
      rememberPayload(payload);
      beginNavigationMotion(direction);
      setFocusWallet(payload.focusWallet);
      setSelectedWallet(null);
      setSelectedGroupId(null);
      setPage(0);
      setSearchQuery('');
      setSearchResults([]);

      if (direction === 'back') {
        const exactParentView = returnViewByChildRef.current.get(current);
        setView(
          exactParentView ??
          viewByFocusRef.current.get(target) ??
          centeredView(stageSize, 1),
        );
      } else {
        setView(
          viewByFocusRef.current.get(target) ??
          centeredView(stageSize, 1),
        );
      }
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      setLoadError(error instanceof Error ? error.message : t.loadError);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (serial === requestSerialRef.current) setPendingFocus(null);
    }
  }, [wallet, currentData, pendingFocus, editingLayout, view, cancelRequest, rememberPayload, beginNavigationMotion, stageSize, t.loadError]);

  const returnToParent = useCallback(() => {
    if (!currentData || pendingFocus || editingLayout || currentData.breadcrumb.length <= 1) return;
    const parent = currentData.breadcrumb[currentData.breadcrumb.length - 2];
    void moveToFocus(parent, 'back');
  }, [currentData, pendingFocus, editingLayout, moveToFocus]);

  const centerNetwork = useCallback(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    setCameraTransition(true);
    setView(centeredView(stageSize, 1));
    window.setTimeout(() => setCameraTransition(false), 240);
  }, [stageSize]);

  const zoomAt = useCallback((screenPoint: Point, nextScale: number) => {
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (screenPoint.x - current.x) / current.scale;
      const worldY = (screenPoint.y - current.y) / current.scale;
      return {
        x: screenPoint.x - worldX * scale,
        y: screenPoint.y - worldY * scale,
        scale,
      };
    });
  }, []);

  const zoomByButton = useCallback((direction: 1 | -1) => {
    if (!editingLayout && direction < 0 && view.scale <= MIN_SCALE + 0.015 && currentData && currentData.breadcrumb.length > 1) {
      returnToParent();
      return;
    }
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    setCameraTransition(true);
    const factor = direction > 0 ? 1.16 : 0.86;
    zoomAt(
      { x: stageSize.width / 2, y: stageSize.height / 2 },
      view.scale * factor,
    );
    window.setTimeout(() => setCameraTransition(false), 220);
  }, [editingLayout, view.scale, currentData, returnToParent, stageSize, zoomAt]);

  useEffect(() => {
    if (!wallet || !currentData || editingLayout) return;
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await fetchNetwork(wallet, {
          focus: currentData.focusWallet,
          query,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setSearchResults(result.searchResults ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [wallet, currentData, searchQuery, editingLayout]);

  const focusSearchResult = useCallback((result: SearchResult) => {
    if (editingLayout) return;
    void moveToFocus(result.wallet, 'forward');
  }, [editingLayout, moveToFocus]);

  const beginLayoutEdit = useCallback(() => {
    if (!currentFocusKey) return;
    setDraftWorkspace(cloneNetworkFocusWorkspace(workspaceForFocus(workspaceStore, currentFocusKey)));
    setEditingLayout(true);
    setSelectedWallet(null);
    setSelectedGroupId(null);
    setGroupDraft(null);
    setWorkspaceNotice('');
  }, [currentFocusKey, workspaceStore]);

  const cancelLayoutEdit = useCallback(() => {
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    setGroupingWallet(null);
    setGroupDraft(null);
    setDraftWorkspace(null);
    setSelectedGroupId(null);
    setEditingLayout(false);
  }, []);

  const saveLayoutEdit = useCallback(() => {
    if (!wallet || !currentFocusKey || !draftWorkspace) return;
    const nextStore = withFocusWorkspace(workspaceStore, currentFocusKey, draftWorkspace);
    setWorkspaceStore(nextStore);
    try {
      window.localStorage.setItem(workspaceStorageKey(wallet), serializeNetworkWorkspaceStore(nextStore));
    } catch {
      // The layout remains committed for this runtime even if storage is unavailable.
    }
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    setGroupDraft(null);
    setDraftWorkspace(null);
    setSelectedGroupId(null);
    setEditingLayout(false);
    setWorkspaceNotice(w.layoutSaved);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setWorkspaceNotice('');
    }, 1800);
  }, [wallet, currentFocusKey, draftWorkspace, workspaceStore, w.layoutSaved]);

  const openGroupBuilder = useCallback(() => {
    if (!editingLayout) return;
    setSelectedGroupId(null);
    setGroupDraft({ id: newGroupId(), label: '', members: [] });
  }, [editingLayout]);

  const createDraftGroup = useCallback(() => {
    if (!groupDraft || !draftWorkspace || groupDraft.members.length < 2) return;
    const members = groupDraft.members.map(keyWallet);
    const memberSet = new Set(members);
    const memberPositions = positionedChildren
      .filter((child) => memberSet.has(keyWallet(child.wallet)))
      .map((child) => ({ x: child.x, y: child.y }));
    const x = memberPositions.length
      ? memberPositions.reduce((sum, point) => sum + point.x, 0) / memberPositions.length
      : FOCUS_X;
    const y = memberPositions.length
      ? memberPositions.reduce((sum, point) => sum + point.y, 0) / memberPositions.length
      : FOCUS_Y + 200;
    const label = groupDraft.label.trim() || `${w.group} ${draftWorkspace.groups.length + 1}`;
    setDraftWorkspace(addWorkspaceGroup(draftWorkspace, {
      id: groupDraft.id,
      label,
      members,
      x,
      y,
    }));
    setGroupDraft(null);
  }, [groupDraft, draftWorkspace, positionedChildren, w.group]);

  const beginWorkspaceDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: WorkspaceDrag['kind'],
    key: string,
    point: Point,
  ) => {
    if (!editingLayout || !draftWorkspace) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const worldPoint = {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    };
    workspaceDragRef.current = {
      pointerId: event.pointerId,
      kind,
      key,
      offset: { x: worldPoint.x - point.x, y: worldPoint.y - point.y },
    };
    suppressClickRef.current = true;
    setDraggingWorkspaceKey(`${kind}:${key}`);
    setSelectedWallet(null);
    setSelectedGroupId(null);
  }, [editingLayout, draftWorkspace, view]);

  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {
    if (drag.kind !== 'node' || !groupDraft || event.type !== 'pointerup') return;
    const drop = groupDropRef.current?.getBoundingClientRect();
    if (!drop) return;
    const inside = event.clientX >= drop.left && event.clientX <= drop.right && event.clientY >= drop.top && event.clientY <= drop.bottom;
    if (!inside || groupDraft.members.includes(drag.key)) return;
    setGroupingWallet(drag.key);
    if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);
    groupingTimerRef.current = window.setTimeout(() => {
      groupingTimerRef.current = null;
      setGroupDraft((current) => {
        if (!current || current.members.includes(drag.key)) return current;
        return { ...current, members: [...current.members, drag.key] };
      });
      setGroupingWallet(null);
    }, GROUP_DROP_MS);
  }, [groupDraft]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const target = event.target instanceof Element ? event.target : null;
    const interactive = Boolean(target?.closest('button,input,a,[data-no-pan="true"]'));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }

    if (pointersRef.current.size === 1) {
      panPointerRef.current = { id: event.pointerId, point, allowed: !interactive };
      pinchRef.current = null;
      pinchReturnIntentRef.current = false;
      return;
    }

    if (pointersRef.current.size === 2) {
      workspaceDragRef.current = null;
      setDraggingWorkspaceKey(null);
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const startView = view;
      pinchRef.current = {
        startDistance: Math.max(1, distance(a, b)),
        startCenter: center,
        startView,
        worldAnchor: {
          x: (center.x - (stageRef.current?.getBoundingClientRect().left ?? 0) - startView.x) / startView.scale,
          y: (center.y - (stageRef.current?.getBoundingClientRect().top ?? 0) - startView.y) / startView.scale,
        },
      };
      panPointerRef.current = null;
      suppressClickRef.current = true;
    }
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const workspaceDrag = workspaceDragRef.current;
    if (
      workspaceDrag &&
      workspaceDrag.pointerId === event.pointerId &&
      pointersRef.current.size === 1 &&
      editingLayout
    ) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const worldPoint = {
        x: (event.clientX - rect.left - view.x) / view.scale - workspaceDrag.offset.x,
        y: (event.clientY - rect.top - view.y) / view.scale - workspaceDrag.offset.y,
      };
      const nextPoint = {
        x: clamp(worldPoint.x, 90, WORLD_W - 90),
        y: clamp(worldPoint.y, 90, WORLD_H - 90),
      };
      setDraftWorkspace((current) => {
        if (!current) return current;
        return workspaceDrag.kind === 'node'
          ? withNodePosition(current, workspaceDrag.key, nextPoint)
          : withGroupPosition(current, workspaceDrag.key, nextPoint);
      });
      suppressClickRef.current = true;
      return;
    }

    if (pointersRef.current.size === 1) {
      const pan = panPointerRef.current;
      if (!pan || pan.id !== event.pointerId || !pan.allowed) return;
      const current = { x: event.clientX, y: event.clientY };
      const dx = current.x - pan.point.x;
      const dy = current.y - pan.point.y;
      if (Math.hypot(dx, dy) > 0) {
        if (Math.hypot(current.x - pan.point.x, current.y - pan.point.y) > 2) {
          suppressClickRef.current = true;
        }
        setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
        panPointerRef.current = { ...pan, point: current };
      }
      return;
    }

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const nextDistance = distance(a, b);
      const pinch = pinchRef.current;
      const rawScale = pinch.startView.scale * (nextDistance / pinch.startDistance);
      const nextScale = clamp(rawScale, MIN_SCALE, MAX_SCALE);
      const localCenter = { x: center.x - rect.left, y: center.y - rect.top };
      setView({
        x: localCenter.x - pinch.worldAnchor.x * nextScale,
        y: localCenter.y - pinch.worldAnchor.y * nextScale,
        scale: nextScale,
      });
      if (!editingLayout && rawScale < MIN_SCALE * 0.88 && currentData && currentData.breadcrumb.length > 1) {
        pinchReturnIntentRef.current = true;
      }
      suppressClickRef.current = true;
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const workspaceDrag = workspaceDragRef.current;
    if (workspaceDrag && workspaceDrag.pointerId === event.pointerId) {
      finishWorkspaceDrop(event, workspaceDrag);
      workspaceDragRef.current = null;
      setDraggingWorkspaceKey(null);
    }

    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [remainingId, remainingPoint] = Array.from(pointersRef.current.entries())[0];
      panPointerRef.current = { id: remainingId, point: remainingPoint, allowed: false };
      pinchRef.current = null;
      if (pinchReturnIntentRef.current) {
        pinchReturnIntentRef.current = false;
        returnToParent();
      }
      return;
    }
    if (pointersRef.current.size === 0) {
      panPointerRef.current = null;
      pinchRef.current = null;
      if (pinchReturnIntentRef.current) {
        pinchReturnIntentRef.current = false;
        returnToParent();
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (
      !editingLayout &&
      event.deltaY > 0 &&
      view.scale <= MIN_SCALE + 0.01 &&
      currentData &&
      currentData.breadcrumb.length > 1
    ) {
      wheelReturnDistanceRef.current += Math.abs(event.deltaY);
      if (wheelReturnDistanceRef.current >= 160) {
        wheelReturnDistanceRef.current = 0;
        returnToParent();
      }
      return;
    }

    if (event.deltaY <= 0 || view.scale > MIN_SCALE + 0.01) {
      wheelReturnDistanceRef.current = 0;
    }
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY < 0 ? 1.09 : 0.91;
    zoomAt(point, view.scale * factor);
  };

  if (!NETWORK_CANVAS_ENABLED) return null;

  if (!wallet) {
    return (
      <section className="networkCard networkStateCard">
        <div className="stateGlyph"><NetworkGlyph size={34} /></div>
        <h1>{t.connectTitle}</h1>
        <p>{t.connectDescription}</p>
        <button type="button" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <section className="networkCard networkStateCard" aria-busy="true">
        <div className="loadingDots" aria-hidden="true"><i /><i /><i /></div>
        <h1>{t.title}</h1>
        <p>{t.directNetwork}</p>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'error' || !rootData || !currentData) {
    return (
      <section className="networkCard networkStateCard">
        <div className="stateGlyph error">!</div>
        <h1>{t.loadError}</h1>
        <p>{loadError || t.loadError}</p>
        <button type="button" onClick={() => void loadRoot()}>{t.retry}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  const focusKey = keyWallet(currentData.focusWallet);
  const rootKey = keyWallet(currentData.rootWallet);
  const focusIsRoot = focusKey === rootKey;
  const breadcrumb = currentData.breadcrumb;
  const breadcrumbStart = Math.max(0, breadcrumb.length - 4);
  const shownBreadcrumb = breadcrumb.slice(breadcrumbStart);
  const worldStyle: CSSProperties = {
    width: WORLD_W,
    height: WORLD_H,
    transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
    transformOrigin: '0 0',
  };

  return (
    <section className="networkCard networkCanvasPage" data-network-runtime="single" data-layout-editing={editingLayout ? 'true' : 'false'}>
      <header className="networkHeader" data-no-pan="true">
        <div className="headerTitle">
          <span>NETWORK</span>
          <h1>{t.title}</h1>
        </div>
        <div className="summary" aria-label={t.networkSize}>
          <strong>{rootData.summary.network.toLocaleString()}</strong>
          <span>{t.networkSize}</span>
          <i />
          <strong className="growth">{rootData.summary.thisRound === null ? '–' : `+${rootData.summary.thisRound}`}</strong>
          <span>{t.thisRound}</span>
        </div>
      </header>

      <div className="networkToolbar" data-no-pan="true">
        <nav className="breadcrumbs" aria-label={t.directNetwork}>
          {breadcrumbStart > 0 ? <span className="crumbEllipsis">…</span> : null}
          {shownBreadcrumb.map((item, index) => {
            const absoluteIndex = breadcrumbStart + index;
            const isCurrent = absoluteIndex === breadcrumb.length - 1;
            return (
              <span className="crumbWrap" key={keyWallet(item)}>
                {index > 0 || breadcrumbStart > 0 ? <span className="crumbSep">›</span> : null}
                <button
                  type="button"
                  className={isCurrent ? 'crumb current' : 'crumb'}
                  disabled={isCurrent || Boolean(pendingFocus) || editingLayout}
                  onClick={() => {
                    if (!isCurrent) void moveToFocus(item, 'back');
                  }}
                >
                  {absoluteIndex === 0 ? c.you : shortWallet(item)}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="searchWrap">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            disabled={editingLayout}
          />
          {!editingLayout && searchQuery.trim().length >= 3 ? (
            <div className="searchResults" role="listbox">
              {searching ? (
                <span className="searchStatus">…</span>
              ) : searchResults.length ? searchResults.slice(0, 8).map((result) => (
                <button
                  type="button"
                  key={`${keyWallet(result.wallet)}:${result.depth}`}
                  onClick={() => focusSearchResult(result)}
                >
                  <strong>{shortWallet(result.wallet)}</strong>
                  <span>{c.branch} · {result.depth}</span>
                </button>
              )) : (
                <span className="searchStatus">{t.noSearchResults}</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={stageRef}
        className={`networkStage${editingLayout ? ' layoutEditing' : ''}`}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={onPointerEndCapture}
        onPointerCancelCapture={onPointerEndCapture}
        onWheel={onWheel}
      >
        <div
          className={`world${cameraTransition ? ' cameraTransition' : ''}`}
          style={worldStyle}
          aria-busy={pendingFocus ? true : undefined}
        >
          <div className={`worldContent${navigationDirection ? ` nav-${navigationDirection}` : ''}`}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} aria-hidden="true">
              {visibleChildren.map((child) => (
                <path
                  key={`edge:${keyWallet(child.wallet)}`}
                  d={edgePath(FOCUS_X, FOCUS_Y + 42, child.x, child.y - 34)}
                  className={child.status === 'REWARDED' ? 'edge rewarded' : 'edge'}
                />
              ))}
              {visibleGroups.map((group) => (
                <path
                  key={`group-edge:${group.id}`}
                  d={edgePath(FOCUS_X, FOCUS_Y + 42, group.x, group.y - 35)}
                  className="edge groupEdge"
                />
              ))}
              {Array.from({ length: emptySlotCount }).map((_, index) => {
                const slotX = FOCUS_X + (index === 0 ? -95 : 95);
                const slotY = FOCUS_Y + 184;
                return (
                  <path
                    key={`slot-edge:${index}`}
                    d={edgePath(FOCUS_X, FOCUS_Y + 42, slotX, slotY - 30)}
                    className="edge slotEdge"
                  />
                );
              })}
            </svg>

            <button
              type="button"
              className={`personNode focusNode${selectedWallet === focusKey ? ' selected' : ''}`}
              style={{ left: FOCUS_X, top: FOCUS_Y }}
              onClick={() => {
                if (suppressClickRef.current || editingLayout) return;
                setSelectedGroupId(null);
                setSelectedWallet(focusKey);
              }}
              data-no-pan="true"
            >
              <NetworkIdentity address={currentData.focusWallet} root />
              <span className="nodeMeta">
                <strong>{focusIsRoot ? c.you : shortWallet(currentData.focusWallet)}</strong>
                <small>{currentData.summary.network.toLocaleString()} {t.networkSize}</small>
              </span>
            </button>

            {visibleChildren.map((child) => {
              const childKey = keyWallet(child.wallet);
              const isSelected = selectedWallet === childKey;
              const dragKey = `node:${childKey}`;
              return (
                <button
                  type="button"
                  key={childKey}
                  className={`personNode childNode status-${child.status.toLowerCase()}${isSelected ? ' selected' : ''}${editingLayout ? ' draggable' : ''}${draggingWorkspaceKey === dragKey ? ' dragging' : ''}${groupingWallet === childKey ? ' grouping' : ''}`}
                  style={{ left: child.x, top: child.y }}
                  onPointerDown={editingLayout ? (event) => beginWorkspaceDrag(event, 'node', childKey, { x: child.x, y: child.y }) : undefined}
                  onClick={() => {
                    if (suppressClickRef.current || editingLayout) return;
                    setSelectedGroupId(null);
                    setSelectedWallet(childKey);
                  }}
                  data-no-pan="true"
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <NetworkIdentity address={child.wallet} />
                  <span className="nodeMeta">
                    <strong>{shortWallet(child.wallet)}</strong>
                    <small>{statusLabel(child.status, locale)}</small>
                  </span>
                  {pendingFocus === childKey ? <span className="nodeBusy" aria-hidden="true" /> : null}
                </button>
              );
            })}

            {visibleGroups.map((group) => {
              const dragKey = `group:${group.id}`;
              return (
                <button
                  type="button"
                  className={`groupNode${editingLayout ? ' draggable' : ''}${draggingWorkspaceKey === dragKey ? ' dragging' : ''}${selectedGroupId === group.id ? ' selected' : ''}`}
                  key={group.id}
                  style={{ left: group.x, top: group.y }}
                  onPointerDown={editingLayout ? (event) => beginWorkspaceDrag(event, 'group', group.id, { x: group.x, y: group.y }) : undefined}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    setSelectedWallet(null);
                    setSelectedGroupId(group.id);
                  }}
                  data-no-pan="true"
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <span className="groupGlyph" aria-hidden="true"><i /><i /><i /></span>
                  <strong>{group.label || w.group}</strong>
                  <small>{group.members.length} {w.members}</small>
                </button>
              );
            })}

            {Array.from({ length: emptySlotCount }).map((_, index) => {
              const slotX = FOCUS_X + (index === 0 ? -95 : 95);
              const slotY = FOCUS_Y + 184;
              return (
                <button
                  type="button"
                  className="slotNode"
                  key={`slot:${index}`}
                  style={{ left: slotX, top: slotY }}
                  onClick={editingLayout ? undefined : goHomeWithoutReload}
                  disabled={editingLayout}
                  data-no-pan="true"
                  aria-label={t.inviteFriend}
                >
                  <span>+</span>
                  <small>{t.inviteFriend}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="layoutControls" data-no-pan="true">
          {!editingLayout ? (
            <button type="button" className="editLayoutButton" onClick={beginLayoutEdit}>✦ {w.editLayout}</button>
          ) : (
            <>
              <button type="button" className="newGroupButton" onClick={openGroupBuilder}>+ {w.newGroup}</button>
              <button type="button" className="cancelLayoutButton" onClick={cancelLayoutEdit}>{w.cancel}</button>
              <button type="button" className="saveLayoutButton" onClick={saveLayoutEdit}>{w.save}</button>
            </>
          )}
        </div>

        {editingLayout && groupDraft ? (
          <aside className="groupBuilder" data-no-pan="true">
            <div className="groupBuilderHead">
              <strong>{w.newGroup}</strong>
              <button type="button" onClick={() => setGroupDraft(null)} aria-label={c.close}>×</button>
            </div>
            <input
              value={groupDraft.label}
              onChange={(event) => setGroupDraft((current) => current ? { ...current, label: event.target.value } : current)}
              placeholder={w.groupName}
              aria-label={w.groupName}
              maxLength={42}
            />
            <div ref={groupDropRef} className="groupDropZone">
              <span className="dropIcon" aria-hidden="true">＋</span>
              <strong>{w.dropHere}</strong>
              <small>{groupDraft.members.length} {w.members}</small>
            </div>
            {groupDraft.members.length ? (
              <div className="groupDraftMembers">
                {groupDraft.members.map((member) => (
                  <button
                    type="button"
                    key={member}
                    title={member}
                    onClick={() => setGroupDraft((current) => current ? {
                      ...current,
                      members: current.members.filter((walletKey) => walletKey !== member),
                    } : current)}
                  >
                    {shortWallet(member)} <span>×</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="createGroupButton"
              disabled={groupDraft.members.length < 2}
              onClick={createDraftGroup}
            >
              {groupDraft.members.length < 2 ? w.needTwo : w.createGroup}
            </button>
          </aside>
        ) : null}

        {pageCount > 1 ? (
          <div className="pager" data-no-pan="true">
            <button
              type="button"
              onClick={() => setPage((value) => clamp(value - 1, 0, pageCount - 1))}
              disabled={safePage === 0 || editingLayout}
              aria-label={c.previous}
            >‹</button>
            <span>{safePage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((value) => clamp(value + 1, 0, pageCount - 1))}
              disabled={safePage >= pageCount - 1 || editingLayout}
              aria-label={c.next}
            >›</button>
          </div>
        ) : null}

        <div className="viewControls" data-no-pan="true">
          <button type="button" onClick={centerNetwork} aria-label={c.centerNetwork} title={c.centerNetwork}>◎</button>
          <button type="button" onClick={() => zoomByButton(1)} aria-label={c.zoomIn} title={c.zoomIn}>+</button>
          <button type="button" onClick={() => zoomByButton(-1)} aria-label={c.zoomOut} title={c.zoomOut}>−</button>
        </div>

        {!focusIsRoot ? (
          <button
            type="button"
            className="parentReturn"
            onClick={returnToParent}
            disabled={Boolean(pendingFocus) || editingLayout}
            data-no-pan="true"
            aria-label={t.invitedBy}
          >
            ‹ {t.invitedBy}
          </button>
        ) : null}

        {selectedWallet && !editingLayout ? (
          <aside className="profileCard" data-no-pan="true">
            <button className="profileClose" type="button" onClick={() => setSelectedWallet(null)} aria-label={c.close}>×</button>
            <div className="profileIdentity">
              <NetworkIdentity address={selectedIsFocus ? currentData.focusWallet : selectedMember?.wallet ?? selectedWallet} root />
              <div>
                <strong>{selectedIsFocus && focusIsRoot ? c.you : shortWallet(selectedIsFocus ? currentData.focusWallet : selectedMember?.wallet ?? selectedWallet)}</strong>
                <span>{selectedIsFocus ? c.branch : statusLabel(selectedStatus, locale)}</span>
              </div>
            </div>
            <div className="profileAddress" dir="ltr">{selectedIsFocus ? currentData.focusWallet : selectedMember?.wallet ?? selectedWallet}</div>
            <div className="profileStats">
              <div><strong>{selectedNetwork.toLocaleString()}</strong><span>{t.networkSize}</span></div>
              <div><strong>{selectedDirect.toLocaleString()}</strong><span>{t.direct}</span></div>
              <div><strong>{selectedQualified.toLocaleString()}</strong><span>{t.qualified}</span></div>
              <div><strong>{selectedRound === null ? '–' : selectedRound.toLocaleString()}</strong><span>{t.thisRound}</span></div>
            </div>
            {!selectedIsFocus && selectedMember ? (
              <button
                type="button"
                className="profileAction"
                onClick={() => void moveToFocus(selectedMember.wallet, 'forward')}
                disabled={Boolean(pendingFocus)}
              >
                {c.expandBranch}
              </button>
            ) : null}
          </aside>
        ) : null}

        {selectedGroup ? (
          <aside className="profileCard groupCard" data-no-pan="true">
            <button className="profileClose" type="button" onClick={() => setSelectedGroupId(null)} aria-label={c.close}>×</button>
            <div className="groupCardTitle">
              <span className="groupGlyph" aria-hidden="true"><i /><i /><i /></span>
              <div><strong>{selectedGroup.label || w.group}</strong><span>{selectedGroup.members.length} {w.members}</span></div>
            </div>
            <div className="groupMemberList">
              {selectedGroup.members.map((member) => <span key={member} title={member}>{shortWallet(member)}</span>)}
            </div>
            {editingLayout ? (
              <button
                type="button"
                className="ungroupButton"
                onClick={() => {
                  setDraftWorkspace((current) => current ? removeWorkspaceGroup(current, selectedGroup.id) : current);
                  setSelectedGroupId(null);
                }}
              >{w.ungroup}</button>
            ) : null}
          </aside>
        ) : null}
      </div>

      {workspaceNotice ? <div className="workspaceNotice" data-no-pan="true">✓ {workspaceNotice}</div> : null}

      {loadError && loadState === 'ready' ? (
        <div className="inlineError" data-no-pan="true">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError('')} aria-label={c.close}>×</button>
        </div>
      ) : null}

      <style jsx>{`
        .networkCanvasPage{width:min(100%,560px);box-sizing:border-box;margin:0 auto;position:relative;overflow:hidden;border:1px solid rgba(255,205,80,.13);border-radius:22px;background:radial-gradient(circle at 50% -14%,rgba(244,183,40,.09),transparent 34%),rgba(10,10,9,.9);box-shadow:0 16px 45px rgba(0,0,0,.24)}
        .networkHeader{min-height:62px;padding:12px 14px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(14,14,12,.94)}
        .headerTitle{min-width:0}.headerTitle>span{display:block;color:#b78d2a;font-size:.52rem;font-weight:950;letter-spacing:.18em}.headerTitle h1{margin:3px 0 0;color:#f0ece3;font-size:.92rem;letter-spacing:-.025em}
        .summary{display:grid;grid-template-columns:auto auto 1px auto auto;align-items:baseline;gap:4px 6px;white-space:nowrap}.summary strong{color:#f1ede4;font-size:.76rem}.summary strong.growth{color:#e6b943}.summary span{color:#77736c;font-size:.52rem}.summary i{width:1px;height:16px;background:rgba(255,255,255,.08);align-self:center}
        .networkToolbar{position:relative;z-index:40;min-height:44px;padding:7px 9px;box-sizing:border-box;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(12,12,10,.96)}
        .breadcrumbs{min-width:0;flex:1;display:flex;align-items:center;overflow:hidden;white-space:nowrap}.crumbWrap{display:flex;align-items:center;min-width:0}.crumbSep,.crumbEllipsis{flex:0 0 auto;color:#4f4c47;font-size:.66rem;margin:0 2px}.crumb{max-width:88px;padding:4px 5px;border:0;background:transparent;color:#8c867b;font:inherit;font-size:.56rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.crumb.current{color:#e5bd55;cursor:default}.crumb:disabled{opacity:.8}
        .searchWrap{position:relative;flex:0 0 min(44%,205px)}.searchWrap input{width:100%;height:30px;box-sizing:border-box;padding:0 9px;border:1px solid rgba(255,205,80,.1);border-radius:9px;background:#11110f;color:#d8d3ca;font:inherit;font-size:.58rem;outline:none}.searchWrap input:focus{border-color:rgba(244,183,40,.34)}.searchWrap input:disabled{opacity:.45}.searchResults{position:absolute;z-index:90;top:35px;right:0;width:min(290px,78vw);max-height:245px;overflow:auto;padding:5px;border:1px solid rgba(255,205,80,.14);border-radius:12px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42)}.searchResults button{width:100%;padding:8px;border:0;border-radius:8px;background:transparent;color:#ddd7cc;text-align:left;cursor:pointer}.searchResults button:hover{background:rgba(244,183,40,.06)}.searchResults strong{display:block;font-size:.62rem}.searchResults button span{display:block;margin-top:3px;color:#6f6b64;font-size:.52rem}.searchStatus{display:block;padding:11px 8px;color:#77736c;font-size:.56rem;line-height:1.45;text-align:center}
        .networkStage{position:relative;height:clamp(430px,68vh,650px);overflow:hidden;touch-action:none;overscroll-behavior:contain;background:radial-gradient(circle at 50% 34%,rgba(244,183,40,.045),transparent 31%),linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px);background-size:auto,28px 28px,28px 28px;cursor:grab;user-select:none;-webkit-user-select:none}.networkStage:active{cursor:grabbing}.networkStage.layoutEditing{box-shadow:inset 0 0 0 1px rgba(244,183,40,.11)}
        .world{position:absolute;top:0;left:0;will-change:transform;backface-visibility:hidden}.world.cameraTransition{transition:transform ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.worldContent{position:absolute;inset:0;transform-origin:${FOCUS_X}px ${FOCUS_Y}px}.worldContent.nav-forward{animation:networkForward ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.worldContent.nav-back{animation:networkBack ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.edge{fill:none;stroke:rgba(176,145,73,.31);stroke-width:1.3;vector-effect:non-scaling-stroke}.edge.rewarded{stroke:rgba(232,183,62,.46)}.edge.groupEdge{stroke:rgba(224,178,65,.42);stroke-width:1.5}.slotEdge{stroke:rgba(232,183,62,.34);stroke-dasharray:7 8;animation:slotFlow 2.2s linear infinite}
        .personNode,.slotNode,.groupNode{position:absolute;z-index:4;transform:translate(-50%,-50%);font:inherit}.personNode{min-width:92px;padding:7px 8px 8px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(17,17,15,.94);color:#d9d4ca;display:grid;justify-items:center;gap:5px;box-shadow:0 8px 20px rgba(0,0,0,.23);cursor:pointer}.personNode:hover,.personNode.selected{border-color:rgba(244,183,40,.35);box-shadow:0 0 0 1px rgba(244,183,40,.07),0 10px 24px rgba(0,0,0,.3)}.focusNode{min-width:112px;padding:10px 11px 9px;border-color:rgba(244,183,40,.24);background:radial-gradient(circle at 50% 0,rgba(244,183,40,.12),transparent 52%),rgba(18,17,14,.97)}.childNode.status-rewarded{border-color:rgba(218,171,57,.17)}.childNode.status-qualified{border-color:rgba(155,136,82,.14)}.personNode.draggable,.groupNode.draggable{cursor:grab;touch-action:none}.personNode.draggable:active,.groupNode.draggable:active{cursor:grabbing}.personNode.dragging,.groupNode.dragging{z-index:12;border-color:rgba(244,183,40,.58);box-shadow:0 14px 30px rgba(0,0,0,.34),0 0 0 2px rgba(244,183,40,.11)}.personNode.grouping{animation:groupDropAway ${GROUP_DROP_MS}ms ease forwards}
        .personNode :global(.identity){display:grid;justify-items:center;gap:4px}.personNode :global(.avatarSlot){position:relative;display:grid;place-items:center}.personNode :global(.neutralAvatar){display:grid;place-items:center;border:1px solid rgba(244,183,40,.13);border-radius:50%;background:#171611;color:#8e7b50}.personNode :global(.avatarSlot img){position:absolute;inset:0;border-radius:50%;object-fit:cover;transition:opacity 160ms ease}.personNode :global(.identityLabel){max-width:88px;color:#a9a49b;font-size:.5rem;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nodeMeta{display:grid;justify-items:center;gap:2px}.nodeMeta strong{max-width:100px;color:#e5dfd5;font-size:.58rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nodeMeta small{color:#6f6a62;font-size:.48rem}.focusNode .nodeMeta strong{color:#edc65c;font-size:.61rem}.nodeBusy{position:absolute;right:6px;top:6px;width:6px;height:6px;border-radius:50%;background:#e9bc45;box-shadow:0 0 10px rgba(233,188,69,.8);animation:pulse 900ms ease-in-out infinite alternate}
        .groupNode{min-width:94px;padding:9px 10px;border:1px solid rgba(244,183,40,.26);border-radius:18px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.15),transparent 56%),rgba(18,17,14,.97);color:#dfd8ca;display:grid;justify-items:center;gap:4px;box-shadow:0 9px 22px rgba(0,0,0,.27);cursor:pointer}.groupNode:hover,.groupNode.selected{border-color:rgba(244,183,40,.46)}.groupNode strong{max-width:105px;font-size:.57rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupNode small{color:#8b805f;font-size:.48rem}.groupGlyph{position:relative;width:34px;height:26px;display:block}.groupGlyph i{position:absolute;width:14px;height:14px;border:1px solid rgba(244,183,40,.34);border-radius:50%;background:#1a1812}.groupGlyph i:nth-child(1){left:10px;top:0}.groupGlyph i:nth-child(2){left:2px;top:11px}.groupGlyph i:nth-child(3){right:2px;top:11px}
        .slotNode{width:84px;height:70px;border:1px dashed rgba(244,183,40,.22);border-radius:15px;background:rgba(244,183,40,.025);color:#a98735;display:grid;place-items:center;align-content:center;gap:3px;cursor:pointer}.slotNode span{font-size:1rem;font-weight:400}.slotNode small{max-width:72px;font-size:.48rem;font-weight:800;line-height:1.15}.slotNode:hover{border-color:rgba(244,183,40,.42);background:rgba(244,183,40,.055)}.slotNode:disabled{opacity:.28;cursor:default}
        .layoutControls{position:absolute;z-index:64;left:10px;top:10px;display:flex;align-items:center;gap:5px}.layoutControls button{min-height:31px;padding:0 9px;border:1px solid rgba(255,205,80,.13);border-radius:9px;background:rgba(18,18,15,.94);color:#a9a397;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(0,0,0,.2)}.layoutControls .editLayoutButton:hover,.layoutControls .newGroupButton:hover{border-color:rgba(244,183,40,.31);color:#e1bd5b}.layoutControls .saveLayoutButton{border-color:rgba(244,183,40,.32);background:linear-gradient(135deg,#e9b93c,#c98a18);color:#17120a}.layoutControls .cancelLayoutButton{color:#8d877e}
        .groupBuilder{position:absolute;z-index:82;left:10px;top:50px;width:min(235px,calc(100% - 20px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.2);border-radius:15px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42);cursor:default}.groupBuilderHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.groupBuilderHead strong{color:#e5dfd3;font-size:.62rem}.groupBuilderHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73;font-size:.95rem;cursor:pointer}.groupBuilder>input{width:100%;height:31px;margin-top:7px;box-sizing:border-box;padding:0 8px;border:1px solid rgba(255,205,80,.1);border-radius:8px;background:#11110f;color:#d8d3ca;font:inherit;font-size:.55rem;outline:none}.groupDropZone{min-height:74px;margin-top:8px;padding:9px;box-sizing:border-box;display:grid;place-items:center;align-content:center;gap:2px;border:1px dashed rgba(244,183,40,.34);border-radius:11px;background:rgba(244,183,40,.035);text-align:center}.dropIcon{color:#c99d35;font-size:.9rem}.groupDropZone strong{color:#b9aa83;font-size:.54rem}.groupDropZone small{color:#6d685e;font-size:.48rem}.groupDraftMembers{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}.groupDraftMembers button{padding:4px 6px;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:rgba(255,255,255,.025);color:#89847a;font:inherit;font-size:.46rem;cursor:pointer}.groupDraftMembers button span{color:#a97f54}.createGroupButton{width:100%;min-height:33px;margin-top:8px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.53rem;font-weight:950;cursor:pointer}.createGroupButton:disabled{background:rgba(255,255,255,.05);color:#68635b;cursor:default}
        .viewControls{position:absolute;z-index:55;right:10px;bottom:10px;display:grid;grid-template-columns:repeat(3,34px);gap:5px}.viewControls button,.pager button{height:34px;border:1px solid rgba(255,205,80,.13);border-radius:10px;background:rgba(18,18,15,.92);color:#bbb5aa;font:inherit;font-size:.78rem;font-weight:850;cursor:pointer}.viewControls button:hover,.pager button:hover:not(:disabled){border-color:rgba(244,183,40,.28);color:#e4c36d}.pager{position:absolute;z-index:55;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:4px;border:1px solid rgba(255,205,80,.08);border-radius:12px;background:rgba(12,12,10,.88)}.pager button{width:32px}.pager button:disabled{opacity:.28;cursor:default}.pager span{min-width:48px;color:#77736c;font-size:.53rem;font-weight:800;text-align:center}.parentReturn{position:absolute;z-index:55;left:10px;bottom:10px;min-height:34px;padding:0 11px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:rgba(18,18,15,.92);color:#a89c7b;font:inherit;font-size:.55rem;font-weight:850;cursor:pointer}.parentReturn:disabled{opacity:.4}
        .profileCard{position:absolute;z-index:75;right:10px;top:10px;width:min(245px,calc(100% - 20px));box-sizing:border-box;padding:13px;border:1px solid rgba(255,205,80,.15);border-radius:17px;background:rgba(15,15,13,.975);box-shadow:0 18px 42px rgba(0,0,0,.45);cursor:default}.profileClose{position:absolute;right:8px;top:7px;width:28px;height:28px;border:0;background:transparent;color:#817c73;font-size:1rem;cursor:pointer}.profileIdentity{padding-right:28px;display:flex;align-items:center;gap:9px}.profileIdentity :global(.identity){display:flex;align-items:center;gap:8px}.profileIdentity :global(.identityLabel){display:none}.profileIdentity :global(.avatarSlot){position:relative;display:grid;place-items:center}.profileIdentity :global(.neutralAvatar){display:grid;place-items:center;border:1px solid rgba(244,183,40,.13);border-radius:50%;background:#171611;color:#8e7b50}.profileIdentity :global(.avatarSlot img){position:absolute;inset:0;border-radius:50%;object-fit:cover}.profileIdentity>div>strong{display:block;color:#e7e1d6;font-size:.66rem}.profileIdentity>div>span{display:block;margin-top:3px;color:#877e69;font-size:.51rem}.profileAddress{margin-top:10px;padding:8px;border-radius:9px;background:rgba(255,255,255,.025);color:#67635d;font-size:.48rem;line-height:1.35;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}.profileStats{margin-top:9px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.profileStats>div{padding:8px;border:1px solid rgba(255,255,255,.045);border-radius:9px;background:rgba(255,255,255,.018)}.profileStats strong{display:block;color:#d6d0c5;font-size:.62rem}.profileStats span{display:block;margin-top:2px;color:#68645e;font-size:.47rem}.profileAction{width:100%;min-height:36px;margin-top:9px;border:0;border-radius:10px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.57rem;font-weight:950;cursor:pointer}.profileAction:disabled{opacity:.45;cursor:default}
        .groupCardTitle{padding-right:28px;display:flex;align-items:center;gap:10px}.groupCardTitle>div strong{display:block;color:#e7dfcf;font-size:.65rem}.groupCardTitle>div span{display:block;margin-top:3px;color:#887c5e;font-size:.5rem}.groupMemberList{margin-top:10px;display:flex;flex-wrap:wrap;gap:5px}.groupMemberList span{padding:5px 6px;border:1px solid rgba(255,255,255,.05);border-radius:7px;background:rgba(255,255,255,.02);color:#777168;font-size:.47rem}.ungroupButton{width:100%;min-height:33px;margin-top:10px;border:1px solid rgba(194,118,90,.2);border-radius:9px;background:rgba(194,118,90,.06);color:#bd9889;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer}
        .workspaceNotice{position:absolute;z-index:96;left:50%;bottom:56px;transform:translateX(-50%);padding:7px 11px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(21,19,14,.97);color:#d5b85f;font-size:.53rem;font-weight:850;white-space:nowrap;box-shadow:0 12px 28px rgba(0,0,0,.3)}
        .inlineError{position:absolute;z-index:90;left:50%;bottom:54px;transform:translateX(-50%);max-width:calc(100% - 28px);padding:8px 9px 8px 11px;display:flex;align-items:center;gap:8px;border:1px solid rgba(194,118,90,.2);border-radius:10px;background:rgba(38,23,18,.96);color:#c7a294;font-size:.53rem;box-shadow:0 12px 30px rgba(0,0,0,.32)}.inlineError button{border:0;background:transparent;color:#9f7d71;font-size:.8rem;cursor:pointer}
        @keyframes networkForward{0%{opacity:.7;scale:.965}100%{opacity:1;scale:1}}@keyframes networkBack{0%{opacity:.76;scale:1.045}100%{opacity:1;scale:1}}@keyframes slotFlow{to{stroke-dashoffset:-30}}@keyframes pulse{to{opacity:.38;transform:scale(.82)}}@keyframes groupDropAway{to{opacity:0;scale:.72}}
        @media(max-width:560px){.networkCanvasPage{width:100%;border-radius:18px}.networkHeader{min-height:58px;padding:10px 11px}.summary{gap:3px 4px}.summary strong{font-size:.68rem}.summary span{font-size:.46rem}.networkToolbar{padding:6px 7px;gap:5px}.searchWrap{flex-basis:43%}.crumb{max-width:64px}.networkStage{height:max(430px,calc(100dvh - 245px));max-height:620px}.profileCard{top:auto;right:8px;bottom:52px;left:8px;width:auto}.groupBuilder{left:8px;top:49px;width:min(232px,calc(100% - 16px))}.layoutControls{left:8px;top:8px}.layoutControls button{padding:0 7px}.viewControls{right:8px;bottom:8px}.parentReturn{left:8px;bottom:8px}.pager{bottom:8px}.personNode{min-width:82px}.focusNode{min-width:101px}}
        @media(prefers-reduced-motion:reduce){.world.cameraTransition{transition:none}.worldContent.nav-forward,.worldContent.nav-back,.slotEdge,.nodeBusy,.personNode.grouping{animation:none!important}}
      `}</style>
    </section>
  );
}

const stateStyles = `
  .networkStateCard{width:min(100%,560px);box-sizing:border-box;margin:0 auto;padding:42px 22px;border:1px solid rgba(255,205,80,.13);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 35%),rgba(255,255,255,.025);text-align:center}
  .stateGlyph{width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.18);border-radius:50%;background:rgba(244,183,40,.055);color:#c59b3d}.stateGlyph.error{color:#bd8b77;border-color:rgba(189,139,119,.18);background:rgba(189,139,119,.045)}
  .networkStateCard h1{margin:0;color:#efebe3;font-size:1.03rem;letter-spacing:-.025em}.networkStateCard p{max-width:390px;margin:9px auto 0;color:#858078;font-size:.7rem;line-height:1.55}.networkStateCard>button{min-width:160px;min-height:43px;margin-top:19px;padding:0 16px;border:0;border-radius:12px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.65rem;font-weight:950;cursor:pointer}.networkStateCard>button:disabled{opacity:.45;cursor:default}.loadingDots{height:62px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;gap:5px}.loadingDots i{width:6px;height:6px;border-radius:50%;background:#b58c31;animation:loadingDot 900ms ease-in-out infinite alternate}.loadingDots i:nth-child(2){animation-delay:150ms}.loadingDots i:nth-child(3){animation-delay:300ms}@keyframes loadingDot{to{opacity:.3;transform:translateY(3px)}}
  @media(prefers-reduced-motion:reduce){.loadingDots i{animation:none}}
`;
