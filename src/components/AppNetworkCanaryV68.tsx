'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV67 } from './AppNetworkCanaryV67';

const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const DRAG_THRESHOLD_PX = 10;
const FALLBACK_DELAY_MS = 180;

type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
};

type DragIntent = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  moved: boolean;
};

type ActionTarget = {
  kind: 'remove' | 'create' | 'new' | 'existing';
  element: HTMLElement;
};

function readGroups() {
  try {
    const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return [] as StoredGroup[];
    const parsed = JSON.parse(raw) as StoredGroup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as StoredGroup[];
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

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function ownerId(root: HTMLElement, nodeId: string) {
  const scope = currentScope(root);
  return readGroups().find((group) => group.scope === scope && group.members.includes(nodeId))?.id ?? null;
}

function actionTargetAt(root: HTMLElement, clientX: number, clientY: number): ActionTarget | null {
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
}

function membershipConfirmed(root: HTMLElement, nodeId: string, targetGroupId: string) {
  const scope = currentScope(root);
  const groups = readGroups().filter((group) => group.scope === scope);
  const target = groups.find((group) => group.id === targetGroupId);
  if (!target?.members.includes(nodeId)) return false;
  return groups
    .filter((group) => group.id !== targetGroupId)
    .every((group) => !group.members.includes(nodeId));
}

function NetworkExistingGroupDropAssuranceV68() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let drag: DragIntent | null = null;
    let pinchBlocked = false;
    let syntheticPointerId = 880000;
    const touchPointers = new Set<number>();
    const fallbackTimers = new Set<number>();

    const groupEditorOpen = () => Boolean(root.querySelector('.v42GroupPanel input'));
    const editMode = () => stage.classList.contains('editMode');
    const inTransition = () => root.classList.contains('v50NetworkTransition') || root.classList.contains('v52NetworkTransition');

    const dispatchFallbackDrop = (node: HTMLButtonElement, target: HTMLElement) => {
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

    const scheduleFallback = (node: HTMLButtonElement, nodeId: string, target: HTMLElement, targetGroupId: string, scope: string) => {
      const timer = window.setTimeout(() => {
        fallbackTimers.delete(timer);
        if (!mounted || currentScope(root) !== scope || !node.isConnected || !target.isConnected) return;
        if (membershipConfirmed(root, nodeId, targetGroupId)) return;
        dispatchFallbackDrop(node, target);
      }, FALLBACK_DELAY_MS);
      fallbackTimers.add(timer);
    };

    const cancelDrag = () => {
      drag = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;

      if (event.pointerType === 'touch') {
        touchPointers.add(event.pointerId);
        if (touchPointers.size > 1) {
          pinchBlocked = true;
          cancelDrag();
          return;
        }
      }

      if (!event.isTrusted || pinchBlocked || groupEditorOpen() || editMode() || inTransition()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const nodeId = node?.dataset.nodeId;
      if (!circle || !node || !nodeId || !root.contains(node) || node.classList.contains('v42CollapsedMember')) return;

      drag = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pinchBlocked) return;
      const current = drag;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= DRAG_THRESHOLD_PX) {
        current.moved = true;
      }
    };

    const finishPointer = (event: PointerEvent) => {
      const current = drag;
      if (current && current.pointerId === event.pointerId) {
        drag = null;
        if (event.isTrusted && !pinchBlocked && current.moved) {
          const action = actionTargetAt(root, event.clientX, event.clientY);
          if (action?.kind === 'existing') {
            const targetGroupId = action.element.dataset.groupId ?? null;
            const sourceGroupId = ownerId(root, current.nodeId);
            if (targetGroupId && targetGroupId !== sourceGroupId) {
              scheduleFallback(current.node, current.nodeId, action.element, targetGroupId, currentScope(root));
            }
          }
        }
      }

      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) pinchBlocked = false;
      }
    };

    const cancelPointer = (event: PointerEvent) => {
      if (drag?.pointerId === event.pointerId) cancelDrag();
      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) pinchBlocked = false;
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', cancelPointer, true);

    return () => {
      mounted = false;
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      fallbackTimers.forEach((timer) => window.clearTimeout(timer));
      fallbackTimers.clear();
      touchPointers.clear();
      drag = null;
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV68({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV67 locale={locale} />
      <NetworkExistingGroupDropAssuranceV68 />
    </>
  );
}
