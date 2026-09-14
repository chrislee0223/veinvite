'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV68 } from './AppNetworkCanaryV68';

const DRAG_THRESHOLD_PX = 10;

type CreateDrag = {
  pointerId: number;
  pointerType: string;
  node: HTMLButtonElement;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  moved: boolean;
  ghost: HTMLDivElement | null;
};

function NetworkCreateGroupDragGhostV69() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let drag: CreateDrag | null = null;
    let multiTouchBlocked = false;
    const touchPointers = new Set<number>();

    const createDrop = () => root.querySelector<HTMLElement>('.v44CreateDropMore');
    const createEditorOpen = () => Boolean(createDrop() && root.querySelector('.v42GroupPanel input'));

    const removeGhost = (current: CreateDrag | null) => {
      if (!current) return;
      current.ghost?.remove();
      current.ghost = null;
      current.node.classList.remove('v69CreateDragSource');
    };

    const releaseCapture = (current: CreateDrag | null) => {
      if (!current) return;
      try {
        if (current.node.hasPointerCapture(current.pointerId)) {
          current.node.releasePointerCapture(current.pointerId);
        }
      } catch {
        // Pointer capture is best-effort in older embedded WebViews.
      }
    };

    const clearDrag = () => {
      const current = drag;
      drag = null;
      removeGhost(current);
      releaseCapture(current);
    };

    const cancelUnderlyingCreateDrag = (current: CreateDrag) => {
      clearDrag();
      if (!current.node.isConnected) return;
      try {
        current.node.dispatchEvent(new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: current.pointerId,
          pointerType: current.pointerType || 'touch',
        }));
      } catch {
        // Visual cleanup is sufficient if this WebView cannot construct PointerEvent.
      }
    };

    const cancelActiveDrag = () => {
      const current = drag;
      if (current) cancelUnderlyingCreateDrag(current);
    };

    const makeGhost = (current: CreateDrag) => {
      if (current.ghost || !current.node.isConnected) return current.ghost;

      const ghost = document.createElement('div');
      ghost.className = 'v69CreateDragGhost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${current.width}px`;
      ghost.style.height = `${Math.max(current.height, 92)}px`;

      const circle = current.node.querySelector<HTMLElement>('.nodeCircle')?.cloneNode(true);
      const label = current.node.querySelector<HTMLElement>(':scope > b')?.cloneNode(true);
      const meta = current.node.querySelector<HTMLElement>(':scope > small')?.cloneNode(true);
      if (circle) ghost.appendChild(circle);
      if (label) ghost.appendChild(label);
      if (meta) ghost.appendChild(meta);

      document.body.appendChild(ghost);
      current.ghost = ghost;
      current.node.classList.add('v69CreateDragSource');
      return ghost;
    };

    const positionGhost = (current: CreateDrag, clientX: number, clientY: number) => {
      const ghost = makeGhost(current);
      if (!ghost) return;
      ghost.style.left = `${clientX - current.grabX}px`;
      ghost.style.top = `${clientY - current.grabY}px`;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touchPointers.add(event.pointerId);
        if (touchPointers.size > 1) {
          multiTouchBlocked = true;
          cancelActiveDrag();
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
      }

      if (!event.isTrusted || multiTouchBlocked || !createEditorOpen()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!node || !root.contains(node) || node.classList.contains('v42CollapsedMember')) return;

      clearDrag();
      const rect = node.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        node,
        startX: event.clientX,
        startY: event.clientY,
        grabX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        grabY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        width: rect.width,
        height: rect.height,
        moved: false,
        ghost: null,
      };

      try { node.setPointerCapture(event.pointerId); } catch { /* best-effort */ }
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = drag;
      if (!event.isTrusted || multiTouchBlocked || !current || current.pointerId !== event.pointerId) return;
      if (!createEditorOpen()) {
        cancelUnderlyingCreateDrag(current);
        return;
      }

      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (!current.moved && distance < DRAG_THRESHOLD_PX) return;
      current.moved = true;
      positionGhost(current, event.clientX, event.clientY);
    };

    const finishPointer = (event: PointerEvent) => {
      if (drag?.pointerId === event.pointerId) clearDrag();
      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) multiTouchBlocked = false;
      }
    };

    const cancelPointer = (event: PointerEvent) => {
      if (drag?.pointerId === event.pointerId) clearDrag();
      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        if (touchPointers.size === 0) multiTouchBlocked = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActiveDrag();
    };

    const onBlur = () => cancelActiveDrag();

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', cancelPointer, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', cancelPointer, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearDrag();
      touchPointers.clear();
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV69({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV68 locale={locale} />
      <NetworkCreateGroupDragGhostV69 />
      <style jsx global>{`
        .productionNetworkCanaryV45 .personNode.v69CreateDragSource {
          opacity: .44 !important;
        }

        .v69CreateDragGhost {
          position: fixed;
          z-index: 2147483000;
          box-sizing: border-box;
          pointer-events: none !important;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          display: block;
          color: #d7d0c3;
          filter: drop-shadow(0 9px 18px rgba(0,0,0,.34));
          will-change: left, top;
        }

        .v69CreateDragGhost > .nodeCircle {
          position: absolute !important;
          left: 50% !important;
          top: 0 !important;
          width: 52px !important;
          height: 52px !important;
          transform: translateX(-50%) scale(1.045) !important;
          border: 1px solid rgba(244,183,40,.88) !important;
          border-radius: 50% !important;
          background-color: #0d0d0b !important;
          color: #e1b94f !important;
          box-shadow: 0 0 0 4px rgba(244,183,40,.09), 0 0 26px rgba(244,183,40,.12) !important;
          opacity: .98 !important;
        }

        .v69CreateDragGhost > b,
        .v69CreateDragGhost > small {
          position: absolute !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: max-content;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
        }

        .v69CreateDragGhost > b {
          top: 59px !important;
          color: #f0c755 !important;
          font-size: .47rem !important;
        }

        .v69CreateDragGhost > small {
          top: 78px !important;
          color: #81786b !important;
          font-size: .38rem !important;
        }

        @media (max-width: 700px) {
          .v69CreateDragGhost {
            filter: drop-shadow(0 7px 14px rgba(0,0,0,.3));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .v69CreateDragGhost { filter: none; }
        }
      `}</style>
    </>
  );
}
