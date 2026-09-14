'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV62 } from './AppNetworkCanaryV62';

const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const NODE_POSITION_STORAGE_KEY = 'veinvite:network:node-position-v63';
const DRAG_THRESHOLD_PX = 10;
const VERIFY_TIMEOUT_MS = 1100;
const VERIFIED_FEEDBACK_MS = 850;

type Point = { x: number; y: number };
type PositionStore = Record<string, Point>;
type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
};
type QuickDrag = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  moved: boolean;
  sourceGroupId: string | null;
  baseAdjustment: Point;
};
type ActionTarget = {
  kind: 'remove' | 'create' | 'new' | 'existing';
  element: HTMLElement;
};

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function activeScenarioId(root: HTMLElement) {
  const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
  const map: Record<string, string> = {
    '0명': 'zero', '1명': 'one', '5명': 'five', '30명': 'balanced30',
    '직접 50': 'direct50', '100명': 'hundred', '500명': 'fiveHundred',
  };
  return map[label] ?? (label || 'unknown');
}

function currentScope(root: HTMLElement) {
  const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean);
  return `${activeScenarioId(root)}|${crumbs.join('>') || 'YOU'}`;
}

function compact() {
  return window.innerWidth <= 640;
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function readGroups() {
  return readJson<StoredGroup[]>(GROUP_STORAGE_KEY, []);
}

function ownerOf(root: HTMLElement, nodeId: string) {
  const scope = currentScope(root);
  return readGroups().find((group) => group.scope === scope && group.members.includes(nodeId)) ?? null;
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

function NetworkUnifiedNodeDragV63() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let drag: QuickDrag | null = null;
    let blockedNode: HTMLButtonElement | null = null;
    let pinchBlocked = false;
    let frame = 0;
    let edgeFrame = 0;
    let finalEdgeTimer: number | null = null;
    let feedbackTimer: number | null = null;
    let toastTimer: number | null = null;
    let lastScope = currentScope(root);
    let positionStore = readJson<PositionStore>(NODE_POSITION_STORAGE_KEY, {});

    const touchPointers = new Set<number>();
    const pinchLegacyNodes = new Set<HTMLButtonElement>();
    const verifyTimers = new Set<number>();
    const forcedEdgeIds = new Set<string>();

    const positionKey = (nodeId: string) => `${currentScope(root)}|${compact() ? 'mobile' : 'desktop'}|${nodeId}`;
    const groupEditorOpen = () => Boolean(root.querySelector('.v42GroupPanel input'));
    const editMode = () => stage.classList.contains('editMode');
    const inTransition = () => root.classList.contains('v50NetworkTransition') || root.classList.contains('v52NetworkTransition');

    const setStylePx = (element: HTMLElement, name: string, value: number) => {
      const next = `${value}px`;
      if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
    };

    const nodePoint = (node: HTMLElement): Point => ({
      x: parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v63-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dx')) +
        parsePx(node.style.getPropertyValue('--v52-drag-dx')) +
        parsePx(node.style.getPropertyValue('--v63-drag-x')),
      y: parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v63-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dy')) +
        parsePx(node.style.getPropertyValue('--v52-drag-dy')) +
        parsePx(node.style.getPropertyValue('--v63-drag-y')),
    });

    const syncEdgeForNode = (node: HTMLButtonElement, nodeId: string) => {
      if (!node.isConnected || node.classList.contains('v42CollapsedMember')) return;
      const scope = currentScope(root);
      const group = readGroups().find((item) => item.scope === scope && item.members.includes(nodeId)) ?? null;
      const point = nodePoint(node);
      if (group) {
        const hub = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(group.id)}"]`);
        const path = root.querySelector<SVGPathElement>(`.v57Edge[data-edge-key="${CSS.escape(`group:${group.id}:member:${nodeId}`)}"]`);
        if (hub && path) {
          const from = {
            x: parsePx(hub.style.getPropertyValue('--gx')),
            y: parsePx(hub.style.getPropertyValue('--gy')),
          };
          path.setAttribute('d', curveBetween(from, point));
          return;
        }
      }
      root.querySelector<SVGPathElement>(`.v57Edge[data-edge-key="${CSS.escape(`person:${nodeId}`)}"]`)
        ?.setAttribute('d', curveFromCenter(point));
    };

    const syncV63Edges = () => {
      edgeFrame = 0;
      if (!mounted) return;
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id) return;
        const active = forcedEdgeIds.has(id) ||
          Math.abs(parsePx(node.style.getPropertyValue('--v63-adjust-x'))) > .001 ||
          Math.abs(parsePx(node.style.getPropertyValue('--v63-adjust-y'))) > .001 ||
          Math.abs(parsePx(node.style.getPropertyValue('--v63-drag-x'))) > .001 ||
          Math.abs(parsePx(node.style.getPropertyValue('--v63-drag-y'))) > .001;
        if (active) syncEdgeForNode(node, id);
      });
      forcedEdgeIds.clear();
    };

    const scheduleEdgeSync = (nodeId?: string) => {
      if (nodeId) forcedEdgeIds.add(nodeId);
      if (edgeFrame || !mounted) return;
      edgeFrame = window.requestAnimationFrame(syncV63Edges);
    };

    const scheduleFinalEdgeSync = (nodeId: string) => {
      scheduleEdgeSync(nodeId);
      if (finalEdgeTimer !== null) window.clearTimeout(finalEdgeTimer);
      finalEdgeTimer = window.setTimeout(() => {
        finalEdgeTimer = null;
        scheduleEdgeSync(nodeId);
      }, 140);
    };

    const applyStoredPositions = () => {
      frame = 0;
      if (!mounted) return;
      const scopeNow = currentScope(root);
      if (scopeNow !== lastScope) lastScope = scopeNow;
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id) return;
        const point = positionStore[positionKey(id)] ?? { x: 0, y: 0 };
        setStylePx(node, '--v63-adjust-x', point.x);
        setStylePx(node, '--v63-adjust-y', point.y);
        if (Math.abs(point.x) > .001 || Math.abs(point.y) > .001) forcedEdgeIds.add(id);
      });
      scheduleEdgeSync();
    };

    const scheduleApply = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(applyStoredPositions);
    };

    const showToast = (message: string, error = false) => {
      root.querySelector('.v63GestureToast')?.remove();
      const toast = document.createElement('div');
      toast.className = `v63GestureToast${error ? ' error' : ''}`;
      toast.textContent = message;
      stage.appendChild(toast);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastTimer = null;
        toast.remove();
      }, error ? 2200 : 1200);
    };

    const clearLegacyDrag = (node: HTMLElement) => {
      node.style.removeProperty('--v50-drag-dx');
      node.style.removeProperty('--v50-drag-dy');
      node.classList.remove('v61DirectGroupDragging');
    };

    const clearQuickDrag = (node: HTMLElement) => {
      node.style.removeProperty('--v63-drag-x');
      node.style.removeProperty('--v63-drag-y');
      node.classList.remove('v63DirectDragging');
      clearLegacyDrag(node);
    };

    const yieldToHold = (current: QuickDrag) => {
      current.node.style.removeProperty('--v63-drag-x');
      current.node.style.removeProperty('--v63-drag-y');
      current.node.classList.remove('v63DirectDragging');
      clearLegacyDrag(current.node);
      drag = null;
      scheduleFinalEdgeSync(current.nodeId);
    };

    const savePosition = (current: QuickDrag, clientX: number, clientY: number) => {
      const zoom = readZoom(root);
      const dx = (clientX - current.startX) / zoom;
      const dy = (clientY - current.startY) / zoom;
      const key = positionKey(current.nodeId);
      const previous = positionStore[key];
      const next = {
        x: current.baseAdjustment.x + dx,
        y: current.baseAdjustment.y + dy,
      };
      positionStore[key] = next;
      if (!writeJson(NODE_POSITION_STORAGE_KEY, positionStore)) {
        if (previous) positionStore[key] = previous;
        else delete positionStore[key];
        setStylePx(current.node, '--v63-adjust-x', current.baseAdjustment.x);
        setStylePx(current.node, '--v63-adjust-y', current.baseAdjustment.y);
        clearQuickDrag(current.node);
        showToast('Couldn’t save this position.', true);
        scheduleFinalEdgeSync(current.nodeId);
        return;
      }
      setStylePx(current.node, '--v63-adjust-x', next.x);
      setStylePx(current.node, '--v63-adjust-y', next.y);
      clearQuickDrag(current.node);
      scheduleFinalEdgeSync(current.nodeId);
    };

    const clearStoredPosition = (nodeId: string) => {
      const key = positionKey(nodeId);
      if (!(key in positionStore)) return;
      const previous = positionStore[key];
      delete positionStore[key];
      if (!writeJson(NODE_POSITION_STORAGE_KEY, positionStore)) {
        positionStore[key] = previous;
        return;
      }
      const node = root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(nodeId)}"]`);
      if (!node) return;
      node.classList.add('v63TransferSettling');
      setStylePx(node, '--v63-adjust-x', 0);
      setStylePx(node, '--v63-adjust-y', 0);
      scheduleFinalEdgeSync(nodeId);
      window.setTimeout(() => node.classList.remove('v63TransferSettling'), 380);
    };

    const actionTargetAt = (clientX: number, clientY: number): ActionTarget | null => {
      const zoom = readZoom(root);
      const hubPad = Math.min(30, Math.max(12, 15 / Math.max(.5, zoom)));
      const candidates: Array<{ selector: string; kind: ActionTarget['kind']; pad: number }> = [
        { selector: '.v42RemoveZone', kind: 'remove', pad: 5 },
        { selector: '.v44CreateDropMore', kind: 'create', pad: 7 },
        { selector: '.v44NewGroupDrop', kind: 'new', pad: 7 },
        { selector: '.v42GroupRow[data-v42-group-drop]', kind: 'existing', pad: 6 },
        { selector: '.v42GroupHub[data-v42-group-drop]', kind: 'existing', pad: hubPad },
      ];
      for (const candidate of candidates) {
        for (const element of Array.from(root.querySelectorAll<HTMLElement>(candidate.selector))) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (
            clientX >= rect.left - candidate.pad && clientX <= rect.right + candidate.pad &&
            clientY >= rect.top - candidate.pad && clientY <= rect.bottom + candidate.pad
          ) return { kind: candidate.kind, element };
        }
      }
      return null;
    };

    const stripLegacyAccepted = () => {
      root.querySelectorAll<HTMLElement>('.v61GroupAccepted').forEach((element) => {
        element.classList.remove('v61GroupAccepted');
        delete element.dataset.v61AcceptedLabel;
      });
    };

    const flashVerified = (groupId: string, moved: boolean) => {
      stripLegacyAccepted();
      const target = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(groupId)}"]`) ??
        root.querySelector<HTMLElement>(`.v42GroupRow[data-group-id="${CSS.escape(groupId)}"]`);
      if (!target) return;
      target.classList.add('v63VerifiedTransfer');
      target.dataset.v63VerifiedLabel = moved ? '✓ Moved' : '✓ Added';
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        feedbackTimer = null;
        target.classList.remove('v63VerifiedTransfer');
        delete target.dataset.v63VerifiedLabel;
      }, VERIFIED_FEEDBACK_MS);
    };

    const verifyTransfer = (nodeId: string, sourceGroupId: string | null, targetGroupId: string) => {
      const scope = currentScope(root);
      const startedAt = performance.now();
      const check = () => {
        if (!mounted || currentScope(root) !== scope) return;
        const groups = readGroups().filter((group) => group.scope === scope);
        const target = groups.find((group) => group.id === targetGroupId);
        const targetOwns = Boolean(target?.members.includes(nodeId));
        const noOtherOwner = groups
          .filter((group) => group.id !== targetGroupId)
          .every((group) => !group.members.includes(nodeId));
        if (targetOwns && noOtherOwner) {
          clearStoredPosition(nodeId);
          flashVerified(targetGroupId, Boolean(sourceGroupId));
          return;
        }
        if (performance.now() - startedAt >= VERIFY_TIMEOUT_MS) {
          stripLegacyAccepted();
          showToast('Couldn’t confirm the group move.', true);
          scheduleFinalEdgeSync(nodeId);
          return;
        }
        const timer = window.setTimeout(() => {
          verifyTimers.delete(timer);
          check();
        }, 40);
        verifyTimers.add(timer);
      };
      check();
    };

    const suspendDropTargets = () => {
      root.querySelectorAll<HTMLElement>('[data-v42-group-drop]').forEach((element) => {
        element.dataset.v63DropSuspended = '1';
        element.removeAttribute('data-v42-group-drop');
      });
      root.querySelectorAll<HTMLElement>('.v60DropPreview,.v61DropPreview').forEach((element) => {
        element.classList.remove('v60DropPreview', 'v61DropPreview');
        delete element.dataset.v61DropLabel;
      });
    };

    const restoreDropTargets = () => {
      root.querySelectorAll<HTMLElement>('[data-v63-drop-suspended="1"]').forEach((element) => {
        element.setAttribute('data-v42-group-drop', 'true');
        delete element.dataset.v63DropSuspended;
      });
    };

    const clearPinchLegacyStyles = () => {
      pinchLegacyNodes.forEach((node) => {
        if (!node.isConnected) return;
        clearLegacyDrag(node);
        node.style.removeProperty('--v63-drag-x');
        node.style.removeProperty('--v63-drag-y');
        node.classList.remove('v63DirectDragging');
      });
    };

    const beginPinchBlock = () => {
      pinchBlocked = true;
      blockedNode = drag?.node ?? blockedNode;
      if (blockedNode) pinchLegacyNodes.add(blockedNode);
      if (drag) {
        clearQuickDrag(drag.node);
        scheduleFinalEdgeSync(drag.nodeId);
      }
      drag = null;
      root.classList.add('v63PinchGuard');
      clearPinchLegacyStyles();
      suspendDropTargets();
    };

    const endPinchBlock = () => {
      if (!pinchBlocked) return;
      pinchBlocked = false;
      root.classList.remove('v63PinchGuard');
      clearPinchLegacyStyles();
      restoreDropTargets();
      pinchLegacyNodes.clear();
      blockedNode = null;
    };

    const resetCurrentPositions = () => {
      const prefix = `${currentScope(root)}|${compact() ? 'mobile' : 'desktop'}|`;
      let changed = false;
      Object.keys(positionStore).forEach((key) => {
        if (!key.startsWith(prefix)) return;
        delete positionStore[key];
        changed = true;
      });
      if (changed && !writeJson(NODE_POSITION_STORAGE_KEY, positionStore)) {
        showToast('Couldn’t reset saved positions.', true);
        positionStore = readJson<PositionStore>(NODE_POSITION_STORAGE_KEY, {});
      }
      root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (id) forcedEdgeIds.add(id);
        setStylePx(node, '--v63-adjust-x', 0);
        setStylePx(node, '--v63-adjust-y', 0);
        node.style.removeProperty('--v63-drag-x');
        node.style.removeProperty('--v63-drag-y');
      });
      scheduleEdgeSync();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;

      if (event.pointerType === 'touch') {
        touchPointers.add(event.pointerId);
        if (node) pinchLegacyNodes.add(node);
        if (touchPointers.size > 1) {
          beginPinchBlock();
          return;
        }
      }

      if (!event.isTrusted || pinchBlocked || groupEditorOpen() || editMode() || inTransition()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const nodeId = node?.dataset.nodeId;
      if (!circle || !node || !nodeId || !root.contains(node) || node.classList.contains('v42CollapsedMember')) return;

      const baseAdjustment = positionStore[positionKey(nodeId)] ?? {
        x: parsePx(node.style.getPropertyValue('--v63-adjust-x')),
        y: parsePx(node.style.getPropertyValue('--v63-adjust-y')),
      };
      drag = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        sourceGroupId: ownerOf(root, nodeId)?.id ?? null,
        baseAdjustment,
      };
      if (event.pointerType !== 'mouse' && event.cancelable) event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pinchBlocked) {
        clearPinchLegacyStyles();
        if (blockedNode) scheduleEdgeSync(blockedNode.dataset.nodeId);
        return;
      }
      const current = drag;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;

      if (current.node.classList.contains('v52HoldArmed') || current.node.classList.contains('v52LongDragging')) {
        yieldToHold(current);
        return;
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      current.moved = true;
      const zoom = readZoom(root);
      setStylePx(current.node, '--v63-drag-x', dx / zoom);
      setStylePx(current.node, '--v63-drag-y', dy / zoom);
      current.node.classList.add('v63DirectDragging');
      clearLegacyDrag(current.node);
      scheduleEdgeSync(current.nodeId);
    };

    const finishPointer = (event: PointerEvent) => {
      if (pinchBlocked) {
        if (event.pointerType === 'touch') {
          touchPointers.delete(event.pointerId);
          if (touchPointers.size === 0) endPinchBlock();
        }
        return;
      }

      const current = drag;
      if (current && current.pointerId === event.pointerId) {
        drag = null;
        if (!current.moved) {
          clearQuickDrag(current.node);
        } else {
          const action = actionTargetAt(event.clientX, event.clientY);
          if (action) {
            clearQuickDrag(current.node);
            if (action.kind === 'existing') {
              stripLegacyAccepted();
              const targetGroupId = action.element.dataset.groupId ?? null;
              if (targetGroupId && targetGroupId !== current.sourceGroupId) {
                verifyTransfer(current.nodeId, current.sourceGroupId, targetGroupId);
              } else {
                scheduleFinalEdgeSync(current.nodeId);
              }
            } else {
              scheduleFinalEdgeSync(current.nodeId);
            }
          } else {
            savePosition(current, event.clientX, event.clientY);
          }
        }
      }

      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) endPinchBlock();
      }
    };

    const cancelPointer = (event: PointerEvent) => {
      const current = drag;
      if (current && current.pointerId === event.pointerId) {
        clearQuickDrag(current.node);
        scheduleFinalEdgeSync(current.nodeId);
        drag = null;
      }
      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) endPinchBlock();
      }
    };

    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.navActions button') : null;
      if (!button || !button.textContent?.includes('Reset')) return;
      window.setTimeout(resetCurrentPositions, 0);
    };

    const observer = new MutationObserver((mutations) => {
      let needsApply = false;
      let needsEdgeSync = false;
      for (const mutation of mutations) {
        if (pinchBlocked && mutation.type === 'attributes') {
          const element = mutation.target instanceof HTMLElement ? mutation.target : null;
          if (element?.hasAttribute('data-v42-group-drop')) suspendDropTargets();
        }
        if (mutation.type === 'attributes') {
          const element = mutation.target instanceof Element ? mutation.target : null;
          if (!element) continue;
          if (mutation.attributeName === 'style' && element.matches('.v42GroupHub[data-group-id]')) needsEdgeSync = true;
          if (mutation.attributeName === 'class' && element.matches('.personNode[data-node-id],.v42GroupHub[data-group-id],.stage')) {
            needsApply = true;
            needsEdgeSync = true;
          }
          continue;
        }
        if (mutation.type === 'characterData') {
          needsApply = true;
          needsEdgeSync = true;
          continue;
        }
        const selector = '.personNode[data-node-id],.v42GroupHub[data-group-id],.crumbs,.scenarioBar';
        const relevant = [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector))));
        if (relevant) {
          needsApply = true;
          needsEdgeSync = true;
        }
      }
      if (needsApply) scheduleApply();
      if (needsEdgeSync) scheduleEdgeSync();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-v42-group-drop'],
    });

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', cancelPointer, true);
    root.addEventListener('click', onClick, true);
    window.addEventListener('resize', scheduleApply);
    scheduleApply();

    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      root.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', scheduleApply);
      if (frame) window.cancelAnimationFrame(frame);
      if (edgeFrame) window.cancelAnimationFrame(edgeFrame);
      if (finalEdgeTimer !== null) window.clearTimeout(finalEdgeTimer);
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      verifyTimers.forEach((timer) => window.clearTimeout(timer));
      verifyTimers.clear();
      drag?.node && clearQuickDrag(drag.node);
      endPinchBlock();
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV63({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV62 locale={locale} />
      <NetworkUnifiedNodeDragV63 />
      <style jsx global>{`
        .productionNetworkCanaryV45 .personNode {
          transform: translate(
            calc(var(--x) + var(--v42-group-dx, 0px) + var(--v50-adjust-x, 0px) + var(--v52-adjust-x, 0px) + var(--v63-adjust-x, 0px) + var(--v50-drag-dx, 0px) + var(--v52-drag-dx, 0px) + var(--v63-drag-x, 0px) - 50%),
            calc(var(--y) + var(--v42-group-dy, 0px) + var(--v50-adjust-y, 0px) + var(--v52-adjust-y, 0px) + var(--v63-adjust-y, 0px) + var(--v50-drag-dy, 0px) + var(--v52-drag-dy, 0px) + var(--v63-drag-y, 0px) - 26px)
          ) !important;
        }

        .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42GroupedMember {
          transform: translate(
            calc(var(--x) + var(--v42-group-dx, 0px) + var(--v50-adjust-x, 0px) + var(--v52-adjust-x, 0px) + var(--v63-adjust-x, 0px) + var(--v50-drag-dx, 0px) + var(--v52-drag-dx, 0px) + var(--v63-drag-x, 0px) - 50%),
            calc(var(--y) + var(--v42-group-dy, 0px) + var(--v50-adjust-y, 0px) + var(--v52-adjust-y, 0px) + var(--v63-adjust-y, 0px) + var(--v50-drag-dy, 0px) + var(--v52-drag-dy, 0px) + var(--v63-drag-y, 0px) - 26px)
          ) !important;
        }

        .productionNetworkCanaryV45 .personNode.v63DirectDragging {
          transition: none !important;
          z-index: 26 !important;
        }

        .productionNetworkCanaryV45 .personNode.v63TransferSettling {
          transition: transform 280ms cubic-bezier(.2,.78,.2,1), opacity 170ms ease !important;
        }

        .productionNetworkCanaryV45.v63PinchGuard .v60DropPreview,
        .productionNetworkCanaryV45.v63PinchGuard .v61DropPreview {
          box-shadow: none !important;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer,
        .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer {
          border-color: rgba(255,207,71,.95) !important;
          box-shadow: 0 0 0 4px rgba(244,183,40,.13), 0 0 34px rgba(244,183,40,.2) !important;
          animation: v63VerifiedPulse 620ms ease-out both;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer {
          position: absolute !important;
        }

        .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer {
          position: relative !important;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer::after,
        .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer::after {
          content: attr(data-v63-verified-label);
          position: absolute;
          top: -9px;
          right: -5px;
          z-index: 5;
          padding: 3px 6px;
          border: 1px solid rgba(244,183,40,.36);
          border-radius: 999px;
          background: rgba(18,16,9,.98);
          color: #e6bf58;
          font-size: .31rem;
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
        }

        .productionNetworkCanaryV45 .v63GestureToast {
          position: absolute;
          z-index: 92;
          left: 50%;
          top: 12px;
          transform: translateX(-50%);
          max-width: calc(100% - 24px);
          padding: 7px 10px;
          border: 1px solid rgba(244,183,40,.24);
          border-radius: 999px;
          background: rgba(18,16,9,.97);
          color: #e1bc55;
          font-size: .4rem;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
        }

        .productionNetworkCanaryV45 .v63GestureToast.error {
          border-color: rgba(242,126,91,.4);
          background: rgba(40,17,12,.97);
          color: #e69a84;
        }

        @keyframes v63VerifiedPulse {
          0% { filter: brightness(1); }
          38% { filter: brightness(1.18); }
          100% { filter: brightness(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .personNode.v63TransferSettling,
          .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer,
          .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
