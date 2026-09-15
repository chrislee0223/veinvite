'use client';

import { useInsertionEffect, useLayoutEffect } from 'react';

import {
  isLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { AppNetworkCanaryV70 } from './AppNetworkCanaryV70';

const STABLE_PINCH_ENTER_RATIO = 1.2;
const STABLE_PINCH_FINAL_RATIO = 1.08;
const STABLE_PINCH_FEEDBACK_MS = 120;
const STABLE_PINCH_CARD_TIMEOUT_MS = 760;
const STABLE_PINCH_TRANSITION_MS = 900;

type StablePinchIntent = {
  root: HTMLElement;
  startDistance: number;
  maxRatio: number;
  currentRatio: number;
  candidateId: string | null;
  candidateSamples: number;
};

function resolveLocale(locale: Locale): SupportedLocale {
  return isLocale(locale) ? locale : 'en';
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function readCenterScale(root: HTMLElement) {
  const parsed = Number.parseFloat(root.style.getPropertyValue('--v46-center-scale'));
  return Number.isFinite(parsed) ? parsed : 1;
}

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function pinchMidpoint(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function nearestStablePinchNode(
  root: HTMLElement,
  clientX: number,
  clientY: number,
  preferredId: string | null,
) {
  let bestNode: HTMLButtonElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const nodes = Array.from(
    root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'),
  );

  for (const node of nodes) {
    if (node.classList.contains('v42CollapsedMember')) continue;
    const circle = node.querySelector<HTMLElement>('.nodeCircle');
    if (!circle) continue;
    const rect = circle.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const id = node.dataset.nodeId ?? null;
    const preferred = Boolean(preferredId && id === preferredId);
    const radius = Math.max(preferred ? 40 : 34, rect.width * (preferred ? .92 : .72));
    const distance = Math.hypot(
      clientX - (rect.left + rect.width / 2),
      clientY - (rect.top + rect.height / 2),
    );
    if (distance > radius || distance >= bestDistance) continue;
    bestNode = node;
    bestDistance = distance;
  }

  return bestNode;
}

function NetworkStablePinchEntryV71() {
  useInsertionEffect(() => {
    let mounted = true;
    let pinchIntent: StablePinchIntent | null = null;
    let navigationNode: HTMLButtonElement | null = null;
    let feedbackTimer: number | null = null;
    let transitionTimer: number | null = null;
    let navigationFrame = 0;

    const realGroupPanel = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.v42GroupPanel');

    const clearNavigationWork = (releaseTransition: boolean) => {
      if (feedbackTimer !== null) {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      if (navigationFrame) {
        window.cancelAnimationFrame(navigationFrame);
        navigationFrame = 0;
      }
      navigationNode?.classList.remove('v50NavigationCandidate');
      navigationNode = null;

      if (releaseTransition) {
        if (transitionTimer !== null) {
          window.clearTimeout(transitionTimer);
          transitionTimer = null;
        }
        document.querySelector<HTMLElement>('.productionNetworkCanaryV45')
          ?.classList.remove('v50NetworkTransition');
      }
    };

    const clearTransientEntry = () => {
      pinchIntent = null;
      clearNavigationWork(true);
    };

    const holdTransition = (root: HTMLElement) => {
      root.classList.add('v50NetworkTransition');
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        root.classList.remove('v50NetworkTransition');
      }, STABLE_PINCH_TRANSITION_MS);
    };

    const enterStableNode = (root: HTMLElement, node: HTMLButtonElement) => {
      if (!mounted || navigationNode || !node.isConnected) return;
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage || stage.classList.contains('editMode') || realGroupPanel(root)) {
        root.classList.remove('v50NetworkTransition');
        return;
      }

      const circle = node.querySelector<HTMLElement>('.nodeCircle');
      if (!circle) {
        root.classList.remove('v50NetworkTransition');
        return;
      }

      navigationNode = node;
      node.classList.add('v50NavigationCandidate');
      holdTransition(root);
      const expectedLabel = node.querySelector<HTMLElement>(':scope > b')?.textContent?.trim() ?? '';

      feedbackTimer = window.setTimeout(() => {
        feedbackTimer = null;
        if (!mounted || !node.isConnected) {
          clearNavigationWork(true);
          return;
        }

        circle.click();
        const deadline = performance.now() + STABLE_PINCH_CARD_TIMEOUT_MS;

        const waitForSelectedCard = () => {
          navigationFrame = 0;
          if (!mounted || !node.isConnected) {
            clearNavigationWork(true);
            return;
          }

          const viewNetwork = root.querySelector<HTMLButtonElement>('.profileCard .viewNetwork');
          const cardLabel = root.querySelector<HTMLElement>('.profileCard > div b')?.textContent?.trim() ?? '';
          const selected = node.classList.contains('canarySelectedNode');
          const matchingCard = !expectedLabel || cardLabel === expectedLabel;

          if (viewNetwork && selected && matchingCard) {
            viewNetwork.click();
            node.classList.remove('v50NavigationCandidate');
            navigationNode = null;
            return;
          }

          if (performance.now() >= deadline) {
            clearNavigationWork(true);
            return;
          }
          navigationFrame = window.requestAnimationFrame(waitForSelectedCard);
        };

        navigationFrame = window.requestAnimationFrame(waitForSelectedCard);
      }, STABLE_PINCH_FEEDBACK_MS);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const target = event.target instanceof Element ? event.target : null;
      const root = target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;
      const stage = root?.querySelector<HTMLElement>('.stage') ?? null;
      if (!root || !stage || !target || !stage.contains(target)) return;
      if (root.classList.contains('v50NetworkTransition') || stage.classList.contains('editMode') || realGroupPanel(root)) return;

      const a = event.touches[0];
      const b = event.touches[1];
      const midpoint = pinchMidpoint(a, b);
      const candidate = nearestStablePinchNode(root, midpoint.x, midpoint.y, null);
      pinchIntent = {
        root,
        startDistance: Math.max(1, touchDistance(a, b)),
        maxRatio: 1,
        currentRatio: 1,
        candidateId: candidate?.dataset.nodeId ?? null,
        candidateSamples: candidate ? 1 : 0,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const intent = pinchIntent;
      if (!intent || event.touches.length !== 2 || !intent.root.isConnected) return;
      const a = event.touches[0];
      const b = event.touches[1];
      const ratio = touchDistance(a, b) / intent.startDistance;
      intent.currentRatio = ratio;
      intent.maxRatio = Math.max(intent.maxRatio, ratio);

      const midpoint = pinchMidpoint(a, b);
      const candidate = nearestStablePinchNode(
        intent.root,
        midpoint.x,
        midpoint.y,
        intent.candidateId,
      );
      const nextId = candidate?.dataset.nodeId ?? null;
      if (nextId && nextId === intent.candidateId) {
        intent.candidateSamples = Math.min(12, intent.candidateSamples + 1);
      } else {
        intent.candidateId = nextId;
        intent.candidateSamples = nextId ? 1 : 0;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!pinchIntent || event.touches.length > 0) return;
      const intent = pinchIntent;
      pinchIntent = null;
      const root = intent.root;
      if (
        !root.isConnected ||
        intent.maxRatio < STABLE_PINCH_ENTER_RATIO ||
        intent.currentRatio < STABLE_PINCH_FINAL_RATIO
      ) return;

      // V50 also has a legacy pinch-enter finisher on window. This insertion
      // effect registers first, so marking the same transition guard here makes
      // that older finisher return without changing its drag/pan/group logic.
      // Blank-space pinches release the guard in a microtask and remain zoom-only.
      const alreadyTransitioning = root.classList.contains('v50NetworkTransition');
      if (!alreadyTransitioning) root.classList.add('v50NetworkTransition');

      const releaseLegacyGuard = () => {
        if (!alreadyTransitioning && !navigationNode) {
          root.classList.remove('v50NetworkTransition');
        }
      };

      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage || stage.classList.contains('editMode') || realGroupPanel(root)) {
        queueMicrotask(releaseLegacyGuard);
        return;
      }

      const id = intent.candidateId;
      if (!id || intent.candidateSamples < 2) {
        queueMicrotask(releaseLegacyGuard);
        return;
      }

      const node = root.querySelector<HTMLButtonElement>(
        `.personNode[data-node-id="${CSS.escape(id)}"]`,
      );
      if (!node || node.classList.contains('v42CollapsedMember')) {
        queueMicrotask(releaseLegacyGuard);
        return;
      }

      enterStableNode(root, node);
    };

    const onTouchCancel = () => {
      pinchIntent = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearTransientEntry();
    };

    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    window.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
    window.addEventListener('blur', clearTransientEntry);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      pinchIntent = null;
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('touchcancel', onTouchCancel, true);
      window.removeEventListener('blur', clearTransientEntry);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearNavigationWork(true);
    };
  }, []);

  return null;
}

function NetworkRootIdentityPlacementV71({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const resolvedLocale = resolveLocale(locale);
    const rootCopy = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale].you;
    let frame = 0;

    const clearRootIdentity = (wrap: HTMLElement | null) => {
      if (!wrap) return;
      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');

      circle?.removeAttribute('data-v71-root-copy');
      circle?.removeAttribute('data-v71-root-length');
      source?.classList.remove('v71RootIdentitySource');
      wrap.classList.remove('v71RootIdentityWrap');
      wrap.style.removeProperty('--v71-root-summary-y');

      // Remove the previous V71 injected-label implementation if it exists in a
      // live session. The root identity now replaces the original center dot.
      circle?.querySelector<HTMLElement>(':scope > .v71CenterIdentityLabel')?.remove();
    };

    const apply = () => {
      const wrap = root.querySelector<HTMLElement>('.centerWrap');
      if (!wrap) return;

      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');
      if (!circle || !source) {
        clearRootIdentity(wrap);
        return;
      }

      // V70 marks only the actual root identity. Descendant networks keep the
      // mature center-dot behavior and their normal wallet label.
      if (source.dataset.v70RootLabel !== '1') {
        clearRootIdentity(wrap);
        return;
      }

      source.classList.add('v71RootIdentitySource');
      wrap.classList.add('v71RootIdentityWrap');
      circle.dataset.v71RootCopy = rootCopy;

      const visibleLength = Array.from(rootCopy).length;
      circle.dataset.v71RootLength = visibleLength > 6
        ? 'long'
        : visibleLength > 4
          ? 'compact'
          : 'normal';

      // V47 positions root metadata absolutely, while V46 scales the center
      // circle independently at high zoom. Keep the summary a constant ~7px
      // below the circle's *visible* edge rather than leaving it at a fixed 82px.
      const zoom = readZoom(root);
      const centerScale = readCenterScale(root);
      const circleCenterY = 37;
      const circleRadius = 37;
      const screenGapPx = 7;
      const summaryY = circleCenterY + circleRadius * centerScale + screenGapPx / zoom;
      wrap.style.setProperty('--v71-root-summary-y', `${summaryY.toFixed(2)}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();

    const observer = new MutationObserver(() => schedule());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-v70-root-label'],
    });

    window.addEventListener('resize', schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      clearRootIdentity(root.querySelector<HTMLElement>('.centerWrap'));
    };
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV71({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV70 locale={locale} />
      <NetworkStablePinchEntryV71 />
      <NetworkRootIdentityPlacementV71 locale={locale} />
      <style jsx global>{`
        /* Root identity: replace the existing V45 center dot itself. */
        .productionNetworkCanaryV45 .centerWrap > b.v71RootIdentitySource {
          display: none !important;
        }

        /* V65 owns localized stats by hiding the raw English source at
           font-size:0 and painting exactly one localized ::after string. Never
           restore a font-size on the source element here, or both languages are
           rendered at once. */
        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small {
          top: var(--v71-root-summary-y, 81px) !important;
          margin: 0 !important;
          color: #6c655b !important;
          white-space: nowrap !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small.v65LocalizedUiCopy {
          font-size: 0 !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small.v65LocalizedUiCopy::after {
          font-size: .38rem !important;
          line-height: 1.15 !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small:not(.v65LocalizedUiCopy) {
          font-size: .38rem !important;
          line-height: 1.15 !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          content: attr(data-v71-root-copy) !important;
          left: 50% !important;
          top: 50% !important;
          width: auto !important;
          height: auto !important;
          min-width: 0 !important;
          max-width: calc(100% - 16px) !important;
          transform: translate(-50%, -50%) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #efc64c !important;
          font-size: .58rem !important;
          font-family: inherit !important;
          font-weight: 850 !important;
          line-height: 1.12 !important;
          letter-spacing: 0 !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          unicode-bidi: plaintext;
          text-shadow: 0 0 10px rgba(239, 198, 76, .18);
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='compact']::after {
          font-size: .53rem !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='long']::after {
          font-size: .48rem !important;
          max-width: calc(100% - 10px) !important;
        }

        html[data-locale-typography='arabic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after,
        html[data-locale-typography='indic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          line-height: 1.28 !important;
        }

        /* Person and available-slot hold timers are both 500 ms in V52/V53.
           Give the slot the same transition cadence as a person node and stop
           its idle pulse while armed so the visible long-press response lands
           at the same moment instead of feeling delayed by the pulse cycle. */
        .productionNetworkCanaryV45 .slotCircle {
          transition: transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease !important;
        }

        .productionNetworkCanaryV45 .slotNode.v53SlotHoldArmed .slotCircle,
        .productionNetworkCanaryV45 .slotNode.v53SlotLongDragging .slotCircle {
          animation: none !important;
        }
      `}</style>
    </>
  );
}
