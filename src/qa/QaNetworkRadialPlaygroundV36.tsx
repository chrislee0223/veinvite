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

export function QaNetworkRadialPlaygroundV36() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const pinchGestureRef = useRef(false);
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

    const temporarilyBlockSemanticNavigation = () => {
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button.ringNode.person'));
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions>button'))
        .find((button) => button.textContent?.includes('Inviter'));
      if (inviter) buttons.push(inviter);

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
        // The second finger must never replace the single-finger pan owner in V35.
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

      // Pinch is handled by V35's touch events. Block its pointer-pan path while two-finger
      // intent is active so camera movement cannot be mistaken for a one-finger drag.
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
      // V35 briefly marks a nearby node as a zoom target. V36 makes mobile pinch visual-only.
      queueMicrotask(clearZoomTargets);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinchGestureRef.current) return;
      queueMicrotask(clearZoomTargets);
    };

    const onTouchFinish = (event: TouchEvent) => {
      if (!pinchGestureRef.current) return;

      // Let V35 finish and clear its internal pinch state, but make both semantic outcomes
      // impossible for this event: pinch-in cannot enter a node and pinch-out cannot go back.
      temporarilyBlockSemanticNavigation();
      guardGhostClick();
      queueMicrotask(clearZoomTargets);

      if (event.touches.length === 0) {
        queueMicrotask(() => {
          pinchGestureRef.current = false;
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
        .v36Root .labHeader>div:first-child::after{content:'Mobile gestures · tap / pan / pinch separated · pinch is zoom-only'!important}
        .v36Root.v36Pinching .ringNode.person .floatInner{filter:none!important}
        .v36Root.v36Pinching .ringNode.person .ringCircle{box-shadow:none!important}
        .v36Root.v36Pinching .ringNode.zoomTarget .floatInner{animation:none!important;transform:none!important}
        .v36Root.v36Pinching .ringNode.zoomTarget .ringCircle{border-color:inherit!important;box-shadow:none!important}
      `}</style>
    </div>
  );
}
