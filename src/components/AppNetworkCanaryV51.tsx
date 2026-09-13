'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV50 } from './AppNetworkCanaryV50';

const ADJUST_STORAGE_KEY = 'veinvite:network:visual-adjust-v1';
const HOLD_MS = 500;
const PRE_HOLD_CANCEL_PX = 10;
const DRAG_AFTER_HOLD_PX = 4;
const POST_HOLD_CLICK_SUPPRESS_MS = 900;

type Point = { x: number; y: number };
type AdjustmentStore = Record<string, Point>;
type HoldState = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  armed: boolean;
  dragging: boolean;
  timer: number;
} | null;

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function curveFromCenter(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(64, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function NetworkStructureAndHoldFixes() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let hold: HoldState = null;
    let syncFrame = 0;
    let syncing = false;
    let suppressNodeId: string | null = null;
    let suppressClickUntil = 0;

    const compact = () => window.innerWidth <= 640;
    const readZoom = () => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      const parsed = Number.parseFloat(text.replace('%', ''));
      return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
    };

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

    const loadAdjustments = () => {
      try {
        const raw = window.localStorage.getItem(ADJUST_STORAGE_KEY);
        if (!raw) return {} as AdjustmentStore;
        const parsed = JSON.parse(raw) as AdjustmentStore;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {} as AdjustmentStore;
      }
    };

    const saveAdjustmentDelta = (node: HTMLButtonElement, nodeId: string, delta: Point) => {
      const store = loadAdjustments();
      const key = adjustmentKey(nodeId);
      const current = store[key] ?? {
        x: parsePx(node.style.getPropertyValue('--v50-adjust-x')),
        y: parsePx(node.style.getPropertyValue('--v50-adjust-y')),
      };
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      store[key] = next;
      node.style.setProperty('--v50-adjust-x', `${next.x}px`);
      node.style.setProperty('--v50-adjust-y', `${next.y}px`);
      try { window.localStorage.setItem(ADJUST_STORAGE_KEY, JSON.stringify(store)); } catch { /* visual state is optional */ }
    };

    const directChild = (node: Element, tagName: 'B' | 'SMALL') =>
      Array.from(node.children).find((child) => child.tagName === tagName) as HTMLElement | undefined;

    const ensurePersonMeta = (node: HTMLButtonElement) => {
      const address = directChild(node, 'B');
      const stats = directChild(node, 'SMALL');
      if (!address || !stats) return;

      let meta = Array.from(node.children).find((child) => child.classList.contains('v51NodeMeta')) as HTMLSpanElement | undefined;
      if (!meta) {
        meta = document.createElement('span');
        meta.className = 'v51NodeMeta';
        meta.setAttribute('aria-hidden', 'true');
        const addressLine = document.createElement('span');
        addressLine.className = 'v51Address';
        const statsLine = document.createElement('span');
        statsLine.className = 'v51Stats';
        meta.append(addressLine, statsLine);
        node.appendChild(meta);
      }

      const addressText = address.textContent ?? '';
      const statsText = stats.textContent ?? '';
      const addressLine = meta.querySelector<HTMLElement>('.v51Address');
      const statsLine = meta.querySelector<HTMLElement>('.v51Stats');
      if (addressLine && addressLine.textContent !== addressText) addressLine.textContent = addressText;
      if (statsLine && statsLine.textContent !== statsText) statsLine.textContent = statsText;
      const ariaLabel = `${addressText} · ${statsText}`;
      if (node.getAttribute('aria-label') !== ariaLabel) node.setAttribute('aria-label', ariaLabel);

      const numbers = statsText.match(/(\d+)\s+direct\s+·\s+(\d+)\s+(?:net|network)/i);
      if (numbers) {
        node.dataset.directCount = numbers[1];
        node.dataset.networkCount = numbers[2];
      }
    };

    const ensureSlotMeta = (node: HTMLButtonElement) => {
      const label = directChild(node, 'B');
      if (!label) return;
      let meta = Array.from(node.children).find((child) => child.classList.contains('v51SlotMeta')) as HTMLSpanElement | undefined;
      if (!meta) {
        meta = document.createElement('span');
        meta.className = 'v51SlotMeta';
        meta.setAttribute('aria-hidden', 'true');
        node.appendChild(meta);
      }
      const labelText = label.textContent ?? '';
      if (meta.textContent !== labelText) meta.textContent = labelText;
      if (node.getAttribute('aria-label') !== labelText) node.setAttribute('aria-label', labelText);
    };

    const nodePoint = (node: HTMLButtonElement): Point => ({
      x: parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dx')),
      y: parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dy')),
    });

    const syncPersonPaths = () => {
      const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
      const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges > path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
      const usedPaths = new Set<SVGPathElement>();

      nodes.forEach((node, index) => {
        const path = paths[index];
        const nodeId = node.dataset.nodeId;
        if (!path || !nodeId) return;
        usedPaths.add(path);
        if (path.dataset.v51NodeId !== nodeId) path.dataset.v51NodeId = nodeId;

        const point = nodePoint(node);
        const nextPath = curveFromCenter(point);
        if (path.getAttribute('d') !== nextPath) path.setAttribute('d', nextPath);

        const grouped = node.classList.contains('v42GroupedMember');
        if (grouped) {
          if (path.dataset.v51GroupedBase !== '1') path.dataset.v51GroupedBase = '1';
          if (path.style.getPropertyValue('opacity') !== '0' || path.style.getPropertyPriority('opacity') !== 'important') {
            path.style.setProperty('opacity', '0', 'important');
          }
        } else if (path.dataset.v51GroupedBase === '1') {
          path.style.removeProperty('opacity');
          delete path.dataset.v51GroupedBase;
        }
      });

      paths.forEach((path) => {
        if (usedPaths.has(path)) return;
        if (path.dataset.v51GroupedBase === '1') path.style.removeProperty('opacity');
        delete path.dataset.v51GroupedBase;
        delete path.dataset.v51NodeId;
      });
    };

    const syncAll = () => {
      syncFrame = 0;
      if (!mounted || syncing) return;
      syncing = true;
      try {
        root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]').forEach(ensurePersonMeta);
        root.querySelectorAll<HTMLButtonElement>('.slotNode').forEach(ensureSlotMeta);
        syncPersonPaths();
      } finally {
        syncing = false;
      }
    };

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(syncAll);
    };

    const clearHold = (discardDrag: boolean) => {
      const current = hold;
      if (!current) return;
      window.clearTimeout(current.timer);
      if (discardDrag) {
        current.node.style.removeProperty('--v50-drag-dx');
        current.node.style.removeProperty('--v50-drag-dy');
      }
      current.node.classList.remove('v51HoldArmed', 'v51LongDragging');
      hold = null;
      scheduleSync();
    };

    const canStartHold = (node: HTMLButtonElement) => {
      if (stage.classList.contains('editMode')) return false;
      if (root.querySelector('.v42GroupPanel')) return false;
      if (root.classList.contains('v50PinchMode') || root.classList.contains('v48PinchGesture')) return false;
      if (root.classList.contains('v50NetworkTransition')) return false;
      if (node.classList.contains('v42CollapsedMember')) return false;
      return true;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      const nodeId = node?.dataset.nodeId;
      if (!circle || !node || !nodeId || !root.contains(node) || !canStartHold(node)) return;

      clearHold(true);
      const state: NonNullable<HoldState> = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        armed: false,
        dragging: false,
        timer: 0,
      };
      state.timer = window.setTimeout(() => {
        if (!hold || hold !== state || !state.node.isConnected || !canStartHold(state.node)) return;
        state.armed = true;
        state.node.classList.add('v51HoldArmed');
        suppressNodeId = state.nodeId;
        suppressClickUntil = performance.now() + POST_HOLD_CLICK_SUPPRESS_MS;
      }, HOLD_MS);
      hold = state;
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = hold;
      if (!event.isTrusted || !current || current.pointerId !== event.pointerId) return;
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      const screenDx = event.clientX - current.startX;
      const screenDy = event.clientY - current.startY;
      const distance = Math.hypot(screenDx, screenDy);

      if (!current.armed) {
        if (distance > PRE_HOLD_CANCEL_PX) clearHold(true);
        return;
      }

      if (!current.dragging && distance < DRAG_AFTER_HOLD_PX) return;
      if (!current.dragging) {
        current.dragging = true;
        current.node.classList.add('v51LongDragging');
      }
      const zoom = readZoom();
      current.node.style.setProperty('--v50-drag-dx', `${screenDx / zoom}px`);
      current.node.style.setProperty('--v50-drag-dy', `${screenDy / zoom}px`);
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
          const dx = parsePx(current.node.style.getPropertyValue('--v50-drag-dx'));
          const dy = parsePx(current.node.style.getPropertyValue('--v50-drag-dy'));
          current.node.style.removeProperty('--v50-drag-dx');
          current.node.style.removeProperty('--v50-drag-dy');
          saveAdjustmentDelta(current.node, current.nodeId, { x: dx, y: dy });
        }
        event.preventDefault();
      }

      current.node.classList.remove('v51HoldArmed', 'v51LongDragging');
      hold = null;
      scheduleSync();
    };

    const cancelHold = (event?: PointerEvent) => {
      if (event && hold?.pointerId !== event.pointerId) return;
      clearHold(true);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil || !suppressNodeId) return;
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!node || node.dataset.nodeId !== suppressNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) clearHold(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearHold(true);
    };
    const onWindowBlur = () => clearHold(true);

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') return true;
        if (mutation.type !== 'attributes') return false;
        return mutation.attributeName === 'class' || mutation.attributeName === 'style' || mutation.attributeName === 'd';
      });
      if (relevant) scheduleSync();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'd'],
    });

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishHold, true);
    window.addEventListener('pointercancel', cancelHold, true);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('click', onClickCapture, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', scheduleSync);

    syncAll();

    return () => {
      mounted = false;
      observer.disconnect();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      clearHold(true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishHold, true);
      window.removeEventListener('pointercancel', cancelHold, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', scheduleSync);
      root.querySelectorAll<HTMLElement>('.v51NodeMeta,.v51SlotMeta').forEach((node) => node.remove());
      root.querySelectorAll<SVGPathElement>('svg.edges > path[data-v51-node-id]').forEach((path) => {
        if (path.dataset.v51GroupedBase === '1') path.style.removeProperty('opacity');
        delete path.dataset.v51GroupedBase;
        delete path.dataset.v51NodeId;
      });
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small,
    .productionNetworkCanaryV45 .slotNode>b{
      display:none!important
    }

    .productionNetworkCanaryV45 .v51NodeMeta{
      position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;
      margin:0!important;padding:0!important;pointer-events:none!important;text-align:center!important;
      direction:ltr!important;unicode-bidi:isolate!important;overflow:visible!important
    }
    .productionNetworkCanaryV45 .v51NodeMeta>.v51Address,
    .productionNetworkCanaryV45 .v51NodeMeta>.v51Stats{
      position:absolute!important;left:0!important;width:100%!important;margin:0!important;padding:0!important;
      text-align:center!important;white-space:nowrap!important;pointer-events:none!important;
      transform:scale(var(--v46-label-scale,1))!important;transform-origin:50% 0!important
    }
    .productionNetworkCanaryV45 .v51NodeMeta>.v51Address{
      top:var(--v48-person-label-y,59px)!important;color:#d7d0c3!important;font-size:.47rem!important;
      font-weight:700!important;line-height:1!important
    }
    .productionNetworkCanaryV45 .v51NodeMeta>.v51Stats{
      top:var(--v48-person-meta-y,78px)!important;color:#6c655b!important;font-size:.38rem!important;
      font-weight:400!important;line-height:1!important;font-variant-numeric:tabular-nums
    }
    .productionNetworkCanaryV45 .personNode.v42SelectedMember .v51Address,
    .productionNetworkCanaryV45 .personNode.v44PendingNewGroupMember .v51Address{
      color:#f0c755!important
    }

    .productionNetworkCanaryV45 .v51SlotMeta{
      position:absolute!important;left:0!important;top:var(--v48-slot-label-y,53px)!important;width:100%!important;
      margin:0!important;padding:0!important;text-align:center!important;white-space:nowrap!important;
      pointer-events:none!important;color:#d7d0c3!important;font-size:.47rem!important;font-weight:700!important;
      line-height:1!important;direction:ltr!important;unicode-bidi:isolate!important;
      transform:scale(var(--v46-label-scale,1))!important;transform-origin:50% 0!important
    }

    .productionNetworkCanaryV45 .personNode.v51HoldArmed .nodeCircle{
      border-color:rgba(244,183,40,.96)!important;
      box-shadow:0 0 0 4px rgba(244,183,40,.11),0 0 30px rgba(244,183,40,.16)!important
    }
    .productionNetworkCanaryV45 .personNode.v51LongDragging{
      z-index:94!important;transition:none!important
    }
    .productionNetworkCanaryV45 .personNode.v51LongDragging .nodeCircle{cursor:grabbing!important}

    .productionNetworkCanaryV45 svg.edges>path[data-v51-grouped-base="1"]{
      opacity:0!important
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .personNode.v51HoldArmed .nodeCircle{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV51({ locale }: { locale: Locale }) {
  return <>
    <NetworkStructureAndHoldFixes />
    <AppNetworkCanaryV50 locale={locale} />
  </>;
}
