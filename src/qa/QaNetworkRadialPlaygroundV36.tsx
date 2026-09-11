'use client';

import { useEffect, useRef } from 'react';
import { QaNetworkRadialPlaygroundV35 } from './QaNetworkRadialPlaygroundV35';

const PAN_THRESHOLD = 10;
const GHOST_CLICK_GUARD_MS = 420;

type TouchPan = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null;

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function QaNetworkRadialPlaygroundV36() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const pinchGestureRef = useRef(false);
  const pinchStartedOnNodeRef = useRef(false);
  const pinchStartDistanceRef = useRef(0);
  const panRef = useRef<TouchPan>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const clearZoomTargets = () => {
      for (const node of Array.from(root.querySelectorAll<HTMLElement>('.ringNode.zoomTarget'))) {
        node.classList.remove('zoomTarget');
      }
    };

    const midpointNode = (event: TouchEvent) => {
      if (event.touches.length < 2) return null;
      const a = event.touches[0];
      const b = event.touches[1];
      const x = (a.clientX + b.clientX) / 2;
      const y = (a.clientY + b.clientY) / 2;
      const direct = document.elementFromPoint(x, y)?.closest('button.ringNode.person') as HTMLButtonElement | null;
      return direct && root.contains(direct) && !direct.disabled ? direct : null;
    };

    const temporarilyBlockPersonEntry = () => {
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button.ringNode.person'));
      const previous = buttons.map((button) => [button, button.disabled] as const);
      for (const [button] of previous) button.disabled = true;

      queueMicrotask(() => {
        for (const [button, wasDisabled] of previous) {
          if (button.isConnected) button.disabled = wasDisabled;
        }
      });
    };

    const guardGhostClick = () => {
      suppressClickUntilRef.current = performance.now() + GHOST_CLICK_GUARD_MS;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;

      activeTouchPointersRef.current.add(event.pointerId);
      if (activeTouchPointersRef.current.size >= 2) {
        pinchGestureRef.current = true;
        panRef.current = null;
        root.classList.add('v36Pinching');
        event.stopPropagation();
        return;
      }

      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;

      if (pinchGestureRef.current) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        return;
      }

      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId || pan.moved) return;
      if (Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) >= PAN_THRESHOLD) {
        pan.moved = true;
      }
    };

    const onPointerFinish = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;

      activeTouchPointersRef.current.delete(event.pointerId);
      const pan = panRef.current;
      if (pan?.pointerId === event.pointerId) {
        if (pan.moved) guardGhostClick();
        panRef.current = null;
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinchGestureRef.current = true;
      root.classList.add('v36Pinching');

      const a = event.touches[0];
      const b = event.touches[1];
      pinchStartDistanceRef.current = Math.max(1, touchDistance(a, b));
      pinchStartedOnNodeRef.current = Boolean(midpointNode(event));

      // Blank-space pinch must stay a pure camera zoom. Only a pinch whose midpoint
      // actually begins on a person node may become semantic node entry.
      if (!pinchStartedOnNodeRef.current) queueMicrotask(clearZoomTargets);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinchGestureRef.current || event.touches.length < 2) return;
      if (!pinchStartedOnNodeRef.current) queueMicrotask(clearZoomTargets);
    };

    const onTouchFinish = (event: TouchEvent) => {
      if (!pinchGestureRef.current) return;

      // Preserve V35 semantic zoom rules when the gesture actually started on a node:
      // pinch-in enters that node; pinch-out from a child context returns to the inviter.
      // For a blank-space pinch, only person-entry is blocked. Back-navigation remains
      // available on pinch-out so users can still return to the parent network.
      if (!pinchStartedOnNodeRef.current) temporarilyBlockPersonEntry();

      guardGhostClick();
      if (!pinchStartedOnNodeRef.current) queueMicrotask(clearZoomTargets);

      if (event.touches.length === 0) {
        queueMicrotask(() => {
          pinchGestureRef.current = false;
          pinchStartedOnNodeRef.current = false;
          pinchStartDistanceRef.current = 0;
          root.classList.remove('v36Pinching');
        });
      }
    };

    const onClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntilRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.stage')) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    root.addEventListener('pointerup', onPointerFinish, true);
    root.addEventListener('pointercancel', onPointerFinish, true);
    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    root.addEventListener('touchend', onTouchFinish, { capture: true, passive: true });
    root.addEventListener('touchcancel', onTouchFinish, { capture: true, passive: true });
    root.addEventListener('click', onClick, true);

    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', onPointerFinish, true);
      root.removeEventListener('pointercancel', onPointerFinish, true);
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', onTouchFinish, true);
      root.removeEventListener('touchcancel', onTouchFinish, true);
      root.removeEventListener('click', onClick, true);
    };
  }, []);

  return (
    <div ref={rootRef} className="v36Root">
      <QaNetworkRadialPlaygroundV35 />
      <style jsx global>{`
        .v36Root .labHeader>div:first-child::before{content:'RADIAL NETWORK PLAYGROUND · V36'!important}
        .v36Root .labHeader>div:first-child::after{content:'Node pinch enters · blank pinch zooms · pinch-out returns to parent'!important}
        .v36Root.v36Pinching .ringNode.person .floatInner{filter:none!important}
        .v36Root.v36Pinching .ringNode.zoomTarget .floatInner{animation:none!important}
      `}</style>
    </div>
  );
}
