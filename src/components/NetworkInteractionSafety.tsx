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
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') resetInterruptedInteraction();
    };
    window.addEventListener('blur', resetInterruptedInteraction);
    window.addEventListener('pagehide', resetInterruptedInteraction);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
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
      const activeTouchCount = Array.from(activePointers.current.values())
        .filter((kind) => kind === 'touch').length;
      if (activeTouchCount >= 2 && !activePointers.current.has(event.pointerId)) {
        // Ignore a third (or later) finger completely. In particular, do not let
        // an inner canvas inherit an old two-finger pinch baseline after 3→2.
        ignoredPointers.current.add(event.pointerId);
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    activePointers.current.set(event.pointerId, event.pointerType || 'mouse');
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (ignoredPointers.current.delete(event.pointerId)) {
      event.stopPropagation();
      return;
    }
    activePointers.current.delete(event.pointerId);
  };

  return (
    <div
      className="networkInteractionSafety"
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={onPointerEndCapture}
      onPointerCancelCapture={onPointerEndCapture}
      onContextMenuCapture={(event) => {
        if (activePointers.current.size > 0) event.preventDefault();
      }}
    >
      <Fragment key={epoch}>{children}</Fragment>
      <style jsx>{`
        .networkInteractionSafety { width: 100%; min-width: 0; }
      `}</style>
    </div>
  );
}
