'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV45 } from './AppNetworkCanaryV45';

const INTRO_SESSION_KEY = 'veinvite:network:intro-v2';
const INTRO_HOLD_MS = 300;
const INTRO_END_MS = 1120;

function NetworkViewportPolish() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const zoomValue = root?.querySelector<HTMLElement>('.zoomValue');
    if (!root || !stage || !zoomValue) return;

    let introTimer: number | null = null;
    let introWheelTimer: number | null = null;
    let introEndTimer: number | null = null;
    let introActive = false;

    const readZoom = () => {
      const parsed = Number.parseFloat(zoomValue.textContent?.replace('%', '') ?? '100');
      return Number.isFinite(parsed) ? parsed / 100 : 1;
    };

    const syncZoomTier = () => {
      const zoom = readZoom();
      const tier = zoom <= .58
        ? 'overview'
        : zoom >= 2.15
          ? 'max'
          : zoom >= 1.75
            ? 'close'
            : 'normal';
      if (root.dataset.veinviteZoomTier !== tier) root.dataset.veinviteZoomTier = tier;
    };

    const zoomObserver = new MutationObserver(syncZoomTier);
    zoomObserver.observe(zoomValue, { childList: true, subtree: true, characterData: true });
    syncZoomTier();

    const blockLegacyIntroFit = (event: MouseEvent) => {
      if (!introActive) return;
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('.viewActions button')
        : null;
      if (!button || !root.contains(button) || button.textContent?.trim() !== 'Fit') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let introSeen = false;
    try { introSeen = window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1'; } catch { introSeen = false; }

    if (!reducedMotion && !introSeen) {
      try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional session hint */ }
      introActive = true;
      root.classList.add('veinviteIntroV2');
      root.addEventListener('click', blockLegacyIntroFit, true);

      introTimer = window.setTimeout(() => {
        const minus = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
          .find((button) => button.textContent?.trim() === '−');
        // 100% → 52% using the existing zoom control, keeping YOU centered.
        for (let step = 0; step < 4; step += 1) minus?.click();

        // One existing wheel-zoom step brings 52% to ~47%, still centered on YOU.
        introWheelTimer = window.setTimeout(() => {
          const rect = stage.getBoundingClientRect();
          try {
            stage.dispatchEvent(new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              deltaY: 100,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            }));
          } catch {
            // A hardened WebView may reject synthetic wheel construction; 52%
            // remains a safe fallback and Fit itself is intentionally untouched.
          }
        }, 40);
      }, INTRO_HOLD_MS);

      introEndTimer = window.setTimeout(() => {
        introActive = false;
        root.classList.remove('veinviteIntroV2');
        root.removeEventListener('click', blockLegacyIntroFit, true);
        syncZoomTier();
      }, INTRO_END_MS);
    }

    return () => {
      zoomObserver.disconnect();
      if (introTimer !== null) window.clearTimeout(introTimer);
      if (introWheelTimer !== null) window.clearTimeout(introWheelTimer);
      if (introEndTimer !== null) window.clearTimeout(introEndTimer);
      root.removeEventListener('click', blockLegacyIntroFit, true);
      root.classList.remove('veinviteIntroV2');
      delete root.dataset.veinviteZoomTier;
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.veinviteIntroV2 .scene{
      transition:transform 760ms cubic-bezier(.18,.82,.2,1)!important
    }
    .productionNetworkCanaryV45.veinviteIntroV2 .zoomValue{opacity:0!important}

    .productionNetworkCanaryV45 .spoke,
    .productionNetworkCanaryV45 .v42GroupEdges path{
      vector-effect:non-scaling-stroke
    }

    .productionNetworkCanaryV45 .centerWrap{
      transition:transform 170ms ease!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='overview'] .centerWrap{
      gap:0!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='overview'] .centerWrap>b,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='overview'] .centerWrap>small{
      height:0!important;line-height:0!important;overflow:hidden!important;
      opacity:0!important;pointer-events:none!important
    }
    .productionNetworkCanaryV45 .centerWrap>b,
    .productionNetworkCanaryV45 .centerWrap>small{
      transition:opacity 180ms ease,transform 180ms ease
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='overview'] .v39MidZoom .spoke:not(.slotSpoke):not(.clusterSpoke){
      opacity:.34!important;stroke-width:.9!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='overview'] .v39MidZoom .slotSpoke{
      opacity:.48!important
    }

    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .centerWrap{
      transform:translate(-50%,-50%) scale(.8)!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .centerWrap{
      transform:translate(-50%,-50%) scale(.62)!important
    }

    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .personNode{width:92px!important}
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .slotNode{width:82px!important}
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .personNode{width:68px!important}
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .slotNode{width:64px!important}

    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .nodeCircle,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .slotCircle{
      transform:scale(.86)!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .nodeCircle,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .slotCircle{
      transform:scale(.68)!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .personNode.canarySelectedNode .nodeCircle{
      transform:scale(.9)!important
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .personNode.canarySelectedNode .nodeCircle{
      transform:scale(.72)!important
    }

    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .personNode>b,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .personNode>small,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='close'] .slotNode>b{
      transform:scale(.88);transform-origin:50% 0
    }
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .personNode>b,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .personNode>small,
    .productionNetworkCanaryV45[data-veinvite-zoom-tier='max'] .slotNode>b{
      transform:scale(.7);transform-origin:50% 0
    }
    .productionNetworkCanaryV45 .nodeCircle,
    .productionNetworkCanaryV45 .slotCircle,
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small,
    .productionNetworkCanaryV45 .slotNode>b{
      transition:transform 170ms ease,opacity 180ms ease
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .centerWrap,
      .productionNetworkCanaryV45 .nodeCircle,
      .productionNetworkCanaryV45 .slotCircle,
      .productionNetworkCanaryV45 .personNode>b,
      .productionNetworkCanaryV45 .personNode>small,
      .productionNetworkCanaryV45 .slotNode>b{
        transition:none!important
      }
    }
  `}</style>;
}

export function AppNetworkCanaryV46({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV45 locale={locale} />
    <NetworkViewportPolish />
  </>;
}
