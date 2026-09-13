'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV47 } from './AppNetworkCanaryV47';

const PINCH_CLICK_SUPPRESS_MS = 700;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readZoom(zoomValue: HTMLElement) {
  const parsed = Number.parseFloat(zoomValue.textContent?.replace('%', '') ?? '100');
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function NetworkPinchAndSpacingCorrections() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const zoomValue = root?.querySelector<HTMLElement>('.zoomValue');
    if (!root || !stage || !zoomValue) return;

    let pinchGestureActive = false;
    let suppressTrustedClicksUntil = 0;

    const syncSpacing = () => {
      const zoom = readZoom(zoomValue);
      const high = clamp((zoom - 1.45) / (2.5 - 1.45), 0, 1);
      const nodeScale = 1 - high * .32;
      const personCircleCenterY = 26;
      const slotCircleCenterY = 23;
      const screenGap = 7;
      const secondaryScreenStep = 19;

      const personLabelY = personCircleCenterY + 26 * nodeScale + screenGap / zoom;
      const personMetaY = personLabelY + secondaryScreenStep / zoom;
      const slotLabelY = slotCircleCenterY + 23 * nodeScale + screenGap / zoom;

      root.style.setProperty('--v48-person-label-y', `${personLabelY.toFixed(2)}px`);
      root.style.setProperty('--v48-person-meta-y', `${personMetaY.toFixed(2)}px`);
      root.style.setProperty('--v48-slot-label-y', `${slotLabelY.toFixed(2)}px`);
    };

    const zoomObserver = new MutationObserver(syncSpacing);
    zoomObserver.observe(zoomValue, { childList: true, subtree: true, characterData: true });
    syncSpacing();

    const beginPinchLock = () => {
      pinchGestureActive = true;
      suppressTrustedClicksUntil = Number.POSITIVE_INFINITY;
      root.classList.add('v48PinchGesture');
    };

    const endPinchLock = () => {
      pinchGestureActive = false;
      suppressTrustedClicksUntil = performance.now() + PINCH_CLICK_SUPPRESS_MS;
      root.classList.remove('v48PinchGesture');
    };

    const onTouchStartCapture = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target)) return;
      if (event.touches.length >= 2) beginPinchLock();
    };

    const onTouchEndCapture = (event: TouchEvent) => {
      if (!pinchGestureActive) return;
      // A two-finger gesture is not considered finished when it becomes one
      // finger. Keep every trusted click locked until every finger is lifted.
      if (event.touches.length === 0) endPinchLock();
    };

    const onTouchCancelCapture = (event: TouchEvent) => {
      if (!pinchGestureActive) return;
      if (event.touches.length === 0) endPinchLock();
    };

    const onTrustedClickCapture = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      if (!pinchGestureActive && performance.now() >= suppressTrustedClicksUntil) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !root.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const clearGestureState = () => {
      if (pinchGestureActive) endPinchLock();
      else suppressTrustedClicksUntil = performance.now() + PINCH_CLICK_SUPPRESS_MS;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearGestureState();
    };

    root.addEventListener('touchstart', onTouchStartCapture, { capture: true, passive: true });
    root.addEventListener('touchend', onTouchEndCapture, { capture: true, passive: true });
    root.addEventListener('touchcancel', onTouchCancelCapture, { capture: true, passive: true });
    root.addEventListener('click', onTrustedClickCapture, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearGestureState);

    return () => {
      zoomObserver.disconnect();
      root.removeEventListener('touchstart', onTouchStartCapture, true);
      root.removeEventListener('touchend', onTouchEndCapture, true);
      root.removeEventListener('touchcancel', onTouchCancelCapture, true);
      root.removeEventListener('click', onTrustedClickCapture, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearGestureState);
      root.classList.remove('v48PinchGesture');
      root.style.removeProperty('--v48-person-label-y');
      root.style.removeProperty('--v48-person-meta-y');
      root.style.removeProperty('--v48-slot-label-y');
    };
  }, []);

  return <style jsx global>{`
    /* The visible circles are the only pointer hit targets. Wallet labels,
       direct/network metadata and Available text behave like canvas content. */
    .productionNetworkCanaryV45 .personNode,
    .productionNetworkCanaryV45 .slotNode,
    .productionNetworkCanaryV45 .clusterNode{
      pointer-events:none!important
    }
    .productionNetworkCanaryV45 .personNode .nodeCircle,
    .productionNetworkCanaryV45 .slotNode .slotCircle,
    .productionNetworkCanaryV45 .clusterNode>span{
      pointer-events:auto!important
    }
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small,
    .productionNetworkCanaryV45 .slotNode>b{
      pointer-events:none!important
    }

    /* Preserve the existing node anchor box while placing metadata from the
       visual circle edge. The screen-space gap stays nearly constant as zoom
       changes, including V46's high-zoom circle size compensation. */
    .productionNetworkCanaryV45 .personNode{
      width:116px!important;height:78px!important;display:block!important;overflow:visible!important
    }
    .productionNetworkCanaryV45 .personNode .nodeCircle{
      position:absolute!important;left:50%!important;top:0!important;margin:0!important;
      transform:translateX(-50%) scale(var(--v46-node-scale,1))!important;
      transform-origin:50% 50%!important
    }
    .productionNetworkCanaryV45 .personNode.canarySelectedNode .nodeCircle,
    .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42SelectedMember .nodeCircle,
    .productionNetworkCanaryV45 .v44GroupUxRoot .personNode.v44PendingNewGroupMember .nodeCircle,
    .productionNetworkCanaryV45 .personNode.pressing .nodeCircle{
      transform:translateX(-50%) scale(var(--v46-selected-scale,1.07))!important
    }
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small{
      position:absolute!important;left:50%!important;width:max-content!important;max-width:180px!important;
      margin:0!important;text-align:center!important;white-space:nowrap!important;
      transform:translateX(-50%) scale(var(--v46-label-scale,1))!important;
      transform-origin:50% 0!important
    }
    .productionNetworkCanaryV45 .personNode>b{top:var(--v48-person-label-y,59px)!important}
    .productionNetworkCanaryV45 .personNode>small{top:var(--v48-person-meta-y,78px)!important}

    .productionNetworkCanaryV45 .slotNode{
      width:104px!important;height:60px!important;display:block!important;overflow:visible!important
    }
    .productionNetworkCanaryV45 .slotNode .slotCircle{
      position:absolute!important;left:50%!important;top:0!important;margin:0!important;
      transform:translateX(-50%) scale(var(--v46-node-scale,1))!important;
      transform-origin:50% 50%!important
    }
    .productionNetworkCanaryV45 .slotNode.pressing .slotCircle{
      transform:translateX(-50%) scale(var(--v46-selected-scale,1.07))!important
    }
    .productionNetworkCanaryV45 .slotNode>b{
      position:absolute!important;left:50%!important;top:var(--v48-slot-label-y,53px)!important;
      width:max-content!important;margin:0!important;text-align:center!important;
      transform:translateX(-50%) scale(var(--v46-label-scale,1))!important;
      transform-origin:50% 0!important
    }

    .productionNetworkCanaryV45.v48PinchGesture .personNode .nodeCircle,
    .productionNetworkCanaryV45.v48PinchGesture .slotNode .slotCircle,
    .productionNetworkCanaryV45.v48PinchGesture .clusterNode>span{
      pointer-events:none!important
    }
    .productionNetworkCanaryV45.v48PinchGesture .personNode>b,
    .productionNetworkCanaryV45.v48PinchGesture .personNode>small,
    .productionNetworkCanaryV45.v48PinchGesture .slotNode>b{
      transition:none!important
    }
    .productionNetworkCanaryV45.veinviteInteracting .personNode>b,
    .productionNetworkCanaryV45.veinviteInteracting .personNode>small,
    .productionNetworkCanaryV45.veinviteInteracting .slotNode>b{
      transition:none!important
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .personNode>b,
      .productionNetworkCanaryV45 .personNode>small,
      .productionNetworkCanaryV45 .slotNode>b{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV48({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV47 locale={locale} />
    <NetworkPinchAndSpacingCorrections />
  </>;
}
