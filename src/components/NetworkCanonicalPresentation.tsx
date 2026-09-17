'use client';

import { useEffect } from 'react';

import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_WORKSPACE_COPY } from '@/lib/i18n/networkWorkspaceCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';

type NetworkSnapshot = {
  focusWallet?: string;
  summary?: {
    direct?: number;
    network?: number;
  };
  children?: Array<{
    wallet: string;
    direct: number;
    network: number;
  }>;
};

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
}

function readScale(world: HTMLElement | null): number {
  if (!world) return 1;
  const match = world.style.transform.match(/scale\(([-+0-9.]+)\)/);
  const parsed = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 1;
}

function ensureSlotFlows(page: HTMLElement) {
  page.querySelectorAll<SVGPathElement>('path.slotEdge').forEach((base) => {
    const next = base.nextElementSibling;
    if (next instanceof SVGPathElement && next.classList.contains('canonicalSlotEdgeFlow')) return;
    const flow = base.cloneNode(false) as SVGPathElement;
    flow.classList.remove('slotEdge');
    flow.classList.add('canonicalSlotEdgeFlow');
    flow.setAttribute('aria-hidden', 'true');
    base.parentNode?.insertBefore(flow, base.nextSibling);
  });

  page.querySelectorAll<SVGPathElement>('path.canonicalSlotEdgeFlow').forEach((flow) => {
    const previous = flow.previousElementSibling;
    if (!(previous instanceof SVGPathElement) || !previous.classList.contains('slotEdge')) {
      flow.remove();
    }
  });
}

export function NetworkCanonicalPresentation({
  wallet,
  locale,
}: {
  wallet: string;
  locale: Locale;
}) {
  const resolvedLocale = locale as SupportedLocale;
  const controls = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale];
  const experience = NETWORK_EXPERIENCE_COPY[resolvedLocale];
  const workspace = NETWORK_WORKSPACE_COPY[resolvedLocale];

  useEffect(() => {
    let disposed = false;
    let snapshot: NetworkSnapshot | null = null;
    let boundPage: HTMLElement | null = null;
    let pageObserver: MutationObserver | null = null;
    let worldObserver: MutationObserver | null = null;
    let frame = 0;

    const applySnapshot = (page: HTMLElement) => {
      const header = page.querySelector<HTMLElement>('.networkHeader');
      if (header) {
        header.dataset.canonicalYou = controls.you;
        header.dataset.canonicalDirectLabel = experience.direct;
        header.dataset.canonicalNetworkLabel = experience.networkSize;
        header.dataset.canonicalDirect = String(snapshot?.summary?.direct ?? 0);
        header.dataset.canonicalNetwork = String(snapshot?.summary?.network ?? 0);
        header.dataset.canonicalCanvas = 'All on one canvas';
      }

      const focus = page.querySelector<HTMLElement>('.focusNode');
      const focusMeta = focus?.querySelector<HTMLElement>('.nodeMeta small');
      if (focusMeta && snapshot?.summary) {
        focusMeta.dataset.canonicalMeta = `${snapshot.summary.direct ?? 0} ${experience.direct} · ${snapshot.summary.network ?? 0} ${experience.networkSize}`;
      }

      const children = new Map(
        (snapshot?.children ?? []).map((child) => [shortWallet(child.wallet), child]),
      );
      page.querySelectorAll<HTMLElement>('.childNode').forEach((node) => {
        const label = node.querySelector<HTMLElement>('.nodeMeta strong')?.textContent?.trim() ?? '';
        const child = children.get(label);
        const meta = node.querySelector<HTMLElement>('.nodeMeta small');
        if (meta && child) {
          meta.dataset.canonicalMeta = `${child.direct} ${experience.direct} · ${child.network} ${experience.networkSize}`;
        }
      });
    };

    const updatePresentation = () => {
      frame = 0;
      const page = document.querySelector<HTMLElement>('.networkCanvasPage');
      if (!page) return;

      if (boundPage !== page) {
        worldObserver?.disconnect();
        boundPage = page;
        page.dataset.canonicalNetwork = 'true';
      }

      const stage = page.querySelector<HTMLElement>('.networkStage');
      const world = page.querySelector<HTMLElement>('.world');
      const crumbCount = page.querySelectorAll('.breadcrumbs .crumb').length;
      page.dataset.canonicalDepth = crumbCount > 1 ? 'deep' : 'root';

      if (stage) {
        stage.dataset.canonicalZoom = `${Math.round(readScale(world) * 100)}%`;
        stage.dataset.canonicalHint = 'Hold a node to edit · drag canvas · pinch to zoom';
      }

      applySnapshot(page);
      ensureSlotFlows(page);

      if (world && !worldObserver) {
        worldObserver = new MutationObserver(() => {
          const activePage = document.querySelector<HTMLElement>('.networkCanvasPage');
          const activeStage = activePage?.querySelector<HTMLElement>('.networkStage');
          const activeWorld = activePage?.querySelector<HTMLElement>('.world');
          if (activeStage) activeStage.dataset.canonicalZoom = `${Math.round(readScale(activeWorld) * 100)}%`;
        });
        worldObserver.observe(world, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updatePresentation);
    };

    pageObserver = new MutationObserver(schedule);
    pageObserver.observe(document.body, { childList: true, subtree: true });
    schedule();

    const controller = new AbortController();
    void fetch(`/api/network?wallet=${encodeURIComponent(wallet)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<NetworkSnapshot>;
      })
      .then((data) => {
        if (!data || disposed) return;
        snapshot = data;
        schedule();
      })
      .catch(() => {
        // Presentation data is optional; AppNetwork remains the source of truth.
      });

    return () => {
      disposed = true;
      controller.abort();
      pageObserver?.disconnect();
      worldObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll('path.canonicalSlotEdgeFlow').forEach((path) => path.remove());
      const page = document.querySelector<HTMLElement>('.networkCanvasPage');
      if (page) {
        delete page.dataset.canonicalNetwork;
        delete page.dataset.canonicalDepth;
      }
    };
  }, [wallet, controls.you, experience.direct, experience.networkSize]);

  return (
    <style jsx global>{`
      .networkCanvasPage[data-canonical-network='true'] {
        width: min(100%, 560px) !important;
        border: 1px solid rgba(226, 177, 51, .22) !important;
        border-radius: 22px !important;
        background: #060706 !important;
        box-shadow: 0 18px 48px rgba(0, 0, 0, .28) !important;
        overflow: hidden !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkHeader {
        position: relative !important;
        min-height: 46px !important;
        padding: 11px 14px 8px !important;
        display: flex !important;
        align-items: baseline !important;
        justify-content: flex-start !important;
        gap: 14px !important;
        border: 0 !important;
        background: #060706 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkHeader > * {
        display: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkHeader::before {
        content: attr(data-canonical-you);
        flex: 0 0 auto;
        color: #e2b635;
        font-size: .67rem;
        font-weight: 900;
        letter-spacing: .01em;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkHeader::after {
        content: attr(data-canonical-direct-label) ' ' attr(data-canonical-direct) '   ' attr(data-canonical-network-label) ' ' attr(data-canonical-network) '   ' attr(data-canonical-canvas);
        min-width: 0;
        color: #6f6a61;
        font-size: .56rem;
        font-weight: 650;
        letter-spacing: .01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkToolbar {
        display: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'][data-canonical-depth='deep'] .networkToolbar {
        min-height: 34px !important;
        padding: 3px 10px !important;
        display: flex !important;
        border: 0 !important;
        background: #060706 !important;
      }

      .networkCanvasPage[data-canonical-network='true'][data-canonical-depth='deep'] .networkToolbar .searchWrap {
        display: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkStage {
        height: clamp(590px, 66dvh, 790px) !important;
        border-top: 1px solid rgba(226, 177, 51, .12) !important;
        background: radial-gradient(circle at 50% 46%, rgba(226, 177, 51, .035), transparent 34%), #030403 !important;
        touch-action: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .networkStage::before {
        content: attr(data-canonical-zoom);
        position: absolute;
        z-index: 67;
        top: 10px;
        left: 151px;
        width: 58px;
        height: 32px;
        box-sizing: border-box;
        display: grid;
        place-items: center;
        border: 1px solid rgba(226, 177, 51, .16);
        border-radius: 9px;
        background: rgba(27, 24, 16, .94);
        color: #b9953e;
        font-size: .51rem;
        font-weight: 850;
        pointer-events: none;
        box-shadow: 0 7px 18px rgba(0, 0, 0, .18);
      }

      .networkCanvasPage[data-canonical-network='true'] .networkStage::after {
        content: attr(data-canonical-hint);
        position: absolute;
        z-index: 3;
        left: 50%;
        bottom: 13px;
        transform: translateX(-50%);
        max-width: calc(100% - 28px);
        color: #4f4a42;
        font-size: .48rem;
        font-weight: 600;
        letter-spacing: .01em;
        white-space: nowrap;
        pointer-events: none;
      }

      .networkCanvasPage[data-canonical-network='true'] .layoutControls,
      .networkCanvasPage[data-canonical-network='true'] .viewControls {
        display: contents !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .layoutControls button,
      .networkCanvasPage[data-canonical-network='true'] .viewControls button {
        position: absolute !important;
        z-index: 68 !important;
        top: 10px !important;
        min-width: 0 !important;
        height: 32px !important;
        min-height: 32px !important;
        padding: 0 8px !important;
        border: 1px solid rgba(226, 177, 51, .15) !important;
        border-radius: 9px !important;
        background: rgba(10, 10, 9, .95) !important;
        color: #807a70 !important;
        font-size: .5rem !important;
        font-weight: 800 !important;
        box-shadow: 0 7px 18px rgba(0, 0, 0, .18) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton { left: 10px !important; width: 98px; }
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4) { left: 116px !important; width: 31px; }
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3) { left: 214px !important; width: 31px; }
      .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton { left: 253px !important; width: 75px; color: #8c784a !important; }
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1) { right: 65px !important; width: 62px; }
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2) { right: 10px !important; width: 48px; }

      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .layoutControls {
        position: absolute !important;
        z-index: 70 !important;
        left: 8px !important;
        right: 8px !important;
        top: 8px !important;
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
      }

      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .layoutControls button {
        position: static !important;
        width: auto !important;
        flex: 1 1 auto;
      }

      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .viewControls,
      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .networkStage::before {
        display: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .edges .edge {
        stroke: rgba(162, 133, 67, .27) !important;
        stroke-width: 1.15 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .edges .edge.rewarded {
        stroke: rgba(208, 165, 55, .38) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .continuationEdge {
        stroke: rgba(174, 142, 66, .2) !important;
        stroke-width: 1.05 !important;
        stroke-linecap: round !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .slotEdge {
        stroke: rgba(216, 170, 48, .18) !important;
        stroke-width: 1.15 !important;
        stroke-dasharray: none !important;
        animation: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .canonicalSlotEdgeFlow {
        fill: none;
        stroke: rgba(242, 193, 60, .82);
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-dasharray: 46 260;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
        opacity: 0;
        animation: canonicalSlotGlowTravel 4.8s cubic-bezier(.24, .7, .26, 1) infinite;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode {
        width: 106px !important;
        height: 104px !important;
        min-width: 0 !important;
        padding: 0 !important;
        display: block !important;
        overflow: visible !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #d5cfc4 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode:hover,
      .networkCanvasPage[data-canonical-network='true'] .personNode.selected {
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .identity {
        position: absolute !important;
        left: 50% !important;
        top: 50% !important;
        width: 70px !important;
        height: 70px !important;
        transform: translate(-50%, -50%) !important;
        display: grid !important;
        place-items: center !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .avatarSlot {
        width: 68px !important;
        height: 68px !important;
        display: grid !important;
        place-items: center !important;
        border: 1px solid rgba(211, 169, 54, .24) !important;
        border-radius: 50% !important;
        background: rgba(7, 8, 7, .96) !important;
        box-shadow: 0 0 0 1px rgba(211, 169, 54, .025) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .neutralAvatar {
        width: 15px !important;
        height: 15px !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: #e6b83d !important;
        color: transparent !important;
        box-shadow: 0 0 11px rgba(230, 184, 61, .13) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .neutralAvatar svg,
      .networkCanvasPage[data-canonical-network='true'] .personNode .avatarSlot img,
      .networkCanvasPage[data-canonical-network='true'] .personNode .identityLabel {
        display: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta {
        position: absolute !important;
        left: 50% !important;
        top: calc(50% + 42px) !important;
        width: 132px !important;
        transform: translateX(-50%) !important;
        display: grid !important;
        justify-items: center !important;
        gap: 4px !important;
        pointer-events: none !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta strong {
        max-width: 126px !important;
        color: #d7d1c6 !important;
        font-size: .62rem !important;
        font-weight: 850 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta small {
        color: #625d55 !important;
        font-size: 0 !important;
        line-height: 1.2 !important;
        white-space: nowrap !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta small[data-canonical-meta]::after {
        content: attr(data-canonical-meta);
        font-size: .5rem !important;
        font-weight: 650 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode {
        width: 132px !important;
        height: 132px !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode .identity {
        width: 96px !important;
        height: 96px !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode .avatarSlot {
        width: 92px !important;
        height: 92px !important;
        border: 1.8px solid rgba(226, 178, 43, .78) !important;
        background: radial-gradient(circle at 50% 50%, rgba(220, 172, 42, .09), rgba(5, 6, 5, .98) 62%) !important;
        box-shadow: 0 0 0 8px rgba(209, 164, 39, .055), 0 0 24px rgba(218, 169, 42, .08) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode .neutralAvatar {
        width: 18px !important;
        height: 18px !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode .nodeMeta {
        top: calc(50% + 57px) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .focusNode .nodeMeta strong {
        color: #e3b938 !important;
        font-size: .68rem !important;
        letter-spacing: .02em !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .slotNode {
        width: 74px !important;
        height: 74px !important;
        min-width: 74px !important;
        padding: 0 !important;
        border: 1.35px dashed rgba(217, 170, 42, .58) !important;
        border-radius: 50% !important;
        background: rgba(216, 170, 43, .015) !important;
        color: #d4a832 !important;
        display: grid !important;
        place-items: center !important;
        align-content: center !important;
        overflow: visible !important;
        animation: canonicalAvailableShimmer 4.8s ease-in-out infinite !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .slotNode span {
        font-size: 1.15rem !important;
        font-weight: 350 !important;
        line-height: 1 !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .slotNode small {
        position: absolute !important;
        left: 50% !important;
        top: calc(100% + 10px) !important;
        max-width: 110px !important;
        transform: translateX(-50%) !important;
        color: #bcb5aa !important;
        font-size: .55rem !important;
        font-weight: 850 !important;
        white-space: nowrap !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .groupNode {
        border-style: dashed !important;
        border-color: rgba(221, 174, 46, .48) !important;
        background: rgba(11, 10, 8, .96) !important;
        box-shadow: 0 0 22px rgba(219, 170, 41, .035) !important;
        transition: border-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .groupNode:hover,
      .networkCanvasPage[data-canonical-network='true'] .groupNode.selected {
        border-color: rgba(235, 188, 60, .75) !important;
        box-shadow: 0 0 24px rgba(226, 177, 49, .11) !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .childNode,
      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .slotNode,
      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .groupNode {
        animation: canonicalBranchBloom 470ms cubic-bezier(.18, .82, .2, 1) both !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .continuationEdge {
        stroke-dasharray: 74 !important;
        stroke-dashoffset: 74;
        animation: canonicalContinuationGrow 430ms cubic-bezier(.2, .75, .2, 1) 90ms both !important;
      }

      .networkCanvasPage[data-canonical-network='true'] .profileCard {
        animation: canonicalProfileIn 180ms cubic-bezier(.2, .8, .2, 1) both;
      }

      @keyframes canonicalSlotGlowTravel {
        0%, 18% { opacity: 0; stroke-dashoffset: 250; }
        27% { opacity: .16; }
        48% { opacity: .8; }
        66% { opacity: .28; stroke-dashoffset: 5; }
        74%, 100% { opacity: 0; stroke-dashoffset: -30; }
      }

      @keyframes canonicalAvailableShimmer {
        0%, 48%, 100% { border-color: rgba(217, 170, 42, .5); box-shadow: 0 0 0 rgba(226, 177, 49, 0); }
        60% { border-color: rgba(235, 190, 64, .78); box-shadow: 0 0 18px rgba(226, 177, 49, .10); }
        72% { border-color: rgba(217, 170, 42, .54); box-shadow: 0 0 7px rgba(226, 177, 49, .035); }
      }

      @keyframes canonicalBranchBloom {
        from { opacity: 0; scale: .84; }
        to { opacity: 1; scale: 1; }
      }

      @keyframes canonicalContinuationGrow {
        from { stroke-dashoffset: 74; opacity: .08; }
        to { stroke-dashoffset: 0; opacity: 1; }
      }

      @keyframes canonicalProfileIn {
        from { opacity: 0; scale: .975; }
        to { opacity: 1; scale: 1; }
      }

      @media (max-width: 560px) {
        .networkCanvasPage[data-canonical-network='true'] {
          border-radius: 20px !important;
        }

        .networkCanvasPage[data-canonical-network='true'] .networkHeader {
          min-height: 43px !important;
          padding: 10px 11px 7px !important;
          gap: 9px !important;
        }

        .networkCanvasPage[data-canonical-network='true'] .networkHeader::before { font-size: .62rem; }
        .networkCanvasPage[data-canonical-network='true'] .networkHeader::after { font-size: .49rem; }
        .networkCanvasPage[data-canonical-network='true'] .networkStage { height: clamp(610px, 64dvh, 780px) !important; }
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton { left: 7px !important; width: 76px; padding: 0 5px !important; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4) { left: 88px !important; width: 30px; }
        .networkCanvasPage[data-canonical-network='true'] .networkStage::before { left: 122px; width: 55px; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3) { left: 181px !important; width: 30px; }
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton { left: 216px !important; width: 62px; padding: 0 4px !important; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1) { right: 51px !important; width: 51px; padding: 0 4px !important; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2) { right: 6px !important; width: 40px; padding: 0 3px !important; }
        .networkCanvasPage[data-canonical-network='true'] .layoutControls button,
        .networkCanvasPage[data-canonical-network='true'] .viewControls button { font-size: .44rem !important; }
        .networkCanvasPage[data-canonical-network='true'] .networkStage::before { font-size: .46rem; }
      }

      @media (max-width: 390px) {
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton { width: 70px; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4) { left: 81px !important; width: 28px; }
        .networkCanvasPage[data-canonical-network='true'] .networkStage::before { left: 113px; width: 52px; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3) { left: 169px !important; width: 28px; }
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton { left: 201px !important; width: 58px; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1) { right: 46px !important; width: 47px; }
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2) { right: 4px !important; width: 38px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .networkCanvasPage[data-canonical-network='true'] .canonicalSlotEdgeFlow,
        .networkCanvasPage[data-canonical-network='true'] .slotNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .childNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .slotNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .groupNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .continuationEdge,
        .networkCanvasPage[data-canonical-network='true'] .profileCard {
          animation: none !important;
        }
      }
    `}</style>
  );
}
