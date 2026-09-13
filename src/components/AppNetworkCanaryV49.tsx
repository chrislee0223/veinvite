'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV48 } from './AppNetworkCanaryV48';

const INTRO_SESSION_KEY = 'veinvite:network:intro-v4';
const LEGACY_INTRO_KEYS = ['veinvite:network:intro-v1', 'veinvite:network:intro-v3'];
const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const LEGACY_SETTLE_MS = 150;
const INTRO_HOLD_MS = 120;
const INTRO_MOTION_MS = 860;
const INTERNAL_POINTER_ID_MIN = 99440;
const GROUP_DROP_VERIFY_MS = 180;

type TrackedGroupDrag = {
  pointerId: number;
  node: HTMLButtonElement;
  nodeId: string;
  startX: number;
  startY: number;
  moved: boolean;
} | null;

type StoredGroup = { id?: string; members?: string[] };

// V49 owns the visible first-entry story. Prime the older wrappers before they
// render so their legacy intro paths cannot race the new one. Their repeat-entry
// settling path is still useful while the dynamic Network chunk finishes mounting.
if (typeof window !== 'undefined') {
  try {
    LEGACY_INTRO_KEYS.forEach((key) => window.sessionStorage.setItem(key, '1'));
  } catch {
    // sessionStorage can be unavailable in hardened/private WebViews.
  }
}

function NetworkFinalInteractionPolish() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let introStarted = false;
    let introFinished = false;
    let pinchBridgeActive = false;
    let trackedGroupDrag: TrackedGroupDrag = null;
    let syntheticDropPointerId = 120000;
    let prepareTimer: number | null = null;
    let holdTimer: number | null = null;
    let wheelTimer: number | null = null;
    let endTimer: number | null = null;
    let groupDropVerifyTimer: number | null = null;
    let revealFrame = 0;
    let animateFrame = 0;

    const sessionIntroSeen = () => {
      try { return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1'; } catch { return false; }
    };
    const markIntroSeen = () => {
      try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional */ }
    };

    const hiddenViewButton = (match: (text: string) => boolean) => Array.from(
      root.querySelectorAll<HTMLButtonElement>('.viewActions button'),
    ).find((button) => match(button.textContent?.trim() ?? '')) ?? null;

    const minusButton = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
      .find((button) => button.textContent?.trim() === '−') ?? null;

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
        // Hardened WebViews can reject synthetic WheelEvent construction.
      }
    };

    const clearIntroTimers = () => {
      if (prepareTimer !== null) window.clearTimeout(prepareTimer);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      if (wheelTimer !== null) window.clearTimeout(wheelTimer);
      if (endTimer !== null) window.clearTimeout(endTimer);
      prepareTimer = null;
      holdTimer = null;
      wheelTimer = null;
      endTimer = null;
      window.cancelAnimationFrame(revealFrame);
      window.cancelAnimationFrame(animateFrame);
    };

    const finishIntro = (remember = true) => {
      if (introFinished) return;
      introFinished = true;
      clearIntroTimers();
      root.classList.remove('v49PreparingIntro', 'v49IntroActive');
      stage.style.visibility = 'visible';
      if (remember) markIntroSeen();
    };

    const applyOverviewZoom = () => {
      const minus = minusButton();
      for (let step = 0; step < 4; step += 1) minus?.click();
      wheelTimer = window.setTimeout(() => {
        wheelTimer = null;
        if (!mounted || introFinished) return;
        dispatchWheel(100);
      }, 40);
    };

    const startVisibleIntro = () => {
      if (!mounted || introFinished) return;

      // Older wrappers finish their hidden settling first. Then reset to YOU
      // without transition, paint that state, and only then begin the zoom-out.
      stage.style.visibility = 'hidden';
      root.classList.remove('veinviteSettling', 'veinviteInitialFit', 'veinviteIntroV3');
      root.classList.add('v49PreparingIntro');
      hiddenViewButton((text) => text.includes('YOU'))?.click();

      revealFrame = window.requestAnimationFrame(() => {
        animateFrame = window.requestAnimationFrame(() => {
          if (!mounted || introFinished) return;
          root.classList.remove('v49PreparingIntro');
          root.classList.add('v49IntroActive');
          stage.style.visibility = 'visible';

          holdTimer = window.setTimeout(() => {
            holdTimer = null;
            if (!mounted || introFinished) return;
            introStarted = true;
            applyOverviewZoom();
            endTimer = window.setTimeout(() => {
              endTimer = null;
              finishIntro(true);
            }, INTRO_MOTION_MS);
          }, INTRO_HOLD_MS);
        });
      });
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alreadySeen = sessionIntroSeen();
    if (!reducedMotion && !alreadySeen) {
      prepareTimer = window.setTimeout(() => {
        prepareTimer = null;
        startVisibleIntro();
      }, LEGACY_SETTLE_MS);
    } else {
      introFinished = true;
    }

    const onUserInteraction = (event: Event) => {
      if (!event.isTrusted || introFinished) return;
      if (introStarted) markIntroSeen();
      finishIntro(introStarted);
    };
    root.addEventListener('pointerdown', onUserInteraction, true);
    root.addEventListener('touchstart', onUserInteraction, true);
    stage.addEventListener('wheel', onUserInteraction, true);

    const groupTargetAt = (clientX: number, clientY: number) => {
      const targets = Array.from(root.querySelectorAll<HTMLElement>(
        '.v42GroupRow[data-v42-group-drop],.v42GroupHub[data-v42-group-drop]',
      ));
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        const pad = target.classList.contains('v42GroupHub') ? 10 : 5;
        if (clientX >= rect.left - pad && clientX <= rect.right + pad &&
            clientY >= rect.top - pad && clientY <= rect.bottom + pad) return target;
      }
      return null;
    };

    const storedGroupHasNode = (groupId: string, nodeId: string) => {
      try {
        const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (!raw) return false;
        const groups = JSON.parse(raw) as StoredGroup[];
        return Array.isArray(groups) && groups.some((group) => group.id === groupId && group.members?.includes(nodeId));
      } catch {
        return false;
      }
    };

    const replayGroupDrop = (node: HTMLButtonElement, target: HTMLElement) => {
      if (!mounted || !node.isConnected || !target.isConnected) return;
      const nodeRect = node.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = nodeRect.left + nodeRect.width / 2;
      const startY = nodeRect.top + Math.min(26, nodeRect.height / 2);
      const endX = targetRect.left + Math.min(Math.max(34, targetRect.width * .35), targetRect.width - 12);
      const endY = targetRect.top + targetRect.height / 2;
      syntheticDropPointerId += 1;
      const pointerId = syntheticDropPointerId;
      try {
        node.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0,
          clientX: startX, clientY: startY,
        }));
        node.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: startX + 18, clientY: startY,
        }));
        node.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: endX, clientY: endY,
        }));
        node.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', button: 0,
          clientX: endX, clientY: endY,
        }));
      } catch {
        // Best-effort iOS pointer-capture fallback only.
      }
    };

    // V44 intentionally dispatches synthetic pointerdown events directly on the
    // person button to toggle/create/move group membership. V47's user-facing
    // circle-only hit rule must not swallow those internal events. Re-target only
    // reserved synthetic pointer IDs to the visible circle before document capture
    // reaches V47, and temporarily bypass V47's real-user drag layer.
    const onWindowPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;

      if (!event.isTrusted) {
        if (event.pointerType !== 'mouse' || event.pointerId < INTERNAL_POINTER_ID_MIN) return;
        if (!node || !root.contains(node) || target?.closest('.nodeCircle')) return;
        const circle = node.querySelector<HTMLElement>('.nodeCircle');
        if (!circle) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const alreadyEditing = stage.classList.contains('editMode');
        if (!alreadyEditing) stage.classList.add('editMode');
        try {
          circle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            button: event.button,
            buttons: event.buttons,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          }));
        } catch {
          // If PointerEvent construction is unavailable, leave the original action
          // cancelled rather than leaking a false user click into the canvas.
        } finally {
          if (!alreadyEditing) stage.classList.remove('editMode');
        }
        return;
      }

      const circle = target?.closest<HTMLElement>('.nodeCircle') ?? null;
      const nodeId = node?.dataset.nodeId;
      if (!node || !nodeId || !circle || !node.contains(circle) || !root.contains(node)) return;
      if (!root.querySelector('.v42GroupPanel') || stage.classList.contains('editMode')) return;
      trackedGroupDrag = {
        pointerId: event.pointerId,
        node,
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      const drag = trackedGroupDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 10) drag.moved = true;
    };

    const finishTrackedGroupDrag = (event: PointerEvent, cancelled = false) => {
      const drag = trackedGroupDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      trackedGroupDrag = null;
      if (cancelled || !drag.moved) return;
      const target = groupTargetAt(event.clientX, event.clientY);
      const groupId = target?.dataset.groupId;
      if (!target || !groupId) return;

      if (groupDropVerifyTimer !== null) window.clearTimeout(groupDropVerifyTimer);
      groupDropVerifyTimer = window.setTimeout(() => {
        groupDropVerifyTimer = null;
        if (!mounted || storedGroupHasNode(groupId, drag.nodeId)) return;
        replayGroupDrop(drag.node, target);
      }, GROUP_DROP_VERIFY_MS);
    };
    const onWindowPointerCancel = (event: PointerEvent) => finishTrackedGroupDrag(event, true);

    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('pointermove', onWindowPointerMove, true);
    window.addEventListener('pointerup', finishTrackedGroupDrag, true);
    window.addEventListener('pointercancel', onWindowPointerCancel, true);

    // Keep V37's pinchRef alive until every finger leaves the screen. Without
    // this bridge, lifting one of two fingers ends pinch early and a surviving
    // one-finger pan can resume from an old origin, making the camera jump.
    const onWindowTouchStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target)) return;
      if (event.touches.length >= 2) pinchBridgeActive = true;
    };
    const holdIntermediatePinchEnd = (event: TouchEvent) => {
      if (!pinchBridgeActive) return;
      if (event.touches.length > 0) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      pinchBridgeActive = false;
    };
    window.addEventListener('touchstart', onWindowTouchStart, { capture: true, passive: true });
    window.addEventListener('touchend', holdIntermediatePinchEnd, { capture: true, passive: true });
    window.addEventListener('touchcancel', holdIntermediatePinchEnd, { capture: true, passive: true });

    return () => {
      mounted = false;
      clearIntroTimers();
      if (groupDropVerifyTimer !== null) window.clearTimeout(groupDropVerifyTimer);
      root.removeEventListener('pointerdown', onUserInteraction, true);
      root.removeEventListener('touchstart', onUserInteraction, true);
      stage.removeEventListener('wheel', onUserInteraction, true);
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('pointermove', onWindowPointerMove, true);
      window.removeEventListener('pointerup', finishTrackedGroupDrag, true);
      window.removeEventListener('pointercancel', onWindowPointerCancel, true);
      window.removeEventListener('touchstart', onWindowTouchStart, true);
      window.removeEventListener('touchend', holdIntermediatePinchEnd, true);
      window.removeEventListener('touchcancel', holdIntermediatePinchEnd, true);
      root.classList.remove('v49PreparingIntro', 'v49IntroActive');
      stage.style.visibility = 'visible';
    };
  }, []);

  return <style jsx global>{`
    /* Make the first-session YOU -> overview story start only after YOU has
       actually painted, instead of completing behind the dynamic mount. */
    .productionNetworkCanaryV45.v49PreparingIntro .scene,
    .productionNetworkCanaryV45.v49PreparingIntro .cameraTransition .scene{
      transition:none!important
    }
    .productionNetworkCanaryV45.v49IntroActive .scene,
    .productionNetworkCanaryV45.v49IntroActive .cameraTransition .scene{
      transition:transform 720ms cubic-bezier(.18,.82,.2,1)!important
    }
    .productionNetworkCanaryV45.v49IntroActive .zoomValue{opacity:0!important}

    /* V48's zoom-aware vertical spacing is retained, but the text is centered
       by the node's fixed anchor box rather than max-content translation. This
       prevents wallet/direct-net text drifting to the lower-left at high zoom. */
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small{
      left:0!important;right:0!important;width:100%!important;max-width:none!important;
      text-align:center!important;overflow:visible!important;white-space:nowrap!important;
      transform:scale(var(--v46-label-scale,1))!important;
      transform-origin:50% 0!important
    }
    .productionNetworkCanaryV45 .slotNode>b{
      left:0!important;right:0!important;width:100%!important;
      text-align:center!important;overflow:visible!important;white-space:nowrap!important;
      transform:scale(var(--v46-label-scale,1))!important;
      transform-origin:50% 0!important
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45.v49IntroActive .scene{transition:none!important}
    }
  `}</style>;
}

export function AppNetworkCanaryV49({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV48 locale={locale} />
    <NetworkFinalInteractionPolish />
  </>;
}
