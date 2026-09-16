'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV72 } from './AppNetworkCanaryV72';

const PARENT_VISUAL_STACK_LIMIT = 12;
const RETURN_SETTLE_MIN_MS = 180;
const RETURN_SETTLE_QUIET_MS = 140;
const RETURN_SETTLE_MAX_MS = 1500;
const RETURN_REVEAL_QUIET_MS = 120;
const RETURN_REVEAL_MAX_MS = 420;

type ParentVisualSnapshot = {
  clone: HTMLElement;
};

function NetworkParentVisualPreserveV73() {
  useLayoutEffect(() => {
    const parentVisuals: ParentVisualSnapshot[] = [];
    let activeOverlay: HTMLElement | null = null;
    let activeRoot: HTMLElement | null = null;
    let liveObserver: MutationObserver | null = null;
    let settleFrame = 0;
    let revealFrame = 0;
    let removeFrameOne = 0;
    let removeFrameTwo = 0;
    let returnStartedAt = 0;
    let lastLiveMutationAt = 0;
    let revealStartedAt = 0;
    let revealing = false;

    const canaryRootFor = (target: Element | null) =>
      target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;

    const cancelFrames = () => {
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      if (revealFrame) window.cancelAnimationFrame(revealFrame);
      if (removeFrameOne) window.cancelAnimationFrame(removeFrameOne);
      if (removeFrameTwo) window.cancelAnimationFrame(removeFrameTwo);
      settleFrame = 0;
      revealFrame = 0;
      removeFrameOne = 0;
      removeFrameTwo = 0;
    };

    const stopLiveObserver = () => {
      liveObserver?.disconnect();
      liveObserver = null;
    };

    const clearV72ReturnStateFromClone = (clone: HTMLElement) => {
      clone.classList.remove('v72ParentReturnTarget');
      clone.style.removeProperty('--v72-parent-return-transform');
      clone.querySelectorAll<HTMLElement>('[data-v72-parent-return-node]').forEach((node) => {
        delete node.dataset.v72ParentReturnNode;
        delete node.dataset.v72ParentReturnHidden;
        node.style.removeProperty('--v72-parent-node-transform');
      });
      clone.querySelectorAll<HTMLElement>('[data-v72-parent-return-group]').forEach((hub) => {
        delete hub.dataset.v72ParentReturnGroup;
        hub.style.removeProperty('--v72-parent-group-transform');
      });
      clone.querySelectorAll<HTMLElement>('[data-v72-parent-return-slot]').forEach((slot) => {
        delete slot.dataset.v72ParentReturnSlot;
        slot.style.removeProperty('--v72-parent-slot-transform');
      });
      clone.querySelectorAll<HTMLElement>('[data-v72-parent-return-cluster]').forEach((cluster) => {
        delete cluster.dataset.v72ParentReturnCluster;
        cluster.style.removeProperty('--v72-parent-cluster-transform');
      });
    };

    const prepareClone = (clone: HTMLElement) => {
      clone.classList.remove(
        'v50NetworkTransition',
        'v50PinchMode',
        'veinviteInteracting',
        'v50DraggingNode',
        'v73LiveReturnHidden',
      );
      clone.classList.add('v73ParentVisualOverlay', 'v73ReturnMotionFrozen');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');

      // The original component keeps the global styles mounted. Duplicating its
      // nested style/script tags in the visual clone can wake unrelated browser
      // work, so the overlay keeps only the already-painted DOM.
      clone.querySelectorAll('style,script').forEach((node) => node.remove());
      clone.querySelectorAll('.profileCard,.searchPanel,.v71MobileCommitFreezeLayer')
        .forEach((node) => node.remove());
      clone.querySelectorAll<HTMLElement>('[aria-live]')
        .forEach((node) => node.removeAttribute('aria-live'));
      clone.querySelectorAll<HTMLElement>(
        '.canarySelectedNode,.v50NavigationCandidate,.v50DirectDragging,.v50ValidDrop,.pressing',
      ).forEach((node) => {
        node.classList.remove(
          'canarySelectedNode',
          'v50NavigationCandidate',
          'v50DirectDragging',
          'v50ValidDrop',
          'pressing',
        );
      });
      clearV72ReturnStateFromClone(clone);
    };

    const captureParentVisual = (root: HTMLElement): ParentVisualSnapshot => {
      const clone = root.cloneNode(true) as HTMLElement;
      prepareClone(clone);
      return { clone };
    };

    const positionOverlay = (root: HTMLElement, overlay: HTMLElement) => {
      const rect = root.getBoundingClientRect();
      overlay.style.setProperty('left', `${rect.left}px`, 'important');
      overlay.style.setProperty('top', `${rect.top}px`, 'important');
      overlay.style.setProperty('width', `${rect.width}px`, 'important');
      overlay.style.setProperty('height', `${rect.height}px`, 'important');
    };

    const detachOverlay = () => {
      cancelFrames();
      stopLiveObserver();
      window.removeEventListener('resize', syncOverlayPosition);
      window.removeEventListener('scroll', syncOverlayPosition, true);

      if (activeRoot) activeRoot.classList.remove('v73LiveReturnHidden');
      activeOverlay?.remove();
      activeOverlay = null;
      activeRoot = null;
      returnStartedAt = 0;
      lastLiveMutationAt = 0;
      revealStartedAt = 0;
      revealing = false;
    };

    function syncOverlayPosition() {
      if (activeRoot && activeOverlay) positionOverlay(activeRoot, activeOverlay);
    }

    const finishOverlayAfterTwoPaints = () => {
      removeFrameOne = window.requestAnimationFrame(() => {
        removeFrameOne = 0;
        removeFrameTwo = window.requestAnimationFrame(() => {
          removeFrameTwo = 0;
          detachOverlay();
        });
      });
    };

    const waitForRevealQuiet = () => {
      if (!activeRoot || !activeOverlay || !revealing) return;
      const now = performance.now();
      const quiet = now - lastLiveMutationAt >= RETURN_REVEAL_QUIET_MS;
      const expired = now - revealStartedAt >= RETURN_REVEAL_MAX_MS;
      if (quiet || expired) {
        finishOverlayAfterTwoPaints();
        return;
      }
      revealFrame = window.requestAnimationFrame(waitForRevealQuiet);
    };

    const beginLiveRevealUnderOverlay = () => {
      if (!activeRoot || !activeOverlay || revealing) return;
      revealing = true;
      revealStartedAt = performance.now();
      lastLiveMutationAt = revealStartedAt;

      // The preserved parent is still physically covering the Network here.
      // Reveal the live React tree underneath it first, then wait for any class/
      // style observer work caused by this reveal to finish before removing the
      // preserved visual. The user never sees that final observer pass.
      activeRoot.classList.remove('v73LiveReturnHidden');
      revealFrame = window.requestAnimationFrame(waitForRevealQuiet);
    };

    const waitForLiveParentToSettle = () => {
      if (!activeRoot || !activeOverlay || revealing) return;
      const now = performance.now();
      const elapsed = now - returnStartedAt;
      const quiet = now - lastLiveMutationAt >= RETURN_SETTLE_QUIET_MS;
      const busy =
        activeRoot.classList.contains('veinviteInteracting') ||
        activeRoot.classList.contains('v50NetworkTransition') ||
        activeRoot.classList.contains('v72ParentReturnTarget');

      if (
        (elapsed >= RETURN_SETTLE_MIN_MS && quiet && !busy) ||
        elapsed >= RETURN_SETTLE_MAX_MS
      ) {
        beginLiveRevealUnderOverlay();
        return;
      }
      settleFrame = window.requestAnimationFrame(waitForLiveParentToSettle);
    };

    const showPreservedParent = (root: HTMLElement, snapshot: ParentVisualSnapshot) => {
      detachOverlay();
      activeRoot = root;
      activeOverlay = snapshot.clone;
      returnStartedAt = performance.now();
      lastLiveMutationAt = returnStartedAt;

      // V66 gives every visible node a small ambient translate animation. The
      // cloned parent and the live React tree cannot share the same animation
      // clock, so freeze both to the exact base position before either can paint.
      // Keep the returned parent frozen until the next deliberate navigation;
      // re-enabling here would immediately re-apply negative animation delays and
      // recreate the final 1-2px nudge that V73 is meant to remove.
      root.classList.add('v73ReturnMotionFrozen');
      positionOverlay(root, activeOverlay);
      root.classList.add('v73LiveReturnHidden');
      document.body.appendChild(activeOverlay);

      liveObserver = new MutationObserver(() => {
        lastLiveMutationAt = performance.now();
      });
      liveObserver.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
      window.addEventListener('resize', syncOverlayPosition);
      window.addEventListener('scroll', syncOverlayPosition, true);
      settleFrame = window.requestAnimationFrame(waitForLiveParentToSettle);
    };

    const clearParentVisuals = () => {
      parentVisuals.splice(0).forEach((snapshot) => snapshot.clone.remove());
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root) return;
      const button = target.closest<HTMLButtonElement>('button');
      if (!button) return;

      if (button.classList.contains('viewNetwork')) {
        parentVisuals.push(captureParentVisual(root));
        while (parentVisuals.length > PARENT_VISUAL_STACK_LIMIT) {
          parentVisuals.shift()?.clone.remove();
        }
        // The current parent is leaving the screen now, so its decorative motion
        // can resume without exposing a return-time handoff nudge.
        root.classList.remove('v73ReturnMotionFrozen');
        return;
      }

      if (button.closest('.viewActions') && button.textContent?.includes('YOU')) {
        root.classList.remove('v73ReturnMotionFrozen');
        clearParentVisuals();
        detachOverlay();
        return;
      }
      if (button.closest('.crumbs')) {
        root.classList.remove('v73ReturnMotionFrozen');
        clearParentVisuals();
        detachOverlay();
        return;
      }

      if (button.closest('.navActions') && button.textContent?.includes('Inviter')) {
        const snapshot = parentVisuals.pop() ?? null;
        if (snapshot) showPreservedParent(root, snapshot);
      }
    };

    document.addEventListener('click', onClickCapture, true);

    return () => {
      document.removeEventListener('click', onClickCapture, true);
      document
        .querySelector<HTMLElement>('.productionNetworkCanaryV45.v73ReturnMotionFrozen')
        ?.classList.remove('v73ReturnMotionFrozen');
      clearParentVisuals();
      detachOverlay();
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.v73LiveReturnHidden{
      visibility:hidden!important
    }
    .productionNetworkCanaryV45.v73ParentVisualOverlay{
      position:fixed!important;
      margin:0!important;
      overflow:hidden!important;
      pointer-events:none!important;
      user-select:none!important;
      visibility:visible!important;
      z-index:2147483000!important;
      contain:layout paint style!important
    }
    .productionNetworkCanaryV45.v73ParentVisualOverlay *{
      pointer-events:none!important;
      user-select:none!important
    }
    .productionNetworkCanaryV45.v73ReturnMotionFrozen :is(
      .personNode,
      .slotNode,
      .clusterNode,
      .v42GroupHub
    ){
      animation:none!important;
      animation-delay:0s!important;
      translate:none!important
    }
  `}</style>;
}

export function AppNetworkCanaryV73({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV72 locale={locale} />
      <NetworkParentVisualPreserveV73 />
    </>
  );
}
