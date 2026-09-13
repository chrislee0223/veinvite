'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV46 } from './AppNetworkCanaryV46';

const DRAG_THRESHOLD_PX = 10;
const CLICK_SUPPRESS_AFTER_GESTURE_MS = 450;

type DirectDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLButtonElement;
  moved: boolean;
};

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function curvePath(x: number, y: number) {
  const bend = Math.sign(x || 1) * Math.min(64, Math.abs(x) * .17);
  return `M 0 0 C ${bend} ${y * .22}, ${x - bend} ${y * .78}, ${x} ${y}`;
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function NetworkInteractionCorrections() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let drag: DirectDrag | null = null;
    let cleanupFrame = 0;
    let pathFrame = 0;
    let pinchActive = false;
    let suppressNodeClickUntil = 0;

    const centerWrap = root.querySelector<HTMLElement>('.centerWrap');
    const centerLabel = centerWrap?.querySelector<HTMLElement>(':scope > b') ?? null;

    const syncCenterIdentity = () => {
      if (!centerWrap || !centerLabel) return;
      centerWrap.classList.toggle('v47YouCenter', centerLabel.textContent?.trim().toUpperCase() === 'YOU');
    };
    syncCenterIdentity();

    const centerObserver = centerWrap && centerLabel
      ? new MutationObserver(syncCenterIdentity)
      : null;
    centerObserver?.observe(centerLabel!, { childList: true, subtree: true, characterData: true });

    const pathForNode = (node: HTMLButtonElement) => {
      const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'));
      const index = nodes.indexOf(node);
      if (index < 0) return null;
      const paths = Array.from(root.querySelectorAll<SVGPathElement>('svg.edges path.spoke:not(.slotSpoke):not(.clusterSpoke)'));
      return paths[index] ?? null;
    };

    const syncPathToNode = (node: HTMLButtonElement, dragDx = 0, dragDy = 0) => {
      const path = pathForNode(node);
      if (!path) return;
      const x = parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) + dragDx;
      const y = parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) + dragDy;
      path.setAttribute('d', curvePath(x, y));
    };

    const validDropAt = (clientX: number, clientY: number) => {
      const targets = Array.from(root.querySelectorAll<HTMLElement>(
        '[data-v42-group-drop],.v44CreateDropMore,.v44NewGroupDrop',
      ));
      return targets.some((target) => {
        const rect = target.getBoundingClientRect();
        const pad = target.classList.contains('v42GroupHub') ? 10 : 3;
        return clientX >= rect.left - pad && clientX <= rect.right + pad &&
          clientY >= rect.top - pad && clientY <= rect.bottom + pad;
      });
    };

    const resetNodeVisual = (node: HTMLButtonElement) => {
      node.style.removeProperty('--v47-drag-dx');
      node.style.removeProperty('--v47-drag-dy');
      node.classList.remove('v47DirectDragging', 'v47ValidDrop');
      root.classList.remove('veinviteGroupDirectDragging');
      window.cancelAnimationFrame(pathFrame);
      pathFrame = window.requestAnimationFrame(() => syncPathToNode(node));
    };

    const finishDirectDrag = (defer = false) => {
      const current = drag;
      if (!current) return;
      drag = null;
      const finish = () => {
        resetNodeVisual(current.target);
        try { current.target.releasePointerCapture(current.pointerId); } catch { /* no-op */ }
      };
      window.cancelAnimationFrame(cleanupFrame);
      if (defer) cleanupFrame = window.requestAnimationFrame(finish);
      else finish();
    };

    const cancelForPinch = () => {
      const current = drag;
      if (!current) return;
      finishDirectDrag(false);
      try {
        current.target.dispatchEvent(new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: current.pointerId,
          pointerType: 'touch',
        }));
      } catch { /* no-op */ }
    };

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const targetElement = event.target instanceof Element ? event.target : null;
      const node = targetElement?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!node || !root.contains(node)) return;

      const circle = targetElement?.closest<HTMLElement>('.nodeCircle') ?? null;
      if (!circle || !node.contains(circle)) {
        // Labels and metadata are intentionally not node hit targets. This also
        // keeps a second pinch finger landing on text from becoming a node drag.
        event.stopPropagation();
        return;
      }

      if (stage.classList.contains('editMode')) return;
      const groupDragContext = root.querySelector('.v42GroupPanel,.v42GroupHub[data-v42-group-drop]');
      if (!groupDragContext) return;

      finishDirectDrag(false);
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        target: node,
        moved: false,
      };
      try { node.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    };

    const onDocumentPointerMove = (event: PointerEvent) => {
      const current = drag;
      if (!current || current.pointerId !== event.pointerId || pinchActive) return;
      const screenDx = event.clientX - current.startX;
      const screenDy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD_PX) return;

      if (!current.moved) {
        current.moved = true;
        suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
        root.classList.add('veinviteGroupDirectDragging');
        current.target.classList.add('v47DirectDragging');
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.closest('.v42GroupPanel')) active.blur();
      }

      const zoom = readZoom(root);
      const dx = screenDx / zoom;
      const dy = screenDy / zoom;
      current.target.style.setProperty('--v47-drag-dx', `${dx}px`);
      current.target.style.setProperty('--v47-drag-dy', `${dy}px`);
      current.target.classList.toggle('v47ValidDrop', validDropAt(event.clientX, event.clientY));
      syncPathToNode(current.target, dx, dy);
    };

    const onDocumentPointerUp = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
      // Let V42/V44 commit the drop first, then remove the temporary visual offset.
      finishDirectDrag(true);
    };

    const onDocumentPointerCancel = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
      finishDirectDrag(false);
    };

    const blockInvalidNodeClick = (event: MouseEvent) => {
      const targetElement = event.target instanceof Element ? event.target : null;
      const node = targetElement?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      if (!node || !root.contains(node)) return;
      const circle = targetElement?.closest<HTMLElement>('.nodeCircle') ?? null;
      const validCircleClick = Boolean(circle && node.contains(circle));
      if (validCircleClick && !pinchActive && performance.now() >= suppressNodeClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinchActive = true;
      suppressNodeClickUntil = Number.POSITIVE_INFINITY;
      cancelForPinch();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (!pinchActive) return;
      pinchActive = false;
      suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
    };

    const onTouchCancel = () => {
      pinchActive = false;
      suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
      cancelForPinch();
    };

    const abortExternalDrag = () => {
      suppressNodeClickUntil = performance.now() + CLICK_SUPPRESS_AFTER_GESTURE_MS;
      finishDirectDrag(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') abortExternalDrag();
    };

    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('pointermove', onDocumentPointerMove, true);
    document.addEventListener('pointerup', onDocumentPointerUp, true);
    document.addEventListener('pointercancel', onDocumentPointerCancel, true);
    root.addEventListener('click', blockInvalidNodeClick, true);
    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', abortExternalDrag);

    return () => {
      centerObserver?.disconnect();
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('pointermove', onDocumentPointerMove, true);
      document.removeEventListener('pointerup', onDocumentPointerUp, true);
      document.removeEventListener('pointercancel', onDocumentPointerCancel, true);
      root.removeEventListener('click', blockInvalidNodeClick, true);
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchend', onTouchEnd, true);
      root.removeEventListener('touchcancel', onTouchCancel, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', abortExternalDrag);
      window.cancelAnimationFrame(cleanupFrame);
      window.cancelAnimationFrame(pathFrame);
      finishDirectDrag(false);
      centerWrap?.classList.remove('v47YouCenter');
      root.classList.remove('veinviteGroupDirectDragging');
    };
  }, []);

  return <style jsx global>{`
    /* V46 used a detached drag ghost. V47 keeps only the real node under the finger. */
    .veinviteNodeDragGhost{display:none!important}

    .productionNetworkCanaryV45 .personNode.v47DirectDragging{
      transform:translate(
        calc(var(--x) + var(--v42-group-dx,0px) + var(--v47-drag-dx,0px) - 50%),
        calc(var(--y) + var(--v42-group-dy,0px) + var(--v47-drag-dy,0px) - 50%)
      )!important;
      z-index:90!important;transition:none!important
    }
    .productionNetworkCanaryV45 .personNode.v47DirectDragging .nodeCircle{
      border-color:rgba(244,183,40,.92)!important;
      box-shadow:0 0 0 4px rgba(244,183,40,.1),0 0 28px rgba(244,183,40,.16)!important
    }
    .productionNetworkCanaryV45 .personNode.v47DirectDragging.v47ValidDrop .nodeCircle{
      border-color:rgba(255,211,77,1)!important;
      box-shadow:0 0 0 5px rgba(244,183,40,.15),0 0 34px rgba(244,183,40,.24)!important
    }
    .productionNetworkCanaryV45.veinviteGroupDirectDragging .v46SlotPulse{
      animation-play-state:paused!important;filter:none!important
    }

    /* Keep the center circle anchored. Labels no longer change its layout box. */
    .productionNetworkCanaryV45 .centerWrap{
      width:74px!important;height:74px!important;display:block!important;gap:0!important;
      transform:translate(-50%,-50%)!important;transition:none!important
    }
    .productionNetworkCanaryV45 .centerWrap .centerCircle{
      position:absolute!important;left:0!important;top:0!important;
      transform:scale(var(--v46-center-scale,1))!important;
      transform-origin:50% 50%!important;transition:transform 90ms linear!important
    }
    .productionNetworkCanaryV45 .centerWrap>b,
    .productionNetworkCanaryV45 .centerWrap>small{
      position:absolute!important;left:50%!important;width:max-content;max-width:180px;
      margin:0!important;text-align:center;pointer-events:none!important;
      transform:translateX(-50%) scale(var(--v46-label-scale,1))!important;
      transform-origin:50% 0!important
    }
    .productionNetworkCanaryV45 .centerWrap>b{top:80px!important}
    .productionNetworkCanaryV45 .centerWrap>small{top:95px!important}
    .productionNetworkCanaryV45 .centerWrap.v47YouCenter>b{display:none!important}
    .productionNetworkCanaryV45 .centerWrap.v47YouCenter>small{top:82px!important}
    .productionNetworkCanaryV45 .centerWrap.v47YouCenter .centerCircle::after{
      content:'YOU'!important;left:50%!important;top:50%!important;width:auto!important;height:auto!important;
      transform:translate(-50%,-50%)!important;border-radius:0!important;background:transparent!important;
      box-shadow:none!important;color:#edc34f!important;font-size:.49rem!important;font-weight:850!important;
      letter-spacing:.045em!important;line-height:1!important
    }

    /* Slightly stronger structure while preserving the continuous V46 zoom curve. */
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .spoke:not(.slotSpoke):not(.clusterSpoke),
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .spoke:not(.slotSpoke):not(.clusterSpoke){
      opacity:calc(var(--v46-line-opacity,.42) + .12)!important;
      stroke-width:1px!important
    }
    .productionNetworkCanaryV45 .spoke.v44CollapsedGroupPath{opacity:0!important}
    .productionNetworkCanaryV45 .v46SlotBase{
      opacity:calc(var(--v46-slot-base-opacity,.5) + .07)!important
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .centerWrap .centerCircle{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV47({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV46 locale={locale} />
    <NetworkInteractionCorrections />
  </>;
}
