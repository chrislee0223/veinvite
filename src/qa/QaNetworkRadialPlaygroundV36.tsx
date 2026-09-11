'use client';

import { useEffect, useRef } from 'react';
import { QaNetworkRadialPlaygroundV35 } from './QaNetworkRadialPlaygroundV35';

const PAN_THRESHOLD = 10;
const GHOST_CLICK_GUARD_MS = 420;
const MIN_VISUAL_ZOOM = .58;
const MAX_VISUAL_ZOOM = 2;
const BACK_VISUAL_THRESHOLD = .9;

type TouchPan = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null;

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function QaNetworkRadialPlaygroundV36() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const pinchGestureRef = useRef(false);
  const pinchStartedOnNodeRef = useRef(false);
  const pinchStartDistanceRef = useRef(0);
  const pinchStartVisualZoomRef = useRef(1);
  const pinchRatioRef = useRef(1);
  const visualZoomRef = useRef(1);
  const panRef = useRef<TouchPan>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const readBaseZoom = () => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      const value = Number.parseInt(text, 10);
      return Number.isFinite(value) ? Math.max(.01, value / 100) : 1;
    };

    const hasCustomZoom = () => root.style.getPropertyValue('--v36VisualZoom').trim().length > 0;

    const applyVisualZoom = (value: number) => {
      const resolved = clamp(value, MIN_VISUAL_ZOOM, MAX_VISUAL_ZOOM);
      visualZoomRef.current = resolved;
      root.style.setProperty('--v36VisualZoom', String(resolved));
    };

    const clearVisualZoom = () => {
      root.style.removeProperty('--v36VisualZoom');
      visualZoomRef.current = readBaseZoom();
    };

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

    const temporarilyBlockBack = () => {
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions>button'))
        .find((button) => button.textContent?.includes('Inviter'));
      if (!inviter) return;
      const wasDisabled = inviter.disabled;
      inviter.disabled = true;
      queueMicrotask(() => {
        if (inviter.isConnected) inviter.disabled = wasDisabled;
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
      pinchRatioRef.current = 1;
      pinchStartedOnNodeRef.current = Boolean(midpointNode(event));
      pinchStartVisualZoomRef.current = hasCustomZoom() ? visualZoomRef.current : readBaseZoom();

      // Blank-space pinch is a real camera zoom with its own wider visual range.
      // Only a gesture whose midpoint actually starts on a person may become node entry.
      if (!pinchStartedOnNodeRef.current) queueMicrotask(clearZoomTargets);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinchGestureRef.current || event.touches.length < 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      const ratio = touchDistance(a, b) / Math.max(1, pinchStartDistanceRef.current);
      pinchRatioRef.current = ratio;

      if (!pinchStartedOnNodeRef.current) {
        applyVisualZoom(pinchStartVisualZoomRef.current * ratio);
        queueMicrotask(clearZoomTargets);
      }
    };

    const onTouchFinish = (event: TouchEvent) => {
      if (!pinchGestureRef.current) return;

      const ratio = pinchRatioRef.current;
      const center = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';

      if (pinchStartedOnNodeRef.current) {
        // Semantic node pinch stays unchanged. Clear any prior free-zoom override only
        // when the gesture is strong enough to enter a node or return to the parent.
        if (ratio >= 1.42 || (center !== 'YOU' && ratio <= .78)) clearVisualZoom();
      } else {
        // Blank-space pinch can never enter a nearby node.
        temporarilyBlockPersonEntry();
        queueMicrotask(clearZoomTargets);

        // When already deeply zoomed in, pinching out first reduces the visual zoom.
        // Parent navigation only becomes available once the view is reasonably zoomed out.
        if (center !== 'YOU' && ratio <= .78) {
          if (visualZoomRef.current > BACK_VISUAL_THRESHOLD) temporarilyBlockBack();
          else clearVisualZoom();
        }
      }

      guardGhostClick();

      if (event.touches.length === 0) {
        queueMicrotask(() => {
          pinchGestureRef.current = false;
          pinchStartedOnNodeRef.current = false;
          pinchStartDistanceRef.current = 0;
          pinchStartVisualZoomRef.current = visualZoomRef.current;
          pinchRatioRef.current = 1;
          root.classList.remove('v36Pinching');
        });
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('button') as HTMLButtonElement | null;

      // Manual zoom controls and YOU reset return to the native zoom state first.
      if (button?.closest('.zoomControls') || button?.textContent?.trim() === '◎ YOU') clearVisualZoom();

      if (performance.now() >= suppressClickUntilRef.current) return;
      if (!target?.closest('.stage')) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    let identity = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
    const observer = new MutationObserver(() => {
      const nextIdentity = root.querySelector<HTMLElement>('.identity b')?.textContent?.trim() ?? 'YOU';
      if (nextIdentity === identity) return;
      identity = nextIdentity;
      clearVisualZoom();
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });

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
      observer.disconnect();
      root.style.removeProperty('--v36VisualZoom');
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
        .v36Root .labHeader>div:first-child::after{content:'Node pinch enters · blank-space zoom up to 200% · pinch-out returns to parent'!important}
        .v36Root .scene{transform:translate3d(var(--camera35X),var(--camera35Y),0) scale(var(--v36VisualZoom,var(--sceneScale)))!important;transform-origin:50% 50%!important}
        .v36Root.v36Pinching .ringNode.person .floatInner{filter:none!important}
        .v36Root.v36Pinching .ringNode.zoomTarget .floatInner{animation:none!important}
      `}</style>
    </div>
  );
}
