'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV52 } from './AppNetworkCanaryV52';

const HOLD_STORAGE_KEY = 'veinvite:network:hold-adjust-v2';
const HOLD_MS = 500;
const PRE_HOLD_CANCEL_PX = 10;
const DRAG_AFTER_HOLD_PX = 4;
const POST_HOLD_CLICK_SUPPRESS_MS = 900;

type Point = { x: number; y: number };
type AdjustmentStore = Record<string, Point>;
type SlotHold = {
  pointerId: number;
  slot: HTMLButtonElement;
  slotKey: string;
  startX: number;
  startY: number;
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

function AvailableSlotHoldController() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let hold: SlotHold = null;
    let suppressSlot: HTMLButtonElement | null = null;
    let suppressClickUntil = 0;
    let syncFrame = 0;

    let adjustments: AdjustmentStore = {};
    try {
      const raw = window.localStorage.getItem(HOLD_STORAGE_KEY);
      if (raw) adjustments = JSON.parse(raw) as AdjustmentStore;
    } catch {
      adjustments = {};
    }

    const compact = () => window.innerWidth <= 640;
    const editMode = () => stage.classList.contains('editMode');
    const groupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel:not([data-v52-pinch-guard="1"])');
    const inTransition = () => root.classList.contains('v50NetworkTransition') || root.classList.contains('v52NetworkTransition');

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

    const slotKey = (slot: HTMLButtonElement) => {
      const baseX = slot.style.getPropertyValue('--x').trim();
      const baseY = slot.style.getPropertyValue('--y').trim();
      if (!baseX || !baseY) return null;
      return `slot:${baseX}:${baseY}`;
    };

    const adjustmentKey = (key: string) => `${currentScope()}|${compact() ? 'mobile' : 'desktop'}|${key}`;

    const readZoom = () => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      const parsed = Number.parseFloat(text.replace('%', ''));
      return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
    };

    const saveAdjustments = () => {
      try { window.localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(adjustments)); } catch { /* optional visual state */ }
    };

    const slotPoint = (slot: HTMLButtonElement, includeDrag = true): Point => ({
      x: parsePx(slot.style.getPropertyValue('--x')) +
        parsePx(slot.style.getPropertyValue('--v53-slot-adjust-x')) +
        (includeDrag ? parsePx(slot.style.getPropertyValue('--v53-slot-drag-x')) : 0),
      y: parsePx(slot.style.getPropertyValue('--y')) +
        parsePx(slot.style.getPropertyValue('--v53-slot-adjust-y')) +
        (includeDrag ? parsePx(slot.style.getPropertyValue('--v53-slot-drag-y')) : 0),
    });

    const ensureSlotBindings = () => {
      const slots = Array.from(root.querySelectorAll<HTMLButtonElement>('.slotNode'));
      const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges > path.slotSpoke'));
      slots.forEach((slot, index) => {
        const key = slotKey(slot);
        const path = paths[index];
        if (!key) return;
        if (slot.dataset.v53SlotKey !== key) slot.dataset.v53SlotKey = key;
        if (path && path.dataset.v53SlotKey !== key) path.dataset.v53SlotKey = key;
      });
    };

    const pathForSlot = (slot: HTMLButtonElement) => {
      const key = slot.dataset.v53SlotKey || slotKey(slot);
      if (!key) return null;
      let path = root.querySelector<SVGPathElement>(
        `svg.edges > path.slotSpoke[data-v53-slot-key="${CSS.escape(key)}"]`,
      );
      if (path) return path;
      ensureSlotBindings();
      path = root.querySelector<SVGPathElement>(
        `svg.edges > path.slotSpoke[data-v53-slot-key="${CSS.escape(key)}"]`,
      );
      return path;
    };

    const syncSlotPath = (slot: HTMLButtonElement) => {
      const path = pathForSlot(slot);
      if (!path) return;
      const d = curveFromCenter(slotPoint(slot));
      if (path.getAttribute('d') !== d) path.setAttribute('d', d);
    };

    const applyStoredAdjustments = () => {
      ensureSlotBindings();
      root.querySelectorAll<HTMLButtonElement>('.slotNode').forEach((slot) => {
        const key = slot.dataset.v53SlotKey || slotKey(slot);
        if (!key) return;
        const point = adjustments[adjustmentKey(key)] ?? { x: 0, y: 0 };
        const x = `${point.x}px`;
        const y = `${point.y}px`;
        if (slot.style.getPropertyValue('--v53-slot-adjust-x') !== x) slot.style.setProperty('--v53-slot-adjust-x', x);
        if (slot.style.getPropertyValue('--v53-slot-adjust-y') !== y) slot.style.setProperty('--v53-slot-adjust-y', y);
        syncSlotPath(slot);
      });
    };

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        if (!mounted) return;
        applyStoredAdjustments();
      });
    };

    const writeAdjustment = (slot: HTMLButtonElement, key: string, delta: Point) => {
      const storageKey = adjustmentKey(key);
      const current = adjustments[storageKey] ?? {
        x: parsePx(slot.style.getPropertyValue('--v53-slot-adjust-x')),
        y: parsePx(slot.style.getPropertyValue('--v53-slot-adjust-y')),
      };
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      adjustments[storageKey] = next;
      slot.style.setProperty('--v53-slot-adjust-x', `${next.x}px`);
      slot.style.setProperty('--v53-slot-adjust-y', `${next.y}px`);
      saveAdjustments();
      syncSlotPath(slot);
    };

    const clearCurrentScopeAdjustments = () => {
      const prefix = `${currentScope()}|${compact() ? 'mobile' : 'desktop'}|slot:`;
      let changed = false;
      Object.keys(adjustments).forEach((key) => {
        if (!key.startsWith(prefix)) return;
        delete adjustments[key];
        changed = true;
      });
      if (changed) saveAdjustments();
      root.querySelectorAll<HTMLButtonElement>('.slotNode').forEach((slot) => {
        slot.style.removeProperty('--v53-slot-adjust-x');
        slot.style.removeProperty('--v53-slot-adjust-y');
        slot.style.removeProperty('--v53-slot-drag-x');
        slot.style.removeProperty('--v53-slot-drag-y');
        syncSlotPath(slot);
      });
    };

    const canStartHold = (slot: HTMLButtonElement) => {
      if (editMode() || groupPanel() || inTransition()) return false;
      if (root.classList.contains('v50PinchMode') || root.classList.contains('v48PinchGesture')) return false;
      if (slot.classList.contains('joining')) return false;
      return true;
    };

    const clearHold = (discardDrag: boolean) => {
      const current = hold;
      if (!current) return;
      window.clearTimeout(current.timer);
      if (discardDrag) {
        current.slot.style.removeProperty('--v53-slot-drag-x');
        current.slot.style.removeProperty('--v53-slot-drag-y');
        syncSlotPath(current.slot);
      }
      current.slot.classList.remove('v53SlotHoldArmed', 'v53SlotLongDragging');
      hold = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const circle = target?.closest<HTMLElement>('.slotCircle') ?? null;
      const slot = circle?.closest<HTMLButtonElement>('button.slotNode') ?? null;
      if (!circle || !slot || !root.contains(slot) || !canStartHold(slot)) return;
      const key = slot.dataset.v53SlotKey || slotKey(slot);
      if (!key) return;

      if (event.pointerType !== 'mouse' && event.cancelable) event.preventDefault();
      clearHold(true);
      const state: NonNullable<SlotHold> = {
        pointerId: event.pointerId,
        slot,
        slotKey: key,
        startX: event.clientX,
        startY: event.clientY,
        armed: false,
        dragging: false,
        timer: 0,
      };
      state.timer = window.setTimeout(() => {
        if (!hold || hold !== state || !state.slot.isConnected || !canStartHold(state.slot)) return;
        state.armed = true;
        state.slot.classList.add('v53SlotHoldArmed');
        suppressSlot = state.slot;
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
        current.slot.classList.add('v53SlotLongDragging');
      }
      const zoom = readZoom();
      current.slot.style.setProperty('--v53-slot-drag-x', `${dx / zoom}px`);
      current.slot.style.setProperty('--v53-slot-drag-y', `${dy / zoom}px`);
      syncSlotPath(current.slot);
    };

    const finishHold = (event: PointerEvent) => {
      const current = hold;
      if (!current || current.pointerId !== event.pointerId) return;
      window.clearTimeout(current.timer);

      if (current.armed) {
        suppressSlot = current.slot;
        suppressClickUntil = performance.now() + POST_HOLD_CLICK_SUPPRESS_MS;
        if (current.dragging) {
          const dx = parsePx(current.slot.style.getPropertyValue('--v53-slot-drag-x'));
          const dy = parsePx(current.slot.style.getPropertyValue('--v53-slot-drag-y'));
          current.slot.style.removeProperty('--v53-slot-drag-x');
          current.slot.style.removeProperty('--v53-slot-drag-y');
          writeAdjustment(current.slot, current.slotKey, { x: dx, y: dy });
        }
        if (event.cancelable) event.preventDefault();
      }

      current.slot.classList.remove('v53SlotHoldArmed', 'v53SlotLongDragging');
      hold = null;
      syncSlotPath(current.slot);
    };

    const cancelHold = (event?: PointerEvent) => {
      if (event && hold?.pointerId !== event.pointerId) return;
      clearHold(true);
    };

    const suppressHeldSlotClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil || !suppressSlot) return;
      const target = event.target instanceof Element ? event.target : null;
      const slot = target?.closest<HTMLButtonElement>('button.slotNode') ?? null;
      if (!slot || slot !== suppressSlot) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onRootClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button') ?? null;
      if (!button) return;
      const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (button.closest('.navActions') && text === 'Reset') clearCurrentScopeAdjustments();
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target instanceof Element ? mutation.target : null;
          return mutation.attributeName === 'style' && Boolean(target?.matches('.slotNode'));
        }
        if (mutation.type === 'characterData') return Boolean(mutation.target.parentElement?.closest('.crumbs'));
        if (mutation.type === 'childList') {
          const target = mutation.target instanceof Element ? mutation.target : null;
          if (target?.closest('.crumbs')) return true;
          return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
            node instanceof Element && (node.matches('.slotNode') || Boolean(node.querySelector('.slotNode'))),
          );
        }
        return false;
      });
      if (relevant) scheduleSync();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishHold, true);
    window.addEventListener('pointercancel', cancelHold, true);
    root.addEventListener('click', suppressHeldSlotClick, true);
    root.addEventListener('click', onRootClickCapture, true);
    window.addEventListener('resize', scheduleSync);

    applyStoredAdjustments();
    scheduleSync();

    return () => {
      mounted = false;
      observer.disconnect();
      clearHold(true);
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishHold, true);
      window.removeEventListener('pointercancel', cancelHold, true);
      root.removeEventListener('click', suppressHeldSlotClick, true);
      root.removeEventListener('click', onRootClickCapture, true);
      window.removeEventListener('resize', scheduleSync);
      root.querySelectorAll<HTMLButtonElement>('.slotNode').forEach((slot) => {
        slot.style.removeProperty('--v53-slot-drag-x');
        slot.style.removeProperty('--v53-slot-drag-y');
        slot.classList.remove('v53SlotHoldArmed', 'v53SlotLongDragging');
      });
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .slotNode{
      transform:translate(
        calc(var(--x) + var(--v53-slot-adjust-x,0px) + var(--v53-slot-drag-x,0px) - 50%),
        calc(var(--y) + var(--v53-slot-adjust-y,0px) + var(--v53-slot-drag-y,0px) - 50%)
      )!important
    }
    .productionNetworkCanaryV45 .slotNode.v53SlotLongDragging{
      z-index:94!important;transition:none!important
    }
    .productionNetworkCanaryV45 .slotNode.v53SlotHoldArmed .slotCircle,
    .productionNetworkCanaryV45 .slotNode.v53SlotLongDragging .slotCircle{
      border-style:solid!important;border-color:rgba(255,211,77,.98)!important;
      box-shadow:0 0 0 4px rgba(244,183,40,.11),0 0 30px rgba(244,183,40,.18)!important
    }
  `}</style>;
}

export function AppNetworkCanaryV53({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV52 locale={locale} />
    <AvailableSlotHoldController />
  </>;
}
