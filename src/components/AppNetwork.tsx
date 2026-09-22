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
import { createPortal } from 'react-dom';

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_WORKSPACE_COPY } from '@/lib/i18n/networkWorkspaceCopy';
import { getLocaleDirection } from '@/lib/i18n/locales';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import {
  getCachedNetworkInviteSlots,
  rememberNetworkInviteSlots,
  type NetworkInviteSlotState,
} from '@/lib/networkInviteSlotsClientCache';
import {
  NETWORK_HEADER_METRICS_UPDATED_EVENT,
  getCachedNetworkHeaderMetrics,
  getCachedNetworkRoot,
  rememberNetworkRoot,
  type NetworkHeaderMetrics,
} from '@/lib/networkRootClientCache';
import {
  readCachedLeaderboardDomain,
  rememberLeaderboardDomain,
} from '@/lib/leaderboardDomainCache';
import { getVeChainExplorerAddressUrl } from '@/lib/vechainExplorer';
import {
  EMPTY_NETWORK_WORKSPACE_STORE,
  MAX_GROUPS_PER_FOCUS,
  MAX_MEMBERS_PER_GROUP,
  addWorkspaceGroup,
  cloneNetworkFocusWorkspace,
  groupContainingWallet,
  moveWorkspaceMemberToGroup,
  parseNetworkWorkspaceStore,
  removeWorkspaceGroupAtMemberPoints,
  removeWorkspaceMemberFromGroupAtPoint,
  serializeNetworkWorkspaceStore,
  withFocusWorkspace,
  withGroupPosition,
  withNodePosition,
  withWorkspaceGroupCollapsed,
  withWorkspaceGroupMemberOffset,
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

type PinchState = {
  startDistance: number;
  startCenter: Point;
  startView: View;
  worldAnchor: Point;
};

type WorkspaceDragKind = 'node' | 'slot' | 'group' | 'group-member';

type WorkspaceDrag = {
  pointerId: number;
  kind: WorkspaceDragKind;
  key: string;
  groupId?: string;
  offset: Point;
  originalWorkspace: NetworkFocusWorkspace;
};

type InviteSlotState = NetworkInviteSlotState;

type PositionedInviteSlot = InviteSlotState & {
  key: string;
  x: number;
  y: number;
};

type HoldDragState = {
  pointerId: number;
  kind: WorkspaceDragKind;
  key: string;
  groupId?: string;
  startScreen: Point;
  startNode: Point;
  offset: Point;
  armed: boolean;
  moved: boolean;
  originalWorkspace: NetworkFocusWorkspace;
};

type GroupDraft = {
  id: string;
  label: string;
  members: string[];
};

type NodeDragGhost = {
  key: string;
  wallet: string;
  x: number;
  y: number;
};

const NETWORK_CANVAS_ENABLED =
  process.env.NEXT_PUBLIC_NETWORK_CANVAS_ENABLED !== 'false';
const WORLD_W = 2600;
const WORLD_H = 1900;
const FOCUS_X = WORLD_W / 2;
const FOCUS_Y = 350;
const MIN_SCALE = 0.32;
const MAX_SCALE = 2.5;
const SEARCH_DELAY_MS = 280;
const NAVIGATION_MS = 720;
const FIT_TRANSITION_MS = 760;
const INTRO_HOLD_MS = 150;
const INTRO_END_MS = 940;
const READABLE_FIT_MIN = 0.46;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GROUP_DROP_MS = 180;
const GROUP_HUB_IN_MS = 220;
const GROUP_DROP_HIT_SLOP_X = 18;
const GROUP_DROP_HIT_SLOP_Y = 14;
const HOLD_TO_MOVE_MS = 500;
const HOLD_CANCEL_DISTANCE = 8;
const NODE_ENTER_SCALE = 1.85;
const NODE_HIT_RADIUS = 58;
const GROUP_SCREEN_DROP_RADIUS = 58;
const WHEEL_ENTER_DISTANCE = 120;
const WORKSPACE_PREFIX = 'veinvite-network-workspace-v1:';

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
}

function nodeWallet(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `0x${wallet.slice(2, 5).toUpperCase()}…${wallet.slice(-3).toUpperCase()}`;
}

function triggerHoldHaptic() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(12);
  } catch {
    // Haptics are optional and unsupported browsers should stay silent.
  }
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

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function radialChildPoint(wallet: string, index: number, compact: boolean): Point {
  const jitter = ((stableHash(wallet) % 101) - 50) / 800;
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE + jitter;
  const radius = compact ? 118 + Math.sqrt(index) * 82 : 208 + Math.sqrt(index) * 128;
  const yScale = compact ? 0.86 : 0.78;
  return {
    x: FOCUS_X + Math.cos(angle) * radius,
    y: FOCUS_Y + Math.sin(angle) * radius * yScale + (compact ? 18 : 26),
  };
}

function inviteSlotPoint(index: number): Point {
  if (index === 0) {
    return { x: FOCUS_X - 58, y: FOCUS_Y + 74 };
  }
  return { x: FOCUS_X + 64, y: FOCUS_Y + 62 };
}

function defaultGroupMemberOffset(index: number, count: number): Point {
  const safeCount = Math.max(1, count);
  const span = Math.min(310, Math.max(90, (safeCount - 1) * 76));
  const ratio = safeCount <= 1 ? 0.5 : index / (safeCount - 1);
  return {
    x: -span / 2 + span * ratio,
    y: 112 + Math.min(26, Math.abs(index - (safeCount - 1) / 2) * 6),
  };
}

function fittedView(stage: { width: number; height: number }, points: Point[]): View {
  if (!points.length) return centeredView(stage, 1);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const contentWidth = Math.max(220, maxX - minX + 190);
  const contentHeight = Math.max(220, maxY - minY + 190);
  const minimum = points.length < 16 ? READABLE_FIT_MIN : MIN_SCALE;
  const scale = clamp(
    Math.min(1, (stage.width - 34) / contentWidth, (stage.height - 50) / contentHeight),
    minimum,
    MAX_SCALE,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: stage.width / 2 - centerX * scale,
    y: stage.height / 2 - centerY * scale,
    scale,
  };
}

function workspaceStorageKey(wallet: string): string {
  return `${WORKSPACE_PREFIX}${keyWallet(wallet)}`;
}

function provisionalNetworkData(wallet: string): NetworkData {
  return {
    rootWallet: wallet,
    focusWallet: wallet,
    focusDepth: 0,
    invitedBy: null,
    breadcrumb: [wallet],
    summary: {
      network: 0,
      direct: 0,
      qualified: 0,
      thisRound: null,
      depth: 0,
    },
    round: null,
    children: [],
    searchResults: [],
    depthLimitReached: false,
  };
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
  options: { focus?: string; query?: string; signal?: AbortSignal; fast?: boolean } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (options.focus && keyWallet(options.focus) !== keyWallet(rootWallet)) {
    params.set('focus', options.focus);
  }
  if (options.query) params.set('q', options.query);
  if (options.fast) params.set('fast', '1');

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
    y: Math.max(88, stage.height * 0.5) - FOCUS_Y * scale,
    scale,
  };
}

function LayoutControlGlyph({ done = false }: { done?: boolean }) {
  if (done) {
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m4 10.4 3.4 3.4L16 5.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.8v14.4M2.8 10h14.4M10 2.8 7.8 5M10 2.8 12.2 5M10 17.2 7.8 15M10 17.2 12.2 15M2.8 10 5 7.8M2.8 10 5 12.2M17.2 10 15 7.8M17.2 10 15 12.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroupsControlGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="5" cy="14" r="2" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="15" cy="14" r="2" stroke="currentColor" strokeWidth="1.45" />
      <path d="M8.8 6.7 6.2 12M11.2 6.7l2.6 5.3M7 14h6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.2 12.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NetworkCountGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="14.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="14.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 6 6 12.7M11 6l3 6.7M6.8 14.5h6.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
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

function NeutralAvatar({ size = 34 }: { size?: number }) {
  const glyphSize = size >= 40 ? 20 : 16;
  return (
    <span className="neutralAvatar" aria-hidden="true" style={{ width: size, height: size }}>
      <svg width={glyphSize} height={glyphSize} viewBox="0 0 20 20" fill="none">
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
  size,
}: {
  address: string;
  root?: boolean;
  showLabel?: boolean;
  size?: number;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(root);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [displayDomain, setDisplayDomain] = useState<string | null | undefined>(
    () => readCachedLeaderboardDomain(address),
  );
  const shouldResolveDomain =
    shouldLoad && displayDomain === undefined;
  const { data: domainInfo, isLoading: domainLoading } = useVechainDomain(
    shouldResolveDomain ? address : undefined,
  );
  const queriedDomain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  const resolvedDomain =
    displayDomain !== undefined
      ? displayDomain
      : shouldResolveDomain && !domainLoading
        ? queriedDomain
        : null;
  const domain = resolvedDomain ?? '';
  const { data: avatarUrl } = useGetAvatar(domain);
  const resolvedSize = size ?? (root ? 42 : 34);

  useEffect(() => {
    setDisplayDomain(readCachedLeaderboardDomain(address));
    setShouldLoad(root);
  }, [address, root]);

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
    if (!shouldResolveDomain || domainLoading) return;
    rememberLeaderboardDomain(address, queriedDomain);
    setDisplayDomain(queriedDomain);
  }, [
    address,
    domainLoading,
    queriedDomain,
    shouldResolveDomain,
  ]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span className="identity" ref={hostRef}>
      <span className="avatarSlot" style={{ width: resolvedSize, height: resolvedSize }}>
        <NeutralAvatar size={resolvedSize} />
        {avatarUrl && !broken ? (
          <img
            src={avatarUrl}
            alt=""
            loading={root ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            style={{ width: resolvedSize, height: resolvedSize, opacity: loaded ? 1 : 0 }}
          />
        ) : null}
      </span>
      {showLabel ? (
        <span
          className="identityLabel"
          dir={domain ? 'auto' : 'ltr'}
          title={domain || address}
        >
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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = Math.sign(dx || 1) * Math.min(58, Math.abs(dx) * 0.16);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1 + dy * 0.22}, ${x2 - bend} ${y1 + dy * 0.78}, ${x2} ${y2}`;
}

export function AppNetwork({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const w = NETWORK_WORKSPACE_COPY[locale as SupportedLocale];
  const u = NETWORK_CANARY_UI_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const groupDropRef = useRef<HTMLDivElement | null>(null);
  const createFirstGroupRef = useRef<HTMLButtonElement | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef(new Map<string, NetworkData>());
  const abortRef = useRef<AbortController | null>(null);
  const requestSerialRef = useRef(0);
  const pointersRef = useRef(new Map<number, Point>());
  const panPointerRef = useRef<{ id: number; point: Point; allowed: boolean } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const suppressClickRef = useRef(false);
  const pinchReturnIntentRef = useRef(false);
  const pinchCandidateWalletRef = useRef<string | null>(null);
  const pinchEnterIntentRef = useRef<string | null>(null);
  const wheelReturnDistanceRef = useRef(0);
  const wheelEnterDistanceRef = useRef(0);
  const wheelEnterWalletRef = useRef<string | null>(null);
  const holdDragRef = useRef<HoldDragState | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const backgroundTapRef = useRef<{
    pointerId: number;
    start: Point;
    moved: boolean;
    blocked: boolean;
  } | null>(null);
  const returnViewByChildRef = useRef(new Map<string, View>());
  const viewByFocusRef = useRef(new Map<string, View>());
  const navigationTimerRef = useRef<number | null>(null);
  const initializedWalletRef = useRef<string | null>(null);
  const workspaceDragRef = useRef<WorkspaceDrag | null>(null);
  const draftWorkspaceRef = useRef<NetworkFocusWorkspace | null>(null);
  const groupingTimerRef = useRef<number | null>(null);
  const groupingRestoreWorkspaceRef = useRef<NetworkFocusWorkspace | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const groupCreatedTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const introFitTimerRef = useRef<number | null>(null);
  const introEndTimerRef = useRef<number | null>(null);
  const introWalletRef = useRef<string | null>(null);
  const introCancelledRef = useRef(false);

  const [rootData, setRootData] = useState<NetworkData | null>(null);
  const [focusWallet, setFocusWallet] = useState<string | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const initialInviteSlots = getCachedNetworkInviteSlots(wallet);
  const [inviteSlots, setInviteSlots] = useState<InviteSlotState[]>(
    () => initialInviteSlots ?? [],
  );
  const [rootTopologyReady, setRootTopologyReady] = useState(false);
  const [inviteSlotsReady, setInviteSlotsReady] = useState(
    () => Boolean(initialInviteSlots),
  );
  const [stageStable, setStageStable] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({
    x: 260 - FOCUS_X,
    y: 300 - FOCUS_Y,
    scale: 1,
  });
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [navigationDirection, setNavigationDirection] = useState<NavigationDirection | null>(null);
  const [cameraTransition, setCameraTransition] = useState(false);
  const [workspaceStore, setWorkspaceStore] = useState<NetworkWorkspaceStore>(EMPTY_NETWORK_WORKSPACE_STORE);
  const [editingLayout, setEditingLayout] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [draftWorkspace, setDraftWorkspace] = useState<NetworkFocusWorkspace | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [managedGroupId, setManagedGroupId] = useState<string | null>(null);
  const [memberDropGroupId, setMemberDropGroupId] = useState<string | null>(null);
  const [draggingWorkspaceKey, setDraggingWorkspaceKey] = useState<string | null>(null);
  const [groupingWallet, setGroupingWallet] = useState<string | null>(null);
  const [groupDropActive, setGroupDropActive] = useState(false);
  const [newGroupDropActive, setNewGroupDropActive] = useState(false);
  const [dragGhost, setDragGhost] = useState<NodeDragGhost | null>(null);
  const [restoringWallets, setRestoringWallets] = useState<string[]>([]);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [introActive, setIntroActive] = useState(false);
  const [headerMetrics, setHeaderMetrics] = useState<NetworkHeaderMetrics | null>(
    () => getCachedNetworkHeaderMetrics(wallet),
  );

  useEffect(() => {
    const syncHeaderMetrics = () => {
      setHeaderMetrics(getCachedNetworkHeaderMetrics(wallet));
    };
    syncHeaderMetrics();
    if (!wallet) return;

    const handleHeaderMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ wallet?: unknown }>).detail;
      if (
        detail &&
        typeof detail.wallet === 'string' &&
        keyWallet(detail.wallet) !== keyWallet(wallet)
      ) {
        return;
      }
      syncHeaderMetrics();
    };

    window.addEventListener(
      NETWORK_HEADER_METRICS_UPDATED_EVENT,
      handleHeaderMetricsUpdated,
    );
    return () => window.removeEventListener(
      NETWORK_HEADER_METRICS_UPDATED_EVENT,
      handleHeaderMetricsUpdated,
    );
  }, [wallet]);

  const visibleRootData = useMemo(() => {
    if (!wallet) return null;
    if (rootData && keyWallet(rootData.rootWallet) === keyWallet(wallet)) {
      return rootData;
    }
    return (getCachedNetworkRoot(wallet) as NetworkData | null) ?? provisionalNetworkData(wallet);
  }, [wallet, rootData]);

  const currentData = useMemo(() => {
    if (!visibleRootData) return null;
    if (!focusWallet) return visibleRootData;
    const cached = cacheRef.current.get(keyWallet(focusWallet)) ?? null;
    if (cached && keyWallet(cached.rootWallet) === keyWallet(visibleRootData.rootWallet)) {
      return cached;
    }
    return visibleRootData;
  }, [focusWallet, visibleRootData, cacheVersion]);

  const currentFocusKey = currentData ? keyWallet(currentData.focusWallet) : '';
  const isMobile = stageSize.width > 0 && stageSize.width < 560;
  const committedWorkspace = useMemo(
    () => currentFocusKey ? workspaceForFocus(workspaceStore, currentFocusKey) : cloneNetworkFocusWorkspace(null),
    [workspaceStore, currentFocusKey],
  );
  const activeWorkspace = editingLayout && draftWorkspace ? draftWorkspace : committedWorkspace;

  const positionedChildren = useMemo(() => {
    const children = currentData?.children ?? [];
    return children.map((child, index): PositionedChild => {
      const fallback = radialChildPoint(child.wallet, index, isMobile);
      const saved = activeWorkspace.positions[keyWallet(child.wallet)];
      return {
        ...child,
        x: saved?.x ?? fallback.x,
        y: saved?.y ?? fallback.y,
      };
    });
  }, [currentData, isMobile, activeWorkspace.positions]);

  const positionedInviteSlots = useMemo((): PositionedInviteSlot[] => {
    if (
      !currentData ||
      keyWallet(currentData.focusWallet) !== keyWallet(currentData.rootWallet)
    ) {
      return [];
    }

    return inviteSlots.map((slot) => {
      const key = `slot:${slot.slot}`;
      const fallback = inviteSlotPoint(slot.slot - 1);
      const saved = activeWorkspace.positions[key];
      return {
        ...slot,
        key,
        x: saved?.x ?? fallback.x,
        y: saved?.y ?? fallback.y,
      };
    });
  }, [currentData, inviteSlots, activeWorkspace.positions]);

  const activeInviteeKeys = useMemo(
    () => new Set(
      positionedInviteSlots
        .filter((slot) => slot.state !== 'AVAILABLE' && slot.inviteeWallet)
        .map((slot) => keyWallet(slot.inviteeWallet as string)),
    ),
    [positionedInviteSlots],
  );

  const groupByMember = useMemo(() => {
    const map = new Map<string, (typeof activeWorkspace.groups)[number]>();
    activeWorkspace.groups.forEach((group) => {
      group.members.forEach((member) => map.set(keyWallet(member), group));
    });
    return map;
  }, [activeWorkspace.groups]);

  const positionedChildKeys = useMemo(
    () => new Set(positionedChildren.map((child) => keyWallet(child.wallet))),
    [positionedChildren],
  );

  const displayedChildren = useMemo(() => positionedChildren.map((child) => {
    const memberKey = keyWallet(child.wallet);
    const group = groupByMember.get(memberKey);
    if (!group || group.collapsed !== false) return child;
    const visibleMembers = group.members.filter((member) => {
      const key = keyWallet(member);
      return !activeInviteeKeys.has(key) && positionedChildKeys.has(key);
    });
    const index = Math.max(0, visibleMembers.findIndex((member) => keyWallet(member) === memberKey));
    const offset =
      group.memberOffsets?.[memberKey] ??
      defaultGroupMemberOffset(index, visibleMembers.length);
    return {
      ...child,
      x: group.x + offset.x,
      y: group.y + offset.y,
    };
  }), [positionedChildren, groupByMember, activeInviteeKeys, positionedChildKeys]);

  const hiddenGroupMembers = useMemo(() => {
    const keys = new Set<string>();
    activeWorkspace.groups.forEach((group) => {
      if (group.collapsed !== false) group.members.forEach((member) => keys.add(keyWallet(member)));
    });
    groupDraft?.members.forEach((member) => {
      const key = keyWallet(member);
      if (key !== groupingWallet) keys.add(key);
    });
    return keys;
  }, [activeWorkspace.groups, groupDraft, groupingWallet]);

  const visibleChildren = useMemo(
    () => displayedChildren.filter((child) => {
      const key = keyWallet(child.wallet);
      return !hiddenGroupMembers.has(key) && !activeInviteeKeys.has(key);
    }),
    [displayedChildren, hiddenGroupMembers, activeInviteeKeys],
  );

  const visibleChildByWallet = useMemo(
    () => new Map(visibleChildren.map((child) => [keyWallet(child.wallet), child])),
    [visibleChildren],
  );

  const groupEligibleWalletKeys = useMemo(
    () => new Set(
      positionedChildren
        .map((child) => keyWallet(child.wallet))
        .filter((key) => !activeInviteeKeys.has(key)),
    ),
    [positionedChildren, activeInviteeKeys],
  );

  const visibleGroups = useMemo(
    () => activeWorkspace.groups.filter((group) =>
      group.members.some((member) => groupEligibleWalletKeys.has(keyWallet(member))),
    ),
    [activeWorkspace.groups, groupEligibleWalletKeys],
  );

  const displayedChildPointByWallet = useMemo(
    () => new Map(
      displayedChildren.map((child) => [
        keyWallet(child.wallet),
        { x: child.x, y: child.y } satisfies Point,
      ]),
    ),
    [displayedChildren],
  );

  const findGroupDropTarget = useCallback((
    clientX: number,
    clientY: number,
    sourceGroupId?: string,
  ) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    let target: (typeof visibleGroups)[number] | null = null;
    let nearestDistance = GROUP_SCREEN_DROP_RADIUS;
    for (const group of visibleGroups) {
      if (group.id === sourceGroupId || group.members.length >= MAX_MEMBERS_PER_GROUP) continue;
      const screenX = rect.left + view.x + group.x * view.scale;
      const screenY = rect.top + view.y + group.y * view.scale;
      const candidateDistance = Math.hypot(clientX - screenX, clientY - screenY);
      if (candidateDistance <= nearestDistance) {
        target = group;
        nearestDistance = candidateDistance;
      }
    }
    return target;
  }, [visibleGroups, view]);

  const nearestVisibleChild = useCallback((point: Point, radius = NODE_HIT_RADIUS): PositionedChild | null => {
    let nearest: PositionedChild | null = null;
    let nearestDistance = radius;
    for (const child of visibleChildren) {
      const candidateDistance = Math.hypot(child.x - point.x, child.y - point.y);
      if (candidateDistance <= nearestDistance) {
        nearest = child;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }, [visibleChildren]);

  const childByWallet = useMemo(() => {
    const map = new Map<string, NetworkChild>();
    currentData?.children.forEach((child) => map.set(keyWallet(child.wallet), child));
    return map;
  }, [currentData]);

  const selectedMember = selectedWallet ? childByWallet.get(selectedWallet) ?? null : null;
  const selectedData = selectedWallet ? cacheRef.current.get(selectedWallet) ?? null : null;
  const selectedIsFocus = Boolean(currentData && selectedWallet === keyWallet(currentData.focusWallet));
  const selectedNetwork = selectedIsFocus
    ? currentData?.summary.network ?? 0
    : selectedData?.summary.network ?? selectedMember?.network ?? 0;
  const selectedDirect = selectedIsFocus
    ? currentData?.summary.direct ?? 0
    : selectedData?.summary.direct ?? selectedMember?.direct ?? 0;
  const selectedQualified = selectedIsFocus
    ? currentData?.summary.qualified ?? 0
    : selectedData?.summary.qualified ?? selectedMember?.qualified ?? 0;
  const selectedRound = selectedIsFocus
    ? currentData?.summary.thisRound ?? null
    : selectedData?.summary.thisRound ?? selectedMember?.thisRound ?? null;
  const selectedAddress = selectedIsFocus
    ? currentData?.focusWallet ?? selectedWallet ?? ''
    : selectedMember?.wallet ?? selectedWallet ?? '';
  const selectedPath = currentData && selectedAddress
    ? (selectedIsFocus
        ? currentData.breadcrumb
        : [...currentData.breadcrumb, selectedAddress])
    : [];
  const compactSelectedPath = selectedPath.length <= 3
    ? selectedPath
    : [selectedPath[0], '…', ...selectedPath.slice(-2)];
  const profileDirection = getLocaleDirection(locale);
  const managedGroup = managedGroupId
    ? activeWorkspace.groups.find((group) => group.id === managedGroupId) ?? null
    : null;

  useEffect(() => {
    if (managedGroupId && !activeWorkspace.groups.some((group) => group.id === managedGroupId)) {
      setManagedGroupId(null);
    }
  }, [managedGroupId, activeWorkspace.groups]);

  const restoringWalletSet = useMemo(
    () => new Set(restoringWallets.map(keyWallet)),
    [restoringWallets],
  );
  const dragGhostChild = dragGhost ? childByWallet.get(dragGhost.key) ?? null : null;

  const clearNavigationTimer = useCallback(() => {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
  }, []);

  const clearWorkspaceTimers = useCallback(() => {
    if (introFitTimerRef.current !== null) {
      window.clearTimeout(introFitTimerRef.current);
      introFitTimerRef.current = null;
    }
    if (introEndTimerRef.current !== null) {
      window.clearTimeout(introEndTimerRef.current);
      introEndTimerRef.current = null;
    }
    if (groupingTimerRef.current !== null) {
      window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = null;
    }
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    if (groupCreatedTimerRef.current !== null) {
      window.clearTimeout(groupCreatedTimerRef.current);
      groupCreatedTimerRef.current = null;
    }
    groupingRestoreWorkspaceRef.current = null;
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdDragRef.current = null;
    backgroundTapRef.current = null;
    setMemberDropGroupId(null);
    pinchCandidateWalletRef.current = null;
    pinchEnterIntentRef.current = null;
    wheelEnterDistanceRef.current = 0;
    wheelEnterWalletRef.current = null;
  }, []);

  const stopIntroForInteraction = useCallback(() => {
    introCancelledRef.current = true;
    if (introFitTimerRef.current !== null) {
      window.clearTimeout(introFitTimerRef.current);
      introFitTimerRef.current = null;
    }
    if (introEndTimerRef.current !== null) {
      window.clearTimeout(introEndTimerRef.current);
      introEndTimerRef.current = null;
    }
    setIntroActive(false);
    setCameraTransition(false);
  }, []);

  const persistFocusWorkspace = useCallback((workspace: NetworkFocusWorkspace) => {
    if (!wallet || !currentFocusKey) return;
    setWorkspaceStore((current) => {
      const next = withFocusWorkspace(current, currentFocusKey, workspace);
      try {
        window.localStorage.setItem(workspaceStorageKey(wallet), serializeNetworkWorkspaceStore(next));
      } catch {
        // Persistence is best-effort; the current runtime still keeps the layout.
      }
      return next;
    });
  }, [wallet, currentFocusKey]);

  const setEditingWorkspace = useCallback((workspace: NetworkFocusWorkspace) => {
    draftWorkspaceRef.current = workspace;
    setDraftWorkspace(workspace);
  }, []);

  const commitEditingWorkspace = useCallback((workspace: NetworkFocusWorkspace) => {
    setEditingWorkspace(workspace);
    persistFocusWorkspace(workspace);
  }, [persistFocusWorkspace, setEditingWorkspace]);

  const mutateEditingWorkspace = useCallback((
    update: (workspace: NetworkFocusWorkspace) => NetworkFocusWorkspace,
  ) => {
    const current = draftWorkspaceRef.current;
    if (!current) return;
    commitEditingWorkspace(update(current));
  }, [commitEditingWorkspace]);

  const commitCurrentDraftWorkspace = useCallback(() => {
    const current = draftWorkspaceRef.current;
    if (current) persistFocusWorkspace(current);
  }, [persistFocusWorkspace]);

  const isInsideGroupDropTarget = useCallback((clientX: number, clientY: number) => {
    const rect = groupDropRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      clientX >= rect.left - GROUP_DROP_HIT_SLOP_X &&
      clientX <= rect.right + GROUP_DROP_HIT_SLOP_X &&
      clientY >= rect.top - GROUP_DROP_HIT_SLOP_Y &&
      clientY <= rect.bottom + GROUP_DROP_HIT_SLOP_Y
    );
  }, []);

  const isInsideNewGroupDropTarget = useCallback((clientX: number, clientY: number) => {
    const rect = createFirstGroupRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      clientX >= rect.left - GROUP_DROP_HIT_SLOP_X &&
      clientX <= rect.right + GROUP_DROP_HIT_SLOP_X &&
      clientY >= rect.top - GROUP_DROP_HIT_SLOP_Y &&
      clientY <= rect.bottom + GROUP_DROP_HIT_SLOP_Y
    );
  }, []);

  const moveDragGhost = useCallback((clientX: number, clientY: number) => {
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    ghost.style.transform = `translate3d(${clientX}px,${clientY}px,0) translate(-50%,-50%)`;
  }, []);

  const clearDragGhost = useCallback(() => {
    setDragGhost(null);
    setNewGroupDropActive(false);
    setMemberDropGroupId(null);
  }, []);

  const animateRestoredWallets = useCallback((wallets: string[]) => {
    const keys = Array.from(new Set(wallets.map(keyWallet)));
    if (!keys.length) return;
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    setRestoringWallets(keys);
    restoreTimerRef.current = window.setTimeout(() => {
      restoreTimerRef.current = null;
      setRestoringWallets([]);
    }, GROUP_DROP_MS);
  }, []);

  const restorePendingGroupDrop = useCallback(() => {
    if (groupingTimerRef.current !== null) {
      window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = null;
    }
    const restoreWorkspace = groupingRestoreWorkspaceRef.current;
    if (restoreWorkspace) setEditingWorkspace(cloneNetworkFocusWorkspace(restoreWorkspace));
    groupingRestoreWorkspaceRef.current = null;
    setGroupingWallet(null);
    setGroupDropActive(false);
  }, [setEditingWorkspace]);

  const markGroupCreated = useCallback((groupId: string) => {
    if (groupCreatedTimerRef.current !== null) window.clearTimeout(groupCreatedTimerRef.current);
    setCreatedGroupId(groupId);
    groupCreatedTimerRef.current = window.setTimeout(() => {
      groupCreatedTimerRef.current = null;
      setCreatedGroupId(null);
    }, GROUP_HUB_IN_MS);
  }, []);

  const updateWorkspaceRuntime = useCallback((
    update: (workspace: NetworkFocusWorkspace) => NetworkFocusWorkspace,
  ) => {
    if (!currentFocusKey) return;
    setWorkspaceStore((current) => {
      const focusWorkspace = workspaceForFocus(current, currentFocusKey);
      const nextWorkspace = update(focusWorkspace);
      if (nextWorkspace === focusWorkspace) return current;
      return withFocusWorkspace(current, currentFocusKey, nextWorkspace);
    });
  }, [currentFocusKey]);

  const flushWorkspaceStore = useCallback(() => {
    if (!wallet) return;
    setWorkspaceStore((current) => {
      try {
        window.localStorage.setItem(workspaceStorageKey(wallet), serializeNetworkWorkspaceStore(current));
      } catch {
        // Runtime state remains authoritative when storage is unavailable.
      }
      return current;
    });
  }, [wallet]);

  const updateNodePositionRuntime = useCallback((walletKey: string, point: Point) => {
    updateWorkspaceRuntime((workspace) => withNodePosition(workspace, walletKey, point));
  }, [updateWorkspaceRuntime]);

  const updateGroupPositionRuntime = useCallback((groupId: string, point: Point) => {
    updateWorkspaceRuntime((workspace) => withGroupPosition(workspace, groupId, point));
  }, [updateWorkspaceRuntime]);

  const updateGroupMemberPositionRuntime = useCallback((
    groupId: string,
    walletKey: string,
    point: Point,
  ) => {
    updateWorkspaceRuntime((workspace) => {
      const group = workspace.groups.find((item) => item.id === groupId);
      if (!group) return workspace;
      return withWorkspaceGroupMemberOffset(workspace, groupId, walletKey, {
        x: point.x - group.x,
        y: point.y - group.y,
      });
    });
  }, [updateWorkspaceRuntime]);

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
    setLoadError('');
    setSelectedWallet(null);
    setSearchQuery('');
    setSearchResults([]);

    const canCommit = () =>
      !controller.signal.aborted &&
      serial === requestSerialRef.current &&
      keyWallet(requestWallet) === keyWallet(wallet);

    const commitRoot = (payload: NetworkData) => {
      cacheRef.current.clear();
      cacheRef.current.set(keyWallet(payload.focusWallet), payload);
      rememberNetworkRoot(requestWallet, payload);
      setRootData(payload);
      setFocusWallet(payload.rootWallet);
      setCacheVersion((value) => value + 1);
      setLoadState('ready');
      setRootTopologyReady(true);
    };

    // Start the fast topology and round-enriched root reads together. The
    // enriched request must never sit behind the fast request, otherwise the
    // header visibly changes from an unresolved round value to the real count.
    const fastRequest = fetchNetwork(requestWallet, {
      signal: controller.signal,
      fast: true,
    });
    const enrichedRequest = fetchNetwork(requestWallet, {
      signal: controller.signal,
    });
    let enrichedCommitted = false;

    void enrichedRequest.then((enriched) => {
      if (!canCommit()) return;
      enrichedCommitted = true;
      commitRoot(enriched);
    }).catch(() => {
      // Fast topology remains a valid fallback if round enrichment fails.
    });

    try {
      const payload = await fastRequest;
      if (!canCommit() || enrichedCommitted) return;
      commitRoot(payload);
    } catch (error) {
      if (!canCommit()) return;

      // Give the already-running enriched request a chance to become the first
      // authoritative scene before exposing the provisional canvas.
      try {
        await enrichedRequest;
        if (!canCommit()) return;
      } catch {
        if (!canCommit()) return;
        setLoadError(error instanceof Error ? error.message : t.loadError);
        setLoadState('ready');
        setRootTopologyReady(true);
      }
    } finally {
      void Promise.allSettled([fastRequest, enrichedRequest]).then(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
    }
  }, [wallet, cancelRequest, t.loadError]);

  useEffect(() => {
    const cachedInviteSlots = wallet
      ? getCachedNetworkInviteSlots(wallet)
      : null;
    cacheRef.current.clear();
    returnViewByChildRef.current.clear();
    viewByFocusRef.current.clear();
    initializedWalletRef.current = null;
    introCancelledRef.current = false;
    setRootTopologyReady(false);
    setInviteSlotsReady(Boolean(cachedInviteSlots));
    setStageStable(false);
    if (introFitTimerRef.current !== null) {
      window.clearTimeout(introFitTimerRef.current);
      introFitTimerRef.current = null;
    }
    if (introEndTimerRef.current !== null) {
      window.clearTimeout(introEndTimerRef.current);
      introEndTimerRef.current = null;
    }
    introWalletRef.current = null;
    setIntroActive(false);
    setWorkspaceStore(wallet ? readStoredWorkspace(wallet) : { version: 1, focus: {} });
    const warmedRoot = wallet ? getCachedNetworkRoot(wallet) as NetworkData | null : null;
    const initialRoot = wallet ? (warmedRoot ?? provisionalNetworkData(wallet)) : null;
    if (warmedRoot) setRootTopologyReady(true);
    setRootData(initialRoot);
    setFocusWallet(initialRoot?.focusWallet ?? null);
    if (initialRoot) {
      cacheRef.current.set(keyWallet(initialRoot.focusWallet), initialRoot);
    }
    setSelectedWallet(null);
    setManagedGroupId(null);
    setEditingLayout(false);
    setGroupsOpen(false);
    draftWorkspaceRef.current = null;
    setDraftWorkspace(null);
    setGroupDraft(null);
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    backgroundTapRef.current = null;
    setDragGhost(null);
    setNewGroupDropActive(false);
    setMemberDropGroupId(null);
    setGroupingWallet(null);
    setWorkspaceNotice('');
    setInviteSlots(cachedInviteSlots ?? []);
    setView({
      x: 260 - FOCUS_X,
      y: 300 - FOCUS_Y,
      scale: 1,
    });
    if (!wallet) {
      setLoadState('idle');
      setLoadError('');
      return;
    }
    setLoadState('ready');
    void loadRoot();
    return () => {
      cancelRequest();
    };
  }, [wallet, loadRoot, cancelRequest]);

  useEffect(() => {
    if (!wallet) {
      setInviteSlots([]);
      setInviteSlotsReady(false);
      return;
    }

    const cachedSlots = getCachedNetworkInviteSlots(wallet);
    let active = true;
    if (cachedSlots) {
      setInviteSlots(cachedSlots);
      setInviteSlotsReady(true);
    } else {
      setInviteSlots([]);
      setInviteSlotsReady(false);
    }

    const controller = new AbortController();
    let retryTimer: number | null = null;
    let refreshInFlight = false;
    let lastAttemptAt = 0;
    const SLOT_RETRY_DELAY_MS = 650;
    const SLOT_REFRESH_MIN_INTERVAL_MS = 1_500;
    const SLOT_REQUEST_TIMEOUT_MS = 2_000;

    const parseSlots = (
      payload: { slots?: unknown } | null,
    ): InviteSlotState[] | null => {
      if (!payload || !Array.isArray(payload.slots)) return null;

      const slots = payload.slots.flatMap((value): InviteSlotState[] => {
        if (!value || typeof value !== 'object') return [];
        const candidate = value as Partial<InviteSlotState>;
        const slot = candidate.slot === 2 ? 2 : candidate.slot === 1 ? 1 : null;
        const state = candidate.state === 'AVAILABLE' || candidate.state === 'PENDING' || candidate.state === 'IN_PROGRESS'
          ? candidate.state
          : null;
        if (!slot || !state) return [];
        const inviteeWallet =
          typeof candidate.inviteeWallet === 'string' && validWallet(candidate.inviteeWallet)
            ? candidate.inviteeWallet
            : null;
        return [{
          slot,
          state,
          inviteeWallet,
          completedSteps: Math.max(0, Math.min(5, Math.trunc(Number(candidate.completedSteps ?? 0)))),
          totalSteps: 5,
        }];
      }).sort((left, right) => left.slot - right.slot);

      // The authoritative route always returns both capacity slots. Keep the
      // last-known-good view if a transient response is partial or malformed.
      return slots.length === 2 ? slots : null;
    };

    const fetchSlotResponse = async (): Promise<Response> => {
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();

      if (controller.signal.aborted) {
        requestController.abort();
      } else {
        controller.signal.addEventListener('abort', abortRequest, { once: true });
      }

      const timeoutId = window.setTimeout(
        () => requestController.abort(),
        SLOT_REQUEST_TIMEOUT_MS,
      );

      try {
        return await fetch(
          `/api/network/slots?wallet=${encodeURIComponent(wallet)}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: requestController.signal,
          },
        );
      } finally {
        window.clearTimeout(timeoutId);
        controller.signal.removeEventListener('abort', abortRequest);
      }
    };

    const refreshSlots = async (
      retryOnFailure = true,
      respectThrottle = false,
    ) => {
      if (!active || controller.signal.aborted || refreshInFlight) return;

      const now = Date.now();
      if (
        respectThrottle &&
        lastAttemptAt > 0 &&
        now - lastAttemptAt < SLOT_REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }

      refreshInFlight = true;
      lastAttemptAt = now;

      try {
        const response = await fetchSlotResponse();

        if (!response.ok) {
          throw new Error(`Invite slot refresh failed (${response.status}).`);
        }

        const payload = await response.json().catch(() => null) as { slots?: unknown } | null;
        const slots = parseSlots(payload);
        if (!slots) {
          throw new Error('Invite slot response was incomplete.');
        }

        if (!active) return;
        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
          retryTimer = null;
        }
        rememberNetworkInviteSlots(wallet, slots);
        setInviteSlots(slots);
        setInviteSlotsReady(true);
      } catch (error) {
        if (!active || controller.signal.aborted) return;

        if (retryOnFailure) {
          if (retryTimer !== null) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            void refreshSlots(false, false);
          }, SLOT_RETRY_DELAY_MS);
          return;
        }

        setInviteSlotsReady(true);
        console.warn(
          'VeInvite could not refresh Network invite slots after retry.',
          error,
        );
      } finally {
        refreshInFlight = false;
      }
    };

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshSlots(true, true);
    };

    void refreshSlots(true, false);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      controller.abort();
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [wallet]);

  useEffect(() => {
    setEditingLayout(false);
    draftWorkspaceRef.current = null;
    setDraftWorkspace(null);
    setGroupDraft(null);
    setManagedGroupId(null);
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

  useEffect(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) {
      setStageStable(false);
      return;
    }
    setStageStable(false);
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setStageStable(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [stageSize.width, stageSize.height]);

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
      setManagedGroupId(null);
        setSearchQuery('');
      setSearchResults([]);

      if (direction === 'back') {
        const immediateParent = currentData.breadcrumb[currentData.breadcrumb.length - 2] ?? null;
        const exactParentView = immediateParent && keyWallet(immediateParent) === target
          ? returnViewByChildRef.current.get(current)
          : undefined;
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
    setView((current) => ({
      x: stageSize.width / 2 - FOCUS_X * current.scale,
      y: Math.max(88, stageSize.height * 0.5) - FOCUS_Y * current.scale,
      scale: current.scale,
    }));
    window.setTimeout(() => setCameraTransition(false), 240);
  }, [stageSize]);

  const returnToYou = useCallback(() => {
    stopIntroForInteraction();
    if (!currentData || pendingFocus || editingLayout) return;
    if (keyWallet(currentData.focusWallet) !== keyWallet(currentData.rootWallet)) {
      void moveToFocus(currentData.rootWallet, 'back');
      return;
    }
    centerNetwork();
  }, [currentData, pendingFocus, editingLayout, moveToFocus, centerNetwork, stopIntroForInteraction]);

  const fitNetwork = useCallback(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const points: Point[] = [
      { x: FOCUS_X, y: FOCUS_Y },
      ...visibleChildren.map((child) => ({ x: child.x, y: child.y })),
      ...visibleGroups.map((group) => ({ x: group.x, y: group.y })),
      ...positionedInviteSlots.map((slot) => ({ x: slot.x, y: slot.y })),
    ];
    setCameraTransition(true);
    setView(fittedView(stageSize, points));
    window.setTimeout(() => setCameraTransition(false), FIT_TRANSITION_MS);
  }, [stageSize, visibleChildren, visibleGroups, positionedInviteSlots]);

  useEffect(() => {
    if (!wallet || loadState !== 'ready' || !currentData) return;
    if (stageSize.width <= 0 || stageSize.height <= 0 || !stageStable) return;
    if (!rootTopologyReady) return;
    if (!inviteSlotsReady) return;
    if (introCancelledRef.current) return;
    if (keyWallet(currentData.focusWallet) !== keyWallet(currentData.rootWallet)) return;
    const walletKey = keyWallet(wallet);
    if (introWalletRef.current === walletKey) return;
    introWalletRef.current = walletKey;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion) {
      fitNetwork();
      return;
    }

    setView(centeredView(stageSize, 1));
    setIntroActive(true);
    introFitTimerRef.current = window.setTimeout(() => {
      introFitTimerRef.current = null;
      if (introCancelledRef.current) return;
      fitNetwork();
    }, INTRO_HOLD_MS);
    introEndTimerRef.current = window.setTimeout(() => {
      introEndTimerRef.current = null;
      setIntroActive(false);
    }, INTRO_END_MS);
  }, [
    wallet,
    loadState,
    currentData,
    stageSize,
    stageStable,
    rootTopologyReady,
    inviteSlotsReady,
    fitNetwork,
  ]);

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
    stopIntroForInteraction();
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
  }, [editingLayout, view.scale, currentData, returnToParent, stageSize, zoomAt, stopIntroForInteraction]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!searchOpen || !wallet || !currentData || editingLayout) return;
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
  }, [searchOpen, wallet, currentData, searchQuery, editingLayout]);

  const focusSearchResult = useCallback((result: SearchResult) => {
    if (editingLayout) return;
    closeSearch();
    void moveToFocus(result.wallet, 'forward');
  }, [editingLayout, closeSearch, moveToFocus]);

  const beginLayoutEdit = useCallback(() => {
    if (!currentFocusKey) return;
    stopIntroForInteraction();
    const workspace = cloneNetworkFocusWorkspace(workspaceForFocus(workspaceStore, currentFocusKey));
    setEditingWorkspace(workspace);
    setEditingLayout(true);
    setGroupsOpen(false);
    closeSearch();
    setSelectedWallet(null);
    setManagedGroupId(null);
    setGroupDraft(null);
    setWorkspaceNotice('');
  }, [currentFocusKey, workspaceStore, setEditingWorkspace, stopIntroForInteraction, closeSearch]);

  const finishLayoutEdit = useCallback(() => {
    workspaceDragRef.current = null;
    restorePendingGroupDrop();
    commitCurrentDraftWorkspace();
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    if (groupCreatedTimerRef.current !== null) {
      window.clearTimeout(groupCreatedTimerRef.current);
      groupCreatedTimerRef.current = null;
    }
    setRestoringWallets([]);
    setCreatedGroupId(null);
    setDraggingWorkspaceKey(null);
    backgroundTapRef.current = null;
    setGroupDropActive(false);
    clearDragGhost();
    setGroupDraft(null);
    setGroupsOpen(false);
    draftWorkspaceRef.current = null;
    setDraftWorkspace(null);
    setManagedGroupId(null);
    setEditingLayout(false);
    setWorkspaceNotice(w.layoutSaved);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setWorkspaceNotice('');
    }, 1400);
  }, [w.layoutSaved, restorePendingGroupDrop, commitCurrentDraftWorkspace, clearDragGhost]);

  const startGroupCreation = useCallback((
    initialMember: string | null = null,
    sourceOverride: NetworkFocusWorkspace | null = null,
  ) => {
    if (!currentFocusKey) return;
    const sourceWorkspace = sourceOverride ?? (editingLayout
      ? draftWorkspaceRef.current ?? committedWorkspace
      : workspaceForFocus(workspaceStore, currentFocusKey));
    if (sourceWorkspace.groups.length >= MAX_GROUPS_PER_FOCUS) return;

    const initialKey = initialMember ? keyWallet(initialMember) : null;
    if (initialKey && groupContainingWallet(sourceWorkspace, initialKey)) return;

    stopIntroForInteraction();
    restorePendingGroupDrop();
    if (!editingLayout) {
      const workspace = cloneNetworkFocusWorkspace(sourceWorkspace);
      setEditingWorkspace(workspace);
      setEditingLayout(true);
    } else if (!draftWorkspaceRef.current) {
      setEditingWorkspace(cloneNetworkFocusWorkspace(committedWorkspace));
    }
    setGroupsOpen(false);
    closeSearch();
    setSelectedWallet(null);
    setManagedGroupId(null);
    setGroupDropActive(false);
    setNewGroupDropActive(false);
    setGroupDraft({
      id: newGroupId(),
      label: '',
      members: initialKey ? [initialKey] : [],
    });
    setWorkspaceNotice('');

    if (initialKey) {
      setGroupingWallet(initialKey);
      if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = window.setTimeout(() => {
        groupingTimerRef.current = null;
        setGroupingWallet(null);
      }, GROUP_DROP_MS);
    }
  }, [
    currentFocusKey,
    editingLayout,
    workspaceStore,
    committedWorkspace,
    setEditingWorkspace,
    stopIntroForInteraction,
    restorePendingGroupDrop,
    closeSearch,
  ]);

  const beginGroupCreation = useCallback(() => {
    startGroupCreation(null);
  }, [startGroupCreation]);

  const beginGroupCreationWithMember = useCallback((
    member: string,
    sourceWorkspace: NetworkFocusWorkspace | null = null,
  ) => {
    startGroupCreation(member, sourceWorkspace);
  }, [startGroupCreation]);

  const cancelGroupCreation = useCallback(() => {
    const members = groupDraft?.members ?? [];
    restorePendingGroupDrop();
    if (members.length) animateRestoredWallets(members);
    setGroupDropActive(false);
    setGroupDraft(null);
  }, [groupDraft, restorePendingGroupDrop, animateRestoredWallets]);

  const removeDraftGroupMember = useCallback((member: string) => {
    const key = keyWallet(member);
    if (groupingWallet === key) restorePendingGroupDrop();
    animateRestoredWallets([key]);
    setGroupDraft((current) => current ? {
      ...current,
      members: current.members.filter((walletKey) => keyWallet(walletKey) !== key),
    } : current);
  }, [groupingWallet, restorePendingGroupDrop, animateRestoredWallets]);

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    if (editingLayout) {
      mutateEditingWorkspace((current) => {
        const group = current.groups.find((item) => item.id === groupId);
        if (!group) return current;
        return withWorkspaceGroupCollapsed(current, groupId, group.collapsed === false);
      });
      return;
    }
    const group = committedWorkspace.groups.find((item) => item.id === groupId);
    if (!group) return;
    persistFocusWorkspace(withWorkspaceGroupCollapsed(committedWorkspace, groupId, group.collapsed === false));
  }, [editingLayout, committedWorkspace, persistFocusWorkspace, mutateEditingWorkspace]);

  const materializeExpandedGroupOffsets = useCallback((
    workspace: NetworkFocusWorkspace,
    groupId: string | undefined,
  ) => {
    if (!groupId) return workspace;
    const group = workspace.groups.find((item) => item.id === groupId);
    if (!group || group.collapsed !== false) return workspace;
    let next = workspace;
    for (const member of group.members) {
      const key = keyWallet(member);
      const point = displayedChildPointByWallet.get(key);
      if (!point) continue;
      next = withWorkspaceGroupMemberOffset(next, group.id, key, {
        x: point.x - group.x,
        y: point.y - group.y,
      });
    }
    return next;
  }, [displayedChildPointByWallet]);

  const moveMemberBetweenGroups = useCallback((
    workspace: NetworkFocusWorkspace,
    walletKey: string,
    sourceGroupId: string | undefined,
    targetGroupId: string,
  ) => {
    let prepared = materializeExpandedGroupOffsets(workspace, sourceGroupId);
    prepared = materializeExpandedGroupOffsets(prepared, targetGroupId);
    return moveWorkspaceMemberToGroup(prepared, walletKey, targetGroupId);
  }, [materializeExpandedGroupOffsets]);

  const updateManagedWorkspace = useCallback((
    update: (workspace: NetworkFocusWorkspace) => NetworkFocusWorkspace,
  ) => {
    if (editingLayout) {
      mutateEditingWorkspace(update);
      return;
    }
    persistFocusWorkspace(update(committedWorkspace));
  }, [editingLayout, committedWorkspace, mutateEditingWorkspace, persistFocusWorkspace]);

  const removeManagedGroupMember = useCallback((member: string) => {
    if (!managedGroup) return;
    const key = keyWallet(member);
    const point = displayedChildPointByWallet.get(key) ?? null;
    animateRestoredWallets([key]);
    updateManagedWorkspace((workspace) => {
      const prepared = materializeExpandedGroupOffsets(workspace, managedGroup.id);
      return removeWorkspaceMemberFromGroupAtPoint(prepared, key, point);
    });
    if (managedGroup.members.length <= 1) setManagedGroupId(null);
  }, [
    managedGroup,
    displayedChildPointByWallet,
    animateRestoredWallets,
    updateManagedWorkspace,
    materializeExpandedGroupOffsets,
  ]);

  const dissolveManagedGroup = useCallback(() => {
    if (!managedGroup) return;
    const memberPoints: Record<string, Point> = {};
    for (const member of managedGroup.members) {
      const key = keyWallet(member);
      const point = displayedChildPointByWallet.get(key);
      if (point) memberPoints[key] = point;
    }
    animateRestoredWallets(managedGroup.members);
    updateManagedWorkspace((workspace) =>
      removeWorkspaceGroupAtMemberPoints(workspace, managedGroup.id, memberPoints)
    );
    setManagedGroupId(null);
  }, [
    managedGroup,
    displayedChildPointByWallet,
    animateRestoredWallets,
    updateManagedWorkspace,
  ]);

  const createDraftGroup = useCallback(() => {
    const workspace = draftWorkspaceRef.current;
    if (
      !groupDraft ||
      !workspace ||
      groupingWallet ||
      groupDraft.members.length < 1 ||
      groupDraft.members.length > MAX_MEMBERS_PER_GROUP
    ) return;

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
    const label = groupDraft.label.trim() || `${w.group} ${workspace.groups.length + 1}`;
    const nextWorkspace = addWorkspaceGroup(workspace, {
      id: groupDraft.id,
      label,
      members,
      x,
      y,
    });
    if (nextWorkspace === workspace) return;

    commitEditingWorkspace(nextWorkspace);
    markGroupCreated(groupDraft.id);
    setGroupDropActive(false);
    setGroupDraft(null);
  }, [
    groupDraft,
    groupingWallet,
    positionedChildren,
    w.group,
    commitEditingWorkspace,
    markGroupCreated,
  ]);

  const beginWorkspaceDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: WorkspaceDrag['kind'],
    key: string,
    point: Point,
    groupId?: string,
  ) => {
    const workspace = draftWorkspaceRef.current;
    if (
      !editingLayout ||
      !workspace ||
      groupingWallet ||
      pointersRef.current.size !== 1 ||
      pinchRef.current
    ) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    const rect = stage.getBoundingClientRect();
    const worldPoint = {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    };
    workspaceDragRef.current = {
      pointerId: event.pointerId,
      kind,
      key,
      groupId,
      offset: { x: worldPoint.x - point.x, y: worldPoint.y - point.y },
      originalWorkspace: cloneNetworkFocusWorkspace(workspace),
    };
    suppressClickRef.current = true;
    setGroupDropActive(false);
    setNewGroupDropActive(false);
    if (kind === 'node' || kind === 'group-member') {
      const child = childByWallet.get(keyWallet(key));
      if (child) {
        setDragGhost({ key: keyWallet(key), wallet: child.wallet, x: event.clientX, y: event.clientY });
        window.requestAnimationFrame(() => moveDragGhost(event.clientX, event.clientY));
      }
    }
    setDraggingWorkspaceKey(`${kind}:${key}`);
    setSelectedWallet(null);
    setManagedGroupId(null);
    if (kind === 'group-member') setGroupsOpen(false);
  }, [editingLayout, groupingWallet, view, childByWallet, moveDragGhost]);

  const cancelHoldDrag = useCallback((restore = false) => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const hold = holdDragRef.current;
    if (restore && hold?.moved) persistFocusWorkspace(hold.originalWorkspace);
    holdDragRef.current = null;
    if (hold) {
      setDraggingWorkspaceKey(null);
      clearDragGhost();
    }
  }, [persistFocusWorkspace, clearDragGhost]);

  const beginHoldDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    point: Point,
    kind: WorkspaceDragKind = 'node',
    groupId?: string,
  ) => {
    if (
      editingLayout ||
      pendingFocus ||
      !currentFocusKey ||
      pointersRef.current.size !== 1 ||
      pinchRef.current ||
      (kind === 'node' && groupContainingWallet(committedWorkspace, key))
    ) return;
    const stage = stageRef.current;
    if (!stage) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    const rect = stage.getBoundingClientRect();
    const worldPoint = {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    };
    holdDragRef.current = {
      pointerId: event.pointerId,
      kind,
      key,
      groupId,
      startScreen: { x: event.clientX, y: event.clientY },
      startNode: point,
      offset: { x: worldPoint.x - point.x, y: worldPoint.y - point.y },
      armed: false,
      moved: false,
      originalWorkspace: cloneNetworkFocusWorkspace(committedWorkspace),
    };
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      const hold = holdDragRef.current;
      if (!hold || hold.pointerId !== event.pointerId || pointersRef.current.size !== 1) return;
      hold.armed = true;
      suppressClickRef.current = true;
      triggerHoldHaptic();
      if (kind === 'group-member') {
        setSelectedWallet(null);
        setManagedGroupId(null);
        setGroupsOpen(false);
      }
      if (kind === 'node' || kind === 'group-member') {
        const child = childByWallet.get(keyWallet(key));
        if (child) {
          setDragGhost({
            key: keyWallet(key),
            wallet: child.wallet,
            x: hold.startScreen.x,
            y: hold.startScreen.y,
          });
          window.requestAnimationFrame(() => moveDragGhost(hold.startScreen.x, hold.startScreen.y));
        }
      }
      setDraggingWorkspaceKey(`${kind}:${key}`);
    }, HOLD_TO_MOVE_MS);
  }, [editingLayout, pendingFocus, currentFocusKey, committedWorkspace, view, childByWallet, moveDragGhost]);

  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {
    setGroupDropActive(false);

    if (event.type !== 'pointerup') {
      setEditingWorkspace(cloneNetworkFocusWorkspace(drag.originalWorkspace));
      return;
    }

    const memberDrag = drag.kind === 'node' || drag.kind === 'group-member';
    if (!memberDrag) {
      commitCurrentDraftWorkspace();
      return;
    }

    if (groupDraft && drag.kind === 'node') {
      const insideDraft = isInsideGroupDropTarget(event.clientX, event.clientY);
      const alreadyAdded = groupDraft.members.some((member) => keyWallet(member) === keyWallet(drag.key));
      const atCapacity = groupDraft.members.length >= MAX_MEMBERS_PER_GROUP;

      if (!insideDraft || alreadyAdded || atCapacity) {
        setEditingWorkspace(cloneNetworkFocusWorkspace(drag.originalWorkspace));
        return;
      }

      groupingRestoreWorkspaceRef.current = cloneNetworkFocusWorkspace(drag.originalWorkspace);
      setGroupingWallet(drag.key);
      setGroupDraft((current) => {
        if (!current) return current;
        if (current.members.some((member) => keyWallet(member) === keyWallet(drag.key))) return current;
        if (current.members.length >= MAX_MEMBERS_PER_GROUP) return current;
        return { ...current, members: [...current.members, keyWallet(drag.key)] };
      });

      if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = window.setTimeout(() => {
        groupingTimerRef.current = null;
        const restoreWorkspace = groupingRestoreWorkspaceRef.current;
        if (restoreWorkspace) setEditingWorkspace(cloneNetworkFocusWorkspace(restoreWorkspace));
        groupingRestoreWorkspaceRef.current = null;
        setGroupingWallet(null);
      }, GROUP_DROP_MS);
      return;
    }

    const targetGroup = findGroupDropTarget(
      event.clientX,
      event.clientY,
      drag.groupId,
    );
    if (targetGroup) {
      const nextWorkspace = moveMemberBetweenGroups(
        drag.originalWorkspace,
        drag.key,
        drag.groupId,
        targetGroup.id,
      );
      if (nextWorkspace !== drag.originalWorkspace) {
        animateRestoredWallets([drag.key]);
        commitEditingWorkspace(nextWorkspace);
      } else {
        setEditingWorkspace(cloneNetworkFocusWorkspace(drag.originalWorkspace));
      }
      return;
    }

    commitCurrentDraftWorkspace();
  }, [
    groupDraft,
    findGroupDropTarget,
    isInsideGroupDropTarget,
    animateRestoredWallets,
    setEditingWorkspace,
    commitEditingWorkspace,
    commitCurrentDraftWorkspace,
    moveMemberBetweenGroups,
  ]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    stopIntroForInteraction();
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const target = event.target instanceof Element ? event.target : null;
    const interactive = Boolean(target?.closest('button,input,a,[data-no-pan="true"]'));
    if (!interactive && selectedWallet) {
      setSelectedWallet(null);
    }
    // Never move pointer ownership away from an interactive control. Capturing
    // button presses on the stage made pointerup land on the canvas instead of
    // the button in VeWorld, so taps looked completely dead. Background drags
    // still capture on the stage; draggable nodes capture themselves.
    if (!interactive) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    }

    if (pointersRef.current.size === 1) {
      panPointerRef.current = { id: event.pointerId, point, allowed: !interactive };
      backgroundTapRef.current = editingLayout && !interactive
        ? {
            pointerId: event.pointerId,
            start: point,
            moved: false,
            blocked: Boolean(groupDraft),
          }
        : null;
      pinchRef.current = null;
      pinchReturnIntentRef.current = false;
      return;
    }

    if (pointersRef.current.size === 2) {
      if (backgroundTapRef.current) backgroundTapRef.current.blocked = true;
      cancelHoldDrag(true);
      const activeWorkspaceDrag = workspaceDragRef.current;
      if (activeWorkspaceDrag) {
        setEditingWorkspace(cloneNetworkFocusWorkspace(activeWorkspaceDrag.originalWorkspace));
      }
      workspaceDragRef.current = null;
      setDraggingWorkspaceKey(null);
      setGroupDropActive(false);
      clearDragGhost();
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const startView = view;
      const stageRect = stageRef.current?.getBoundingClientRect();
      const worldAnchor = {
        x: (center.x - (stageRect?.left ?? 0) - startView.x) / startView.scale,
        y: (center.y - (stageRect?.top ?? 0) - startView.y) / startView.scale,
      };
      pinchRef.current = {
        startDistance: Math.max(1, distance(a, b)),
        startCenter: center,
        startView,
        worldAnchor,
      };
      pinchCandidateWalletRef.current = editingLayout
        ? null
        : nearestVisibleChild(worldAnchor)?.wallet ?? null;
      pinchEnterIntentRef.current = null;
      panPointerRef.current = null;
      suppressClickRef.current = true;
    }
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const backgroundTap = backgroundTapRef.current;
    if (backgroundTap && backgroundTap.pointerId === event.pointerId && !backgroundTap.moved) {
      backgroundTap.moved = Math.hypot(
        event.clientX - backgroundTap.start.x,
        event.clientY - backgroundTap.start.y,
      ) > HOLD_CANCEL_DISTANCE;
    }

    const holdDrag = holdDragRef.current;
    if (holdDrag && holdDrag.pointerId === event.pointerId && pointersRef.current.size === 1 && !editingLayout) {
      const screenDistance = Math.hypot(
        event.clientX - holdDrag.startScreen.x,
        event.clientY - holdDrag.startScreen.y,
      );
      if (!holdDrag.armed) {
        if (screenDistance > HOLD_CANCEL_DISTANCE) {
          if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          holdDragRef.current = null;
          suppressClickRef.current = true;
        }
        return;
      }
      if (screenDistance <= HOLD_CANCEL_DISTANCE && !holdDrag.moved) return;
      if (holdDrag.kind === 'node' || holdDrag.kind === 'group-member') {
        moveDragGhost(event.clientX, event.clientY);
      }
      const holdTargetGroup = holdDrag.kind === 'group-member'
        ? findGroupDropTarget(event.clientX, event.clientY, holdDrag.groupId)
        : null;
      setMemberDropGroupId(holdTargetGroup?.id ?? null);
      setNewGroupDropActive(
        holdDrag.kind === 'node' &&
        Boolean(groupsOpen) &&
        activeWorkspace.groups.length < MAX_GROUPS_PER_FOCUS &&
        isInsideNewGroupDropTarget(event.clientX, event.clientY),
      );
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextPoint = {
        x: clamp((event.clientX - rect.left - view.x) / view.scale - holdDrag.offset.x, 90, WORLD_W - 90),
        y: clamp((event.clientY - rect.top - view.y) / view.scale - holdDrag.offset.y, 90, WORLD_H - 90),
      };
      holdDrag.moved = true;
      if (holdDrag.kind === 'group') {
        updateGroupPositionRuntime(holdDrag.key, nextPoint);
      } else if (holdDrag.kind === 'group-member' && holdDrag.groupId) {
        updateGroupMemberPositionRuntime(holdDrag.groupId, holdDrag.key, nextPoint);
      } else {
        updateNodePositionRuntime(holdDrag.key, nextPoint);
      }
      suppressClickRef.current = true;
      return;
    }

    const workspaceDrag = workspaceDragRef.current;
    if (
      workspaceDrag &&
      workspaceDrag.pointerId === event.pointerId &&
      pointersRef.current.size === 1 &&
      editingLayout
    ) {
      if (workspaceDrag.kind === 'node' || workspaceDrag.kind === 'group-member') {
        moveDragGhost(event.clientX, event.clientY);
      }
      if (workspaceDrag.kind === 'node' && groupDraft) {
        const alreadyAdded = groupDraft.members.some((member) => keyWallet(member) === keyWallet(workspaceDrag.key));
        setGroupDropActive(
          !alreadyAdded &&
          groupDraft.members.length < MAX_MEMBERS_PER_GROUP &&
          isInsideGroupDropTarget(event.clientX, event.clientY),
        );
      } else {
        setGroupDropActive(false);
      }
      setNewGroupDropActive(
        workspaceDrag.kind === 'node' &&
        !groupDraft &&
        groupsOpen &&
        activeWorkspace.groups.length < MAX_GROUPS_PER_FOCUS &&
        isInsideNewGroupDropTarget(event.clientX, event.clientY),
      );
      const workspaceTargetGroup =
        !groupDraft && (workspaceDrag.kind === 'node' || workspaceDrag.kind === 'group-member')
          ? findGroupDropTarget(event.clientX, event.clientY, workspaceDrag.groupId)
          : null;
      setMemberDropGroupId(workspaceTargetGroup?.id ?? null);

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
        let next = current;
        if (workspaceDrag.kind === 'group') {
          next = withGroupPosition(current, workspaceDrag.key, nextPoint);
        } else if (workspaceDrag.kind === 'group-member' && workspaceDrag.groupId) {
          const group = current.groups.find((item) => item.id === workspaceDrag.groupId);
          if (group) {
            next = withWorkspaceGroupMemberOffset(
              current,
              workspaceDrag.groupId,
              workspaceDrag.key,
              { x: nextPoint.x - group.x, y: nextPoint.y - group.y },
            );
          }
        } else {
          next = withNodePosition(current, workspaceDrag.key, nextPoint);
        }
        draftWorkspaceRef.current = next;
        return next;
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
      if (
        !editingLayout &&
        pinchCandidateWalletRef.current &&
        rawScale >= Math.max(NODE_ENTER_SCALE, pinch.startView.scale * 1.18)
      ) {
        pinchEnterIntentRef.current = pinchCandidateWalletRef.current;
      }
      if (!editingLayout && rawScale < MIN_SCALE * 0.88 && currentData && currentData.breadcrumb.length > 1) {
        pinchReturnIntentRef.current = true;
      }
      suppressClickRef.current = true;
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    setGroupDropActive(false);
    setNewGroupDropActive(false);
    const backgroundTap = backgroundTapRef.current;
    const finishEditingFromBlankTap = Boolean(
      backgroundTap &&
      backgroundTap.pointerId === event.pointerId &&
      event.type === 'pointerup' &&
      editingLayout &&
      !groupDraft &&
      !backgroundTap.moved &&
      !backgroundTap.blocked &&
      pointersRef.current.size === 1
    );
    if (backgroundTap?.pointerId === event.pointerId) backgroundTapRef.current = null;
    const holdDrag = holdDragRef.current;
    if (holdDrag && holdDrag.pointerId === event.pointerId) {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      const droppedToNewGroup =
        event.type === 'pointerup' &&
        holdDrag.kind === 'node' &&
        holdDrag.armed &&
        groupsOpen &&
        activeWorkspace.groups.length < MAX_GROUPS_PER_FOCUS &&
        isInsideNewGroupDropTarget(event.clientX, event.clientY);
      const droppedToExistingGroup =
        event.type === 'pointerup' &&
        holdDrag.kind === 'group-member' &&
        holdDrag.armed &&
        holdDrag.moved
          ? findGroupDropTarget(event.clientX, event.clientY, holdDrag.groupId)
          : null;

      if (droppedToNewGroup) {
        if (holdDrag.moved) persistFocusWorkspace(holdDrag.originalWorkspace);
        suppressClickRef.current = true;
        beginGroupCreationWithMember(holdDrag.key, holdDrag.originalWorkspace);
      } else if (droppedToExistingGroup) {
        const nextWorkspace = moveMemberBetweenGroups(
          holdDrag.originalWorkspace,
          holdDrag.key,
          holdDrag.groupId,
          droppedToExistingGroup.id,
        );
        if (nextWorkspace !== holdDrag.originalWorkspace) {
          persistFocusWorkspace(nextWorkspace);
          animateRestoredWallets([holdDrag.key]);
        } else {
          persistFocusWorkspace(holdDrag.originalWorkspace);
        }
        suppressClickRef.current = true;
      } else if (event.type === 'pointercancel' && holdDrag.moved) {
        persistFocusWorkspace(holdDrag.originalWorkspace);
        suppressClickRef.current = true;
      } else if (holdDrag.moved) {
        flushWorkspaceStore();
        suppressClickRef.current = true;
      }
      holdDragRef.current = null;
      setDraggingWorkspaceKey(null);
      clearDragGhost();
    }

    const workspaceDrag = workspaceDragRef.current;
    if (workspaceDrag && workspaceDrag.pointerId === event.pointerId) {
      const droppedToNewGroup =
        event.type === 'pointerup' &&
        workspaceDrag.kind === 'node' &&
        !groupDraft &&
        groupsOpen &&
        activeWorkspace.groups.length < MAX_GROUPS_PER_FOCUS &&
        isInsideNewGroupDropTarget(event.clientX, event.clientY);

      if (droppedToNewGroup) {
        setEditingWorkspace(cloneNetworkFocusWorkspace(workspaceDrag.originalWorkspace));
        beginGroupCreationWithMember(workspaceDrag.key, workspaceDrag.originalWorkspace);
      } else {
        finishWorkspaceDrop(event, workspaceDrag);
      }
      workspaceDragRef.current = null;
      setDraggingWorkspaceKey(null);
      clearDragGhost();
    }

    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [remainingId, remainingPoint] = Array.from(pointersRef.current.entries())[0];
      panPointerRef.current = { id: remainingId, point: remainingPoint, allowed: false };
      return;
    }
    if (pointersRef.current.size === 0) {
      panPointerRef.current = null;
      const enterWallet = pinchEnterIntentRef.current;
      const returnIntent = pinchReturnIntentRef.current;
      pinchRef.current = null;
      pinchCandidateWalletRef.current = null;
      pinchEnterIntentRef.current = null;
      pinchReturnIntentRef.current = false;
      if (finishEditingFromBlankTap) {
        finishLayoutEdit();
      } else if (enterWallet && !editingLayout) {
        void moveToFocus(enterWallet, 'forward');
      } else if (returnIntent) {
        returnToParent();
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopIntroForInteraction();
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
    const nextScale = view.scale * factor;
    if (!editingLayout && event.deltaY < 0) {
      const worldPoint = {
        x: (point.x - view.x) / view.scale,
        y: (point.y - view.y) / view.scale,
      };
      const candidate = nearestVisibleChild(worldPoint);
      if (candidate && nextScale >= NODE_ENTER_SCALE) {
        const candidateKey = keyWallet(candidate.wallet);
        if (wheelEnterWalletRef.current === candidateKey) {
          wheelEnterDistanceRef.current += Math.abs(event.deltaY);
        } else {
          wheelEnterWalletRef.current = candidateKey;
          wheelEnterDistanceRef.current = Math.abs(event.deltaY);
        }
        if (wheelEnterDistanceRef.current >= WHEEL_ENTER_DISTANCE) {
          wheelEnterDistanceRef.current = 0;
          wheelEnterWalletRef.current = null;
          void moveToFocus(candidate.wallet, 'forward');
          return;
        }
      } else {
        wheelEnterDistanceRef.current = 0;
        wheelEnterWalletRef.current = null;
      }
    } else {
      wheelEnterDistanceRef.current = 0;
      wheelEnterWalletRef.current = null;
    }
    zoomAt(point, nextScale);
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

  if (!visibleRootData || !currentData) {
    return null;
  }

  const focusKey = keyWallet(currentData.focusWallet);
  const rootKey = keyWallet(currentData.rootWallet);
  const focusIsRoot = focusKey === rootKey;
  const breadcrumb = currentData.breadcrumb;
  const breadcrumbStart = Math.max(0, breadcrumb.length - 4);
  const shownBreadcrumb = breadcrumb.slice(breadcrumbStart);
  const headerNetwork =
    headerMetrics?.network ?? visibleRootData.summary.network;
  const headerThisRound =
    visibleRootData.summary.thisRound ?? headerMetrics?.thisRound ?? null;
  const rootSceneReady = rootTopologyReady && inviteSlotsReady;
  const headerMetricsReady = headerThisRound !== null;

  const worldStyle: CSSProperties = {
    width: WORLD_W,
    height: WORLD_H,
    transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
    transformOrigin: '0 0',
  };
  const highZoom = clamp((view.scale - 1.45) / (MAX_SCALE - 1.45), 0, 1);
  const labelOpacity = clamp((view.scale - 0.48) / 0.52, 0, 1);
  const visualStyle = {
    '--network-node-scale': String(1 - highZoom * 0.32),
    '--network-node-selected-scale': String(Math.min(1.08, (1 - highZoom * 0.32) * 1.07)),
    '--network-center-scale': String(1 - highZoom * 0.38),
    '--network-center-selected-scale': String(Math.min(1.08, (1 - highZoom * 0.38) * 1.07)),
    '--network-label-opacity': String(labelOpacity),
  } as CSSProperties;

  return (
    <section
      className={`networkCard networkCanvasPage${introActive ? ' introActive' : ''}`}
      data-network-runtime="single"
      data-layout-editing={editingLayout ? 'true' : 'false'}
      data-camera-transition={cameraTransition ? 'true' : 'false'}
      style={visualStyle}
    >
      <header className="networkHeader" data-no-pan="true">
        <h1>{t.title}</h1>
        <div
          className={`summary ${headerMetricsReady ? 'metricsReady' : 'metricsPending'}`}
          aria-label={t.networkSize}
        >
          <strong className="summaryNumber networkTotal">{headerNetwork.toLocaleString()}</strong>
          <span>{t.networkSize}</span>
          <i />
          <strong
            className="summaryNumber growth"
            aria-label={headerThisRound === null ? undefined : `+${headerThisRound}`}
          >
            {headerThisRound === null ? '\u00A0' : `+${headerThisRound}`}
          </strong>
          <span>{t.thisRound}</span>
        </div>
      </header>

      <div className="networkUtilityRow" data-no-pan="true">
        <div className={`searchWrap${searchOpen ? ' open' : ''}`}>
          {searchOpen ? (
            <>
              <div className="searchField">
                <SearchGlyph />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closeSearch();
                  }}
                  placeholder={t.searchPlaceholder}
                  aria-label={t.searchPlaceholder}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="search"
                  disabled={editingLayout}
                />
                <button
                  type="button"
                  className="searchClose"
                  onClick={closeSearch}
                  aria-label={c.close}
                  title={c.close}
                >
                  ×
                </button>
              </div>
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
            </>
          ) : (
            <button
              type="button"
              className="searchToggle"
              onClick={() => setSearchOpen(true)}
              aria-label={t.searchPlaceholder}
              title={t.searchPlaceholder}
              disabled={editingLayout}
            >
              <SearchGlyph />
            </button>
          )}
        </div>

        <div className="compactControls">
          <div className="viewControls">
            <button type="button" className="youControl" onClick={returnToYou} aria-label={c.you} title={c.you}>
              <span aria-hidden="true">◎</span>
            </button>
            <button type="button" className="fitButton" onClick={() => { stopIntroForInteraction(); fitNetwork(); }} aria-label={w.fit} title={w.fit}>⛶</button>
            <button type="button" onClick={() => zoomByButton(-1)} aria-label={c.zoomOut} title={c.zoomOut}>−</button>
            <button type="button" onClick={() => zoomByButton(1)} aria-label={c.zoomIn} title={c.zoomIn}>+</button>
          </div>

          <div className="layoutControls">
            <button
              type="button"
              className={`editLayoutButton${editingLayout ? ' active' : ''}`}
              onClick={editingLayout ? finishLayoutEdit : beginLayoutEdit}
              aria-label={editingLayout ? w.done : w.editLayout}
              title={editingLayout ? w.done : w.editLayout}
            >
              <LayoutControlGlyph done={editingLayout} />
            </button>
            <div className="groupMenuAnchor">
              <button
                type="button"
                className={`groupsButton${groupsOpen || groupDraft ? ' active' : ''}`}
                onClick={() => {
                  stopIntroForInteraction();
                  if (groupDraft) {
                    cancelGroupCreation();
                    setGroupsOpen(false);
                    return;
                  }
                  setManagedGroupId(null);
                  setGroupsOpen((open) => !open);
                }}
                aria-label={w.groups}
                title={w.groups}
                aria-expanded={Boolean(groupsOpen || groupDraft)}
              >
                <GroupsControlGlyph />
              </button>
              {groupDraft ? (
                <aside className="groupBuilder" data-no-pan="true">
                  <div className="groupBuilderHead">
                    <strong>{w.newGroup}</strong>
                    <button type="button" onClick={cancelGroupCreation} aria-label={c.close}>×</button>
                  </div>
                  <input
                    value={groupDraft.label}
                    onChange={(event) => setGroupDraft((current) => current ? { ...current, label: event.target.value } : current)}
                    placeholder={w.groupName}
                    aria-label={w.groupName}
                    maxLength={42}
                    autoComplete="off"
                  />
                  <div
                    ref={groupDropRef}
                    className={`groupDropZone${groupDropActive ? ' active' : ''}${groupingWallet ? ' memberAdded' : ''}`}
                  >
                    <span className="dropIcon" aria-hidden="true">＋</span>
                    <strong>{w.dropHere}</strong>
                    <small aria-live="polite">{groupDraft.members.length} {w.members}</small>
                  </div>
                  {groupDraft.members.length ? (
                    <div className="groupDraftMembers">
                      {groupDraft.members.map((member) => (
                        <button
                          type="button"
                          key={member}
                          title={member}
                          onClick={() => removeDraftGroupMember(member)}
                        >
                          {shortWallet(member)} <span>×</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="createGroupButton"
                    disabled={groupDraft.members.length < 1 || Boolean(groupingWallet)}
                    onClick={createDraftGroup}
                  >
                    {w.createGroup}
                  </button>
                </aside>
              ) : groupsOpen ? (
                <aside className="groupsPanel" data-no-pan="true">
                  {managedGroup ? (
                    <>
                      <div className="groupsPanelHead groupManageHead">
                        <button
                          type="button"
                          className="groupBackButton"
                          onClick={() => setManagedGroupId(null)}
                          aria-label={w.myGroups}
                        >‹</button>
                        <div className="groupManageTitle">
                          <span className="groupManageGlyph" aria-hidden="true"><GroupsControlGlyph size={18} /></span>
                          <strong>{managedGroup.label || w.group}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setManagedGroupId(null); setGroupsOpen(false); }}
                          aria-label={c.close}
                        >×</button>
                      </div>
                      <small className="groupManageCount">{managedGroup.members.length} {w.members}</small>
                      <div className="groupManageMembers">
                        {managedGroup.members.map((member) => (
                          <div className="groupManageMember" key={member} title={member}>
                            <span>{shortWallet(member)}</span>
                            <button
                              type="button"
                              onClick={() => removeManagedGroupMember(member)}
                              aria-label={`${w.removeFromGroup}: ${shortWallet(member)}`}
                              title={w.removeFromGroup}
                            >−</button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="ungroupButton groupManageUngroup"
                        onClick={dissolveManagedGroup}
                      >{w.ungroup}</button>
                    </>
                  ) : (
                    <>
                      <div className="groupsPanelHead">
                        <strong>{w.myGroups}</strong>
                        <button
                          type="button"
                          onClick={() => { setManagedGroupId(null); setGroupsOpen(false); }}
                          aria-label={c.close}
                        >×</button>
                      </div>
                      {activeWorkspace.groups.length ? (
                        <div className="groupsList">
                          {activeWorkspace.groups.map((group) => (
                            <button type="button" key={group.id} onClick={() => setManagedGroupId(group.id)}>
                              <span>{group.label || w.group}</span>
                              <small>{group.members.length} {w.members} ›</small>
                            </button>
                          ))}
                        </div>
                      ) : <p>{w.noGroups}</p>}
                      <button
                        ref={createFirstGroupRef}
                        type="button"
                        className={`createFirstGroup${newGroupDropActive ? ' dropActive' : ''}`}
                        onClick={beginGroupCreation}
                        disabled={activeWorkspace.groups.length >= MAX_GROUPS_PER_FOCUS}
                      >+ {w.newGroup}</button>
                    </>
                  )}
                </aside>
              ) : null}
            </div>
          </div>
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
        <nav className={`breadcrumbs${breadcrumb.length === 1 ? ' rootOnly' : ''}`} aria-label={t.directNetwork} data-no-pan="true">
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
        <div
          className={`world${cameraTransition ? ' cameraTransition' : ''}`}
          style={worldStyle}
          aria-busy={pendingFocus ? true : undefined}
        >
          <div className={`worldContent ${rootSceneReady ? 'sceneReady' : 'scenePending'}${navigationDirection ? ` nav-${navigationDirection}` : ''}`}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} aria-hidden="true">
              {visibleChildren.filter((child) => !groupContainingWallet(activeWorkspace, child.wallet)).map((child) => (
                <path
                  key={`edge:${keyWallet(child.wallet)}`}
                  d={edgePath(FOCUS_X, FOCUS_Y, child.x, child.y)}
                  className={child.status === 'REWARDED' ? 'edge rewarded' : 'edge'}
                />
              ))}
              {visibleGroups.map((group) => (
                <path
                  key={`group-edge:${group.id}`}
                  d={edgePath(FOCUS_X, FOCUS_Y, group.x, group.y)}
                  className="edge groupEdge"
                />
              ))}
              {visibleGroups.filter((group) => group.collapsed === false).flatMap((group) =>
                group.members.map((member) => {
                  const child = visibleChildByWallet.get(keyWallet(member));
                  return child ? (
                    <path
                      key={`group-member-edge:${group.id}:${keyWallet(member)}`}
                      d={edgePath(group.x, group.y, child.x, child.y)}
                      className="edge groupMemberEdge"
                    />
                  ) : null;
                }),
              )}
              {positionedInviteSlots.map((slot, index) => {
                const path = edgePath(FOCUS_X, FOCUS_Y, slot.x, slot.y);
                return (
                  <g key={`slot-edge:${slot.slot}`} className="slotEdgeGroup">
                    <path
                      d={path}
                      className={slot.state === 'AVAILABLE' ? 'edge slotEdgeBase' : 'edge slotEdgeProgress'}
                    />
                    {slot.state === 'AVAILABLE' ? (
                      <path
                        d={path}
                        className="edge slotEdgePulse"
                        style={{ animationDelay: `${index * -0.92}s` }}
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <button
              type="button"
              className={`personNode focusNode${selectedWallet === focusKey ? ' selected' : ''}`}
              style={{ left: FOCUS_X, top: FOCUS_Y }}
              onClick={() => {
                if (suppressClickRef.current || editingLayout) return;
                setManagedGroupId(null);
                setSelectedWallet(focusKey);
              }}
              data-no-pan="true"
            >
              <span className="nodeCircle focusCircle">
                {focusIsRoot ? (
                  <span className="focusYouLabel">{c.you}</span>
                ) : (
                  <NetworkIdentity address={currentData.focusWallet} root showLabel={false} />
                )}
              </span>
              <span className="nodeMeta">
                <strong>{nodeWallet(currentData.focusWallet)}</strong>
                <span className="nodeNetworkMetric">
                  <NetworkCountGlyph />
                  <span>{currentData.summary.network.toLocaleString()}</span>
                </span>
              </span>
            </button>

            {visibleChildren.map((child) => {
              const childKey = keyWallet(child.wallet);
              const parentGroup = groupByMember.get(childKey) ?? null;
              const expandedGroupMember = Boolean(parentGroup && parentGroup.collapsed === false);
              const dragKind: WorkspaceDragKind = expandedGroupMember ? 'group-member' : 'node';
              const isSelected = selectedWallet === childKey;
              const dragKey = `${dragKind}:${childKey}`;
              return (
                <button
                  type="button"
                  key={childKey}
                  className={`personNode childNode status-${child.status.toLowerCase()}${isSelected ? ' selected' : ''}${editingLayout ? ' draggable' : ''}${draggingWorkspaceKey === dragKey ? ' dragging' : ''}${dragGhost?.key === childKey ? ' dragGhostSource' : ''}${groupingWallet === childKey ? ' grouping' : ''}${restoringWalletSet.has(childKey) ? ' restoring' : ''}`}
                  style={{ left: child.x, top: child.y }}
                  onPointerDown={(event) => {
                    if (editingLayout) {
                      beginWorkspaceDrag(
                        event,
                        dragKind,
                        childKey,
                        { x: child.x, y: child.y },
                        expandedGroupMember ? parentGroup?.id : undefined,
                      );
                    } else {
                      beginHoldDrag(
                        event,
                        childKey,
                        { x: child.x, y: child.y },
                        dragKind,
                        expandedGroupMember ? parentGroup?.id : undefined,
                      );
                    }
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    if (suppressClickRef.current || editingLayout) return;
                    setManagedGroupId(null);
                    setSelectedWallet(childKey);
                  }}
                  data-no-pan="true"
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <span className="nodeCircle"><NetworkIdentity address={child.wallet} showLabel={false} /></span>
                  <span className="nodeMeta">
                    <strong>{nodeWallet(child.wallet)}</strong>
                    {child.status === 'IN_PROGRESS' ? (
                      <small className="nodeProgressStatus">{t.inProgress}</small>
                    ) : (
                      <span className="nodeNetworkMetric">
                        <NetworkCountGlyph />
                        <span>{child.network.toLocaleString()}</span>
                      </span>
                    )}
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
                  className={`groupNode${editingLayout ? ' draggable' : ''}${draggingWorkspaceKey === dragKey ? ' dragging' : ''}${memberDropGroupId === group.id ? ' dropTarget' : ''}${group.collapsed === false ? ' expanded' : ''}${createdGroupId === group.id ? ' created' : ''}`}
                  key={group.id}
                  style={{ left: group.x, top: group.y }}
                  onPointerDown={(event) => {
                    if (editingLayout) beginWorkspaceDrag(event, 'group', group.id, { x: group.x, y: group.y });
                    else beginHoldDrag(event, group.id, { x: group.x, y: group.y }, 'group');
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    setSelectedWallet(null);
                    toggleGroupCollapsed(group.id);
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  aria-expanded={group.collapsed === false}
                  data-no-pan="true"
                  data-group-drop-id={group.id}
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <span className="groupGlyph" aria-hidden="true"><GroupsControlGlyph size={18} /></span>
                  <strong>{group.label || w.group}</strong>
                  <small>{group.members.length} {w.members}</small>
                </button>
              );
            })}

            {positionedInviteSlots.map((slot) => {
              const dragKey = `slot:${slot.key}`;
              const isDragging = draggingWorkspaceKey === dragKey;
              const point = { x: slot.x, y: slot.y };
              const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
                if (editingLayout) beginWorkspaceDrag(event, 'slot', slot.key, point);
                else beginHoldDrag(event, slot.key, point, 'slot');
              };

              if (slot.state === 'AVAILABLE') {
                return (
                  <button
                    type="button"
                    className={`slotNode${editingLayout ? ' draggable' : ''}${isDragging ? ' dragging' : ''}`}
                    key={slot.key}
                    style={{ left: slot.x, top: slot.y }}
                    onPointerDown={handlePointerDown}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={() => {
                      if (suppressClickRef.current || editingLayout) return;
                      goHomeWithoutReload();
                    }}
                    data-no-pan="true"
                    data-workspace-draggable={editingLayout ? 'true' : undefined}
                    aria-label={t.inviteFriend}
                  >
                    <span className="slotCircle" aria-hidden="true">+</span>
                    <strong>{u.available}</strong>
                  </button>
                );
              }

              const progressDegrees = `${Math.round(
                (slot.completedSteps / Math.max(1, slot.totalSteps)) * 360,
              )}deg`;
              const progressStyle = {
                left: slot.x,
                top: slot.y,
                '--slot-progress': progressDegrees,
              } as CSSProperties;

              return (
                <button
                  type="button"
                  className={`personNode childNode progressInviteNode${editingLayout ? ' draggable' : ''}${isDragging ? ' dragging' : ''}`}
                  key={slot.key}
                  style={progressStyle}
                  onPointerDown={handlePointerDown}
                  onContextMenu={(event) => event.preventDefault()}
                  data-no-pan="true"
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                  aria-label={t.inProgress}
                  title={slot.inviteeWallet ?? t.inProgress}
                >
                  <span className="nodeCircle">
                    {slot.inviteeWallet ? (
                      <NetworkIdentity address={slot.inviteeWallet} showLabel={false} />
                    ) : (
                      <span className="pendingInviteGlyph" aria-hidden="true">…</span>
                    )}
                  </span>
                  <span className="nodeMeta">
                    <small className="nodeProgressStatus">{t.inProgress} · {slot.completedSteps}/{slot.totalSteps}</small>
                    <strong>{slot.inviteeWallet ? nodeWallet(slot.inviteeWallet) : t.inProgress}</strong>
                  </span>
                </button>
              );
            })}
          </div>
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
          <aside
            className={`profileCard${!focusIsRoot ? ' hasParentReturn' : ''}`}
            data-no-pan="true"
            dir={profileDirection}
          >
            <button className="profileClose" type="button" onClick={() => setSelectedWallet(null)} aria-label={c.close}>×</button>
            <div className="profileIdentity">
              <NetworkIdentity address={selectedAddress} root size={34} />
            </div>
            {compactSelectedPath.length > 1 ? (
              <div className="profilePath" aria-label={t.directNetwork}>
                {compactSelectedPath.map((item, index) => (
                  <span key={`${item}-${index}`}>
                    {index > 0 ? (
                      <b className="profilePathChevron" aria-hidden="true">
                        {profileDirection === 'rtl' ? '‹' : '›'}
                      </b>
                    ) : null}
                    {item === '…' ? (
                      '…'
                    ) : index === 0 ? (
                      c.you
                    ) : (
                      <bdi dir="ltr">{nodeWallet(item)}</bdi>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="profileAddress" dir="ltr" title={selectedAddress}>
              <span>{selectedAddress}</span>
              {validWallet(selectedAddress) ? (
                <a
                  href={getVeChainExplorerAddressUrl(selectedAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VeChain Explorer"
                >
                  ↗
                </a>
              ) : null}
            </div>
            <div className="profileStats">
              <div><strong>{selectedNetwork.toLocaleString()}</strong><span>{t.networkSize}</span></div>
              <div><strong>{selectedDirect.toLocaleString()}</strong><span>{t.direct}</span></div>
              <div><strong>{selectedQualified.toLocaleString()}</strong><span>{t.qualified}</span></div>
              <div><strong>{selectedRound === null ? '–' : `+${selectedRound.toLocaleString()}`}</strong><span>{t.thisRound}</span></div>
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

      </div>

      {dragGhost && dragGhostChild && typeof document !== 'undefined' ? createPortal(
        <div
          ref={dragGhostRef}
          className={`nodeDragGhost status-${dragGhostChild.status.toLowerCase()}`}
          style={{ transform: `translate3d(${dragGhost.x}px,${dragGhost.y}px,0) translate(-50%,-50%)` }}
          aria-hidden="true"
        >
          <span className="nodeCircle"><NetworkIdentity address={dragGhost.wallet} showLabel={false} /></span>
          <span className="nodeMeta">
            <strong>{nodeWallet(dragGhost.wallet)}</strong>
            {dragGhostChild.status === 'IN_PROGRESS' ? (
              <small className="nodeProgressStatus">{t.inProgress}</small>
            ) : (
              <span className="nodeNetworkMetric">
                <NetworkCountGlyph />
                <span>{dragGhostChild.network.toLocaleString()}</span>
              </span>
            )}
          </span>
        </div>,
        document.body,
      ) : null}

      {workspaceNotice ? <div className="workspaceNotice" data-no-pan="true">✓ {workspaceNotice}</div> : null}

      {loadError && loadState === 'ready' ? (
        <div className="inlineError" data-no-pan="true">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError('')} aria-label={c.close}>×</button>
        </div>
      ) : null}

      <style jsx>{`
        .networkCanvasPage{width:min(100%,520px);height:100%;min-height:0;box-sizing:border-box;margin:0 auto;position:relative;overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907;box-shadow:0 16px 45px rgba(0,0,0,.22)}
        .networkHeader{flex:0 0 auto;min-height:42px;padding:7px 9px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(14,14,12,.94)}.networkHeader h1{min-width:0;margin:0;color:#f0ece3;font-size:.82rem;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .summary{display:grid;grid-template-columns:4.6ch auto 1px 4.6ch auto;align-items:baseline;gap:2px 4px;white-space:nowrap}.summary.metricsPending{visibility:hidden}.summary.metricsReady{visibility:visible}.summary strong{color:#f1ede4;font-size:.66rem}.summaryNumber{display:block;width:100%;text-align:right;font-variant-numeric:tabular-nums}.summary strong.growth{color:#e6b943}.summary span{color:#77736c;font-size:.43rem}.summary i{width:1px;height:14px;background:rgba(255,255,255,.08);align-self:center}
        .networkUtilityRow{position:relative;z-index:70;flex:0 0 auto;min-height:39px;padding:4px 6px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:4px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(11,11,9,.98)}
        .breadcrumbs{position:absolute;z-index:60;left:8px;top:8px;max-width:calc(100% - 16px);padding:3px 5px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;border:1px solid rgba(255,205,80,.08);border-radius:8px;background:rgba(12,12,10,.82);backdrop-filter:blur(5px)}.breadcrumbs.rootOnly{display:none}.crumbWrap{display:flex;align-items:center;min-width:0}.crumbSep,.crumbEllipsis{flex:0 0 auto;color:#4f4c47;font-size:.62rem;margin:0 1px}.crumb{max-width:60px;padding:2px 4px;border:0;background:transparent;color:#8c867b;font:inherit;font-size:.5rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.crumb.current{color:#e5bd55;cursor:default}.crumb:disabled{opacity:.8}
        .searchWrap{position:relative;flex:0 0 auto;display:flex;align-items:center}.searchWrap.open{flex:0 1 168px;width:168px;max-width:min(168px,48vw)}.searchToggle{width:28px;height:29px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.94);color:#a9a397;font:inherit;cursor:pointer}.searchToggle:hover{border-color:rgba(244,183,40,.31);color:#e1bd5b}.searchToggle:disabled{opacity:.45;cursor:not-allowed}.searchField{width:100%;height:32px;box-sizing:border-box;padding:0 3px 0 8px;display:flex;align-items:center;gap:5px;border:1px solid rgba(255,205,80,.14);border-radius:9px;background:#11110f;color:#8f887d}.searchField:focus-within{border-color:rgba(244,183,40,.34)}.searchField input{min-width:0;width:100%;height:30px;box-sizing:border-box;padding:0;border:0;background:transparent;color:#d8d3ca;font:inherit;font-size:16px;line-height:1;outline:none}.searchField input:disabled{opacity:.45}.searchClose{flex:0 0 25px;width:25px;height:25px;padding:0;border:0;border-radius:7px;background:transparent;color:#716d66;font:inherit;font-size:.9rem;cursor:pointer}.searchClose:hover{background:rgba(255,255,255,.035);color:#b4ada3}.searchResults{position:absolute;z-index:90;top:35px;left:0;width:min(290px,78vw);max-height:245px;overflow:auto;padding:5px;border:1px solid rgba(255,205,80,.14);border-radius:12px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42)}.searchResults button{width:100%;padding:8px;border:0;border-radius:8px;background:transparent;color:#ddd7cc;text-align:left;cursor:pointer}.searchResults button:hover{background:rgba(244,183,40,.06)}.searchResults strong{display:block;font-size:.62rem}.searchResults button span{display:block;margin-top:3px;color:#6f6b64;font-size:.52rem}.searchStatus{display:block;padding:11px 8px;color:#77736c;font-size:.56rem;line-height:1.45;text-align:center}
        .compactControls{flex:0 0 auto;margin-left:auto;display:flex;align-items:center;gap:3px}.networkStage{position:relative;flex:1 1 auto;min-height:0;height:auto;overflow:hidden;touch-action:none;overscroll-behavior:contain;background:radial-gradient(ellipse at 50% 50%,rgba(244,183,40,.036),transparent 36%),#080807;cursor:grab;user-select:none;-webkit-user-select:none}.networkStage:active{cursor:grabbing}.networkStage.layoutEditing{box-shadow:inset 0 0 0 1px rgba(244,183,40,.11)}
        .world{position:absolute;top:0;left:0;will-change:transform;backface-visibility:hidden}.world.cameraTransition{transition:transform ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.introActive .world.cameraTransition{transition-duration:${FIT_TRANSITION_MS}ms}.worldContent{position:absolute;inset:0;transform-origin:${FOCUS_X}px ${FOCUS_Y}px}.worldContent.scenePending{opacity:0;pointer-events:none}.worldContent.sceneReady{opacity:1;transition:opacity 120ms ease-out}.worldContent.nav-forward{animation:networkForward ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.worldContent.nav-back{animation:networkBack ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2}.edge{fill:none;stroke:rgba(176,145,73,.31);stroke-width:1.05;stroke-linecap:round;vector-effect:non-scaling-stroke}.edge.rewarded{stroke:rgba(232,183,62,.46)}.edge.groupEdge{stroke:rgba(226,184,78,.5);stroke-width:1.35}.groupMemberEdge{stroke:rgba(190,158,88,.3);stroke-width:.82}.slotEdgeBase,.slotEdgePulse,.slotEdgeProgress{fill:none;stroke-linecap:round;pointer-events:none;vector-effect:non-scaling-stroke}.slotEdgeBase{stroke:rgba(226,188,79,.62);stroke-width:1.05;opacity:.5}.slotEdgePulse{stroke:rgba(255,210,76,.95);stroke-width:1.55;stroke-dasharray:5 38;opacity:.8;filter:drop-shadow(0 0 2px rgba(244,183,40,.28));animation:networkSlotFlow 2.45s linear infinite}.slotEdgeProgress{stroke:rgba(244,183,40,.62);stroke-width:1.25;stroke-dasharray:3 7;opacity:.78}
        .personNode,.slotNode,.groupNode{position:absolute;z-index:6;transform:translate(-50%,-50%);font:inherit;translate:none}.personNode{min-width:0;width:52px;height:52px;padding:0;border:0;border-radius:50%;background:transparent;color:#d9d4ca;display:block;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;isolation:isolate}.focusNode{min-width:0;width:74px;height:74px;z-index:8}.childNode::before,.slotNode::before{content:'';position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:0}.childNode::before{width:58px;height:58px;background:radial-gradient(circle,rgba(8,8,7,.94) 0 87%,rgba(8,8,7,.58) 91%,rgba(8,8,7,.17) 96%,rgba(8,8,7,0) 100%)}.slotNode::before{width:58px;height:58px;background:radial-gradient(circle,rgba(8,8,7,.92) 0 86%,rgba(8,8,7,.54) 91%,rgba(8,8,7,.15) 96%,rgba(8,8,7,0) 100%)}.nodeCircle,.slotCircle{position:absolute;inset:0;z-index:1;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;background:#0d0d0b;overflow:hidden;transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.nodeCircle{border:1px solid rgba(210,174,65,.38);box-shadow:0 0 22px rgba(244,183,40,.025);transform:scale(var(--network-node-scale,1))}.focusCircle{border-color:rgba(255,207,71,.82);background:radial-gradient(circle at 50% 45%,rgb(24,21,13) 0%,rgb(13,13,11) 62%,rgb(13,13,11) 100%);box-shadow:0 0 0 1px rgba(244,183,40,.07),0 0 28px rgba(244,183,40,.08);transform:scale(var(--network-center-scale,1))}.focusNode::before{content:'';position:absolute;inset:-7px;border:1px solid rgba(244,183,40,.42);border-radius:50%;box-shadow:0 0 18px rgba(244,183,40,.055);animation:networkYouBreath 2.8s ease-in-out infinite;pointer-events:none}.introActive .focusNode::before{animation:networkYouIntro .72s ease-out 1,networkYouBreath 2.8s .72s ease-in-out infinite}.personNode:hover .nodeCircle,.personNode:focus-visible .nodeCircle,.personNode.selected .nodeCircle{border-color:rgba(244,183,40,.78);box-shadow:0 0 0 3px rgba(244,183,40,.08),0 0 26px rgba(244,183,40,.1);transform:scale(var(--network-node-selected-scale,1.07))}.personNode.selected .nodeCircle{border-color:rgba(255,211,88,.96);box-shadow:0 0 0 4px rgba(244,183,40,.11),0 0 34px rgba(244,183,40,.18)}.personNode.selected .nodeMeta{opacity:1}.focusNode:hover .focusCircle,.focusNode:focus-visible .focusCircle,.focusNode.selected .focusCircle{transform:scale(var(--network-center-selected-scale,1.07))}.childNode.status-rewarded .nodeCircle{border-color:rgba(232,183,62,.58)}.childNode.status-qualified .nodeCircle{border-color:rgba(193,166,90,.46)}.personNode.draggable,.slotNode.draggable,.groupNode.draggable{cursor:grab}.personNode.draggable:active,.slotNode.draggable:active,.groupNode.draggable:active{cursor:grabbing}.personNode.dragging,.slotNode.dragging{z-index:14}.personNode.dragGhostSource{opacity:.12}.personNode.dragging .nodeCircle,.slotNode.dragging .slotCircle{border-color:rgba(244,183,40,.92);box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)}.groupNode.dragging{z-index:14;border-color:rgba(244,183,40,.82);box-shadow:0 14px 30px rgba(0,0,0,.34),0 0 0 3px rgba(244,183,40,.1)}.personNode.grouping{animation:groupDropAway ${GROUP_DROP_MS}ms ease forwards}.personNode.restoring{animation:groupNodeRestore ${GROUP_DROP_MS}ms cubic-bezier(.2,.8,.2,1) both}
        .nodeCircle :global(.identity){width:100%;height:100%;display:grid;place-items:center}.nodeCircle :global(.avatarSlot){position:relative;display:grid;place-items:center}.childNode .nodeCircle :global(.avatarSlot),.childNode .nodeCircle :global(.neutralAvatar),.childNode .nodeCircle :global(.avatarSlot img){width:40px!important;height:40px!important}.focusNode .nodeCircle :global(.avatarSlot),.focusNode .nodeCircle :global(.neutralAvatar),.focusNode .nodeCircle :global(.avatarSlot img){width:56px!important;height:56px!important}.nodeCircle :global(.neutralAvatar){display:grid;place-items:center;border:0;border-radius:50%;background:#171611;color:#8e7b50}.nodeCircle :global(.avatarSlot img){position:absolute;inset:0;margin:auto;border-radius:50%;object-fit:cover;transition:opacity 160ms ease}.focusYouLabel{display:grid;place-items:center;width:100%;height:100%;color:#edc65c;font-size:.78rem;font-weight:950;letter-spacing:-.03em}.nodeMeta{position:absolute;left:50%;z-index:2;width:92px;display:grid;justify-items:center;gap:1px;transform:translateX(-50%);opacity:var(--network-label-opacity,1);pointer-events:none;transition:opacity 90ms linear}.childNode .nodeMeta{top:calc(100% + 6px)}.focusNode .nodeMeta{top:calc(100% + 7px);width:110px}.nodeMeta strong{max-width:90px;color:#89837a;font-size:.46rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nodeNetworkMetric{display:inline-flex;align-items:center;justify-content:center;gap:3px;color:#d8b958;font-size:.48rem;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}.nodeNetworkMetric svg{flex:0 0 auto}.nodeProgressStatus{max-width:90px;color:#b28c32!important;font-size:.43rem!important;font-weight:900;white-space:nowrap}.focusNode .nodeMeta strong{color:#8b857c;font-size:.48rem}.focusNode .nodeNetworkMetric{color:#edc65c;font-size:.52rem}.nodeBusy{position:absolute;z-index:3;right:-2px;top:-2px;width:7px;height:7px;border-radius:50%;background:#e9bc45;box-shadow:0 0 10px rgba(233,188,69,.8);animation:pulse 900ms ease-in-out infinite alternate}
        .groupNode{width:64px;height:64px;min-width:64px;max-width:64px;padding:5px 4px;box-sizing:border-box;border:1.2px solid rgba(224,183,74,.62);border-radius:14px;background:linear-gradient(180deg,rgba(25,22,14,.97),rgba(16,15,11,.97));color:#d8b450;display:grid;grid-template-columns:1fr;grid-template-rows:20px auto auto;row-gap:1px;align-content:center;justify-items:center;text-align:center;box-shadow:0 5px 18px rgba(0,0,0,.24);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.groupNode:hover,.groupNode.dropTarget{border-color:rgba(255,207,71,.84);box-shadow:0 0 0 3px rgba(244,183,40,.1),0 8px 26px rgba(0,0,0,.28)}.groupNode.dropTarget{background:linear-gradient(180deg,rgba(35,29,14,.99),rgba(20,17,10,.98));transform:translate(-50%,-50%) scale(1.035)}.groupNode.expanded{border-color:rgba(235,193,84,.72);background:linear-gradient(180deg,rgba(27,24,15,.98),rgba(17,16,12,.96))}.groupNode.expanded.dropTarget{border-color:rgba(255,207,71,.9);background:linear-gradient(180deg,rgba(38,31,14,.99),rgba(22,18,10,.98));box-shadow:0 0 0 3px rgba(244,183,40,.11),0 8px 26px rgba(0,0,0,.28)}.groupNode.created{animation:groupHubIn ${GROUP_HUB_IN_MS}ms cubic-bezier(.16,.82,.2,1) both}.groupNode .groupGlyph{grid-row:1}.groupNode strong{min-width:0;max-width:54px;font-size:.42rem;line-height:1.08;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupNode small{min-width:0;max-width:54px;color:#857655;font-size:.29rem;line-height:1.08;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupGlyph{width:20px;height:20px;display:grid;place-items:center;color:#d6ad49}.groupGlyph svg{display:block}
        .slotNode{width:52px;height:52px;padding:0;border:0;border-radius:50%;background:transparent;color:#c79f36;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;isolation:isolate}.slotCircle{border:1px dashed rgba(226,181,62,.52);color:#c79f36;font-size:.9rem;background:#0d0d0b;transform:scale(var(--network-node-scale,1));animation:slotPulse 5.6s ease-in-out infinite}.slotNode>strong{position:absolute;left:50%;top:calc(100% + 5px);z-index:2;width:92px;transform:translateX(-50%);color:#a98735;font-size:.47rem;white-space:nowrap;pointer-events:none;opacity:var(--network-label-opacity,1)}.slotNode:hover .slotCircle,.slotNode:focus-visible .slotCircle{border-style:solid;border-color:rgba(244,183,40,.9);box-shadow:0 0 28px rgba(244,183,40,.1);transform:scale(var(--network-node-selected-scale,1.07))}.progressInviteNode::after{content:'';position:absolute;z-index:0;inset:-3px;border-radius:50%;background:conic-gradient(rgba(244,183,40,.95) var(--slot-progress),rgba(244,183,40,.12) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);filter:drop-shadow(0 0 4px rgba(244,183,40,.18));pointer-events:none}.progressInviteNode .nodeCircle{border-color:rgba(244,183,40,.62);background:#11100c}.progressInviteNode .nodeMeta small{color:#b28c32}.pendingInviteGlyph{display:grid;place-items:center;width:100%;height:100%;color:#d3aa43;font-size:.9rem;font-weight:950;letter-spacing:.08em}
        .worldContent.nav-forward .childNode .nodeCircle{animation:networkNodeBloom 620ms cubic-bezier(.16,.82,.2,1) both}
        .layoutControls{display:flex;align-items:center;gap:3px;min-width:0}.layoutControls>button,.groupMenuAnchor>button{width:28px;height:29px;padding:0;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.94);color:#a9a397;font:inherit;font-size:.65rem;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(0,0,0,.2)}.layoutControls .editLayoutButton:hover,.layoutControls .editLayoutButton.active,.layoutControls .groupsButton:hover,.layoutControls .groupsButton.active{border-color:rgba(244,183,40,.31);color:#e1bd5b}.layoutControls .editLayoutButton.active{background:rgba(244,183,40,.08)}.groupMenuAnchor{position:relative;display:flex;flex:0 0 auto}.labeledControl{width:auto!important;min-width:38px;max-width:64px;padding:0 6px!important;display:inline-flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap}.controlLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.45rem;line-height:1}.editLayoutButton,.groupsButton{display:grid;place-items:center}
        .groupsPanel,.groupBuilder{position:absolute;z-index:95;left:auto;right:0;top:calc(100% + 7px);transform:none;width:min(232px,calc(100vw - 28px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.17);border-radius:15px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42);cursor:default}.groupBuilder{z-index:96;border-color:rgba(244,183,40,.2)}.groupsPanelHead{display:flex;align-items:center;justify-content:space-between}.groupsPanelHead strong{color:#e5dfd3;font-size:.62rem}.groupsPanelHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73;font-size:.95rem;cursor:pointer}.groupsPanel p{margin:10px 0;color:#77736c;font-size:.53rem}.groupsList{max-height:216px;overflow-y:auto;overscroll-behavior:contain;display:grid;gap:5px;margin-top:7px;padding-right:1px}.groupsList>button{width:100%;padding:7px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.025);color:#aaa398;text-align:left;cursor:pointer}.groupsList span,.groupsList small{display:block}.groupsList span{font-size:.54rem;font-weight:900}.groupsList small{margin-top:2px;color:#746e64;font-size:.46rem}.groupManageHead{display:grid;grid-template-columns:30px minmax(0,1fr) 27px;gap:4px}.groupBackButton{font-size:1.1rem!important}.groupManageTitle{min-width:0;display:flex;align-items:center;gap:6px}.groupManageTitle strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupManageGlyph{width:22px;height:22px;display:grid;place-items:center;color:#c8a34e;flex:0 0 auto}.groupManageCount{display:block;margin:5px 2px 7px;color:#756d5f;font-size:.47rem}.groupManageMembers{max-height:216px;overflow-y:auto;overscroll-behavior:contain;display:grid;gap:4px;padding-right:1px}.groupManageMember{min-height:36px;padding:4px 4px 4px 8px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.02);color:#827c71;font-size:.48rem}.groupManageMember>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupManageMember>button{flex:0 0 36px;width:36px;height:36px;border:0;border-radius:8px;background:rgba(194,118,90,.07);color:#b08c7e;font:inherit;font-size:.8rem;font-weight:900;cursor:pointer}.groupManageUngroup{margin-top:8px!important}.createFirstGroup{width:100%;min-height:32px;margin-top:8px;border:1px solid rgba(244,183,40,.22);border-radius:9px;background:rgba(244,183,40,.05);color:#c5a454;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer;transition:transform 120ms ease,border-color 120ms ease,background 120ms ease,box-shadow 120ms ease}.createFirstGroup.dropActive{transform:scale(1.02);border-color:rgba(255,208,79,.72);background:rgba(244,183,40,.11);box-shadow:0 0 0 3px rgba(244,183,40,.07)}.createFirstGroup:disabled{opacity:.42;cursor:default}.groupBuilderHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.groupBuilderHead strong{color:#e5dfd3;font-size:.62rem}.groupBuilderHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73;font-size:.95rem;cursor:pointer}.groupBuilder>input{width:100%;height:34px;margin-top:7px;box-sizing:border-box;padding:0 8px;border:1px solid rgba(255,205,80,.1);border-radius:8px;background:#11110f;color:#d8d3ca;font:inherit;font-size:16px;line-height:1;outline:none}.groupDropZone{min-height:42px;margin-top:8px;padding:7px 9px;box-sizing:border-box;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;border:1px dashed rgba(244,183,40,.34);border-radius:11px;background:rgba(244,183,40,.035);text-align:left;transform-origin:88% 50%;transition:transform 120ms ease,border-color 120ms ease,background 120ms ease,box-shadow 120ms ease}.groupDropZone.active{transform:scale(1.02);border-color:rgba(255,208,79,.72);background:rgba(244,183,40,.085);box-shadow:0 0 0 3px rgba(244,183,40,.07),0 8px 24px rgba(0,0,0,.22)}.dropIcon{color:#c99d35;font-size:.9rem;line-height:1}.groupDropZone strong{min-width:0;color:#b9aa83;font-size:.54rem;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.groupDropZone small{color:#6d685e;font-size:.48rem;white-space:nowrap;font-variant-numeric:tabular-nums}.groupDropZone.memberAdded small{animation:groupCountPop ${GROUP_DROP_MS}ms ease-out}.groupDraftMembers{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}.groupDraftMembers button{padding:4px 6px;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:rgba(255,255,255,.025);color:#89847a;font:inherit;font-size:.46rem;cursor:pointer;animation:groupMemberIn 160ms ease-out both}.groupDraftMembers button span{color:#a97f54}.createGroupButton{width:100%;min-height:33px;margin-top:8px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.53rem;font-weight:950;cursor:pointer}.createGroupButton:disabled{background:rgba(255,255,255,.05);color:#68635b;cursor:default}
        .viewControls{display:flex;align-items:center;gap:3px;flex:0 0 auto}.viewControls .fitButton{width:28px;min-width:28px;padding:0;font-size:.62rem}.viewControls button{width:28px;height:29px;padding:0;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.92);color:#bbb5aa;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}.viewControls .youControl{width:28px!important;min-width:28px;max-width:28px;padding:0!important}.viewControls button:hover{border-color:rgba(244,183,40,.28);color:#e4c36d}.parentReturn{position:absolute;z-index:55;left:8px;bottom:8px;min-height:34px;padding:0 11px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:rgba(18,18,15,.92);color:#a89c7b;font:inherit;font-size:.55rem;font-weight:850;cursor:pointer}.parentReturn:disabled{opacity:.4}
        .profileCard{position:absolute;z-index:75;inset-inline:8px;top:auto;bottom:8px;width:auto;box-sizing:border-box;padding:9px;border:1px solid rgba(255,205,80,.15);border-radius:14px;background:rgba(15,15,13,.975);box-shadow:0 16px 38px rgba(0,0,0,.42);cursor:default}.profileCard.hasParentReturn{bottom:52px}.profileClose{position:absolute;inset-inline-end:5px;top:4px;width:24px;height:24px;border:0;background:transparent;color:#817c73;font-size:.88rem;cursor:pointer}.profileIdentity{min-width:0;padding-inline-end:26px;display:flex;align-items:center;gap:7px}.profileIdentity :global(.identity){min-width:0;width:100%;display:flex;align-items:center;gap:7px}.profileIdentity :global(.identityLabel){min-width:0;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e7e1d6;font-size:.64rem;font-weight:800;line-height:1.2}.profileIdentity :global(.avatarSlot){position:relative;display:grid;place-items:center;flex:0 0 auto}.profileIdentity :global(.neutralAvatar){display:grid;place-items:center;border:1px solid rgba(244,183,40,.13);border-radius:50%;background:#171611;color:#8e7b50}.profileIdentity :global(.avatarSlot img){position:absolute;inset:0;border-radius:50%;object-fit:cover}.profilePath{min-width:0;margin-top:5px;display:flex;align-items:center;gap:3px;color:#716b60;font-size:.44rem;white-space:nowrap;overflow:hidden}.profilePath span{min-width:0;display:inline-flex;align-items:center;gap:3px;overflow:hidden;text-overflow:ellipsis}.profilePath bdi{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profilePathChevron{display:inline-block;color:#49453e;font-weight:700}.profileAddress{min-width:0;height:27px;margin-top:5px;padding:0 5px 0 8px;box-sizing:border-box;display:flex;align-items:center;gap:5px;border-radius:8px;background:rgba(255,255,255,.025);color:#67635d;font-size:.45rem;line-height:1;user-select:text;-webkit-user-select:text}.profileAddress>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profileAddress>a{flex:0 0 23px;width:23px;height:23px;display:grid;place-items:center;border-radius:7px;color:#9a8550;text-decoration:none;font-size:.64rem;user-select:none;-webkit-user-select:none}.profileAddress>a:hover,.profileAddress>a:focus-visible{background:rgba(244,183,40,.07);color:#d1ac4c}.profileStats{margin-top:5px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.profileStats>div{min-width:0;padding:5px 6px;border:1px solid rgba(255,255,255,.045);border-radius:8px;background:rgba(255,255,255,.018)}.profileStats strong{display:block;color:#d6d0c5;font-size:.59rem;font-variant-numeric:tabular-nums}.profileStats span{display:-webkit-box;margin-top:1px;color:#68645e;font-size:.43rem;line-height:1.18;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal}.profileAction{width:100%;min-height:32px;margin-top:5px;padding:4px 10px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.54rem;font-weight:950;line-height:1.15;white-space:normal;cursor:pointer}.profileAction:disabled{opacity:.45;cursor:default}
        .ungroupButton{width:100%;min-height:33px;margin-top:10px;border:1px solid rgba(194,118,90,.2);border-radius:9px;background:rgba(194,118,90,.06);color:#bd9889;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer}
        .nodeDragGhost{position:fixed;z-index:220;left:0;top:0;width:52px;height:52px;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;filter:drop-shadow(0 12px 18px rgba(0,0,0,.38));will-change:transform}.nodeDragGhost .nodeCircle{border-color:rgba(244,183,40,.92);box-shadow:0 0 0 4px rgba(244,183,40,.13),0 0 30px rgba(244,183,40,.18)}.nodeDragGhost .nodeMeta{top:calc(100% + 5px);opacity:.96}
        .workspaceNotice{position:absolute;z-index:96;left:50%;bottom:56px;transform:translateX(-50%);padding:7px 11px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(21,19,14,.97);color:#d5b85f;font-size:.53rem;font-weight:850;white-space:nowrap;box-shadow:0 12px 28px rgba(0,0,0,.3)}
        .inlineError{position:absolute;z-index:90;left:50%;bottom:54px;transform:translateX(-50%);max-width:calc(100% - 28px);padding:8px 9px 8px 11px;display:flex;align-items:center;gap:8px;border:1px solid rgba(194,118,90,.2);border-radius:10px;background:rgba(38,23,18,.96);color:#c7a294;font-size:.53rem;box-shadow:0 12px 30px rgba(0,0,0,.32)}.inlineError button{border:0;background:transparent;color:#9f7d71;font-size:.8rem;cursor:pointer}
        @keyframes networkForward{0%{opacity:.68;scale:.975}100%{opacity:1;scale:1}}@keyframes networkBack{0%{opacity:.74;scale:1.035}100%{opacity:1;scale:1}}@keyframes networkSlotFlow{from{stroke-dashoffset:43}to{stroke-dashoffset:-43}}@keyframes networkYouBreath{0%,100%{opacity:.46;transform:scale(.96)}50%{opacity:.92;transform:scale(1.06)}}@keyframes networkYouIntro{0%{opacity:.25;transform:scale(.78)}58%{opacity:1;transform:scale(1.14)}100%{opacity:.62;transform:scale(1)}}@keyframes networkNodeBloom{0%{transform:scale(.45);box-shadow:0 0 0 rgba(244,183,40,0)}55%{transform:scale(1.18);box-shadow:0 0 42px rgba(244,183,40,.22)}100%{transform:scale(var(--network-node-scale,1));box-shadow:0 0 22px rgba(244,183,40,.025)}}@keyframes slotPulse{0%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}50%{box-shadow:0 0 22px rgba(244,183,40,.07)}}@keyframes pulse{to{opacity:.38;transform:scale(.82)}}@keyframes groupDropAway{to{opacity:0;scale:.82}}@keyframes groupNodeRestore{0%{opacity:0;scale:.86}100%{opacity:1;scale:1}}@keyframes groupHubIn{0%{opacity:0;scale:.82}65%{opacity:1;scale:1.04}100%{opacity:1;scale:1}}@keyframes groupMemberIn{0%{opacity:0;translate:0 5px}100%{opacity:1;translate:0 0}}@keyframes groupCountPop{0%{scale:.8;opacity:.45}60%{scale:1.12;opacity:1}100%{scale:1;opacity:1}}
        @media(prefers-reduced-motion:reduce){.world.cameraTransition{transition:none}.worldContent.sceneReady{transition:none}.groupDropZone,.createFirstGroup{transition:none}.worldContent.nav-forward,.worldContent.nav-back,.slotEdgePulse,.nodeBusy,.personNode.grouping,.personNode.restoring,.groupNode.created,.groupDraftMembers button,.groupDropZone.memberAdded small,.slotCircle,.focusNode::before,.worldContent.nav-forward .childNode .nodeCircle{animation:none!important}}
      `}</style>
    </section>
  );
}

const stateStyles = `
  .networkStateCard{width:min(100%,520px);box-sizing:border-box;margin:0 auto;padding:42px 22px;border:1px solid rgba(255,205,80,.13);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 35%),rgba(255,255,255,.025);text-align:center}
  .stateGlyph{width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.18);border-radius:50%;background:rgba(244,183,40,.055);color:#c59b3d}.stateGlyph.error{color:#bd8b77;border-color:rgba(189,139,119,.18);background:rgba(189,139,119,.045)}
  .networkStateCard h1{margin:0;color:#efebe3;font-size:1.03rem;letter-spacing:-.025em}.networkStateCard p{max-width:390px;margin:9px auto 0;color:#858078;font-size:.7rem;line-height:1.55}.networkStateCard>button{min-width:160px;min-height:43px;margin-top:19px;padding:0 16px;border:0;border-radius:12px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.65rem;font-weight:950;cursor:pointer}.networkStateCard>button:disabled{opacity:.45;cursor:default}.loadingDots{height:62px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;gap:5px}.loadingDots i{width:6px;height:6px;border-radius:50%;background:#b58c31;animation:loadingDot 900ms ease-in-out infinite alternate}.loadingDots i:nth-child(2){animation-delay:150ms}.loadingDots i:nth-child(3){animation-delay:300ms}@keyframes loadingDot{to{opacity:.3;transform:translateY(3px)}}
  @media(prefers-reduced-motion:reduce){.loadingDots i{animation:none}}
`;
