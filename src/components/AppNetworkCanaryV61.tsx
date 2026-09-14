'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV60 } from './AppNetworkCanaryV60';

const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const V50_ADJUST_STORAGE_KEY = 'veinvite:network:visual-adjust-v1';
const GROUP_POSITION_STORAGE_KEY = 'veinvite:network:group-position-v61';
const DRAG_THRESHOLD_PX = 10;
const GROUP_DRAG_THRESHOLD_PX = 6;
const TRANSFER_MS = 280;

type Point = { x: number; y: number };
type DevicePoints = { desktop: Point; mobile: Point };
type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  positions?: DevicePoints;
  memberOffsets?: DevicePoints;
  offsets?: DevicePoints;
};
type AdjustmentStore = Record<string, Point>;
type GroupPositionOverride = { baseX: number; baseY: number; x: number; y: number };
type GroupPositionStore = Record<string, GroupPositionOverride>;
type TransferDrag = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  moved: boolean;
  sourceGroupId: string | null;
  priorV50Adjustment: Point;
};
type GroupDrag = {
  pointerId: number;
  hub: HTMLButtonElement;
  groupId: string;
  startClientX: number;
  startClientY: number;
  startPoint: Point;
  basePoint: Point;
  moved: boolean;
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
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* visual state is optional */ }
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

function existingGroupTargetAt(root: HTMLElement, clientX: number, clientY: number) {
  const zoom = readZoom(root);
  const hubPad = Math.min(30, Math.max(12, 15 / Math.max(.5, zoom)));
  const candidates: Array<{ selector: string; pad: number }> = [
    { selector: '.v42GroupRow[data-v42-group-drop]', pad: 6 },
    { selector: '.v42GroupHub[data-v42-group-drop]', pad: hubPad },
  ];
  for (const candidate of candidates) {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(candidate.selector))) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (
        clientX >= rect.left - candidate.pad && clientX <= rect.right + candidate.pad &&
        clientY >= rect.top - candidate.pad && clientY <= rect.bottom + candidate.pad
      ) return element;
    }
  }
  return null;
}

function relaxedCenterCollision(point: Point, fallback: Point): Point {
  // The YOU circle is 74px. Protect only the real overlap area instead of the
  // old 176/238px circular wall. The ellipse accounts for the wider group card.
  const radiusX = compact() ? 124 : 132;
  const radiusY = compact() ? 72 : 78;
  const normalized = (point.x * point.x) / (radiusX * radiusX) + (point.y * point.y) / (radiusY * radiusY);
  if (normalized >= 1) return point;

  const fallbackAngle = Math.atan2(fallback.y || -1, fallback.x || .001);
  const angle = Math.hypot(point.x, point.y) > 4 ? Math.atan2(point.y, point.x) : fallbackAngle;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const distance = 1 / Math.sqrt((cos * cos) / (radiusX * radiusX) + (sin * sin) / (radiusY * radiusY));
  return { x: cos * distance, y: sin * distance };
}

function NetworkGroupTransferV61() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let drag: TransferDrag | null = null;
    let preview: HTMLElement | null = null;
    let feedbackTimer: number | null = null;
    let syntheticPointerId = 610000;
    let restoreTimer: number | null = null;

    const groupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel');
    const groupEditorOpen = () => Boolean(groupPanel()?.querySelector('input'));
    const hasGroupHub = () => Boolean(root.querySelector('.v42GroupHub[data-v42-group-drop]'));
    const editMode = () => stage.classList.contains('editMode');
    const inTransition = () => root.classList.contains('v50NetworkTransition') || root.classList.contains('v52NetworkTransition');

    const adjustmentKey = (nodeId: string) => `${currentScope(root)}|${compact() ? 'mobile' : 'desktop'}|${nodeId}`;

    const clearPreview = () => {
      if (!preview) return;
      preview.classList.remove('v61DropPreview');
      delete preview.dataset.v61DropLabel;
      preview = null;
    };

    const setPreview = (target: HTMLElement | null, sourceGroupId: string | null) => {
      if (preview === target) return;
      clearPreview();
      preview = target;
      if (!preview) return;
      const targetGroupId = preview.dataset.groupId ?? null;
      const targetName = preview.querySelector<HTMLElement>('b')?.textContent?.trim() || 'group';
      const label = sourceGroupId && sourceGroupId === targetGroupId
        ? `Already in ${targetName}`
        : sourceGroupId
          ? `Release to move to ${targetName}`
          : `Release to add to ${targetName}`;
      preview.dataset.v61DropLabel = label;
      preview.classList.add('v61DropPreview');
    };

    const flashAccepted = (target: HTMLElement, moved: boolean) => {
      target.classList.add('v61GroupAccepted');
      target.dataset.v61AcceptedLabel = moved ? '✓ Moved' : '✓ Added';
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        feedbackTimer = null;
        target.classList.remove('v61GroupAccepted');
        delete target.dataset.v61AcceptedLabel;
      }, 820);
    };

    const clearDirectDragStyle = (node: HTMLElement) => {
      node.style.removeProperty('--v50-drag-dx');
      node.style.removeProperty('--v50-drag-dy');
      node.classList.remove('v61DirectGroupDragging');
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

    const restoreV50Adjustment = (node: HTMLButtonElement, nodeId: string, prior: Point) => {
      const key = adjustmentKey(nodeId);
      const store = readJson<AdjustmentStore>(V50_ADJUST_STORAGE_KEY, {});
      if (Math.abs(prior.x) < .001 && Math.abs(prior.y) < .001) delete store[key];
      else store[key] = prior;
      writeJson(V50_ADJUST_STORAGE_KEY, store);
      node.style.setProperty('--v50-adjust-x', `${prior.x}px`);
      node.style.setProperty('--v50-adjust-y', `${prior.y}px`);
    };

    const cancelTransfer = () => {
      if (drag) clearDirectDragStyle(drag.node);
      drag = null;
      clearPreview();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted || groupEditorOpen() || editMode() || inTransition() || !hasGroupHub()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      const nodeId = node?.dataset.nodeId;
      if (!circle || !node || !nodeId || !root.contains(node) || node.classList.contains('v42CollapsedMember')) return;

      const key = adjustmentKey(nodeId);
      const store = readJson<AdjustmentStore>(V50_ADJUST_STORAGE_KEY, {});
      const prior = store[key] ?? {
        x: parsePx(node.style.getPropertyValue('--v50-adjust-x')),
        y: parsePx(node.style.getPropertyValue('--v50-adjust-y')),
      };
      drag = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        sourceGroupId: ownerOf(root, nodeId)?.id ?? null,
        priorV50Adjustment: prior,
      };
      clearPreview();
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = drag;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;

      // 0.5s hold remains the free-position gesture from V52. A quick drag is
      // reserved for group transfer, so the two interactions never compete.
      if (current.node.classList.contains('v52HoldArmed') || current.node.classList.contains('v52LongDragging')) {
        cancelTransfer();
        return;
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      current.moved = true;

      const panelOpen = Boolean(groupPanel());
      if (!panelOpen) {
        const zoom = readZoom(root);
        current.node.style.setProperty('--v50-drag-dx', `${dx / zoom}px`);
        current.node.style.setProperty('--v50-drag-dy', `${dy / zoom}px`);
        current.node.classList.add('v61DirectGroupDragging');
      }
      setPreview(existingGroupTargetAt(root, event.clientX, event.clientY), current.sourceGroupId);
    };

    const finishPointer = (event: PointerEvent) => {
      const current = drag;
      if (!current || current.pointerId !== event.pointerId) return;
      const target = current.moved ? existingGroupTargetAt(root, event.clientX, event.clientY) : null;
      const targetGroupId = target?.dataset.groupId ?? null;
      const panelOpen = Boolean(groupPanel());
      drag = null;
      clearPreview();

      if (!current.moved || !target || !targetGroupId) {
        if (!panelOpen) clearDirectDragStyle(current.node);
        return;
      }

      const changedGroup = current.sourceGroupId !== targetGroupId;
      if (changedGroup) current.node.classList.add('v61GroupTransfer');

      // With the Groups panel open V50 already performs the synthetic drop.
      // With it closed, V61 supplies the same V42-compatible synthetic gesture.
      if (!panelOpen) {
        dispatchSyntheticDrop(current.node, target);
        window.requestAnimationFrame(() => {
          if (current.node.isConnected) clearDirectDragStyle(current.node);
        });
      } else {
        clearDirectDragStyle(current.node);
      }

      if (changedGroup) {
        flashAccepted(target, Boolean(current.sourceGroupId));
        if (panelOpen) {
          if (restoreTimer !== null) window.clearTimeout(restoreTimer);
          restoreTimer = window.setTimeout(() => {
            restoreTimer = null;
            if (current.node.isConnected) restoreV50Adjustment(current.node, current.nodeId, current.priorV50Adjustment);
          }, 210);
        }
        window.setTimeout(() => current.node.classList.remove('v61GroupTransfer'), TRANSFER_MS + 120);
      }
    };

    const cancelPointer = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      cancelTransfer();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', cancelPointer, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      cancelTransfer();
    };
  }, []);

  return null;
}

function NetworkGroupPositionV61() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let frame = 0;
    let drag: GroupDrag | null = null;
    let syntheticPointerId = 710000;
    let store = readJson<GroupPositionStore>(GROUP_POSITION_STORAGE_KEY, {});

    const positionKey = (groupId: string) => `${currentScope(root)}@@${compact() ? 'mobile' : 'desktop'}@@${groupId}`;
    const prefix = () => `${currentScope(root)}@@${compact() ? 'mobile' : 'desktop'}@@`;
    const groupEditorOpen = () => Boolean(root.querySelector('.v42GroupPanel input'));
    const baseOffset = (group: StoredGroup) => {
      const points = group.memberOffsets ?? group.offsets ?? { desktop: { x: 0, y: 0 }, mobile: { x: 0, y: 0 } };
      return compact() ? points.mobile : points.desktop;
    };

    const setStylePx = (element: HTMLElement, name: string, value: number) => {
      const next = `${value}px`;
      if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
    };

    const applyPosition = (groupId: string, entry: GroupPositionOverride) => {
      const hub = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(groupId)}"]`);
      if (!hub) return;
      setStylePx(hub, '--gx', entry.x);
      setStylePx(hub, '--gy', entry.y);

      const group = readGroups().find((item) => item.id === groupId && item.scope === currentScope(root));
      if (!group) return;
      const offset = baseOffset(group);
      const dx = entry.x - entry.baseX;
      const dy = entry.y - entry.baseY;
      group.members.forEach((memberId) => {
        const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(memberId)}"]`);
        if (!node) return;
        setStylePx(node, '--v42-group-dx', offset.x + dx);
        setStylePx(node, '--v42-group-dy', offset.y + dy);
      });
    };

    const applyAll = () => {
      frame = 0;
      if (!mounted) return;
      const currentPrefix = prefix();
      Object.entries(store).forEach(([key, entry]) => {
        if (!key.startsWith(currentPrefix)) return;
        const groupId = key.slice(currentPrefix.length);
        if (drag?.groupId === groupId) return;
        applyPosition(groupId, entry);
      });
    };

    const schedule = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(applyAll);
    };

    const saveStore = () => writeJson(GROUP_POSITION_STORAGE_KEY, store);

    const replayHubTap = (hub: HTMLButtonElement, clientX: number, clientY: number) => {
      syntheticPointerId += 1;
      const pointerId = syntheticPointerId;
      const common = { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse' } as const;
      hub.dispatchEvent(new PointerEvent('pointerdown', { ...common, button: 0, clientX, clientY }));
      hub.dispatchEvent(new PointerEvent('pointerup', { ...common, button: 0, clientX, clientY }));
    };

    const clearCurrentOverrides = () => {
      const currentPrefix = prefix();
      let changed = false;
      Object.entries(store).forEach(([key, entry]) => {
        if (!key.startsWith(currentPrefix)) return;
        const groupId = key.slice(currentPrefix.length);
        const hub = root.querySelector<HTMLElement>(`.v42GroupHub[data-group-id="${CSS.escape(groupId)}"]`);
        if (hub) {
          setStylePx(hub, '--gx', entry.baseX);
          setStylePx(hub, '--gy', entry.baseY);
        }
        const group = readGroups().find((item) => item.id === groupId && item.scope === currentScope(root));
        if (group) {
          const offset = baseOffset(group);
          group.members.forEach((memberId) => {
            const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(memberId)}"]`);
            if (!node) return;
            setStylePx(node, '--v42-group-dx', offset.x);
            setStylePx(node, '--v42-group-dy', offset.y);
          });
        }
        delete store[key];
        changed = true;
      });
      if (changed) saveStore();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted || groupEditorOpen()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const hub = target?.closest<HTMLButtonElement>('.v42GroupHub[data-group-id]') ?? null;
      const groupId = hub?.dataset.groupId;
      if (!hub || !groupId || !root.contains(hub)) return;

      event.preventDefault();
      event.stopPropagation();
      const key = positionKey(groupId);
      const existing = store[key];
      const currentPoint = existing
        ? { x: existing.x, y: existing.y }
        : { x: parsePx(hub.style.getPropertyValue('--gx')), y: parsePx(hub.style.getPropertyValue('--gy')) };
      const basePoint = existing
        ? { x: existing.baseX, y: existing.baseY }
        : { ...currentPoint };
      drag = {
        pointerId: event.pointerId,
        hub,
        groupId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: currentPoint,
        basePoint,
        moved: false,
      };
      try { hub.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = drag;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - current.startClientX;
      const dy = event.clientY - current.startClientY;
      if (!current.moved && Math.hypot(dx, dy) < GROUP_DRAG_THRESHOLD_PX) return;
      current.moved = true;
      current.hub.classList.add('v61GroupDragging');
      const zoom = readZoom(root);
      const desired = relaxedCenterCollision(
        { x: current.startPoint.x + dx / zoom, y: current.startPoint.y + dy / zoom },
        current.startPoint,
      );
      applyPosition(current.groupId, {
        baseX: current.basePoint.x,
        baseY: current.basePoint.y,
        x: desired.x,
        y: desired.y,
      });
    };

    const finishPointer = (event: PointerEvent) => {
      const current = drag;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      try { current.hub.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      current.hub.classList.remove('v61GroupDragging');
      drag = null;

      if (!current.moved) {
        window.setTimeout(() => {
          if (current.hub.isConnected) replayHubTap(current.hub, event.clientX, event.clientY);
        }, 0);
        return;
      }

      const x = parsePx(current.hub.style.getPropertyValue('--gx'));
      const y = parsePx(current.hub.style.getPropertyValue('--gy'));
      store[positionKey(current.groupId)] = {
        baseX: current.basePoint.x,
        baseY: current.basePoint.y,
        x,
        y,
      };
      saveStore();
      schedule();
    };

    const cancelPointer = (event: PointerEvent) => {
      const current = drag;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      try { current.hub.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      current.hub.classList.remove('v61GroupDragging');
      applyPosition(current.groupId, {
        baseX: current.basePoint.x,
        baseY: current.basePoint.y,
        x: current.startPoint.x,
        y: current.startPoint.y,
      });
      drag = null;
      schedule();
    };

    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.navActions button') : null;
      if (!button || !button.textContent?.includes('Reset')) return;
      window.setTimeout(clearCurrentOverrides, 0);
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          const element = mutation.target instanceof Element ? mutation.target : null;
          return Boolean(element?.matches('.v42GroupHub[data-group-id],.personNode[data-node-id],.stage'));
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
          if (!(node instanceof Element)) return false;
          const selector = '.v42GroupHub[data-group-id],.personNode[data-node-id]';
          return node.matches(selector) || Boolean(node.querySelector(selector));
        });
      });
      if (relevant) schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', cancelPointer, true);
    root.addEventListener('click', onClick, true);
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      root.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      drag?.hub.classList.remove('v61GroupDragging');
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV61({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV60 locale={locale} />
      <NetworkGroupTransferV61 />
      <NetworkGroupPositionV61 />
      <style jsx global>{`
        .productionNetworkCanaryV45 .v42GroupHub.v61DropPreview,
        .productionNetworkCanaryV45 .v42GroupRow.v61DropPreview {
          border-color: rgba(255,207,71,1) !important;
          background: rgba(42,33,10,.98) !important;
          box-shadow: 0 0 0 5px rgba(244,183,40,.14), 0 0 36px rgba(244,183,40,.22) !important;
          position: relative;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v61DropPreview::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61DropPreview::after {
          content: attr(data-v61-drop-label);
          position: absolute;
          top: -9px;
          right: -5px;
          z-index: 3;
          max-width: 156px;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: 3px 6px;
          border: 1px solid rgba(244,183,40,.38);
          border-radius: 999px;
          background: rgba(18,16,9,.98);
          color: #e6bf58;
          font-size: .31rem;
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted,
        .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted {
          border-color: rgba(255,207,71,.95) !important;
          box-shadow: 0 0 0 4px rgba(244,183,40,.13), 0 0 34px rgba(244,183,40,.2) !important;
          animation: v61GroupAcceptedPulse 620ms ease-out both;
          position: relative;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted::after {
          content: attr(data-v61-accepted-label);
          position: absolute;
          top: -9px;
          right: -5px;
          z-index: 4;
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

        .productionNetworkCanaryV45 .personNode.v61DirectGroupDragging {
          transition: none !important;
          z-index: 24 !important;
        }

        .productionNetworkCanaryV45 .personNode.v61GroupTransfer {
          transition: transform ${TRANSFER_MS}ms cubic-bezier(.2,.78,.2,1), opacity 170ms ease !important;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v61GroupDragging {
          cursor: grabbing !important;
          transition: none !important;
          box-shadow: 0 10px 34px rgba(0,0,0,.3), 0 0 26px rgba(244,183,40,.09) !important;
        }

        @keyframes v61GroupAcceptedPulse {
          0% { filter: brightness(1); }
          38% { filter: brightness(1.18); }
          100% { filter: brightness(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .personNode.v61GroupTransfer,
          .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted,
          .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
