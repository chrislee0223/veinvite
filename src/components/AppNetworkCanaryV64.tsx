'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV63 } from './AppNetworkCanaryV63';

type TrackedPointer = {
  pointerType: string;
};

function editableTarget(target: EventTarget | Node | null) {
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

function NetworkIOSSelectionGuardV64() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let selectionFrame = 0;

    const clearStageSelection = () => {
      selectionFrame = 0;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      if (!anchor || !stage.contains(anchor) || editableTarget(document.activeElement)) return;
      selection.removeAllRanges();
    };

    const scheduleSelectionClear = () => {
      if (selectionFrame) return;
      selectionFrame = window.requestAnimationFrame(clearStageSelection);
    };

    const blockNativeSelection = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !stage.contains(target) || editableTarget(target)) return;
      if (event.cancelable) event.preventDefault();
      scheduleSelectionClear();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !stage.contains(target) || editableTarget(target)) return;
      scheduleSelectionClear();
    };

    const onSelectionChange = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode ?? null;
      if (!anchor || !stage.contains(anchor)) return;
      scheduleSelectionClear();
    };

    const blockNativeGesture = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !stage.contains(target) || editableTarget(target)) return;
      if (event.cancelable) event.preventDefault();
    };

    root.addEventListener('selectstart', blockNativeSelection, true);
    root.addEventListener('contextmenu', blockNativeSelection, true);
    root.addEventListener('dragstart', blockNativeSelection, true);
    root.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('selectionchange', onSelectionChange);
    stage.addEventListener('gesturestart', blockNativeGesture as EventListener, { capture: true, passive: false });
    stage.addEventListener('gesturechange', blockNativeGesture as EventListener, { capture: true, passive: false });
    stage.addEventListener('gestureend', blockNativeGesture as EventListener, { capture: true, passive: false });

    return () => {
      root.removeEventListener('selectstart', blockNativeSelection, true);
      root.removeEventListener('contextmenu', blockNativeSelection, true);
      root.removeEventListener('dragstart', blockNativeSelection, true);
      root.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      stage.removeEventListener('gesturestart', blockNativeGesture as EventListener, true);
      stage.removeEventListener('gesturechange', blockNativeGesture as EventListener, true);
      stage.removeEventListener('gestureend', blockNativeGesture as EventListener, true);
      if (selectionFrame) window.cancelAnimationFrame(selectionFrame);
    };
  }, []);

  return null;
}

function NetworkInteractionRecoveryV64() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    const pointers = new Map<number, TrackedPointer>();
    let interrupted = false;
    let cleanupFrame = 0;

    const isCanvasTarget = (target: EventTarget | null) => {
      const node = target instanceof Node ? target : null;
      return Boolean(node && stage.contains(node));
    };

    const restoreSuspendedDrops = () => {
      const editing = stage.classList.contains('editMode');
      root.querySelectorAll<HTMLElement>('[data-v63-drop-suspended="1"]').forEach((element) => {
        if (!editing && element.dataset.v50DropDisabled !== '1') {
          element.setAttribute('data-v42-group-drop', 'true');
        }
        delete element.dataset.v63DropSuspended;
      });
    };

    const clearTransientDom = () => {
      cleanupFrame = 0;
      root.classList.remove('v50PinchMode', 'v50DraggingNode', 'v63PinchGuard');
      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        node.style.removeProperty('--v50-drag-dx');
        node.style.removeProperty('--v50-drag-dy');
        node.style.removeProperty('--v52-drag-dx');
        node.style.removeProperty('--v52-drag-dy');
        node.style.removeProperty('--v63-drag-x');
        node.style.removeProperty('--v63-drag-y');
        node.classList.remove(
          'v50DirectDragging',
          'v50ValidDrop',
          'v52HoldArmed',
          'v52LongDragging',
          'v61DirectGroupDragging',
          'v63DirectDragging',
        );
      });
      root.querySelectorAll<HTMLElement>('.v60DropPreview,.v61DropPreview').forEach((element) => {
        element.classList.remove('v60DropPreview', 'v61DropPreview');
        delete element.dataset.v61DropLabel;
      });
      restoreSuspendedDrops();
    };

    const scheduleCleanup = () => {
      if (cleanupFrame) return;
      cleanupFrame = window.requestAnimationFrame(clearTransientDom);
    };

    const cancelTrackedPointers = () => {
      const active = Array.from(pointers.entries());
      pointers.clear();
      active.forEach(([pointerId, pointer]) => {
        try {
          stage.dispatchEvent(new PointerEvent('pointercancel', {
            bubbles: true,
            cancelable: false,
            pointerId,
            pointerType: pointer.pointerType || 'touch',
          }));
        } catch {
          // Older embedded WebViews may not allow constructing PointerEvent.
          // DOM cleanup below still prevents stale visual interaction state.
        }
      });
      scheduleCleanup();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted || !isCanvasTarget(event.target)) return;
      pointers.set(event.pointerId, { pointerType: event.pointerType || 'mouse' });
    };

    const finishPointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };

    const interrupt = () => {
      interrupted = true;
      cancelTrackedPointers();
    };

    const recover = () => {
      if (!interrupted) return;
      interrupted = false;
      pointers.clear();
      scheduleCleanup();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') interrupt();
      else recover();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', finishPointer, true);
    window.addEventListener('blur', interrupt);
    window.addEventListener('focus', recover);
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('pageshow', recover);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', finishPointer, true);
      window.removeEventListener('blur', interrupt);
      window.removeEventListener('focus', recover);
      window.removeEventListener('pagehide', interrupt);
      window.removeEventListener('pageshow', recover);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cleanupFrame) window.cancelAnimationFrame(cleanupFrame);
      pointers.clear();
      clearTransientDom();
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV64({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV63 locale={locale} />
      <NetworkIOSSelectionGuardV64 />
      <NetworkInteractionRecoveryV64 />
      <style jsx global>{`
        /* The Network is an interactive canvas, not selectable document text.
           iOS Safari/WebViews otherwise show native selection handles and the
           Copy / Look Up / Translate callout during long-press or drag. */
        .productionNetworkCanaryV45 .stage,
        .productionNetworkCanaryV45 .stage * {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-user-drag: none !important;
        }

        /* The canvas owns pan/pinch. Prevent the embedded browser from running
           native page gestures in parallel with the Network gesture system. */
        .productionNetworkCanaryV45 .stage {
          touch-action: none !important;
          overscroll-behavior: contain;
        }

        /* Keep real editor controls fully editable/selectable. */
        .productionNetworkCanaryV45 .stage input,
        .productionNetworkCanaryV45 .stage textarea,
        .productionNetworkCanaryV45 .stage select,
        .productionNetworkCanaryV45 .stage [contenteditable="true"] {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-touch-callout: default !important;
          -webkit-user-drag: auto !important;
          touch-action: manipulation !important;
        }
      `}</style>
    </>
  );
}