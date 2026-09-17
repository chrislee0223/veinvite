import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/AppNetwork.tsx';
let source = await readFile(path, 'utf8');
const lines = (...items) => items.join('\n');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce('hold type', lines(
  'type GroupDraft = {',
  '  id: string;',
  '  label: string;',
  '  members: string[];',
  '};'
), lines(
  'type HoldDragState = {',
  '  pointerId: number;',
  '  key: string;',
  '  startScreen: Point;',
  '  startNode: Point;',
  '  offset: Point;',
  '  armed: boolean;',
  '  moved: boolean;',
  '  originalWorkspace: NetworkFocusWorkspace;',
  '};',
  '',
  'type GroupDraft = {',
  '  id: string;',
  '  label: string;',
  '  members: string[];',
  '};'
));

replaceOnce('gesture constants', lines(
  'const GROUP_DROP_MS = 160;',
  "const SESSION_PREFIX = 'veinvite-network-runtime-v1:';"
), lines(
  'const GROUP_DROP_MS = 160;',
  'const HOLD_TO_MOVE_MS = 500;',
  'const HOLD_CANCEL_DISTANCE = 8;',
  'const NODE_ENTER_SCALE = 1.85;',
  'const NODE_HIT_RADIUS = 58;',
  'const GROUP_DROP_RADIUS = 92;',
  'const WHEEL_ENTER_DISTANCE = 120;',
  "const SESSION_PREFIX = 'veinvite-network-runtime-v1:';"
));

replaceOnce('gesture refs', lines(
  '  const pinchReturnIntentRef = useRef(false);',
  '  const wheelReturnDistanceRef = useRef(0);'
), lines(
  '  const pinchReturnIntentRef = useRef(false);',
  '  const pinchCandidateWalletRef = useRef<string | null>(null);',
  '  const pinchEnterIntentRef = useRef<string | null>(null);',
  '  const wheelReturnDistanceRef = useRef(0);',
  '  const wheelEnterDistanceRef = useRef(0);',
  '  const wheelEnterWalletRef = useRef<string | null>(null);',
  '  const holdDragRef = useRef<HoldDragState | null>(null);',
  '  const holdTimerRef = useRef<number | null>(null);'
));

replaceOnce('timer cleanup', lines(
  '    if (noticeTimerRef.current !== null) {',
  '      window.clearTimeout(noticeTimerRef.current);',
  '      noticeTimerRef.current = null;',
  '    }',
  '  }, []);'
), lines(
  '    if (noticeTimerRef.current !== null) {',
  '      window.clearTimeout(noticeTimerRef.current);',
  '      noticeTimerRef.current = null;',
  '    }',
  '    if (holdTimerRef.current !== null) {',
  '      window.clearTimeout(holdTimerRef.current);',
  '      holdTimerRef.current = null;',
  '    }',
  '    holdDragRef.current = null;',
  '    pinchCandidateWalletRef.current = null;',
  '    pinchEnterIntentRef.current = null;',
  '    wheelEnterDistanceRef.current = 0;',
  '    wheelEnterWalletRef.current = null;',
  '  }, []);'
));

replaceOnce('geometry helpers', lines(
  '  const childByWallet = useMemo(() => {',
  '    const map = new Map<string, NetworkChild>();'
), lines(
  '  const nearestVisibleChild = useCallback((point: Point, radius = NODE_HIT_RADIUS): PositionedChild | null => {',
  '    let nearest: PositionedChild | null = null;',
  '    let nearestDistance = radius;',
  '    for (const child of visibleChildren) {',
  '      const candidateDistance = Math.hypot(child.x - point.x, child.y - point.y);',
  '      if (candidateDistance <= nearestDistance) {',
  '        nearest = child;',
  '        nearestDistance = candidateDistance;',
  '      }',
  '    }',
  '    return nearest;',
  '  }, [visibleChildren]);',
  '',
  '  const nearestVisibleGroup = useCallback((point: Point, radius = GROUP_DROP_RADIUS) => {',
  '    let nearest: (typeof visibleGroups)[number] | null = null;',
  '    let nearestDistance = radius;',
  '    for (const group of visibleGroups) {',
  '      const candidateDistance = Math.hypot(group.x - point.x, group.y - point.y);',
  '      if (candidateDistance <= nearestDistance) {',
  '        nearest = group;',
  '        nearestDistance = candidateDistance;',
  '      }',
  '    }',
  '    return nearest;',
  '  }, [visibleGroups]);',
  '',
  '  const childByWallet = useMemo(() => {',
  '    const map = new Map<string, NetworkChild>();'
));

replaceOnce('persist node helper', '  const beginNavigationMotion = useCallback((direction: NavigationDirection) => {', lines(
  '  const persistNodePosition = useCallback((walletKey: string, point: Point) => {',
  '    if (!wallet || !currentFocusKey) return;',
  '    setWorkspaceStore((current) => {',
  '      const focusWorkspace = workspaceForFocus(current, currentFocusKey);',
  '      const nextWorkspace = withNodePosition(focusWorkspace, walletKey, point);',
  '      const nextStore = withFocusWorkspace(current, currentFocusKey, nextWorkspace);',
  '      try {',
  '        window.localStorage.setItem(workspaceStorageKey(wallet), serializeNetworkWorkspaceStore(nextStore));',
  '      } catch {',
  '        // In-memory state remains authoritative when storage is unavailable.',
  '      }',
  '      return nextStore;',
  '    });',
  '  }, [wallet, currentFocusKey]);',
  '',
  '  const beginNavigationMotion = useCallback((direction: NavigationDirection) => {'
));

await writeFile(path, source);
