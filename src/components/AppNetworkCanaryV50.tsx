'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV49 } from './AppNetworkCanaryV49';

const INTRO_SESSION_KEY = 'veinvite:network:intro-v4';
const DRAG_THRESHOLD_PX = 10;
const POST_DRAG_CLICK_SUPPRESS_MS = 340;
const LONG_PRESS_CLICK_CUTOFF_MS = 420;
const DRAG_CREATE_FOCUS_SUPPRESS_MS = 1200;
const CREATE_DROP_VERIFY_MS = 180;

type PointerOwner = {
  pointerId: number;
  pointerType: string;
  node: HTMLButtonElement;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
  groupMode: boolean;
} | null;

type DropKind = 'existing' | 'new' | 'create';
type DropTarget = { kind: DropKind; element: HTMLElement } | null;

function NetworkInputOwnershipPolish() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let activePointer: PointerOwner = null;
    let suppressNodeClickUntil = 0;
    let suppressGroupAutoFocusUntil = 0;
    let syntheticPointerId = 140000;
    let createDropVerifyTimer: number | null = null;

    const groupToolbar = () => root.querySelector<HTMLButtonElement>('.v42GroupToolbarButton');
    const groupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel');
    const editToggle = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
      .find((button) => {
        const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return text === 'Edit layout' || text.includes('Done');
      }) ?? null;

    const markIntroSeen = () => {
      try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional */ }
    };

    const syncModeClasses = () => {
      const hasGroups = Boolean(groupPanel());
      const editing = stage.classList.contains('editMode');
      root.classList.toggle('v50GroupMode', hasGroups && !editing);
      root.classList.toggle('v50EditMode', editing);
      if (!hasGroups && activePointer?.groupMode) cancelActivePointer(true);
    };

    const nodeCircleFromTarget = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      const circle = element?.closest<HTMLElement>('.nodeCircle') ?? null;
      const node = circle?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!circle || !node || !root.contains(node)) return null;
      return { circle, node };
    };

    const dropTargetAt = (clientX: number, clientY: number): DropTarget => {
      const candidates: Array<{ selector: string; kind: DropKind; pad: number }> = [
        { selector: '.v44CreateDropMore', kind: 'create', pad: 7 },
        { selector: '.v44NewGroupDrop', kind: 'new', pad: 5 },
        { selector: '.v42GroupRow[data-v42-group-drop]', kind: 'existing', pad: 5 },
        { selector: '.v42GroupHub[data-v42-group-drop]', kind: 'existing', pad: 10 },
      ];
      for (const candidate of candidates) {
        const elements = Array.from(root.querySelectorAll<HTMLElement>(candidate.selector));
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (clientX >= rect.left - candidate.pad && clientX <= rect.right + candidate.pad &&
              clientY >= rect.top - candidate.pad && clientY <= rect.bottom + candidate.pad) {
            return { kind: candidate.kind, element };
          }
        }
      }
      return null;
    };

    const nodeSelectedForCreate = (node: HTMLButtonElement) =>
      node.classList.contains('v42SelectedMember') || node.classList.contains('v44PendingNewGroupMember');

    const createEditorOpen = () => {
      const panel = groupPanel();
      if (!panel?.querySelector('input')) return false;
      return (panel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '').startsWith('Create group');
    };

    const dispatchSyntheticDrop = (node: HTMLButtonElement, target: HTMLElement) => {
      if (!mounted || !node.isConnected || !target.isConnected) return;
      const circle = node.querySelector<HTMLElement>('.nodeCircle');
      if (!circle) return;
      const startRect = circle.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = startRect.left + startRect.width / 2;
      const startY = startRect.top + startRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      syntheticPointerId += 1;
      const pointerId = syntheticPointerId;
      const hadEditClass = stage.classList.contains('editMode');
      if (!hadEditClass) stage.classList.add('editMode');
      try {
        circle.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0,
          clientX: startX, clientY: startY,
        }));
        circle.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: startX + 18, clientY: startY,
        }));
        circle.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: endX, clientY: endY,
        }));
        circle.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0,
          clientX: endX, clientY: endY,
        }));
      } catch {
        // Best-effort WebView fallback only.
      } finally {
        if (!hadEditClass) stage.classList.remove('editMode');
      }
    };

    const scheduleCreateDropFallback = (kind: 'new' | 'create', node: HTMLButtonElement, originalTarget: HTMLElement) => {
      if (createDropVerifyTimer !== null) window.clearTimeout(createDropVerifyTimer);
      createDropVerifyTimer = window.setTimeout(() => {
        createDropVerifyTimer = null;
        if (!mounted || !node.isConnected || nodeSelectedForCreate(node)) return;

        if (kind === 'create') {
          const currentTarget = root.querySelector<HTMLElement>('.v44CreateDropMore');
          if (currentTarget) dispatchSyntheticDrop(node, currentTarget);
          return;
        }

        if (createEditorOpen()) {
          const createTarget = root.querySelector<HTMLElement>('.v44CreateDropMore');
          if (createTarget) dispatchSyntheticDrop(node, createTarget);
          return;
        }

        const currentNewTarget = root.querySelector<HTMLElement>('.v44NewGroupDrop');
        dispatchSyntheticDrop(node, currentNewTarget ?? originalTarget);
      }, CREATE_DROP_VERIFY_MS);
    };

    function cancelActivePointer(dispatchCancel: boolean) {
      const current = activePointer;
      activePointer = null;
      if (!current || !dispatchCancel || !current.node.isConnected) return;
      try {
        current.node.dispatchEvent(new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: current.pointerId,
          pointerType: current.pointerType || 'touch',
        }));
      } catch { /* no-op */ }
    }

    const onWindowPointerDownCapture = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const match = nodeCircleFromTarget(event.target);
      if (!match || stage.classList.contains('editMode')) return;
      activePointer = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        node: match.node,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        moved: false,
        groupMode: Boolean(groupPanel()),
      };
    };

    const onWindowPointerMoveCapture = (event: PointerEvent) => {
      const current = activePointer;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= DRAG_THRESHOLD_PX) {
        current.moved = true;
        suppressNodeClickUntil = Number.POSITIVE_INFINITY;
      }
    };

    const onWindowPointerUpCapture = (event: PointerEvent) => {
      const current = activePointer;
      if (!current || current.pointerId !== event.pointerId) return;
      activePointer = null;
      if (!current.moved) {
        if (performance.now() - current.startedAt >= LONG_PRESS_CLICK_CUTOFF_MS) {
          suppressNodeClickUntil = performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;
        }
        return;
      }

      suppressNodeClickUntil = performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;
      if (!current.groupMode) return;

      const target = dropTargetAt(event.clientX, event.clientY);
      if (!target) return;
      if (target.kind === 'new') suppressGroupAutoFocusUntil = performance.now() + DRAG_CREATE_FOCUS_SUPPRESS_MS;
      if (target.kind === 'new' || target.kind === 'create') {
        scheduleCreateDropFallback(target.kind, current.node, target.element);
      }
    };

    const onWindowPointerCancelCapture = (event: PointerEvent) => {
      if (!activePointer || activePointer.pointerId !== event.pointerId) return;
      suppressNodeClickUntil = performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;
      activePointer = null;
    };

    // V42/V44/V47 own group capture logic. Stop trusted node pointerdown only in
    // bubble phase so those capture handlers run first, while V37's delegated
    // long-press Edit-layout handler never sees the same pointer.
    const onRootPointerDownBubble = (event: PointerEvent) => {
      if (!event.isTrusted || stage.classList.contains('editMode')) return;
      if (!nodeCircleFromTarget(event.target)) return;
      event.stopPropagation();
    };

    const onRootClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const button = target.closest<HTMLButtonElement>('button');

      if (event.isTrusted && button?.classList.contains('v42GroupToolbarButton')) {
        if (stage.classList.contains('editMode')) editToggle()?.click();
        return;
      }

      if (event.isTrusted && button?.closest('.navActions')) {
        const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if ((text === 'Edit layout' || text.includes('Done')) && groupPanel()) groupToolbar()?.click();
      }

      const node = target.closest<HTMLButtonElement>('button.personNode[data-node-id]');
      if (!node || !root.contains(node)) return;
      if (performance.now() >= suppressNodeClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const preventNativeNodeGesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.personNode,.slotNode,.clusterNode,.nodeCircle,.slotCircle')) return;
      event.preventDefault();
    };

    const onFocusInCapture = (event: FocusEvent) => {
      if (performance.now() >= suppressGroupAutoFocusUntil) return;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.closest('.v42GroupPanel')) return;
      queueMicrotask(() => {
        if (performance.now() < suppressGroupAutoFocusUntil && document.activeElement === input) input.blur();
      });
    };

    const onWindowTouchStartCapture = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target)) return;
      if (event.isTrusted) markIntroSeen();
      if (event.touches.length >= 2) {
        suppressNodeClickUntil = Number.POSITIVE_INFINITY;
        cancelActivePointer(true);
      }
    };

    const onWindowTouchEndCapture = (event: TouchEvent) => {
      if (event.touches.length > 0 || suppressNodeClickUntil !== Number.POSITIVE_INFINITY) return;
      suppressNodeClickUntil = performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;
    };

    const onWindowPointerMarkIntro = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && root.contains(target)) markIntroSeen();
    };

    const clearExternalState = () => {
      cancelActivePointer(true);
      suppressNodeClickUntil = performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;
      suppressGroupAutoFocusUntil = 0;
      if (createDropVerifyTimer !== null) {
        window.clearTimeout(createDropVerifyTimer);
        createDropVerifyTimer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearExternalState();
    };

    const modeObserver = new MutationObserver(syncModeClasses);
    modeObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    syncModeClasses();

    window.addEventListener('pointerdown', onWindowPointerDownCapture, true);
    window.addEventListener('pointermove', onWindowPointerMoveCapture, true);
    window.addEventListener('pointerup', onWindowPointerUpCapture, true);
    window.addEventListener('pointercancel', onWindowPointerCancelCapture, true);
    window.addEventListener('pointerdown', onWindowPointerMarkIntro, true);
    window.addEventListener('touchstart', onWindowTouchStartCapture, { capture: true, passive: true });
    window.addEventListener('touchend', onWindowTouchEndCapture, { capture: true, passive: true });
    root.addEventListener('pointerdown', onRootPointerDownBubble, false);
    root.addEventListener('click', onRootClickCapture, true);
    root.addEventListener('selectstart', preventNativeNodeGesture, true);
    root.addEventListener('contextmenu', preventNativeNodeGesture, true);
    root.addEventListener('dragstart', preventNativeNodeGesture, true);
    root.addEventListener('focusin', onFocusInCapture, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearExternalState);

    return () => {
      mounted = false;
      modeObserver.disconnect();
      if (createDropVerifyTimer !== null) window.clearTimeout(createDropVerifyTimer);
      window.removeEventListener('pointerdown', onWindowPointerDownCapture, true);
      window.removeEventListener('pointermove', onWindowPointerMoveCapture, true);
      window.removeEventListener('pointerup', onWindowPointerUpCapture, true);
      window.removeEventListener('pointercancel', onWindowPointerCancelCapture, true);
      window.removeEventListener('pointerdown', onWindowPointerMarkIntro, true);
      window.removeEventListener('touchstart', onWindowTouchStartCapture, true);
      window.removeEventListener('touchend', onWindowTouchEndCapture, true);
      root.removeEventListener('pointerdown', onRootPointerDownBubble, false);
      root.removeEventListener('click', onRootClickCapture, true);
      root.removeEventListener('selectstart', preventNativeNodeGesture, true);
      root.removeEventListener('contextmenu', preventNativeNodeGesture, true);
      root.removeEventListener('dragstart', preventNativeNodeGesture, true);
      root.removeEventListener('focusin', onFocusInCapture, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearExternalState);
      cancelActivePointer(false);
      root.classList.remove('v50GroupMode', 'v50EditMode');
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .personNode,
    .productionNetworkCanaryV45 .personNode *,
    .productionNetworkCanaryV45 .slotNode,
    .productionNetworkCanaryV45 .slotNode *,
    .productionNetworkCanaryV45 .clusterNode,
    .productionNetworkCanaryV45 .clusterNode *{
      user-select:none!important;
      -webkit-user-select:none!important;
      -webkit-touch-callout:none!important;
      -webkit-user-drag:none!important
    }
    .productionNetworkCanaryV45.v50GroupMode .personNode .nodeCircle{
      cursor:grab;
      border-color:rgba(210,174,65,.48)!important
    }
    .productionNetworkCanaryV45.v50GroupMode .personNode.v47DirectDragging .nodeCircle{
      cursor:grabbing
    }
  `}</style>;
}

export function AppNetworkCanaryV50({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV49 locale={locale} />
    <NetworkInputOwnershipPolish />
  </>;
}
