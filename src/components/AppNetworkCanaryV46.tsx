'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV45 } from './AppNetworkCanaryV45';

const INTRO_SESSION_KEY = 'veinvite:network:intro-v3';
const INTRO_HOLD_MS = 150;
const INTRO_END_MS = 940;
const LEGACY_FIT_BLOCK_MS = 1400;
const READABLE_FIT_MIN = .46;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function samePaths(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function NetworkSlotLineOverlay() {
  const [host, setHost] = useState<SVGSVGElement | null>(null);
  const [paths, setPaths] = useState<string[]>([]);

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const edges = root?.querySelector<SVGSVGElement>('svg.edges');
    if (!root || !edges) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = Array.from(edges.querySelectorAll<SVGPathElement>('path.slotSpoke'))
          .map((path) => path.getAttribute('d') ?? '')
          .filter(Boolean);
        setPaths((current) => samePaths(current, next) ? current : next);
      });
    };

    setHost(edges);
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') return true;
        return mutation.type === 'attributes' &&
          mutation.attributeName === 'd' &&
          mutation.target instanceof Element &&
          mutation.target.classList.contains('slotSpoke');
      });
      if (relevant) sync();
    });
    observer.observe(edges, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['d'],
    });
    sync();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!host || !paths.length) return null;

  return createPortal(
    <g className="v46SlotOverlay" aria-hidden="true">
      {paths.map((d, index) => <g key={`${index}:${d}`}>
        <path d={d} className="v46SlotBase" />
        <path
          d={d}
          className="v46SlotPulse"
          style={{ animationDelay: `${index * -.92}s` }}
        />
      </g>)}
    </g>,
    host,
  );
}

function NetworkViewportPolish() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const zoomValue = root?.querySelector<HTMLElement>('.zoomValue');
    if (!root || !stage || !zoomValue) return;

    let introTimer: number | null = null;
    let introWheelTimer: number | null = null;
    let introEndTimer: number | null = null;
    let settleEndTimer: number | null = null;
    let legacyBlockTimer: number | null = null;
    let fitFloorTimer: number | null = null;
    let introMotionActive = false;
    let blockLegacyFit = true;
    let allowNextProgrammaticFit = false;

    const readZoom = () => {
      const parsed = Number.parseFloat(zoomValue.textContent?.replace('%', '') ?? '100');
      return Number.isFinite(parsed) ? parsed / 100 : 1;
    };

    const syncZoomPresentation = () => {
      const zoom = readZoom();
      const full = clamp((zoom - .32) / (2.5 - .32), 0, 1);
      const high = clamp((zoom - 1.45) / (2.5 - 1.45), 0, 1);
      const label = clamp((zoom - .48) / .52, 0, 1);
      const visualScale = 1 - high * .32;
      const centerScale = 1 - high * .38;
      const labelScale = 1 - high * .30;

      root.style.setProperty('--v46-line-opacity', (0.36 + full * .16).toFixed(3));
      root.style.setProperty('--v46-slot-base-opacity', (0.44 + full * .12).toFixed(3));
      root.style.setProperty('--v46-slot-pulse-opacity', (0.72 + full * .12).toFixed(3));
      root.style.setProperty('--v46-node-scale', visualScale.toFixed(3));
      root.style.setProperty('--v46-selected-scale', Math.min(1.08, visualScale * 1.07).toFixed(3));
      root.style.setProperty('--v46-center-scale', centerScale.toFixed(3));
      root.style.setProperty('--v46-label-scale', labelScale.toFixed(3));
      root.style.setProperty('--v46-label-opacity', label.toFixed(3));
      root.dataset.veinviteOverview = zoom <= .58 ? '1' : '0';
    };

    const zoomObserver = new MutationObserver(syncZoomPresentation);
    zoomObserver.observe(zoomValue, { childList: true, subtree: true, characterData: true });
    syncZoomPresentation();

    const dispatchWheel = (deltaY: number) => {
      const rect = stage.getBoundingClientRect();
      try {
        stage.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      } catch {
        // Hardened WebViews may reject synthetic WheelEvent construction.
      }
    };

    const enforceReadableFit = (attempt = 0) => {
      fitFloorTimer = null;
      if (!root.isConnected || stage.classList.contains('clusterMode')) return;
      const people = root.querySelectorAll('.personNode[data-node-id]').length;
      if (people >= 14 || readZoom() >= READABLE_FIT_MIN || attempt >= 4) return;
      dispatchWheel(-100);
      fitFloorTimer = window.setTimeout(() => enforceReadableFit(attempt + 1), 34);
    };

    const scheduleReadableFit = () => {
      if (fitFloorTimer !== null) window.clearTimeout(fitFloorTimer);
      fitFloorTimer = window.setTimeout(() => enforceReadableFit(0), 28);
    };

    const applyOverviewZoom = () => {
      const minus = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
        .find((button) => button.textContent?.trim() === '−');
      for (let step = 0; step < 4; step += 1) minus?.click();
      introWheelTimer = window.setTimeout(() => {
        introWheelTimer = null;
        dispatchWheel(100);
      }, 40);
    };

    const cancelIntroMotion = () => {
      if (!introMotionActive) return;
      introMotionActive = false;
      if (introTimer !== null) window.clearTimeout(introTimer);
      if (introWheelTimer !== null) window.clearTimeout(introWheelTimer);
      if (introEndTimer !== null) window.clearTimeout(introEndTimer);
      introTimer = null;
      introWheelTimer = null;
      introEndTimer = null;
      root.classList.remove('veinviteIntroV3');
      syncZoomPresentation();
    };

    const onRootClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button');
      if (!button || !root.contains(button)) return;
      const text = button.textContent?.trim() ?? '';

      if (event.isTrusted && button.closest('.canaryViewActions') && text === 'Fit') {
        cancelIntroMotion();
        allowNextProgrammaticFit = true;
        scheduleReadableFit();
        return;
      }

      if (!event.isTrusted && button.closest('.viewActions') && text === 'Fit') {
        if (allowNextProgrammaticFit) {
          allowNextProgrammaticFit = false;
          return;
        }
        if (blockLegacyFit) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    };

    root.addEventListener('click', onRootClickCapture, true);
    legacyBlockTimer = window.setTimeout(() => {
      legacyBlockTimer = null;
      blockLegacyFit = false;
    }, LEGACY_FIT_BLOCK_MS);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let introSeen = false;
    try { introSeen = window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1'; } catch { introSeen = false; }

    if (!reducedMotion && !introSeen) {
      try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional session hint */ }
      introMotionActive = true;
      root.classList.add('veinviteIntroV3');
      introTimer = window.setTimeout(() => {
        introTimer = null;
        if (!introMotionActive) return;
        applyOverviewZoom();
      }, INTRO_HOLD_MS);
      introEndTimer = window.setTimeout(() => {
        introEndTimer = null;
        introMotionActive = false;
        root.classList.remove('veinviteIntroV3');
        syncZoomPresentation();
      }, INTRO_END_MS);
    } else {
      root.classList.add('veinviteSettling');
      applyOverviewZoom();
      settleEndTimer = window.setTimeout(() => {
        settleEndTimer = null;
        root.classList.remove('veinviteSettling');
        syncZoomPresentation();
      }, 120);
    }

    const onUserInteraction = (event: Event) => {
      if (!event.isTrusted) return;
      cancelIntroMotion();
    };
    root.addEventListener('pointerdown', onUserInteraction, true);
    root.addEventListener('touchstart', onUserInteraction, true);
    stage.addEventListener('wheel', onUserInteraction, true);

    return () => {
      zoomObserver.disconnect();
      if (introTimer !== null) window.clearTimeout(introTimer);
      if (introWheelTimer !== null) window.clearTimeout(introWheelTimer);
      if (introEndTimer !== null) window.clearTimeout(introEndTimer);
      if (settleEndTimer !== null) window.clearTimeout(settleEndTimer);
      if (legacyBlockTimer !== null) window.clearTimeout(legacyBlockTimer);
      if (fitFloorTimer !== null) window.clearTimeout(fitFloorTimer);
      root.removeEventListener('click', onRootClickCapture, true);
      root.removeEventListener('pointerdown', onUserInteraction, true);
      root.removeEventListener('touchstart', onUserInteraction, true);
      stage.removeEventListener('wheel', onUserInteraction, true);
      root.classList.remove('veinviteIntroV3', 'veinviteSettling');
      delete root.dataset.veinviteOverview;
      [
        '--v46-line-opacity',
        '--v46-slot-base-opacity',
        '--v46-slot-pulse-opacity',
        '--v46-node-scale',
        '--v46-selected-scale',
        '--v46-center-scale',
        '--v46-label-scale',
        '--v46-label-opacity',
      ].forEach((property) => root.style.removeProperty(property));
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.veinviteIntroV3 .scene{
      transition:transform 680ms cubic-bezier(.18,.82,.2,1)!important
    }
    .productionNetworkCanaryV45.veinviteIntroV3 .zoomValue{opacity:0!important}
    .productionNetworkCanaryV45.veinviteSettling .stage{opacity:0!important}
    .productionNetworkCanaryV45.veinviteSettling .scene{transition:none!important}

    .productionNetworkCanaryV45 .spoke,
    .productionNetworkCanaryV45 .v42GroupEdges path{
      vector-effect:non-scaling-stroke
    }
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .spoke:not(.slotSpoke):not(.clusterSpoke),
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .spoke:not(.slotSpoke):not(.clusterSpoke){
      opacity:var(--v46-line-opacity,.42)!important;
      stroke-width:.92!important;
      transition:opacity 90ms linear!important
    }
    .productionNetworkCanaryV45 .spoke.v44CollapsedGroupPath{
      opacity:0!important
    }
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .slotSpoke,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .slotSpoke,
    .productionNetworkCanaryV45 .slotSpoke{
      opacity:0!important;animation:none!important;filter:none!important
    }
    .productionNetworkCanaryV45 .v46SlotBase,
    .productionNetworkCanaryV45 .v46SlotPulse{
      fill:none;stroke-linecap:round;pointer-events:none;vector-effect:non-scaling-stroke
    }
    .productionNetworkCanaryV45 .v46SlotBase{
      stroke:rgba(226,188,79,.62);stroke-width:1.05;
      opacity:var(--v46-slot-base-opacity,.5)
    }
    .productionNetworkCanaryV45 .v46SlotPulse{
      stroke:rgba(255,210,76,.95);stroke-width:1.55;stroke-dasharray:5 38;
      opacity:var(--v46-slot-pulse-opacity,.78);
      filter:drop-shadow(0 0 2px rgba(244,183,40,.28));
      animation:v46SlotFlow 2.45s linear infinite
    }
    .productionNetworkCanaryV45.veinviteInteracting .v46SlotPulse,
    .productionNetworkCanaryV45.veinviteIntroV3 .v46SlotPulse,
    .productionNetworkCanaryV45 .v42ManualGroupsRoot[data-v42-transient-drag="1"] .v46SlotPulse{
      animation-play-state:paused!important;filter:none!important
    }

    .productionNetworkCanaryV45 .centerWrap{
      transform:translate(-50%,-50%) scale(var(--v46-center-scale,1))!important;
      transition:transform 90ms linear!important
    }
    .productionNetworkCanaryV45[data-veinvite-overview='1'] .centerWrap{
      gap:0!important
    }
    .productionNetworkCanaryV45[data-veinvite-overview='1'] .centerWrap>b,
    .productionNetworkCanaryV45[data-veinvite-overview='1'] .centerWrap>small{
      height:0!important;line-height:0!important;overflow:hidden!important;
      opacity:0!important;pointer-events:none!important
    }

    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .nodeCircle,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .nodeCircle,
    .productionNetworkCanaryV45 .nodeCircle{
      width:52px!important;height:52px!important;
      transform:scale(var(--v46-node-scale,1))!important
    }
    .productionNetworkCanaryV45 .slotCircle{
      width:46px!important;height:46px!important;
      transform:scale(var(--v46-node-scale,1))!important
    }
    .productionNetworkCanaryV45 .personNode.canarySelectedNode .nodeCircle,
    .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42SelectedMember .nodeCircle,
    .productionNetworkCanaryV45 .v44GroupUxRoot .personNode.v44PendingNewGroupMember .nodeCircle,
    .productionNetworkCanaryV45 .personNode.pressing .nodeCircle,
    .productionNetworkCanaryV45 .slotNode.pressing .slotCircle{
      transform:scale(var(--v46-selected-scale,1.07))!important
    }
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .personNode>b,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .personNode>small,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39MidZoom .slotNode>b,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .personNode>b,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .personNode>small,
    .productionNetworkCanaryV45 .v39RefinementRoot.v39DetailZoom .slotNode>b,
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small,
    .productionNetworkCanaryV45 .slotNode>b{
      transform:scale(var(--v46-label-scale,1));transform-origin:50% 0;
      opacity:var(--v46-label-opacity,1)!important;
      transition:transform 90ms linear,opacity 90ms linear!important
    }
    .productionNetworkCanaryV45.veinviteInteracting .centerWrap,
    .productionNetworkCanaryV45.veinviteInteracting .nodeCircle,
    .productionNetworkCanaryV45.veinviteInteracting .slotCircle{
      transition:none!important
    }

    @keyframes v46SlotFlow{from{stroke-dashoffset:43}to{stroke-dashoffset:-43}}

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45 .centerWrap,
      .productionNetworkCanaryV45 .nodeCircle,
      .productionNetworkCanaryV45 .slotCircle,
      .productionNetworkCanaryV45 .personNode>b,
      .productionNetworkCanaryV45 .personNode>small,
      .productionNetworkCanaryV45 .slotNode>b{
        transition:none!important
      }
      .productionNetworkCanaryV45 .v46SlotPulse{display:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV46({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV45 locale={locale} />
    <NetworkViewportPolish />
    <NetworkSlotLineOverlay />
  </>;
}
