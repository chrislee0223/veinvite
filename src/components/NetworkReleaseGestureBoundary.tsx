'use client';

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export function NetworkReleaseGestureBoundary({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const target = event.target instanceof Element ? event.target : null;
    const stage = target?.closest<HTMLElement>('.releaseStage');
    if (!stage) return;

    // Capture every touch pointer to the actual canvas stage. The release canvas
    // already captures the first pointer itself; doing it here as well guarantees
    // that the second pinch pointer keeps delivering move/up events even when the
    // finger leaves the visible stage bounds in iOS/WebView implementations.
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; the canvas still receives ordinary events.
    }
  };

  const onPointerCancelCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.releaseStage')) return;

    // A cancelled gesture is never an intentional completed pinch. Stop it before
    // the inner canvas can interpret its last ratio as enter/parent navigation,
    // then remount to clear every private pointer/pinch ref in one deterministic
    // boundary. Normal pointerup still follows the regular completion path.
    event.stopPropagation();
    setEpoch((value) => value + 1);
  };

  return (
    <div
      className="networkReleaseGestureBoundary"
      onPointerDownCapture={onPointerDownCapture}
      onPointerCancelCapture={onPointerCancelCapture}
    >
      <div key={epoch}>{children}</div>
      <style jsx>{`
        .networkReleaseGestureBoundary { width: 100%; min-width: 0; }
      `}</style>
    </div>
  );
}
