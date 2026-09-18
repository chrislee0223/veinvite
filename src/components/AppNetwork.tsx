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

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_WORKSPACE_COPY } from '@/lib/i18n/networkWorkspaceCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import {
  getCachedNetworkRoot,
  rememberNetworkRoot,
} from '@/lib/networkRootClientCache';
import {
  EMPTY_NETWORK_WORKSPACE_STORE,
  addWorkspaceGroup,
  cloneNetworkFocusWorkspace,
  groupContainingWallet,
  moveWorkspaceMemberToGroup,
  parseNetworkWorkspaceStore,
  removeWorkspaceGroup,
  removeWorkspaceMemberFromGroup,
  serializeNetworkWorkspaceStore,
  withFocusWorkspace,
  withGroupPosition,
  withNodePosition,
  withWorkspaceGroupCollapsed,
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

type WorkspaceDrag = {
  pointerId: number;
  kind: 'node' | 'slot' | 'group';
  key: string;
  offset: Point;
  originalWorkspace: NetworkFocusWorkspace;
};

type InviteSlotState = {
  slot: 1 | 2;
  state: 'AVAILABLE' | 'PENDING' | 'IN_PROGRESS';
  inviteeWallet: string | null;
  completedSteps: number;
  totalSteps: number;
};

type PositionedInviteSlot = InviteSlotState & {
  key: string;
  x: number;
  y: number;
};

type HoldDragState = {
  pointerId: number;
  key: string;
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
const GROUP_DROP_MS = 160;
const HOLD_TO_MOVE_MS = 500;
const HOLD_CANCEL_DISTANCE = 8;
const NODE_ENTER_SCALE = 1.85;
const NODE_HIT_RADIUS = 58;
const GROUP_DROP_RADIUS = 92;
const WHEEL_ENTER_DISTANCE = 120;
const WORKSPACE_PREFIX = 'veinvite-network-workspace-v1:';

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = Math.sign(dx || 1) * Math.min(58, Math.abs(dx) * 0.16);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1 + dy * 0.22}, ${x2 - bend} ${y1 + dy * 0.78}, ${x2} ${y2}`;
}

function continuationEdgePath(x: number, y: number): string {
  const dx = x - FOCUS_X;
  const dy = y - FOCUS_Y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const endX = x + ux * 70;
  const endY = y + uy * 70;
  return `M ${x} ${y} C ${x + ux * 32} ${y + uy * 32}, ${x + ux * 52} ${y + uy * 52}, ${endX} ${endY}`;
}

export function AppNetwork({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const w = NETWORK_WORKSPACE_COPY[locale as SupportedLocale];
  const u = NETWORK_CANARY_UI_COPY[locale as SupportedLocale];
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
  const pinchCandidateWalletRef = useRef<string | null>(null);
  const pinchEnterIntentRef = useRef<string | null>(null);
  const wheelReturnDistanceRef = useRef(0);
  const wheelEnterDistanceRef = useRef(0);
  const wheelEnterWalletRef = useRef<string | null>(null);
  const holdDragRef = useRef<HoldDragState | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const returnViewByChildRef = useRef(new Map<string, View>());
  const viewByFocusRef = useRef(new Map<string, View>());
  const navigationTimerRef = useRef<number | null>(null);
  const initializedWalletRef = useRef<string | null>(null);
  const workspaceDragRef = useRef<WorkspaceDrag | null>(null);
  const draftWorkspaceRef = useRef<NetworkFocusWorkspace | null>(null);
  const groupingTimerRef = useRef<number | null>(null);
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
  const [inviteSlots, setInviteSlots] = useState<InviteSlotState[]>([]);
  const [rootTopologyReady, setRootTopologyReady] = useState(false);
  const [inviteSlotsReady, setInviteSlotsReady] = useState(false);
  const [stageStable, setStageStable] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({
    x: 260 - FOCUS_X,
    y: 300 - FOCUS_Y,
    scale: 1,
  });
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [navigationDirection, setNavigationDirection] = useState<NavigationDirection | null>(null);
  const [cameraTransition, setCameraTransition] = useState(false);
  const [workspaceStore, setWorkspaceStore] = useState<NetworkWorkspaceStore>(EMPTY_NETWORK_WORKSPACE_STORE);
  const [editingLayout, setEditingLayout] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [draftWorkspace, setDraftWorkspace] = useState<NetworkFocusWorkspace | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draggingWorkspaceKey, setDraggingWorkspaceKey] = useState<string | null>(null);
  const [groupingWallet, setGroupingWallet] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [introActive, setIntroActive] = useState(false);

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

  const displayedChildren = useMemo(() => positionedChildren.map((child) => {
    const memberKey = keyWallet(child.wallet);
    const group = groupByMember.get(memberKey);
    if (!group || group.collapsed !== false) return child;
    const visibleMembers = group.members.filter((member) =>
      positionedChildren.some((candidate) => keyWallet(candidate.wallet) === keyWallet(member)),
    );
    const index = Math.max(0, visibleMembers.findIndex((member) => keyWallet(member) === memberKey));
    const count = Math.max(1, visibleMembers.length);
    const span = Math.min(310, Math.max(90, (count - 1) * 76));
    const ratio = count <= 1 ? 0.5 : index / (count - 1);
    return {
      ...child,
      x: group.x - span / 2 + span * ratio,
      y: group.y + 112 + Math.min(26, Math.abs(index - (count - 1) / 2) * 6),
    };
  }), [positionedChildren, groupByMember]);

  const hiddenGroupMembers = useMemo(() => {
    const keys = new Set<string>();
    activeWorkspace.groups.forEach((group) => {
      if (group.collapsed !== false) group.members.forEach((member) => keys.add(keyWallet(member)));
    });
    groupDraft?.members.forEach((member) => keys.add(keyWallet(member)));
    return keys;
  }, [activeWorkspace.groups, groupDraft]);

  const visibleChildren = useMemo(
    () => displayedChildren.filter((child) => {
      const key = keyWallet(child.wallet);
      return !hiddenGroupMembers.has(key) && !activeInviteeKeys.has(key);
    }),
    [displayedChildren, hiddenGroupMembers, activeInviteeKeys],
  );

  const visibleWalletKeys = useMemo(
    () => new Set(visibleChildren.map((child) => keyWallet(child.wallet))),
    [visibleChildren],
  );

  const visibleGroups = useMemo(
    () => activeWorkspace.groups.filter((group) => group.members.some((member) => visibleWalletKeys.has(keyWallet(member)))),
    [activeWorkspace.groups, visibleWalletKeys],
  );

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

  const nearestVisibleGroup = useCallback((point: Point, radius = GROUP_DROP_RADIUS) => {
    let nearest: (typeof visibleGroups)[number] | null = null;
    let nearestDistance = radius;
    for (const group of visibleGroups) {
      const candidateDistance = Math.hypot(group.x - point.x, group.y - point.y);
      if (candidateDistance <= nearestDistance) {
        nearest = group;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }, [visibleGroups]);

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
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdDragRef.current = null;
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

  const persistNodePosition = useCallback((walletKey: string, point: Point) => {
    if (!wallet || !currentFocusKey) return;
    setWorkspaceStore((current) => {
      const focusWorkspace = workspaceForFocus(current, currentFocusKey);
      const nextWorkspace = withNodePosition(focusWorkspace, walletKey, point);
      const nextStore = withFocusWorkspace(current, currentFocusKey, nextWorkspace);
      try {
        window.localStorage.setItem(workspaceStorageKey(wallet), serializeNetworkWorkspaceStore(nextStore));
      } catch {
        // In-memory state remains authoritative when storage is unavailable.
      }
      return nextStore;
    });
  }, [wallet, currentFocusKey]);

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

    try {
      const payload = await fetchNetwork(requestWallet, {
        signal: controller.signal,
        fast: true,
      });
      if (!canCommit()) return;

      cacheRef.current.clear();
      cacheRef.current.set(keyWallet(payload.focusWallet), payload);
      rememberNetworkRoot(requestWallet, payload);
      setRootData(payload);
      setFocusWallet(payload.rootWallet);
      setCacheVersion((value) => value + 1);
      setLoadState('ready');
      setRootTopologyReady(true);

      void fetchNetwork(requestWallet).then((enriched) => {
        if (!canCommit()) return;
        cacheRef.current.set(keyWallet(enriched.focusWallet), enriched);
        rememberNetworkRoot(requestWallet, enriched);
        setRootData(enriched);
        setCacheVersion((value) => value + 1);
      }).catch(() => {
        // Fast topology remains usable if round enrichment is unavailable.
      });
    } catch (error) {
      if (!canCommit()) return;
      // Never replace the Network surface with a blocking loading/error card.
      // Keep the warmed or provisional canvas visible and retry on the next
      // entry while preserving the error for diagnostics.
      setLoadError(error instanceof Error ? error.message : t.loadError);
      setLoadState('ready');
      setRootTopologyReady(true);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [wallet, cancelRequest, t.loadError]);

  useEffect(() => {
    cacheRef.current.clear();
    returnViewByChildRef.current.clear();
    viewByFocusRef.current.clear();
    initializedWalletRef.current = null;
    introCancelledRef.current = false;
    setRootTopologyReady(false);
    setInviteSlotsReady(false);
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
    setSelectedGroupId(null);
    setEditingLayout(false);
    setGroupsOpen(false);
    draftWorkspaceRef.current = null;
    setDraftWorkspace(null);
    setGroupDraft(null);
    workspaceDragRef.current = null;
    setDraggingWorkspaceKey(null);
    setGroupingWallet(null);
    setWorkspaceNotice('');
    setInviteSlots([]);
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

    let active = true;
    setInviteSlotsReady(false);

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
      setSelectedGroupId(null);
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
    stopIntroForInteraction();
    const workspace = cloneNetworkFocusWorkspace(workspaceForFocus(workspaceStore, currentFocusKey));
    setEditingWorkspace(workspace);
    setEditingLayout(true);
    setGroupsOpen(false);
    setSelectedWallet(null);
    setSelectedGroupId(null);
    setGroupDraft(null);
    setWorkspaceNotice('');
  }, [currentFocusKey, workspaceStore, setEditingWorkspace, stopIntroForInteraction]);

  const finishLayoutEdit = useCallback(() => {
    workspaceDragRef.current = null;
    if (groupingTimerRef.current !== null) {
      window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = null;
    }
    setDraggingWorkspaceKey(null);
    setGroupingWallet(null);
    setGroupDraft(null);
    setGroupsOpen(false);
    draftWorkspaceRef.current = null;
    setDraftWorkspace(null);
    setSelectedGroupId(null);
    setEditingLayout(false);
    setWorkspaceNotice(w.layoutSaved);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setWorkspaceNotice('');
    }, 1400);
  }, [w.layoutSaved]);

  const beginGroupCreation = useCallback(() => {
    if (!currentFocusKey) return;
    stopIntroForInteraction();
    if (!editingLayout) {
      const workspace = cloneNetworkFocusWorkspace(workspaceForFocus(workspaceStore, currentFocusKey));
      setEditingWorkspace(workspace);
      setEditingLayout(true);
    } else if (!draftWorkspaceRef.current) {
      setEditingWorkspace(cloneNetworkFocusWorkspace(committedWorkspace));
    }
    setGroupsOpen(false);
    setSelectedWallet(null);
    setSelectedGroupId(null);
    setGroupDraft({ id: newGroupId(), label: '', members: [] });
    setWorkspaceNotice('');
  }, [
    currentFocusKey,
    editingLayout,
    workspaceStore,
    committedWorkspace,
    setEditingWorkspace,
    stopIntroForInteraction,
  ]);

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

  const createDraftGroup = useCallback(() => {
    const workspace = draftWorkspaceRef.current;
    if (!groupDraft || !workspace || groupDraft.members.length < 2) return;
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
    commitEditingWorkspace(addWorkspaceGroup(workspace, {
      id: groupDraft.id,
      label,
      members,
      x,
      y,
    }));
    setGroupDraft(null);
  }, [groupDraft, positionedChildren, w.group, commitEditingWorkspace]);

  const beginWorkspaceDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: WorkspaceDrag['kind'],
    key: string,
    point: Point,
  ) => {
    const workspace = draftWorkspaceRef.current;
    if (!editingLayout || !workspace) return;
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
      offset: { x: worldPoint.x - point.x, y: worldPoint.y - point.y },
      originalWorkspace: cloneNetworkFocusWorkspace(workspace),
    };
    suppressClickRef.current = true;
    setDraggingWorkspaceKey(`${kind}:${key}`);
    setSelectedWallet(null);
    setSelectedGroupId(null);
  }, [editingLayout, view]);

  const cancelHoldDrag = useCallback((restore = false) => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const hold = holdDragRef.current;
    if (restore && hold?.moved) persistFocusWorkspace(hold.originalWorkspace);
    holdDragRef.current = null;
    if (hold) setDraggingWorkspaceKey(null);
  }, [persistFocusWorkspace]);

  const beginHoldDrag = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    point: Point,
    kind: 'node' | 'slot' = 'node',
  ) => {
    if (
      editingLayout ||
      pendingFocus ||
      !currentFocusKey ||
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
      key,
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
      triggerHoldHaptic();
      setDraggingWorkspaceKey(`${kind}:${key}`);
    }, HOLD_TO_MOVE_MS);
  }, [editingLayout, pendingFocus, currentFocusKey, committedWorkspace, view]);

  const finishWorkspaceDrop = useCallback((event: ReactPointerEvent<HTMLDivElement>, drag: WorkspaceDrag) => {
    if (event.type !== 'pointerup') {
      setEditingWorkspace(cloneNetworkFocusWorkspace(drag.originalWorkspace));
      return;
    }

    if (drag.kind !== 'node') {
      commitCurrentDraftWorkspace();
      return;
    }

    const draftRect = groupDropRef.current?.getBoundingClientRect();
    const insideDraft = Boolean(
      groupDraft &&
      draftRect &&
      event.clientX >= draftRect.left &&
      event.clientX <= draftRect.right &&
      event.clientY >= draftRect.top &&
      event.clientY <= draftRect.bottom
    );
    if (insideDraft && groupDraft && !groupDraft.members.includes(drag.key)) {
      // Keep the node at the drop point for the short fade-out. Once hidden
      // in the provisional group, restore its standalone coordinates behind
      // the scenes so cancelling the builder returns it exactly.
      setGroupingWallet(drag.key);
      if (groupingTimerRef.current !== null) window.clearTimeout(groupingTimerRef.current);
      groupingTimerRef.current = window.setTimeout(() => {
        groupingTimerRef.current = null;
        setEditingWorkspace(cloneNetworkFocusWorkspace(drag.originalWorkspace));
        setGroupDraft((current) => {
          if (!current || current.members.includes(drag.key)) return current;
          return { ...current, members: [...current.members, drag.key] };
        });
        setGroupingWallet(null);
      }, GROUP_DROP_MS);
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      commitCurrentDraftWorkspace();
      return;
    }
    const rect = stage.getBoundingClientRect();
    const worldPoint = {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    };
    const targetGroup = nearestVisibleGroup(worldPoint);
    if (targetGroup) {
      // Membership changes keep the node's saved standalone position intact,
      // so ungrouping returns it to the place the user chose before grouping.
      commitEditingWorkspace(
        moveWorkspaceMemberToGroup(drag.originalWorkspace, drag.key, targetGroup.id),
      );
      return;
    }

    commitCurrentDraftWorkspace();
  }, [
    groupDraft,
    view,
    nearestVisibleGroup,
    setEditingWorkspace,
    commitEditingWorkspace,
    commitCurrentDraftWorkspace,
  ]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    stopIntroForInteraction();
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const target = event.target instanceof Element ? event.target : null;
    const interactive = Boolean(target?.closest('button,input,a,[data-no-pan="true"]'));
    // Never move pointer ownership away from an interactive control. Capturing
    // button presses on the stage made pointerup land on the canvas instead of
    // the button in VeWorld, so taps looked completely dead. Background drags
    // still capture on the stage; draggable nodes capture themselves.
    if (!interactive) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    }

    if (pointersRef.current.size === 1) {
      panPointerRef.current = { id: event.pointerId, point, allowed: !interactive };
      pinchRef.current = null;
      pinchReturnIntentRef.current = false;
      return;
    }

    if (pointersRef.current.size === 2) {
      cancelHoldDrag(true);
      const activeWorkspaceDrag = workspaceDragRef.current;
      if (activeWorkspaceDrag) {
        setEditingWorkspace(cloneNetworkFocusWorkspace(activeWorkspaceDrag.originalWorkspace));
      }
      workspaceDragRef.current = null;
      setDraggingWorkspaceKey(null);
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
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextPoint = {
        x: clamp((event.clientX - rect.left - view.x) / view.scale - holdDrag.offset.x, 90, WORLD_W - 90),
        y: clamp((event.clientY - rect.top - view.y) / view.scale - holdDrag.offset.y, 90, WORLD_H - 90),
      };
      holdDrag.moved = true;
      persistNodePosition(holdDrag.key, nextPoint);
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
        const next = workspaceDrag.kind === 'group'
          ? withGroupPosition(current, workspaceDrag.key, nextPoint)
          : withNodePosition(current, workspaceDrag.key, nextPoint);
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
    const holdDrag = holdDragRef.current;
    if (holdDrag && holdDrag.pointerId === event.pointerId) {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (event.type === 'pointercancel' && holdDrag.moved) persistFocusWorkspace(holdDrag.originalWorkspace);
      if (holdDrag.moved) suppressClickRef.current = true;
      holdDragRef.current = null;
      setDraggingWorkspaceKey(null);
    }

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
      if (enterWallet && !editingLayout) {
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
        <div className="summary" aria-label={t.networkSize}>
          <strong>{visibleRootData.summary.network.toLocaleString()}</strong>
          <span>{t.networkSize}</span>
          <i />
          <strong className="growth">{visibleRootData.summary.thisRound === null ? '–' : `+${visibleRootData.summary.thisRound}`}</strong>
          <span>{t.thisRound}</span>
        </div>
      </header>

      <div className="networkUtilityRow" data-no-pan="true">
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

        <div className="compactControls">
          <div className="layoutControls">
            <button
              type="button"
              className={`editLayoutButton labeledControl${editingLayout ? ' active' : ''}`}
              onClick={editingLayout ? finishLayoutEdit : beginLayoutEdit}
              aria-label={editingLayout ? w.done : w.editLayout}
              title={editingLayout ? w.done : w.editLayout}
            >
              <span aria-hidden="true">{editingLayout ? '✓' : '✦'}</span>
              <span className="controlLabel">{editingLayout ? w.done : w.editLayout}</span>
            </button>
            <div className="groupMenuAnchor">
              <button
                type="button"
                className={`groupsButton labeledControl${groupsOpen || groupDraft ? ' active' : ''}`}
                onClick={() => {
                  stopIntroForInteraction();
                  if (groupDraft) {
                    setGroupDraft(null);
                    setGroupsOpen(false);
                    return;
                  }
                  setGroupsOpen((open) => !open);
                }}
                aria-label={w.groups}
                title={w.groups}
                aria-expanded={Boolean(groupsOpen || groupDraft)}
              >
                <span aria-hidden="true">◉</span>
                <span className="controlLabel">{w.groups}</span>
              </button>
              {groupDraft ? (
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
              ) : groupsOpen ? (
                <aside className="groupsPanel" data-no-pan="true">
                  <div className="groupsPanelHead">
                    <strong>{w.myGroups}</strong>
                    <button type="button" onClick={() => setGroupsOpen(false)} aria-label={c.close}>×</button>
                  </div>
                  {activeWorkspace.groups.length ? (
                    <div className="groupsList">
                      {activeWorkspace.groups.map((group) => (
                        <button type="button" key={group.id} onClick={() => { setSelectedGroupId(group.id); toggleGroupCollapsed(group.id); }}>
                          <span>{group.label || w.group}</span>
                          <small>{group.members.length} {w.members} · {group.collapsed === false ? w.collapseGroup : w.expandGroup}</small>
                        </button>
                      ))}
                    </div>
                  ) : <p>{w.noGroups}</p>}
                  <button type="button" className="createFirstGroup" onClick={beginGroupCreation}>+ {w.newGroup}</button>
                </aside>
              ) : null}
            </div>
          </div>

          <div className="viewControls">
            <button type="button" className="youControl labeledControl" onClick={returnToYou} aria-label={c.you} title={c.you}>
              <span aria-hidden="true">◎</span>
              <span className="controlLabel">{c.you}</span>
            </button>
            <button type="button" className="fitButton" onClick={() => { stopIntroForInteraction(); fitNetwork(); }} aria-label={w.fit} title={w.fit}>⛶</button>
            <button type="button" onClick={() => zoomByButton(1)} aria-label={c.zoomIn} title={c.zoomIn}>+</button>
            <button type="button" onClick={() => zoomByButton(-1)} aria-label={c.zoomOut} title={c.zoomOut}>−</button>
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
          <div className={`worldContent${navigationDirection ? ` nav-${navigationDirection}` : ''}`}>
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
                  const child = visibleChildren.find((item) => keyWallet(item.wallet) === keyWallet(member));
                  return child ? (
                    <path
                      key={`group-member-edge:${group.id}:${keyWallet(member)}`}
                      d={edgePath(group.x, group.y, child.x, child.y)}
                      className="edge groupMemberEdge"
                    />
                  ) : null;
                }),
              )}
              {visibleChildren.filter((child) => child.network > 0).map((child) => (
                <path
                  key={`continuation:${keyWallet(child.wallet)}`}
                  d={continuationEdgePath(child.x, child.y)}
                  className="continuationEdge"
                />
              ))}
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
                setSelectedGroupId(null);
                setSelectedWallet(focusKey);
              }}
              data-no-pan="true"
            >
              <span className="nodeCircle focusCircle"><NetworkIdentity address={currentData.focusWallet} root showLabel={false} /></span>
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
                  onPointerDown={(event) => {
                    if (editingLayout) beginWorkspaceDrag(event, 'node', childKey, { x: child.x, y: child.y });
                    else beginHoldDrag(event, childKey, { x: child.x, y: child.y });
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    if (suppressClickRef.current || editingLayout) return;
                    setSelectedGroupId(null);
                    setSelectedWallet(childKey);
                  }}
                  data-no-pan="true"
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <span className="nodeCircle"><NetworkIdentity address={child.wallet} showLabel={false} /></span>
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
                  className={`groupNode${editingLayout ? ' draggable' : ''}${draggingWorkspaceKey === dragKey ? ' dragging' : ''}${selectedGroupId === group.id ? ' selected' : ''}${group.collapsed === false ? ' expanded' : ''}`}
                  key={group.id}
                  style={{ left: group.x, top: group.y }}
                  onPointerDown={editingLayout ? (event) => beginWorkspaceDrag(event, 'group', group.id, { x: group.x, y: group.y }) : undefined}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    setSelectedWallet(null);
                    setSelectedGroupId(group.id);
                    toggleGroupCollapsed(group.id);
                  }}
                  data-no-pan="true"
                  data-group-drop-id={group.id}
                  data-workspace-draggable={editingLayout ? 'true' : undefined}
                >
                  <span className="groupGlyph" aria-hidden="true"><i /><i /><i /></span>
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
                    <strong>{slot.inviteeWallet ? shortWallet(slot.inviteeWallet) : t.inProgress}</strong>
                    <small>{t.inProgress} · {slot.completedSteps}/{slot.totalSteps}</small>
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
              {selectedGroup.members.map((member) => (
                <span key={member} title={member}>
                  {shortWallet(member)}
                  {editingLayout ? <button type="button" onClick={() => mutateEditingWorkspace((current) => removeWorkspaceMemberFromGroup(current, member))}>×</button> : null}
                </span>
              ))}
            </div>
            <button type="button" className="groupToggleButton" onClick={() => toggleGroupCollapsed(selectedGroup.id)}>
              {selectedGroup.collapsed === false ? w.collapseGroup : w.expandGroup}
            </button>
            {editingLayout ? (
              <button
                type="button"
                className="ungroupButton"
                onClick={() => {
                  mutateEditingWorkspace((current) => removeWorkspaceGroup(current, selectedGroup.id));
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
        .networkCanvasPage{width:min(100%,520px);height:100%;min-height:0;box-sizing:border-box;margin:0 auto;position:relative;overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907;box-shadow:0 16px 45px rgba(0,0,0,.22)}
        .networkHeader{flex:0 0 auto;min-height:42px;padding:7px 9px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(14,14,12,.94)}.networkHeader h1{min-width:0;margin:0;color:#f0ece3;font-size:.82rem;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .summary{display:grid;grid-template-columns:auto auto 1px auto auto;align-items:baseline;gap:2px 4px;white-space:nowrap}.summary strong{color:#f1ede4;font-size:.66rem}.summary strong.growth{color:#e6b943}.summary span{color:#77736c;font-size:.43rem}.summary i{width:1px;height:14px;background:rgba(255,255,255,.08);align-self:center}
        .networkUtilityRow{position:relative;z-index:70;flex:0 0 auto;min-height:39px;padding:4px 6px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:5px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(11,11,9,.98)}
        .breadcrumbs{position:absolute;z-index:60;left:8px;top:8px;max-width:calc(100% - 16px);padding:3px 5px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;border:1px solid rgba(255,205,80,.08);border-radius:8px;background:rgba(12,12,10,.82);backdrop-filter:blur(5px)}.breadcrumbs.rootOnly{display:none}.crumbWrap{display:flex;align-items:center;min-width:0}.crumbSep,.crumbEllipsis{flex:0 0 auto;color:#4f4c47;font-size:.62rem;margin:0 1px}.crumb{max-width:74px;padding:2px 4px;border:0;background:transparent;color:#8c867b;font:inherit;font-size:.5rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.crumb.current{color:#e5bd55;cursor:default}.crumb:disabled{opacity:.8}
        .searchWrap{position:relative;min-width:64px;max-width:108px;flex:0 1 108px}.searchWrap input{width:100%;height:29px;box-sizing:border-box;padding:0 7px;border:1px solid rgba(255,205,80,.1);border-radius:9px;background:#11110f;color:#d8d3ca;font:inherit;font-size:.52rem;outline:none}.searchWrap input:focus{border-color:rgba(244,183,40,.34)}.searchWrap input:disabled{opacity:.45}.searchResults{position:absolute;z-index:90;top:35px;left:0;width:min(290px,78vw);max-height:245px;overflow:auto;padding:5px;border:1px solid rgba(255,205,80,.14);border-radius:12px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42)}.searchResults button{width:100%;padding:8px;border:0;border-radius:8px;background:transparent;color:#ddd7cc;text-align:left;cursor:pointer}.searchResults button:hover{background:rgba(244,183,40,.06)}.searchResults strong{display:block;font-size:.62rem}.searchResults button span{display:block;margin-top:3px;color:#6f6b64;font-size:.52rem}.searchStatus{display:block;padding:11px 8px;color:#77736c;font-size:.56rem;line-height:1.45;text-align:center}
        .compactControls{flex:0 0 auto;margin-left:auto;display:flex;align-items:center;gap:3px}.networkStage{position:relative;flex:1 1 auto;min-height:0;height:auto;overflow:hidden;touch-action:none;overscroll-behavior:contain;background:radial-gradient(ellipse at 50% 50%,rgba(244,183,40,.036),transparent 36%),#080807;cursor:grab;user-select:none;-webkit-user-select:none}.networkStage:active{cursor:grabbing}.networkStage.layoutEditing{box-shadow:inset 0 0 0 1px rgba(244,183,40,.11)}
        .world{position:absolute;top:0;left:0;will-change:transform;backface-visibility:hidden}.world.cameraTransition{transition:transform ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.introActive .world.cameraTransition{transition-duration:${FIT_TRANSITION_MS}ms}.worldContent{position:absolute;inset:0;transform-origin:${FOCUS_X}px ${FOCUS_Y}px}.worldContent.nav-forward{animation:networkForward ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}.worldContent.nav-back{animation:networkBack ${NAVIGATION_MS}ms cubic-bezier(.18,.82,.2,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2}.edge{fill:none;stroke:rgba(176,145,73,.31);stroke-width:1.05;stroke-linecap:round;vector-effect:non-scaling-stroke}.edge.rewarded{stroke:rgba(232,183,62,.46)}.edge.groupEdge{stroke:rgba(224,178,65,.42);stroke-width:1.15;stroke-dasharray:4 8}.groupMemberEdge{stroke:rgba(194,157,75,.32);stroke-width:.95;stroke-dasharray:4 8}.continuationEdge{fill:none;stroke:rgba(176,145,73,.24);stroke-width:1;stroke-linecap:round;vector-effect:non-scaling-stroke}.slotEdgeBase,.slotEdgePulse,.slotEdgeProgress{fill:none;stroke-linecap:round;pointer-events:none;vector-effect:non-scaling-stroke}.slotEdgeBase{stroke:rgba(226,188,79,.62);stroke-width:1.05;opacity:.5}.slotEdgePulse{stroke:rgba(255,210,76,.95);stroke-width:1.55;stroke-dasharray:5 38;opacity:.8;filter:drop-shadow(0 0 2px rgba(244,183,40,.28));animation:networkSlotFlow 2.45s linear infinite}.slotEdgeProgress{stroke:rgba(244,183,40,.62);stroke-width:1.25;stroke-dasharray:3 7;opacity:.78}
        .personNode,.slotNode,.groupNode{position:absolute;z-index:6;transform:translate(-50%,-50%);font:inherit;translate:none}.personNode{width:52px;height:52px;padding:0;border:0;border-radius:50%;background:transparent;color:#d9d4ca;display:block;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;isolation:isolate}.focusNode{width:74px;height:74px;z-index:8}.childNode::before,.slotNode::before{content:'';position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:0}.childNode::before{width:58px;height:58px;background:radial-gradient(circle,rgba(8,8,7,.94) 0 87%,rgba(8,8,7,.58) 91%,rgba(8,8,7,.17) 96%,rgba(8,8,7,0) 100%)}.slotNode::before{width:52px;height:52px;background:radial-gradient(circle,rgba(8,8,7,.92) 0 86%,rgba(8,8,7,.54) 91%,rgba(8,8,7,.15) 96%,rgba(8,8,7,0) 100%)}.nodeCircle,.slotCircle{position:absolute;inset:0;z-index:1;display:grid;place-items:center;border-radius:50%;box-sizing:border-box;background:#0d0d0b;overflow:hidden;transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.nodeCircle{border:1px solid rgba(210,174,65,.38);box-shadow:0 0 22px rgba(244,183,40,.025);transform:scale(var(--network-node-scale,1))}.focusCircle{border-color:rgba(255,207,71,.82);background:radial-gradient(circle at 50% 45%,rgb(24,21,13) 0%,rgb(13,13,11) 62%,rgb(13,13,11) 100%);box-shadow:0 0 0 1px rgba(244,183,40,.07),0 0 28px rgba(244,183,40,.08);transform:scale(var(--network-center-scale,1))}.focusNode::before{content:'';position:absolute;inset:-7px;border:1px solid rgba(244,183,40,.42);border-radius:50%;box-shadow:0 0 18px rgba(244,183,40,.055);animation:networkYouBreath 2.8s ease-in-out infinite;pointer-events:none}.introActive .focusNode::before{animation:networkYouIntro .72s ease-out 1,networkYouBreath 2.8s .72s ease-in-out infinite}.personNode:hover .nodeCircle,.personNode:focus-visible .nodeCircle,.personNode.selected .nodeCircle{border-color:rgba(244,183,40,.78);box-shadow:0 0 0 3px rgba(244,183,40,.08),0 0 26px rgba(244,183,40,.1);transform:scale(var(--network-node-selected-scale,1.07))}.focusNode:hover .focusCircle,.focusNode:focus-visible .focusCircle,.focusNode.selected .focusCircle{transform:scale(var(--network-center-selected-scale,1.07))}.childNode.status-rewarded .nodeCircle{border-color:rgba(232,183,62,.58)}.childNode.status-qualified .nodeCircle{border-color:rgba(193,166,90,.46)}.personNode.draggable,.slotNode.draggable,.groupNode.draggable{cursor:grab}.personNode.draggable:active,.slotNode.draggable:active,.groupNode.draggable:active{cursor:grabbing}.personNode.dragging,.slotNode.dragging{z-index:14}.personNode.dragging .nodeCircle,.slotNode.dragging .slotCircle{border-color:rgba(244,183,40,.92);box-shadow:0 0 0 4px rgba(244,183,40,.12),0 0 30px rgba(244,183,40,.18)}.groupNode.dragging{z-index:14;border-color:rgba(244,183,40,.82);box-shadow:0 14px 30px rgba(0,0,0,.34),0 0 0 3px rgba(244,183,40,.1)}.personNode.grouping{animation:groupDropAway ${GROUP_DROP_MS}ms ease forwards}
        .nodeCircle :global(.identity){width:100%;height:100%;display:grid;place-items:center}.nodeCircle :global(.avatarSlot){position:relative;display:grid;place-items:center}.childNode .nodeCircle :global(.avatarSlot),.childNode .nodeCircle :global(.neutralAvatar),.childNode .nodeCircle :global(.avatarSlot img){width:40px!important;height:40px!important}.focusNode .nodeCircle :global(.avatarSlot),.focusNode .nodeCircle :global(.neutralAvatar),.focusNode .nodeCircle :global(.avatarSlot img){width:56px!important;height:56px!important}.nodeCircle :global(.neutralAvatar){display:grid;place-items:center;border:0;border-radius:50%;background:#171611;color:#8e7b50}.nodeCircle :global(.avatarSlot img){position:absolute;inset:0;margin:auto;border-radius:50%;object-fit:cover;transition:opacity 160ms ease}.nodeMeta{position:absolute;left:50%;z-index:2;width:120px;display:grid;justify-items:center;gap:2px;transform:translateX(-50%);opacity:var(--network-label-opacity,1);pointer-events:none;transition:opacity 90ms linear}.childNode .nodeMeta{bottom:calc(100% + 6px)}.focusNode .nodeMeta{top:calc(100% + 7px)}.nodeMeta strong{max-width:112px;color:#e5dfd5;font-size:.52rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nodeMeta small{max-width:116px;color:#6f6a62;font-size:.41rem;white-space:nowrap}.focusNode .nodeMeta strong{color:#edc65c;font-size:.61rem}.focusNode .nodeMeta small{font-size:.44rem}.nodeBusy{position:absolute;z-index:3;right:-2px;top:-2px;width:7px;height:7px;border-radius:50%;background:#e9bc45;box-shadow:0 0 10px rgba(233,188,69,.8);animation:pulse 900ms ease-in-out infinite alternate}
        .groupNode{min-width:108px;max-width:160px;padding:8px 10px;border:1px solid rgba(244,183,40,.54);border-radius:14px;background:rgba(18,16,10,.96);color:#d8b450;display:grid;grid-template-columns:30px 1fr;column-gap:6px;row-gap:1px;align-items:center;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.26),0 0 24px rgba(244,183,40,.045);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.groupNode:hover,.groupNode.selected{border-color:rgba(255,207,71,.82);box-shadow:0 0 0 3px rgba(244,183,40,.09),0 8px 28px rgba(0,0,0,.3)}.groupNode.expanded{border-style:dashed;background:rgba(13,12,9,.9);opacity:.92}.groupNode .groupGlyph{grid-row:1/3}.groupNode strong{min-width:0;max-width:110px;font-size:.48rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.groupNode small{color:#756b55;font-size:.34rem;white-space:nowrap}.groupGlyph{position:relative;width:30px;height:24px;display:block}.groupGlyph i{position:absolute;width:13px;height:13px;border:1px solid rgba(244,183,40,.34);border-radius:50%;background:#1a1812}.groupGlyph i:nth-child(1){left:9px;top:0}.groupGlyph i:nth-child(2){left:2px;top:10px}.groupGlyph i:nth-child(3){right:2px;top:10px}
        .slotNode{width:46px;height:46px;padding:0;border:0;border-radius:50%;background:transparent;color:#c79f36;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;isolation:isolate}.slotCircle{border:1px dashed rgba(226,181,62,.52);color:#c79f36;font-size:.9rem;background:#0d0d0b;transform:scale(var(--network-node-scale,1));animation:slotPulse 5.6s ease-in-out infinite}.slotNode>strong{position:absolute;left:50%;top:calc(100% + 5px);z-index:2;width:92px;transform:translateX(-50%);color:#a98735;font-size:.47rem;white-space:nowrap;pointer-events:none;opacity:var(--network-label-opacity,1)}.slotNode:hover .slotCircle,.slotNode:focus-visible .slotCircle{border-style:solid;border-color:rgba(244,183,40,.9);box-shadow:0 0 28px rgba(244,183,40,.1);transform:scale(var(--network-node-selected-scale,1.07))}.progressInviteNode::after{content:'';position:absolute;z-index:0;inset:-5px;border-radius:50%;background:conic-gradient(rgba(244,183,40,.95) var(--slot-progress),rgba(244,183,40,.12) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);filter:drop-shadow(0 0 4px rgba(244,183,40,.18));pointer-events:none}.progressInviteNode .nodeCircle{border-color:rgba(244,183,40,.62);background:#11100c}.progressInviteNode .nodeMeta small{color:#b28c32}.pendingInviteGlyph{display:grid;place-items:center;width:100%;height:100%;color:#d3aa43;font-size:.9rem;font-weight:950;letter-spacing:.08em}
        .worldContent.nav-forward .childNode .nodeCircle{animation:networkNodeBloom 620ms cubic-bezier(.16,.82,.2,1) both}
        .layoutControls{display:flex;align-items:center;gap:3px;min-width:0}.layoutControls>button,.groupMenuAnchor>button{width:28px;height:29px;padding:0;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.94);color:#a9a397;font:inherit;font-size:.65rem;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(0,0,0,.2)}.layoutControls .editLayoutButton:hover,.layoutControls .editLayoutButton.active,.layoutControls .groupsButton:hover,.layoutControls .groupsButton.active{border-color:rgba(244,183,40,.31);color:#e1bd5b}.layoutControls .editLayoutButton.active{background:rgba(244,183,40,.08)}.groupMenuAnchor{position:relative;display:flex;flex:0 0 auto}.labeledControl{width:auto!important;min-width:38px;max-width:64px;padding:0 6px!important;display:inline-flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap}.controlLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.45rem;line-height:1}.editLayoutButton{max-width:62px}.groupsButton{max-width:56px}
        .groupsPanel,.groupBuilder{position:absolute;z-index:95;left:50%;top:calc(100% + 7px);transform:translateX(-50%);width:min(235px,calc(100vw - 32px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.17);border-radius:15px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42);cursor:default}.groupBuilder{z-index:96;border-color:rgba(244,183,40,.2)}.groupsPanelHead{display:flex;align-items:center;justify-content:space-between}.groupsPanelHead strong{color:#e5dfd3;font-size:.62rem}.groupsPanelHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73;font-size:.95rem;cursor:pointer}.groupsPanel p{margin:10px 0;color:#77736c;font-size:.53rem}.groupsList{display:grid;gap:5px;margin-top:7px}.groupsList>button{width:100%;padding:7px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.025);color:#aaa398;text-align:left;cursor:pointer}.groupsList span,.groupsList small{display:block}.groupsList span{font-size:.54rem;font-weight:900}.groupsList small{margin-top:2px;color:#746e64;font-size:.46rem}.createFirstGroup{width:100%;min-height:32px;margin-top:8px;border:1px solid rgba(244,183,40,.22);border-radius:9px;background:rgba(244,183,40,.05);color:#c5a454;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer}.groupBuilderHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.groupBuilderHead strong{color:#e5dfd3;font-size:.62rem}.groupBuilderHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73;font-size:.95rem;cursor:pointer}.groupBuilder>input{width:100%;height:31px;margin-top:7px;box-sizing:border-box;padding:0 8px;border:1px solid rgba(255,205,80,.1);border-radius:8px;background:#11110f;color:#d8d3ca;font:inherit;font-size:.55rem;outline:none}.groupDropZone{min-height:74px;margin-top:8px;padding:9px;box-sizing:border-box;display:grid;place-items:center;align-content:center;gap:2px;border:1px dashed rgba(244,183,40,.34);border-radius:11px;background:rgba(244,183,40,.035);text-align:center}.dropIcon{color:#c99d35;font-size:.9rem}.groupDropZone strong{color:#b9aa83;font-size:.54rem}.groupDropZone small{color:#6d685e;font-size:.48rem}.groupDraftMembers{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}.groupDraftMembers button{padding:4px 6px;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:rgba(255,255,255,.025);color:#89847a;font:inherit;font-size:.46rem;cursor:pointer}.groupDraftMembers button span{color:#a97f54}.groupMemberList span{display:inline-flex;align-items:center;gap:4px}.groupMemberList span button{width:18px;height:18px;border:0;border-radius:50%;background:rgba(255,255,255,.04);color:#8d8173;cursor:pointer}.groupToggleButton{width:100%;min-height:30px;margin-top:8px;border:1px solid rgba(244,183,40,.15);border-radius:9px;background:rgba(244,183,40,.035);color:#b69a57;font:inherit;font-size:.5rem;font-weight:900;cursor:pointer}.createGroupButton{width:100%;min-height:33px;margin-top:8px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.53rem;font-weight:950;cursor:pointer}.createGroupButton:disabled{background:rgba(255,255,255,.05);color:#68635b;cursor:default}
        .viewControls{display:flex;align-items:center;gap:3px;flex:0 0 auto}.viewControls .fitButton{width:28px;min-width:28px;padding:0;font-size:.62rem}.viewControls button{width:28px;height:29px;padding:0;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.92);color:#bbb5aa;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}.viewControls .youControl{width:auto!important;min-width:38px;max-width:54px;padding:0 5px!important}.viewControls button:hover{border-color:rgba(244,183,40,.28);color:#e4c36d}.parentReturn{position:absolute;z-index:55;left:10px;bottom:10px;min-height:34px;padding:0 11px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:rgba(18,18,15,.92);color:#a89c7b;font:inherit;font-size:.55rem;font-weight:850;cursor:pointer}.parentReturn:disabled{opacity:.4}
        .profileCard{position:absolute;z-index:75;right:10px;top:10px;width:min(245px,calc(100% - 20px));box-sizing:border-box;padding:13px;border:1px solid rgba(255,205,80,.15);border-radius:17px;background:rgba(15,15,13,.975);box-shadow:0 18px 42px rgba(0,0,0,.45);cursor:default}.profileClose{position:absolute;right:8px;top:7px;width:28px;height:28px;border:0;background:transparent;color:#817c73;font-size:1rem;cursor:pointer}.profileIdentity{padding-right:28px;display:flex;align-items:center;gap:9px}.profileIdentity :global(.identity){display:flex;align-items:center;gap:8px}.profileIdentity :global(.identityLabel){display:none}.profileIdentity :global(.avatarSlot){position:relative;display:grid;place-items:center}.profileIdentity :global(.neutralAvatar){display:grid;place-items:center;border:1px solid rgba(244,183,40,.13);border-radius:50%;background:#171611;color:#8e7b50}.profileIdentity :global(.avatarSlot img){position:absolute;inset:0;border-radius:50%;object-fit:cover}.profileIdentity>div>strong{display:block;color:#e7e1d6;font-size:.66rem}.profileIdentity>div>span{display:block;margin-top:3px;color:#877e69;font-size:.51rem}.profileAddress{margin-top:10px;padding:8px;border-radius:9px;background:rgba(255,255,255,.025);color:#67635d;font-size:.48rem;line-height:1.35;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}.profileStats{margin-top:9px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.profileStats>div{padding:8px;border:1px solid rgba(255,255,255,.045);border-radius:9px;background:rgba(255,255,255,.018)}.profileStats strong{display:block;color:#d6d0c5;font-size:.62rem}.profileStats span{display:block;margin-top:2px;color:#68645e;font-size:.47rem}.profileAction{width:100%;min-height:36px;margin-top:9px;border:0;border-radius:10px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.57rem;font-weight:950;cursor:pointer}.profileAction:disabled{opacity:.45;cursor:default}
        .groupCardTitle{padding-right:28px;display:flex;align-items:center;gap:10px}.groupCardTitle>div strong{display:block;color:#e7dfcf;font-size:.65rem}.groupCardTitle>div span{display:block;margin-top:3px;color:#887c5e;font-size:.5rem}.groupMemberList{margin-top:10px;display:flex;flex-wrap:wrap;gap:5px}.groupMemberList span{padding:5px 6px;border:1px solid rgba(255,255,255,.05);border-radius:7px;background:rgba(255,255,255,.02);color:#777168;font-size:.47rem}.ungroupButton{width:100%;min-height:33px;margin-top:10px;border:1px solid rgba(194,118,90,.2);border-radius:9px;background:rgba(194,118,90,.06);color:#bd9889;font:inherit;font-size:.52rem;font-weight:900;cursor:pointer}
        .workspaceNotice{position:absolute;z-index:96;left:50%;bottom:56px;transform:translateX(-50%);padding:7px 11px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(21,19,14,.97);color:#d5b85f;font-size:.53rem;font-weight:850;white-space:nowrap;box-shadow:0 12px 28px rgba(0,0,0,.3)}
        .inlineError{position:absolute;z-index:90;left:50%;bottom:54px;transform:translateX(-50%);max-width:calc(100% - 28px);padding:8px 9px 8px 11px;display:flex;align-items:center;gap:8px;border:1px solid rgba(194,118,90,.2);border-radius:10px;background:rgba(38,23,18,.96);color:#c7a294;font-size:.53rem;box-shadow:0 12px 30px rgba(0,0,0,.32)}.inlineError button{border:0;background:transparent;color:#9f7d71;font-size:.8rem;cursor:pointer}
        @keyframes networkForward{0%{opacity:.68;scale:.975}100%{opacity:1;scale:1}}@keyframes networkBack{0%{opacity:.74;scale:1.035}100%{opacity:1;scale:1}}@keyframes networkSlotFlow{from{stroke-dashoffset:43}to{stroke-dashoffset:-43}}@keyframes networkYouBreath{0%,100%{opacity:.46;transform:scale(.96)}50%{opacity:.92;transform:scale(1.06)}}@keyframes networkYouIntro{0%{opacity:.25;transform:scale(.78)}58%{opacity:1;transform:scale(1.14)}100%{opacity:.62;transform:scale(1)}}@keyframes networkNodeBloom{0%{transform:scale(.45);box-shadow:0 0 0 rgba(244,183,40,0)}55%{transform:scale(1.18);box-shadow:0 0 42px rgba(244,183,40,.22)}100%{transform:scale(var(--network-node-scale,1));box-shadow:0 0 22px rgba(244,183,40,.025)}}@keyframes slotPulse{0%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}50%{box-shadow:0 0 22px rgba(244,183,40,.07)}}@keyframes pulse{to{opacity:.38;transform:scale(.82)}}@keyframes groupDropAway{to{opacity:0;scale:.72}}
        @media(max-width:560px){.networkCanvasPage{width:100%;border-radius:18px}.networkHeader{min-height:42px;padding:7px 9px}.networkHeader h1{font-size:.82rem}.summary{gap:2px 4px}.summary strong{font-size:.66rem}.summary span{font-size:.43rem}.networkUtilityRow{min-height:39px;padding:4px 6px;gap:4px}.searchWrap input{height:29px;padding:0 7px;font-size:.52rem}.compactControls{gap:3px}.layoutControls,.viewControls{gap:3px}.layoutControls>button,.groupMenuAnchor>button,.viewControls button,.viewControls .fitButton{height:29px;border-radius:8px}.groupsPanel,.groupBuilder{width:min(232px,calc(100vw - 28px))}.crumb{max-width:60px}.profileCard{top:auto;right:8px;bottom:52px;left:8px;width:auto}.parentReturn{left:8px;bottom:8px}.personNode{min-width:0}.focusNode{min-width:0}}
        @media(prefers-reduced-motion:reduce){.world.cameraTransition{transition:none}.worldContent.nav-forward,.worldContent.nav-back,.slotEdgePulse,.nodeBusy,.personNode.grouping,.slotCircle,.focusNode::before,.worldContent.nav-forward .childNode .nodeCircle{animation:none!important}}
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
