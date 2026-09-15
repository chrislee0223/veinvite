'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV49 } from './AppNetworkCanaryV49';

const INTRO_SESSION_KEY = 'veinvite:network:intro-v4';
const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const ADJUST_STORAGE_KEY = 'veinvite:network:visual-adjust-v1';
const DRAG_THRESHOLD_PX = 10;
const CLICK_SUPPRESS_MS = 360;
const TRANSITION_LOCK_MS = 860;
const PINCH_ENTER_RATIO = 1.18;
const PINCH_RECOGNIZE_RATIO = 1.08;
const PINCH_FINAL_RATIO_MIN = 1.04;
const PINCH_CLICK_GUARD_MS = 520;
const PINCH_PARENT_RATIO = 0.76;
const PARENT_ZOOM_MAX = 0.64;
const WHEEL_ENTER_ZOOM_MIN = 1.18;
const PROFILE_CONFIRM_POLL_MS = 32;
const PROFILE_CONFIRM_MAX_ATTEMPTS = 20;

type Point = { x: number; y: number };
type DevicePoint = { desktop: Point; mobile: Point };
type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  positions?: DevicePoint;
  memberOffsets?: DevicePoint;
  offsets?: DevicePoint;
};
type ActivePointer = {
  pointerId: number;
  node: HTMLButtonElement;
  startX: number;
  startY: number;
  moved: boolean;
  mode: 'normal' | 'group';
} | null;
type DropKind = 'existing' | 'new' | 'create' | 'remove';
type DropTarget = { kind: DropKind; element: HTMLElement } | null;
type PinchIntent = {
  startedAt: number;
  startDistance: number;
  maxRatio: number;
  minRatio: number;
  lastRatio: number;
  candidateId: string | null;
} | null;
type ViewSnapshot = { zoom: number; cameraX: number; cameraY: number };
type AdjustmentStore = Record<string, Point>;

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function curveFromCenter(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(64, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function curveBetween(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = Math.sign(dx || 1) * Math.min(54, Math.abs(dx) * .14);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y + dy * .28}, ${to.x - bend} ${from.y + dy * .72}, ${to.x} ${to.y}`;
}

function NetworkInteractionController() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const scene = root?.querySelector<HTMLElement>('.scene');
    if (!root || !stage || !scene) return;

    let mounted = true;
    let activePointer: ActivePointer = null;
    let pinchActive = false;
    let pinchIntent: PinchIntent = null;
    let suppressTrustedClickUntil = 0;
    let syntheticPointerId = 180000;
    let transitionTimer: number | null = null;
    let autoNavTimer: number | null = null;
    let syncFrame = 0;
    let membershipTimer: number | null = null;
    let wheelCandidateId: string | null = null;
    let wheelScore = 0;
    let wheelAt = 0;
    let programmaticNavigation = false;
    let pendingTrustedNodeClick: HTMLButtonElement | null = null;
    const navigationStack: ViewSnapshot[] = [];
    const edgePaths = new Map<string, SVGPathElement>();

    const svgNs = 'http://www.w3.org/2000/svg';
    const groupMemberEdges = document.createElementNS(svgNs, 'svg');
    groupMemberEdges.setAttribute('class', 'v50GroupMemberEdges');
    groupMemberEdges.setAttribute('viewBox', '-2200 -2200 4400 4400');
    groupMemberEdges.setAttribute('aria-hidden', 'true');
    scene.appendChild(groupMemberEdges);

    let adjustments: AdjustmentStore = {};
    try {
      const raw = window.localStorage.getItem(ADJUST_STORAGE_KEY);
      if (raw) adjustments = JSON.parse(raw) as AdjustmentStore;
    } catch { adjustments = {}; }

    const saveAdjustments = () => {
      try { window.localStorage.setItem(ADJUST_STORAGE_KEY, JSON.stringify(adjustments)); } catch { /* optional visual state */ }
    };

    const markIntroSeen = () => {
      try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional */ }
    };

    const groupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel');
    const groupEditorOpen = () => Boolean(groupPanel()?.querySelector('input'));
    const groupsMode = () => Boolean(groupPanel()) && !groupEditorOpen() && !stage.classList.contains('editMode');
    const inTransition = () => root.classList.contains('v50NetworkTransition');
    const editMode = () => stage.classList.contains('editMode');
    const compact = () => window.innerWidth <= 640;

    const activeScenarioId = () => {
      const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
      const map: Record<string, string> = {
        '0명': 'zero', '1명': 'one', '5명': 'five', '30명': 'balanced30',
        '직접 50': 'direct50', '100명': 'hundred', '500명': 'fiveHundred',
      };
      return map[label] ?? (label || 'unknown');
    };

    const currentScope = () => {
      const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
        .map((button) => button.textContent?.trim() ?? '')
        .filter(Boolean);
      return `${activeScenarioId()}|${crumbs.join('>') || 'YOU'}`;
    };

    const adjustmentKey = (nodeId: string) => `${currentScope()}|${compact() ? 'mobile' : 'desktop'}|${nodeId}`;

    const readZoom = () => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      const parsed = Number.parseFloat(text.replace('%', ''));
      return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
    };

    const readCamera = () => ({
      x: parsePx(scene.style.getPropertyValue('--cameraX')),
      y: parsePx(scene.style.getPropertyValue('--cameraY')),
    });

    const captureView = (): ViewSnapshot => {
      const camera = readCamera();
      return { zoom: readZoom(), cameraX: camera.x, cameraY: camera.y };
    };

    const readGroups = () => {
      try {
        const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (!raw) return [] as StoredGroup[];
        const parsed = JSON.parse(raw) as StoredGroup[];
        return Array.isArray(parsed) ? parsed : [];
      } catch { return [] as StoredGroup[]; }
    };

    const nodePoint = (node: HTMLButtonElement, includeDrag = true): Point => ({
      x: parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
        (includeDrag ? parsePx(node.style.getPropertyValue('--v50-drag-dx')) : 0),
      y: parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
        (includeDrag ? parsePx(node.style.getPropertyValue('--v50-drag-dy')) : 0),
    });

    const applyStoredAdjustments = () => {
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id) return;
        const point = adjustments[adjustmentKey(id)] ?? { x: 0, y: 0 };
        const x = `${point.x}px`;
        const y = `${point.y}px`;
        if (node.style.getPropertyValue('--v50-adjust-x') !== x) node.style.setProperty('--v50-adjust-x', x);
        if (node.style.getPropertyValue('--v50-adjust-y') !== y) node.style.setProperty('--v50-adjust-y', y);
      });
    };

    const writeAdjustment = (node: HTMLButtonElement, delta: Point) => {
      const id = node.dataset.nodeId;
      if (!id) return;
      const key = adjustmentKey(id);
      const current = adjustments[key] ?? {
        x: parsePx(node.style.getPropertyValue('--v50-adjust-x')),
        y: parsePx(node.style.getPropertyValue('--v50-adjust-y')),
      };
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      adjustments[key] = next;
      node.style.setProperty('--v50-adjust-x', `${next.x}px`);
      node.style.setProperty('--v50-adjust-y', `${next.y}px`);
    };

    const snapshotNodePoints = () => {
      const map = new Map<string, Point>();
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (id) map.set(id, nodePoint(node, false));
      });
      return map;
    };

    const compensateMembershipChange = (before: Map<string, Point>) => {
      if (membershipTimer !== null) window.clearTimeout(membershipTimer);
      membershipTimer = window.setTimeout(() => {
        membershipTimer = null;
        if (!mounted) return;
        let changed = false;
        root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
          const id = node.dataset.nodeId;
          const previous = id ? before.get(id) : null;
          if (!id || !previous) return;
          const current = nodePoint(node, false);
          const delta = { x: previous.x - current.x, y: previous.y - current.y };
          if (Math.abs(delta.x) < .5 && Math.abs(delta.y) < .5) return;
          writeAdjustment(node, delta);
          changed = true;
        });
        if (changed) saveAdjustments();
        scheduleSync();
      }, 140);
    };

    const clearCurrentScopeAdjustments = () => {
      const prefix = `${currentScope()}|${compact() ? 'mobile' : 'desktop'}|`;
      let changed = false;
      Object.keys(adjustments).forEach((key) => {
        if (!key.startsWith(prefix)) return;
        delete adjustments[key];
        changed = true;
      });
      if (changed) saveAdjustments();
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        node.style.removeProperty('--v50-adjust-x');
        node.style.removeProperty('--v50-adjust-y');
      });
    };

    const pathForNode = (node: HTMLButtonElement) => {
      const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
      const index = nodes.indexOf(node);
      if (index < 0) return null;
      const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
      return paths[index] ?? null;
    };

    const syncBasePath = (node: HTMLButtonElement) => {
      const path = pathForNode(node);
      if (!path) return;
      path.setAttribute('d', curveFromCenter(nodePoint(node)));
    };

    const syncGroupMemberEdges = () => {
      syncFrame = 0;
      if (!mounted) return;
      applyStoredAdjustments();
      const scope = currentScope();
      const scopedGroups = readGroups().filter((group) => group.scope === scope);
      const keep = new Set<string>();

      scopedGroups.forEach((group) => {
        const hub = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(group.id)}"]`);
        if (!hub) return;
        const from = {
          x: parsePx(hub.style.getPropertyValue('--gx')),
          y: parsePx(hub.style.getPropertyValue('--gy')),
        };
        const expanded = hub.classList.contains('expanded') || editMode();
        group.members.forEach((memberId) => {
          const node = root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(memberId)}"]`);
          if (!node) return;
          const key = `${group.id}:${memberId}`;
          keep.add(key);
          let path = edgePaths.get(key);
          if (!path) {
            path = document.createElementNS(svgNs, 'path');
            path.dataset.edgeKey = key;
            path.classList.add('v50GroupMemberEdge');
            groupMemberEdges.appendChild(path);
            edgePaths.set(key, path);
          }
          path.setAttribute('d', curveBetween(from, nodePoint(node)));
          path.classList.toggle('visible', expanded);
        });
      });

      edgePaths.forEach((path, key) => {
        if (keep.has(key)) return;
        path.remove();
        edgePaths.delete(key);
      });
    };

    function scheduleSync() {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(syncGroupMemberEdges);
    }

    const setModeClasses = () => {
      const editing = editMode();
      const group = groupsMode();
      root.classList.toggle('v50EditMode', editing);
      root.classList.toggle('v50GroupMode', group);
      root.classList.toggle('v50PinchMode', pinchActive);

      if (editing) {
        root.querySelectorAll<HTMLElement>('[data-v42-group-drop]').forEach((element) => {
          element.dataset.v50DropDisabled = '1';
          element.removeAttribute('data-v42-group-drop');
        });
      } else {
        root.querySelectorAll<HTMLElement>('[data-v50-drop-disabled="1"]').forEach((element) => {
          element.setAttribute('data-v42-group-drop', 'true');
          delete element.dataset.v50DropDisabled;
        });
      }
      scheduleSync();
    };

    const dropTargetAt = (clientX: number, clientY: number): DropTarget => {
      const candidates: Array<{ selector: string; kind: DropKind; pad: number }> = [
        { selector: '.v42RemoveZone', kind: 'remove', pad: 4 },
        { selector: '.v44CreateDropMore', kind: 'create', pad: 7 },
        { selector: '.v44NewGroupDrop', kind: 'new', pad: 6 },
        { selector: '.v42GroupRow[data-v42-group-drop]', kind: 'existing', pad: 5 },
        { selector: '.v42GroupHub[data-v42-group-drop]', kind: 'existing', pad: 10 },
      ];
      for (const candidate of candidates) {
        for (const element of Array.from(root.querySelectorAll<HTMLElement>(candidate.selector))) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (clientX >= rect.left - candidate.pad && clientX <= rect.right + candidate.pad &&
              clientY >= rect.top - candidate.pad && clientY <= rect.bottom + candidate.pad) {
            return { kind: candidate.kind, element };
          }
        }
      }
      return null;
    };

    const resetDraggedNode = (node: HTMLButtonElement) => {
      node.style.removeProperty('--v50-drag-dx');
      node.style.removeProperty('--v50-drag-dy');
      node.classList.remove('v50DirectDragging', 'v50ValidDrop');
      root.classList.remove('v50DraggingNode');
      syncBasePath(node);
      scheduleSync();
    };

    const dispatchSyntheticDrop = (node: HTMLButtonElement, target: HTMLElement) => {
      const circle = node.querySelector<HTMLElement>('.nodeCircle');
      if (!circle || !node.isConnected || !target.isConnected) return;
      const start = circle.getBoundingClientRect();
      const end = target.getBoundingClientRect();
      const startX = start.left + start.width / 2;
      const startY = start.top + start.height / 2;
      const endX = end.left + end.width / 2;
      const endY = end.top + end.height / 2;
      syntheticPointerId += 1;
      const pointerId = syntheticPointerId;
      const common = { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse' } as const;
      circle.dispatchEvent(new PointerEvent('pointerdown', { ...common, button: 0, clientX: startX, clientY: startY }));
      circle.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, clientX: startX + 18, clientY: startY }));
      circle.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, clientX: endX, clientY: endY }));
      circle.dispatchEvent(new PointerEvent('pointerup', { ...common, button: 0, clientX: endX, clientY: endY }));
    };

    const nearestNavigableNode = (clientX: number, clientY: number) => {
      let bestNode: HTMLButtonElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const node of Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'))) {
        if (node.classList.contains('v42CollapsedMember')) continue;
        const circle = node.querySelector<HTMLElement>('.nodeCircle');
        if (!circle) continue;
        const rect = circle.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
        const limit = Math.max(38, rect.width * .9);
        if (distance > limit || distance >= bestDistance) continue;
        bestNode = node;
        bestDistance = distance;
      }
      return bestNode;
    };

    const centerIsYou = () => {
      const source = root.querySelector<HTMLElement>('.centerWrap>b');
      return source?.dataset.v70RootLabel === '1' || source?.textContent?.trim().toUpperCase() === 'YOU';
    };

    const clearNavigationCandidate = (node: HTMLButtonElement | null) => {
      node?.classList.remove('v50NavigationCandidate');
    };

    const candidateNode = (id: string | null) => id
      ? root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`)
      : null;

    const beginTransition = () => {
      root.classList.add('v50NetworkTransition');
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        root.classList.remove('v50NetworkTransition');
        setModeClasses();
      }, TRANSITION_LOCK_MS);
    };

    const restoreView = (snapshot: ViewSnapshot) => {
      window.setTimeout(() => {
        if (!mounted) return;
        const plus = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button')).find((button) => button.textContent?.trim() === '+');
        const minus = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button')).find((button) => button.textContent?.trim() === '−');
        const steps = Math.min(16, Math.round(Math.abs(snapshot.zoom - 1) / .12));
        const zoomButton = snapshot.zoom >= 1 ? plus : minus;
        for (let index = 0; index < steps; index += 1) zoomButton?.click();

        window.setTimeout(() => {
          const rect = stage.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          syntheticPointerId += 1;
          const pointerId = syntheticPointerId;
          stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
          stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, pointerType: 'mouse', buttons: 1, clientX: x + snapshot.cameraX, clientY: y + snapshot.cameraY }));
          stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, clientX: x + snapshot.cameraX, clientY: y + snapshot.cameraY }));
        }, 24);
      }, 34);
    };

    const triggerEnter = (node: HTMLButtonElement, delayMs = 0) => {
      if (inTransition() || editMode() || groupPanel() || programmaticNavigation) return false;
      const snapshot = captureView();
      const expectedLabel = node.querySelector<HTMLElement>(':scope > b')?.textContent?.trim() ?? '';
      const previousClose = root.querySelector<HTMLButtonElement>('.profileCard > div button');
      if (previousClose?.textContent?.trim() === '×') previousClose.click();

      programmaticNavigation = true;
      node.classList.add('v50NavigationCandidate');
      if (autoNavTimer !== null) window.clearTimeout(autoNavTimer);

      const finish = () => {
        node.classList.remove('v50NavigationCandidate');
        programmaticNavigation = false;
        autoNavTimer = null;
      };

      const confirmProfile = (attempt: number) => {
        if (!mounted || !node.isConnected) {
          finish();
          return;
        }
        const card = root.querySelector<HTMLElement>('.profileCard');
        const viewNetwork = card?.querySelector<HTMLButtonElement>('.viewNetwork') ?? null;
        const cardLabel = card?.querySelector<HTMLElement>(':scope > div > b')?.textContent?.trim() ?? '';
        if (viewNetwork && (!expectedLabel || cardLabel === expectedLabel)) {
          navigationStack.push(snapshot);
          beginTransition();
          viewNetwork.click();
          finish();
          return;
        }
        if (attempt >= PROFILE_CONFIRM_MAX_ATTEMPTS) {
          finish();
          return;
        }
        autoNavTimer = window.setTimeout(() => confirmProfile(attempt + 1), PROFILE_CONFIRM_POLL_MS);
      };

      autoNavTimer = window.setTimeout(() => {
        autoNavTimer = null;
        if (!mounted || !node.isConnected) {
          finish();
          return;
        }
        node.querySelector<HTMLElement>('.nodeCircle')?.click();
        autoNavTimer = window.setTimeout(() => confirmProfile(0), PROFILE_CONFIRM_POLL_MS);
      }, Math.max(0, delayMs));
      return true;
    };

    const triggerParent = () => {
      if (inTransition() || centerIsYou() || editMode() || groupPanel()) return;
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
        .find((button) => button.textContent?.includes('Inviter'));
      if (!inviter) return;
      const snapshot = navigationStack.pop() ?? null;
      beginTransition();
      programmaticNavigation = true;
      inviter.click();
      if (snapshot) restoreView(snapshot);
      window.setTimeout(() => { programmaticNavigation = false; }, 90);
    };

    const onWindowPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      const element = event.target instanceof Element ? event.target : null;
      const person = element?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      const slot = element?.closest<HTMLButtonElement>('button.slotNode') ?? null;
      if (!person && !slot) return;

      const personCircle = element?.closest<HTMLElement>('.nodeCircle') ?? null;
      const slotCircle = element?.closest<HTMLElement>('.slotCircle') ?? null;
      const validCircle = Boolean((person && personCircle && person.contains(personCircle)) || (slot && slotCircle && slot.contains(slotCircle)));
      if (!validCircle) {
        event.stopPropagation();
        return;
      }

      markIntroSeen();
      if (inTransition() || pinchActive) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (editMode() || groupEditorOpen()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const node = person ?? slot!;
      activePointer = {
        pointerId: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        mode: person && groupsMode() ? 'group' : 'normal',
      };
      pendingTrustedNodeClick = node;
      event.stopPropagation();
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      const current = activePointer;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const screenDx = event.clientX - current.startX;
      const screenDy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD_PX) return;
      if (!current.moved) {
        current.moved = true;
        suppressTrustedClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      }
      if (current.mode !== 'group' || !current.node.matches('.personNode[data-node-id]')) return;

      const zoom = readZoom();
      current.node.style.setProperty('--v50-drag-dx', `${screenDx / zoom}px`);
      current.node.style.setProperty('--v50-drag-dy', `${screenDy / zoom}px`);
      current.node.classList.add('v50DirectDragging');
      root.classList.add('v50DraggingNode');
      current.node.classList.toggle('v50ValidDrop', Boolean(dropTargetAt(event.clientX, event.clientY)));
      syncBasePath(current.node);
      scheduleSync();
    };

    const onWindowPointerUp = (event: PointerEvent) => {
      const current = activePointer;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
      activePointer = null;
      event.stopPropagation();

      if (!current.moved) {
        suppressTrustedClickUntil = performance.now() + 220;
        pendingTrustedNodeClick = current.node;
        window.setTimeout(() => {
          if (!mounted || pendingTrustedNodeClick !== current.node || !current.node.isConnected) return;
          pendingTrustedNodeClick = null;
          current.node.querySelector<HTMLElement>('.nodeCircle,.slotCircle')?.click();
        }, 0);
        return;
      }

      pendingTrustedNodeClick = null;
      suppressTrustedClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      if (current.mode === 'group' && current.node.matches('.personNode[data-node-id]')) {
        const target = dropTargetAt(event.clientX, event.clientY);
        if (target) {
          const before = snapshotNodePoints();
          dispatchSyntheticDrop(current.node, target.element);
          compensateMembershipChange(before);
        }
        resetDraggedNode(current.node);
      }
    };

    const onWindowPointerCancel = (event: PointerEvent) => {
      const current = activePointer;
      if (!current || current.pointerId !== event.pointerId) return;
      activePointer = null;
      pendingTrustedNodeClick = null;
      suppressTrustedClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      if (current.mode === 'group' && current.node.matches('.personNode[data-node-id]')) resetDraggedNode(current.node);
    };

    const onRootClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const button = target.closest<HTMLButtonElement>('button');

      if (event.isTrusted && performance.now() < suppressTrustedClickUntil && target.closest('.personNode,.slotNode')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (button?.classList.contains('v42GroupToolbarButton') && event.isTrusted) {
        if (editMode()) {
          Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
            .find((candidate) => candidate.textContent?.includes('Done'))?.click();
        }
        return;
      }

      if (button?.closest('.navActions') && event.isTrusted) {
        const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if ((text === 'Edit layout' || text.includes('Done')) && groupPanel()) {
          root.querySelector<HTMLButtonElement>('.v42GroupToolbarButton')?.click();
        }
        if (text === 'Reset') {
          clearCurrentScopeAdjustments();
          scheduleSync();
        }
        if (text.includes('Inviter') && !programmaticNavigation) {
          const snapshot = navigationStack.pop() ?? null;
          if (snapshot) window.setTimeout(() => restoreView(snapshot), 28);
        }
      }

      if (button?.closest('.viewActions') && button.textContent?.includes('YOU')) navigationStack.length = 0;
      if (button?.classList.contains('viewNetwork') && !programmaticNavigation) navigationStack.push(captureView());

      if (button && (button.textContent?.trim() === 'Create' || button.textContent?.trim() === 'Save changes' || button.classList.contains('v42DeleteGroup'))) {
        const before = snapshotNodePoints();
        window.setTimeout(() => compensateMembershipChange(before), 0);
      }
    };

    const preventNativeNodeGesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.personNode,.slotNode,.clusterNode,.nodeCircle,.slotCircle')) return;
      event.preventDefault();
    };

    const onTouchStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target)) return;
      markIntroSeen();
      if (event.touches.length !== 2 || editMode() || groupPanel() || inTransition()) return;
      pinchActive = true;
      root.classList.add('v50PinchMode');
      if (activePointer?.mode === 'group' && activePointer.node.matches('.personNode[data-node-id]')) resetDraggedNode(activePointer.node);
      activePointer = null;
      pendingTrustedNodeClick = null;
      const a = event.touches[0];
      const b = event.touches[1];
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      pinchIntent = {
        startedAt: performance.now(),
        startDistance: Math.max(1, touchDistance(a, b)),
        maxRatio: 1,
        minRatio: 1,
        lastRatio: 1,
        candidateId: nearestNavigableNode(midX, midY)?.dataset.nodeId ?? null,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinchActive || !pinchIntent || event.touches.length !== 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      const ratio = touchDistance(a, b) / pinchIntent.startDistance;
      pinchIntent.maxRatio = Math.max(pinchIntent.maxRatio, ratio);
      pinchIntent.minRatio = Math.min(pinchIntent.minRatio, ratio);
      pinchIntent.lastRatio = ratio;

      if (!pinchIntent.candidateId) {
        const midX = (a.clientX + b.clientX) / 2;
        const midY = (a.clientY + b.clientY) / 2;
        pinchIntent.candidateId = nearestNavigableNode(midX, midY)?.dataset.nodeId ?? null;
      }

      const candidate = candidateNode(pinchIntent.candidateId);
      if (candidate && ratio >= PINCH_RECOGNIZE_RATIO) candidate.classList.add('v50NavigationCandidate');
      else clearNavigationCandidate(candidate);
    };

    const finishPinch = (event: TouchEvent) => {
      if (!pinchActive || event.touches.length > 0) return;
      const intent = pinchIntent;
      pinchActive = false;
      pinchIntent = null;
      root.classList.remove('v50PinchMode');
      suppressTrustedClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      if (!intent || inTransition() || editMode() || groupPanel()) {
        clearNavigationCandidate(candidateNode(intent?.candidateId ?? null));
        return;
      }

      if (intent.candidateId && intent.maxRatio >= PINCH_ENTER_RATIO && intent.lastRatio >= PINCH_FINAL_RATIO_MIN) {
        const node = candidateNode(intent.candidateId);
        if (node && !node.classList.contains('v42CollapsedMember')) {
          const elapsed = performance.now() - intent.startedAt;
          const delay = Math.max(0, PINCH_CLICK_GUARD_MS - elapsed);
          if (triggerEnter(node, delay)) return;
        }
      }
      clearNavigationCandidate(candidateNode(intent.candidateId));
      if (!centerIsYou() && intent.minRatio <= PINCH_PARENT_RATIO && readZoom() <= PARENT_ZOOM_MAX) triggerParent();
    };

    const onTouchCancel = () => {
      clearNavigationCandidate(candidateNode(pinchIntent?.candidateId ?? null));
      pinchActive = false;
      pinchIntent = null;
      root.classList.remove('v50PinchMode');
      pendingTrustedNodeClick = null;
      if (activePointer?.mode === 'group' && activePointer.node.matches('.personNode[data-node-id]')) resetDraggedNode(activePointer.node);
      activePointer = null;
      suppressTrustedClickUntil = performance.now() + CLICK_SUPPRESS_MS;
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.isTrusted || editMode() || groupPanel() || inTransition()) return;
      const now = performance.now();
      if (now - wheelAt > 320) { wheelScore = 0; wheelCandidateId = null; }
      wheelAt = now;

      if (event.deltaY < 0) {
        const node = nearestNavigableNode(event.clientX, event.clientY);
        const id = node?.dataset.nodeId ?? null;
        if (!id) { wheelScore = 0; wheelCandidateId = null; return; }
        wheelScore = wheelCandidateId === id ? wheelScore + 1 : 1;
        wheelCandidateId = id;
        window.setTimeout(() => {
          if (wheelScore < 3 || wheelCandidateId !== id || readZoom() < WHEEL_ENTER_ZOOM_MIN) return;
          const current = candidateNode(id);
          if (current) triggerEnter(current);
          wheelScore = 0;
          wheelCandidateId = null;
        }, 42);
        return;
      }

      if (event.deltaY > 0 && !centerIsYou()) {
        wheelScore += 1;
        window.setTimeout(() => {
          if (wheelScore >= 3 && readZoom() <= PARENT_ZOOM_MAX) triggerParent();
        }, 42);
      }
    };

    const clearTransientState = () => {
      clearNavigationCandidate(candidateNode(pinchIntent?.candidateId ?? null));
      pinchActive = false;
      pinchIntent = null;
      pendingTrustedNodeClick = null;
      if (activePointer?.mode === 'group' && activePointer.node.matches('.personNode[data-node-id]')) resetDraggedNode(activePointer.node);
      activePointer = null;
      root.classList.remove('v50PinchMode', 'v50DraggingNode');
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearTransientState();
    };

    const observer = new MutationObserver(() => {
      setModeClasses();
      scheduleSync();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('pointermove', onWindowPointerMove, true);
    window.addEventListener('pointerup', onWindowPointerUp, true);
    window.addEventListener('pointercancel', onWindowPointerCancel, true);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    window.addEventListener('touchend', finishPinch, { capture: true, passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
    stage.addEventListener('wheel', onWheel, { capture: true, passive: true });
    root.addEventListener('click', onRootClickCapture, true);
    root.addEventListener('selectstart', preventNativeNodeGesture, true);
    root.addEventListener('contextmenu', preventNativeNodeGesture, true);
    root.addEventListener('dragstart', preventNativeNodeGesture, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearTransientState);

    setModeClasses();
    applyStoredAdjustments();
    scheduleSync();

    return () => {
      mounted = false;
      observer.disconnect();
      clearNavigationCandidate(candidateNode(pinchIntent?.candidateId ?? null));
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      if (autoNavTimer !== null) window.clearTimeout(autoNavTimer);
      if (membershipTimer !== null) window.clearTimeout(membershipTimer);
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('pointermove', onWindowPointerMove, true);
      window.removeEventListener('pointerup', onWindowPointerUp, true);
      window.removeEventListener('pointercancel', onWindowPointerCancel, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', finishPinch, true);
      window.removeEventListener('touchcancel', onTouchCancel, true);
      stage.removeEventListener('wheel', onWheel, true);
      root.removeEventListener('click', onRootClickCapture, true);
      root.removeEventListener('selectstart', preventNativeNodeGesture, true);
      root.removeEventListener('contextmenu', preventNativeNodeGesture, true);
      root.removeEventListener('dragstart', preventNativeNodeGesture, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearTransientState);
      groupMemberEdges.remove();
      root.querySelectorAll<HTMLElement>('[data-v50-drop-disabled="1"]').forEach((element) => {
        element.setAttribute('data-v42-group-drop', 'true');
        delete element.dataset.v50DropDisabled;
      });
      root.classList.remove('v50EditMode', 'v50GroupMode', 'v50PinchMode', 'v50NetworkTransition', 'v50DraggingNode');
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .personNode,
    .productionNetworkCanaryV45 .personNode *,
    .productionNetworkCanaryV45 .slotNode,
    .productionNetworkCanaryV45 .slotNode *,
    .productionNetworkCanaryV45 .clusterNode,
    .productionNetworkCanaryV45 .clusterNode *{
      user-select:none!important;-webkit-user-select:none!important;
      -webkit-touch-callout:none!important;-webkit-user-drag:none!important
    }

    .productionNetworkCanaryV45 .personNode{
      transform:translate(
        calc(var(--x) + var(--v42-group-dx,0px) + var(--v50-adjust-x,0px) + var(--v50-drag-dx,0px) - 50%),
        calc(var(--y) + var(--v42-group-dy,0px) + var(--v50-adjust-y,0px) + var(--v50-drag-dy,0px) - 50%)
      )!important
    }
    .productionNetworkCanaryV45 .personNode.v50DirectDragging{z-index:92!important;transition:none!important}
    .productionNetworkCanaryV45 .personNode.v50DirectDragging .nodeCircle{
      cursor:grabbing!important;border-color:rgba(244,183,40,.94)!important;
      box-shadow:0 0 0 4px rgba(244,183,40,.1),0 0 30px rgba(244,183,40,.18)!important
    }
    .productionNetworkCanaryV45 .personNode.v50ValidDrop .nodeCircle{
      border-color:rgba(255,211,77,1)!important;
      box-shadow:0 0 0 5px rgba(244,183,40,.16),0 0 36px rgba(244,183,40,.26)!important
    }
    .productionNetworkCanaryV45.v50GroupMode .personNode .nodeCircle{cursor:grab!important}
    .productionNetworkCanaryV45.v50NetworkTransition .stage{pointer-events:none!important}
    .productionNetworkCanaryV45.v50NetworkTransition .scene{transition:transform 720ms cubic-bezier(.18,.82,.2,1)!important}
    .productionNetworkCanaryV45 .personNode.v50NavigationCandidate .nodeCircle{
      border-color:rgba(255,211,77,1)!important;
      box-shadow:0 0 0 5px rgba(244,183,40,.14),0 0 38px rgba(244,183,40,.24)!important
    }

    .productionNetworkCanaryV45.v50EditMode .personNode.v42CollapsedMember{opacity:1!important;pointer-events:auto!important}
    .productionNetworkCanaryV45.v50EditMode .v42RemoveZone{display:none!important}

    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small,
    .productionNetworkCanaryV45 .slotNode>b{
      left:0!important;right:0!important;width:100%!important;max-width:none!important;
      margin-left:0!important;margin-right:0!important;text-align:center!important;
      direction:ltr!important;unicode-bidi:isolate!important;
      transform:scale(var(--v46-label-scale,1))!important;transform-origin:50% 0!important
    }

    .productionNetworkCanaryV45 .spoke.v42GroupMemberPath,
    .productionNetworkCanaryV45 .spoke.v42GroupMemberPath.v44ExpandedGroupPath{opacity:0!important}
    .productionNetworkCanaryV45 .v50GroupMemberEdges{
      position:absolute;left:50%;top:50%;width:4400px;height:4400px;
      transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:5
    }
    .productionNetworkCanaryV45 .v50GroupMemberEdge{
      fill:none;stroke:rgba(239,205,111,.30);stroke-width:.92;stroke-linecap:round;
      vector-effect:non-scaling-stroke;opacity:0;transition:opacity 180ms ease
    }
    .productionNetworkCanaryV45 .v50GroupMemberEdge.visible{opacity:.62}
    .productionNetworkCanaryV45.v50DraggingNode .v50GroupMemberEdge{transition:none!important}

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .v50GroupMemberEdge,
      .productionNetworkCanaryV45.v50NetworkTransition .scene{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV50({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV49 locale={locale} />
    <NetworkInteractionController />
  </>;
}
