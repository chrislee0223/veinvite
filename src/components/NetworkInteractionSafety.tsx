'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

type PointerKind = 'mouse' | 'pen' | 'touch' | string;

export function NetworkInteractionSafety({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const activePointers = useRef<Map<number, PointerKind>>(new Map());
  const ignoredPointers = useRef<Set<number>>(new Set());

  const resetInterruptedInteraction = useCallback(() => {
    if (activePointers.current.size === 0 && ignoredPointers.current.size === 0) return;
    activePointers.current.clear();
    ignoredPointers.current.clear();
    // A remount is intentionally reserved for a genuinely interrupted gesture.
    // It clears private pointer/hold state inside every accumulated Network
    // layer instead of only removing DOM classes and leaving stale refs behind.
    setEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    // Track at window capture level as well as the React boundary. Several mature
    // canary layers deliberately stop propagation at window/document while they
    // own a drag, so a parent-only React handler cannot reliably see every active
    // pointer that later needs interruption recovery.
    const observePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      const boundary = boundaryRef.current;
      if (!target || !boundary?.contains(target)) return;
      activePointers.current.set(event.pointerId, event.pointerType || 'mouse');
    };
    const observePointerEnd = (event: PointerEvent) => {
      activePointers.current.delete(event.pointerId);
      ignoredPointers.current.delete(event.pointerId);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetInterruptedInteraction();
    };

    window.addEventListener('pointerdown', observePointerDown, true);
    window.addEventListener('pointerup', observePointerEnd, true);
    window.addEventListener('pointercancel', observePointerEnd, true);
    window.addEventListener('blur', resetInterruptedInteraction);
    window.addEventListener('pagehide', resetInterruptedInteraction);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', observePointerDown, true);
      window.removeEventListener('pointerup', observePointerEnd, true);
      window.removeEventListener('pointercancel', observePointerEnd, true);
      window.removeEventListener('blur', resetInterruptedInteraction);
      window.removeEventListener('pagehide', resetInterruptedInteraction);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      activePointers.current.clear();
      ignoredPointers.current.clear();
    };
  }, [resetInterruptedInteraction]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.pointerType === 'touch') {
      const currentAlreadyObserved = activePointers.current.get(event.pointerId) === 'touch' ? 1 : 0;
      const previousTouchCount = Array.from(activePointers.current.values())
        .filter((kind) => kind === 'touch').length - currentAlreadyObserved;
      if (previousTouchCount >= 2) {
        // Ignore a third (or later) finger completely. In particular, do not let
        // an inner canvas inherit an old two-finger pinch baseline after 3→2.
        ignoredPointers.current.add(event.pointerId);
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (ignoredPointers.current.delete(event.pointerId)) {
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={boundaryRef}
      className="networkInteractionSafety"
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={onPointerEndCapture}
      onPointerCancelCapture={onPointerEndCapture}
    >
      <Fragment key={epoch}>{children}</Fragment>
      <style jsx>{`
        .networkInteractionSafety { width: 100%; min-width: 0; }
      `}</style>
    </div>
  );
}
