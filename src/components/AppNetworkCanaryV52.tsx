'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV50 } from './AppNetworkCanaryV50';

const HOLD_STORAGE_KEY = 'veinvite:network:hold-adjust-v2';
const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const HOLD_MS = 500;
const PRE_HOLD_CANCEL_PX = 10;
const DRAG_AFTER_HOLD_PX = 4;
const POST_HOLD_CLICK_SUPPRESS_MS = 900;
const PARENT_ZOOM_MAX = 0.48;
const PARENT_PINCH_RATIO = 0.64;
const ENTER_PINCH_RATIO = 1.28;
const ENTER_ZOOM_MIN = 1.28;
const WHEEL_PARENT_SCORE = 3;

type Point = { x: number; y: number };
type AdjustmentStore = Record<string, Point>;
type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
};
type HoldState = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  armed: boolean;
  dragging: boolean;
  timer: number;
} | null;
type ParentPinch = {
  startDistance: number;
  minRatio: number;
  maxRatio: number;
  candidateId: string | null;
} | null;
type BackgroundTap = {
  pointerId: number;
  startX: number;
  startY: number;
  target: EventTarget | null;
} | null;

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

function NetworkV52StabilityController() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const scene = root?.querySelector<HTMLElement>('.scene');
    if (!root || !stage || !scene) return;

    let mounted = true;
    let hold: HoldState = null;
    let parentPinch: ParentPinch = null;
    let backgroundTap: BackgroundTap = null;
    let pinchGuard: HTMLDivElement | null = null;
    let suppressNodeId: string | null = null;
    let suppressClickUntil = 0;
    let syncFrame = 0;
    let wheelScore = 0;
    let wheelAt = 0;
    let transitionTimer: number | null = null;

    let adjustments: AdjustmentStore = {};
    try {
      const raw = window.localStorage.getItem(HOLD_STORAGE_KEY);
      if (raw) adjustments = JSON.parse(raw) as AdjustmentStore;
    } catch {
      adjustments = {};
    }

    const compact = () => window.innerWidth <= 640;
    const editMode = () => stage.classList.contains('editMode');
    const realGroupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel:not([data-v52-pinch-guard="1"])');
    const inTransition = () => root.classList.contains('v50NetworkTransition') || root.classList.contains('v52NetworkTransition');
    const centerIsYou = () => root.querySelector<HTMLElement>('.centerWrap>b')?.textContent?.trim().toUpperCase() === 'YOU';

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

    const saveAdjustments = () => {
      try { window.localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(adjustments)); } catch { /* visual state is optional */ }
    };

    const nodePoint = (node: HTMLButtonElement, includeDrag = true): Point => ({
      x: parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-x')) +
        (includeDrag ? parsePx(node.style.getPropertyValue('--v50-drag-dx')) + parsePx(node.style.getPropertyValue('--v52-drag-dx')) : 0),
      y: parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-y')) +
        (includeDrag ? parsePx(node.style.getPropertyValue('--v50-drag-dy')) + parsePx(node.style.getPropertyValue('--v52-drag-dy')) : 0),
    });

    const applyStoredAdjustments = () => {
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id) return;
        const point = adjustments[adjustmentKey(id)] ?? { x: 0, y: 0 };
        const x = `${point.x}px`;
        const y = `${point.y}px`;
        if (node.style.getPropertyValue('--v52-adjust-x') !== x) node.style.setProperty('--v52-adjust-x', x);
        if (node.style.getPropertyValue('--v52-adjust-y') !== y) node.style.setProperty('--v52-adjust-y', y);
      });
    };

    const writeAdjustment = (node: HTMLButtonElement, nodeId: string, delta: Point) => {
      const key = adjustmentKey(nodeId);
      const current = adjustments[key] ?? {
        x: parsePx(node.style.getPropertyValue('--v52-adjust-x')),
        y: parsePx(node.style.getPropertyValue('--v52-adjust-y')),
      };
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      adjustments[key] = next;
      node.style.setProperty('--v52-adjust-x', `${next.x}px`);
      node.style.setProperty('--v52-adjust-y', `${next.y}px`);
      saveAdjustments();
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
      root.querySelectorAll<HTMLElement>('.personNode').forEach((node) => {
        node.style.removeProperty('--v52-adjust-x');
        node.style.removeProperty('--v52-adjust-y');
      });
    };

    const readGroups = () => {
      try {
        const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (!raw) return [] as StoredGroup[];
        const parsed = JSON.parse(raw) as StoredGroup[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [] as StoredGroup[];
      }
    };

    const syncGeometry = () => {
      syncFrame = 0;
      if (!mounted) return;
      applyStoredAdjustments();

      const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
      const basePaths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges > path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
      const scope = currentScope();
      const groups = readGroups().filter((group) => group.scope === scope);
      const groupedIds = new Set(groups.flatMap((group) => group.members));

      nodes.forEach((node, index) => {
        const id = node.dataset.nodeId;
        const path = basePaths[index];
        if (!id || !path) return;
        const point = nodePoint(node);
        const d = curveFromCenter(point);
        if (path.getAttribute('d') !== d) path.setAttribute('d', d);
        if (groupedIds.has(id)) {
          if (path.dataset.v52GroupedBase !== '1') path.dataset.v52GroupedBase = '1';
          if (path.style.getPropertyValue('opacity') !== '0' || path.style.getPropertyPriority('opacity') !== 'important') {
            path.style.setProperty('opacity', '0', 'important');
          }
        } else if (path.dataset.v52GroupedBase === '1') {
          path.style.removeProperty('opacity');
          delete path.dataset.v52GroupedBase;
        }
      });

      groups.forEach((group) => {
        const hub = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(group.id)}"]`);
        if (!hub) return;
        const from = {
          x: parsePx(hub.style.getPropertyValue('--gx')),
          y: parsePx(hub.style.getPropertyValue('--gy')),
        };
        group.members.forEach((memberId) => {
          const node = root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(memberId)}"]`);
          const path = root.querySelector<SVGPathElement>(`.v50GroupMemberEdge[data-edge-key="${CSS.escape(`${group.id}:${memberId}`)}"]`);
          if (!node || !path) return;
          const d = curveBetween(from, nodePoint(node));
          if (path.getAttribute('d') !== d) path.setAttribute('d', d);
        });
      });
    };

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(syncGeometry);
    };

    const canStartHold = (node: HTMLButtonElement) => {
      if (editMode() || realGroupPanel() || inTransition()) return false;
      if (root.classList.contains('v50PinchMode') || root.classList.contains('v48PinchGesture')) return false;
      if (node.classList.contains('v42CollapsedMember')) return false;
      return true;
    };

    const clearHold = (discardDrag: boolean) => {
      const current = hold;
      if (!current) return;
      window.clearTimeout(current.timer);
      if (discardDrag) {
        current.node.style.removeProperty('--v52-drag-dx');
        current.node.style.removeProperty('--v52-drag-dy');
      }
      current.node.classList.remove('v52HoldArmed', 'v52LongDragging');
      hold = null;
      scheduleSync();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      const nodeId = node?.dataset.nodeId;
      if (!circle || !node || !nodeId || !root.contains(node) || !canStartHold(node)) return;

      if (event.pointerType !== 'mouse' && event.cancelable) event.preventDefault();
      clearHold(true);
      const state: NonNullable<HoldState> = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        armed: false,
        dragging: false,
        timer: 0,
      };
      state.timer = window.setTimeout(() => {
        if (!hold || hold !== state || !state.node.isConnected || !canStartHold(state.node)) return;
        state.armed = true;
        state.node.classList.add('v52HoldArmed');
        suppressNodeId = state.nodeId;
        suppressClickUntil = performance.now() + POST_HOLD_CLICK_SUPPRESS_MS;
      }, HOLD_MS);
      hold = state;
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = hold;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const distance = Math.hypot(dx, dy);

      if (!current.armed) {
        if (distance > PRE_HOLD_CANCEL_PX) clearHold(true);
        return;
      }
      if (!current.dragging && distance < DRAG_AFTER_HOLD_PX) return;
      if (!current.dragging) {
        current.dragging = true;
        current.node.classList.add('v52LongDragging');
      }
      const zoom = readZoom();
      current.node.style.setProperty('--v52-drag-dx', `${dx / zoom}px`);
      current.node.style.setProperty('--v52-drag-dy', `${dy / zoom}px`);
      scheduleSync();
    };

    const finishHold = (event: PointerEvent) => {
      const current = hold;
      if (!current || current.pointerId !== event.pointerId) return;
      window.clearTimeout(current.timer);

      if (current.armed) {
        suppressNodeId = current.nodeId;
        suppressClickUntil = performance.now() + POST_HOLD_CLICK_SUPPRESS_MS;
        if (current.dragging) {
          const dx = parsePx(current.node.style.getPropertyValue('--v52-drag-dx'));
          const dy = parsePx(current.node.style.getPropertyValue('--v52-drag-dy'));
          current.node.style.removeProperty('--v52-drag-dx');
          current.node.style.removeProperty('--v52-drag-dy');
          writeAdjustment(current.node, current.nodeId, { x: dx, y: dy });
        }
        if (event.cancelable) event.preventDefault();
      }

      current.node.classList.remove('v52HoldArmed', 'v52LongDragging');
      hold = null;
      scheduleSync();
    };

    const cancelHold = (event?: PointerEvent) => {
      if (event && hold?.pointerId !== event.pointerId) return;
      clearHold(true);
    };

    const suppressHeldClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil || !suppressNodeId) return;
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!node || node.dataset.nodeId !== suppressNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const nearestNavigableNode = (clientX: number, clientY: number) => {
      let bestNode: HTMLButtonElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const node of Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'))) {
        if (node.classList.contains('v42CollapsedMember')) continue;
        const circle = node.querySelector<HTMLElement>('.nodeCircle');
        const meta = node.querySelector<HTMLElement>('small');
        if (!circle || !meta) continue;
        const numbers = meta.textContent?.match(/(\d+)\s+direct\s+·\s+(\d+)\s+(?:net|network)/i);
        if (!numbers || (Number(numbers[1]) <= 0 && Number(numbers[2]) <= 0)) continue;
        const rect = circle.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
        const limit = Math.max(62, rect.width * 1.25);
        if (distance > limit || distance >= bestDistance) continue;
        bestDistance = distance;
        bestNode = node;
      }
      return bestNode;
    };

    const beginV52Transition = () => {
      root.classList.add('v52NetworkTransition');
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        root.classList.remove('v52NetworkTransition');
      }, 820);
    };

    const enterNodeNetwork = (nodeId: string) => {
      if (inTransition() || editMode() || realGroupPanel()) return;
      const node = root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(nodeId)}"]`);
      if (!node || node.classList.contains('v42CollapsedMember')) return;
      beginV52Transition();
      node.classList.add('v52NavigationCandidate');
      node.querySelector<HTMLElement>('.nodeCircle')?.click();
      window.setTimeout(() => {
        if (!mounted) return;
        root.querySelector<HTMLButtonElement>('.profileCard .viewNetwork')?.click();
        node.classList.remove('v52NavigationCandidate');
      }, 34);
    };

    const goParent = () => {
      if (inTransition() || centerIsYou() || editMode() || realGroupPanel()) return;
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
        .find((button) => button.textContent?.includes('Inviter'));
      if (!inviter) return;
      beginV52Transition();
      inviter.click();
    };

    const addPinchGuard = () => {
      if (pinchGuard?.isConnected) return;
      const guard = document.createElement('div');
      guard.className = 'v42GroupPanel';
      guard.dataset.v52PinchGuard = '1';
      guard.setAttribute('aria-hidden', 'true');
      guard.style.display = 'none';
      root.appendChild(guard);
      pinchGuard = guard;
    };

    const removePinchGuard = () => {
      pinchGuard?.remove();
      pinchGuard = null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2 || centerIsYou() || editMode() || realGroupPanel() || inTransition()) return;
      clearHold(true);
      const a = event.touches[0];
      const b = event.touches[1];
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      parentPinch = {
        startDistance: Math.max(1, touchDistance(a, b)),
        minRatio: 1,
        maxRatio: 1,
        candidateId: nearestNavigableNode(midX, midY)?.dataset.nodeId ?? null,
      };
      addPinchGuard();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!parentPinch || event.touches.length !== 2) return;
      const ratio = touchDistance(event.touches[0], event.touches[1]) / parentPinch.startDistance;
      parentPinch.minRatio = Math.min(parentPinch.minRatio, ratio);
      parentPinch.maxRatio = Math.max(parentPinch.maxRatio, ratio);
    };

    const finishPinch = (event: TouchEvent) => {
      if (!parentPinch || event.touches.length > 0) return;
      const intent = parentPinch;
      parentPinch = null;
      removePinchGuard();
      if (inTransition() || editMode() || realGroupPanel()) return;
      if (intent.candidateId && intent.maxRatio >= ENTER_PINCH_RATIO && readZoom() >= ENTER_ZOOM_MIN) {
        enterNodeNetwork(intent.candidateId);
        return;
      }
      if (intent.minRatio <= PARENT_PINCH_RATIO && readZoom() <= PARENT_ZOOM_MAX) goParent();
    };

    const cancelPinch = () => {
      parentPinch = null;
      removePinchGuard();
    };

    const onWheelWindowCapture = (event: WheelEvent) => {
      if (!event.isTrusted || event.deltaY <= 0 || centerIsYou() || editMode() || realGroupPanel() || inTransition()) return;
      addPinchGuard();
      window.setTimeout(removePinchGuard, 0);
      const now = performance.now();
      if (now - wheelAt > 320) wheelScore = 0;
      wheelAt = now;
      wheelScore += 1;
      window.setTimeout(() => {
        if (!mounted || wheelScore < WHEEL_PARENT_SCORE || readZoom() > PARENT_ZOOM_MAX) return;
        wheelScore = 0;
        goParent();
      }, 48);
    };

    const onBackgroundPointerDown = (event: PointerEvent) => {
      if (!root.querySelector('.profileCard')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target)) return;
      if (target.closest('button,.profileCard,.searchPanel,.v42GroupPanel,.v42RemoveZone,.v42GroupHub')) return;
      backgroundTap = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        target: event.target,
      };
    };

    const onBackgroundPointerUp = (event: PointerEvent) => {
      const current = backgroundTap;
      if (!current || current.pointerId !== event.pointerId) return;
      backgroundTap = null;
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('button,.profileCard,.searchPanel,.v42GroupPanel,.v42RemoveZone,.v42GroupHub')) return;
      const close = root.querySelector<HTMLButtonElement>('.profileCard > div button');
      if (close?.textContent?.trim() === '×') close.click();
    };

    const onRootClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button') ?? null;
      if (!button) return;
      const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (button.closest('.navActions') && text === 'Reset') {
        clearCurrentScopeAdjustments();
        scheduleSync();
      }
    };

    const preventNativeNodeGesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.personNode,.personNode *,.slotNode,.slotNode *,.clusterNode,.clusterNode *')) return;
      if (event.cancelable) event.preventDefault();
    };

    const clearTransientState = () => {
      clearHold(true);
      cancelPinch();
      backgroundTap = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearTransientState();
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') return true;
        if (mutation.type !== 'attributes') return false;
        return mutation.attributeName === 'class' || mutation.attributeName === 'style' || mutation.attributeName === 'd';
      });
      if (relevant) scheduleSync();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'd'],
    });

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishHold, true);
    window.addEventListener('pointercancel', cancelHold, true);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    window.addEventListener('touchend', finishPinch, { capture: true, passive: true });
    window.addEventListener('touchcancel', cancelPinch, { capture: true, passive: true });
    window.addEventListener('wheel', onWheelWindowCapture, { capture: true, passive: true });
    stage.addEventListener('pointerdown', onBackgroundPointerDown, true);
    stage.addEventListener('pointerup', onBackgroundPointerUp, true);
    root.addEventListener('click', suppressHeldClick, true);
    root.addEventListener('click', onRootClickCapture, true);
    root.addEventListener('selectstart', preventNativeNodeGesture, true);
    root.addEventListener('contextmenu', preventNativeNodeGesture, true);
    root.addEventListener('dragstart', preventNativeNodeGesture, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearTransientState);
    window.addEventListener('resize', scheduleSync);

    applyStoredAdjustments();
    scheduleSync();

    return () => {
      mounted = false;
      observer.disconnect();
      clearHold(true);
      cancelPinch();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishHold, true);
      window.removeEventListener('pointercancel', cancelHold, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', finishPinch, true);
      window.removeEventListener('touchcancel', cancelPinch, true);
      window.removeEventListener('wheel', onWheelWindowCapture, true);
      stage.removeEventListener('pointerdown', onBackgroundPointerDown, true);
      stage.removeEventListener('pointerup', onBackgroundPointerUp, true);
      root.removeEventListener('click', suppressHeldClick, true);
      root.removeEventListener('click', onRootClickCapture, true);
      root.removeEventListener('selectstart', preventNativeNodeGesture, true);
      root.removeEventListener('contextmenu', preventNativeNodeGesture, true);
      root.removeEventListener('dragstart', preventNativeNodeGesture, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearTransientState);
      window.removeEventListener('resize', scheduleSync);
      root.classList.remove('v52NetworkTransition');
      root.querySelectorAll<SVGPathElement>('svg.edges > path[data-v52-grouped-base="1"]').forEach((path) => {
        path.style.removeProperty('opacity');
        delete path.dataset.v52GroupedBase;
      });
      root.querySelectorAll<HTMLElement>('.personNode').forEach((node) => {
        node.style.removeProperty('--v52-drag-dx');
        node.style.removeProperty('--v52-drag-dy');
      });
    };
  }, []);

  return <style jsx global>{`
    /* One stable horizontal coordinate system for the node circle and both
       metadata lines. Explicitly remove native button padding, which otherwise
       shifts the apparent text center on mobile WebKit. */
    .productionNetworkCanaryV45 .personNode,
    .productionNetworkCanaryV45 .slotNode{
      padding:0!important;box-sizing:border-box!important;text-align:center!important
    }
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small{
      left:0!important;right:auto!important;width:116px!important;max-width:116px!important;
      margin:0!important;padding:0!important;box-sizing:border-box!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      text-align:center!important;white-space:nowrap!important;direction:ltr!important;unicode-bidi:isolate!important;
      transform:scale(var(--v46-label-scale,1))!important;transform-origin:50% 0!important
    }
    .productionNetworkCanaryV45 .slotNode>b{
      left:0!important;right:auto!important;width:104px!important;max-width:104px!important;
      margin:0!important;padding:0!important;box-sizing:border-box!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      text-align:center!important;white-space:nowrap!important;direction:ltr!important;unicode-bidi:isolate!important;
      transform:scale(var(--v46-label-scale,1))!important;transform-origin:50% 0!important
    }

    /* V52 owns persistent free-position adjustments. V50 may continue to own
       group drops; the two offsets are additive instead of overwriting each other. */
    .productionNetworkCanaryV45 .personNode{
      transform:translate(
        calc(var(--x) + var(--v42-group-dx,0px) + var(--v50-adjust-x,0px) + var(--v52-adjust-x,0px) + var(--v50-drag-dx,0px) + var(--v52-drag-dx,0px) - 50%),
        calc(var(--y) + var(--v42-group-dy,0px) + var(--v50-adjust-y,0px) + var(--v52-adjust-y,0px) + var(--v50-drag-dy,0px) + var(--v52-drag-dy,0px) - 50%)
      )!important
    }
    .productionNetworkCanaryV45 .personNode.v52LongDragging{z-index:94!important;transition:none!important}
    .productionNetworkCanaryV45 .personNode.v52LongDragging .nodeCircle,
    .productionNetworkCanaryV45 .personNode.v52HoldArmed .nodeCircle{
      border-color:rgba(255,211,77,.98)!important;
      box-shadow:0 0 0 4px rgba(244,183,40,.11),0 0 30px rgba(244,183,40,.18)!important
    }

    /* Selection emphasis changes only paint, never the node's horizontal
       transform. This removes the old left-slide caused by competing transforms. */
    .productionNetworkCanaryV45 .personNode.canarySelectedNode .nodeCircle,
    .productionNetworkCanaryV45 .personNode.pressing .nodeCircle{
      transform:translateX(-50%) scale(var(--v46-selected-scale,1.07))!important;
      transform-origin:50% 50%!important;
      transition:border-color 170ms ease,box-shadow 170ms ease!important
    }
    .productionNetworkCanaryV45 .personNode .nodeCircle{
      transform-origin:50% 50%!important
    }

    /* Keep iOS from interpreting a deliberate hold as text selection/callout. */
    .productionNetworkCanaryV45 .personNode,
    .productionNetworkCanaryV45 .personNode *,
    .productionNetworkCanaryV45 .slotNode,
    .productionNetworkCanaryV45 .slotNode *{
      user-select:none!important;-webkit-user-select:none!important;
      -webkit-touch-callout:none!important;-webkit-user-drag:none!important
    }

    /* Compact node details: preserve the action, but stop the card from taking
       over the mobile canvas. */
    .productionNetworkCanaryV45 .profileCard{
      top:9px!important;right:9px!important;width:min(238px,calc(100% - 18px))!important;
      padding:8px!important;border-radius:11px!important;box-shadow:0 10px 28px rgba(0,0,0,.26)!important
    }
    .productionNetworkCanaryV45 .profileCard>div button{width:24px!important;height:24px!important;border-radius:7px!important}
    .productionNetworkCanaryV45 .profileCard code{
      margin-top:5px!important;padding:5px 6px!important;white-space:nowrap!important;
      overflow:hidden!important;text-overflow:ellipsis!important;font-size:.36rem!important
    }
    .productionNetworkCanaryV45 .profileCard p{margin:6px 0!important;font-size:.41rem!important}
    .productionNetworkCanaryV45 .profileCard .viewNetwork{height:30px!important;font-size:.43rem!important}

    .productionNetworkCanaryV45.v52NetworkTransition .stage{pointer-events:none!important}
    .productionNetworkCanaryV45.v52NetworkTransition .scene{transition:transform 720ms cubic-bezier(.18,.82,.2,1)!important}
    .productionNetworkCanaryV45 .personNode.v52NavigationCandidate .nodeCircle{
      border-color:rgba(255,211,77,1)!important;
      box-shadow:0 0 0 5px rgba(244,183,40,.14),0 0 38px rgba(244,183,40,.24)!important
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45.v52NetworkTransition .scene{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV52({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV50 locale={locale} />
    <NetworkV52StabilityController />
  </>;
}
