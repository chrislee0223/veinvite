'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV73 } from './AppNetworkCanaryV73';

const MOBILE_BREAKPOINT_PX = 700;
const MOBILE_STAGE_MIN_PX = 420;
const BOTTOM_NAV_GAP_PX = 16;
const RESIZE_RETRY_MS = 96;

function NetworkViewportStabilityV74() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    const previousHeight = stage.style.height;
    const previousMinHeight = stage.style.minHeight;
    let resizeFrame = 0;
    let retryTimer: number | null = null;

    const interactionBusy = () =>
      root.classList.contains('veinviteInteracting') ||
      root.classList.contains('v50NetworkTransition') ||
      root.classList.contains('v72ParentReturnTarget') ||
      root.classList.contains('v73LiveReturnHidden') ||
      Boolean(root.querySelector('.personNode.v69CreateDragSource'));

    const restoreMeasuredStyles = (height: string, minHeight: string) => {
      if (height) stage.style.height = height;
      else stage.style.removeProperty('height');
      if (minHeight) stage.style.minHeight = minHeight;
      else stage.style.removeProperty('min-height');
    };

    const measureNaturalStage = () => {
      const ownedHeight = stage.style.height;
      const ownedMinHeight = stage.style.minHeight;
      stage.style.removeProperty('height');
      stage.style.removeProperty('min-height');
      const rect = stage.getBoundingClientRect();
      restoreMeasuredStyles(ownedHeight, ownedMinHeight);
      return rect;
    };

    const applyStableStageSize = () => {
      resizeFrame = 0;

      if (interactionBusy()) {
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          scheduleStageSize();
        }, RESIZE_RETRY_MS);
        return;
      }

      if (window.innerWidth > MOBILE_BREAKPOINT_PX) {
        stage.style.removeProperty('height');
        stage.style.removeProperty('min-height');
        return;
      }

      const navTrack = document.querySelector<HTMLElement>('.bottomNavigation > div');
      if (!navTrack) return;

      // Always measure from the CSS-defined natural stage, not from the last
      // inline height. The old handler could shrink the stage once and then use
      // that already-shrunken box as its next ceiling, so address-bar, keyboard
      // or orientation changes could never grow the canvas back again.
      root.classList.add('v74StageSizing');
      const naturalRect = measureNaturalStage();
      const navRect = navTrack.getBoundingClientRect();
      const availableHeight = Math.floor(navRect.top - BOTTOM_NAV_GAP_PX - naturalRect.top);
      const targetHeight = Math.max(
        MOBILE_STAGE_MIN_PX,
        Math.min(Math.round(naturalRect.height), availableHeight),
      );

      stage.style.height = `${targetHeight}px`;
      stage.style.minHeight = `${MOBILE_STAGE_MIN_PX}px`;
      root.classList.remove('v74StageSizing');
    };

    function scheduleStageSize() {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(applyStableStageSize);
    }

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', scheduleStageSize);
    window.addEventListener('orientationchange', scheduleStageSize);
    visualViewport?.addEventListener('resize', scheduleStageSize);
    scheduleStageSize();

    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener('resize', scheduleStageSize);
      window.removeEventListener('orientationchange', scheduleStageSize);
      visualViewport?.removeEventListener('resize', scheduleStageSize);
      root.classList.remove('v74StageSizing');
      restoreMeasuredStyles(previousHeight, previousMinHeight);
    };
  }, []);

  return <style jsx global>{`
    /* The inherited V37 90ms transform transition makes live wheel/pinch/pan
       chase the user's finger and can create a final nudge after passive layout
       work. Camera motion is immediate by default; only deliberate navigation
       transitions keep their existing long animation. */
    .productionNetworkCanaryV45:not(.v50NetworkTransition)
      .stage:not(.cameraTransition) .scene {
      transition: none !important;
    }

    .productionNetworkCanaryV45.v74StageSizing .scene,
    .productionNetworkCanaryV45.v72ParentReturnTarget .scene {
      transition: none !important;
    }
  `}</style>;
}

export function AppNetworkCanaryV74({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV73 locale={locale} />
      <NetworkViewportStabilityV74 />
    </>
  );
}
