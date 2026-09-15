'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

const ENTER_RATIO = 1.18;
const ENTER_RECOGNIZE_RATIO = 1.08;
const ENTER_FINAL_RATIO_MIN = 1.04;
const MAX_ZOOM_START = 2.45;
const MAX_ZOOM_ENTER_RATIO = 1.06;
const MAX_ZOOM_RECOGNIZE_RATIO = 1.025;
const MAX_ZOOM_FINAL_RATIO_MIN = 1.015;
const PARENT_PINCH_RATIO = 0.64;
const PARENT_ZOOM_MAX = 0.48;
const CLICK_GUARD_MS = 540;
const PROFILE_POLL_MS = 32;
const PROFILE_POLL_ATTEMPTS = 24;

type PinchIntent = {
  startedAt: number;
  startDistance: number;
  startZoom: number;
  maxRatio: number;
  minRatio: number;
  lastRatio: number;
  candidateId: string | null;
};

type GestureLikeEvent = Event & { scale?: number };

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function NetworkTouchNavigationV72() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    let mounted = true;
    let pinch: PinchIntent | null = null;
    let guard: HTMLDivElement | null = null;
    let navigationTimer: number | null = null;
    let profileTimer: number | null = null;

    const editMode = () => stage.classList.contains('editMode');
    const inTransition = () => root.classList.contains('v50NetworkTransition');
    const realGroupPanel = () => root.querySelector<HTMLElement>('.v42GroupPanel:not([data-v72-pinch-guard="1"])');

    const isRootNetwork = () => {
      const source = root.querySelector<HTMLElement>('.centerWrap > b');
      const circle = root.querySelector<HTMLElement>('.centerWrap > .centerCircle');
      return source?.dataset.v70RootLabel === '1' || circle?.hasAttribute('data-v71-root-copy') === true;
    };

    const nodeById = (id: string | null) => id
      ? root.querySelector<HTMLButtonElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`)
      : null;

    const nearestNode = (clientX: number, clientY: number): HTMLButtonElement | null => {
      let best: HTMLButtonElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const node of Array.from(root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'))) {
        if (node.classList.contains('v42CollapsedMember')) continue;
        const circle = node.querySelector<HTMLElement>('.nodeCircle');
        if (!circle) continue;
        const rect = circle.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const currentDistance = Math.hypot(clientX - centerX, clientY - centerY);
        const limit = Math.max(92, rect.width * 1.4);
        if (currentDistance > limit || currentDistance >= bestDistance) continue;
        best = node;
        bestDistance = currentDistance;
      }

      return best;
    };

    const targetNode = (event: TouchEvent, midX: number, midY: number) => {
      const target = event.target instanceof Element ? event.target : null;
      const direct = target?.closest<HTMLButtonElement>('.personNode[data-node-id]') ?? null;
      if (direct && root.contains(direct) && !direct.classList.contains('v42CollapsedMember')) return direct;
      return nearestNode(midX, midY);
    };

    const clearCandidate = (id: string | null) => {
      nodeById(id)?.classList.remove('v72NavigationCandidate');
    };

    const showCandidate = (id: string | null) => {
      root.querySelectorAll('.personNode.v72NavigationCandidate').forEach((node) => {
        if (!(node instanceof HTMLButtonElement) || node.dataset.nodeId !== id) {
          node.classList.remove('v72NavigationCandidate');
        }
      });
      nodeById(id)?.classList.add('v72NavigationCandidate');
    };

    const addGuard = () => {
      if (guard?.isConnected) return;
      const next = document.createElement('div');
      next.className = 'v42GroupPanel';
      next.dataset.v72PinchGuard = '1';
      next.setAttribute('aria-hidden', 'true');
      next.style.display = 'none';
      root.appendChild(next);
      guard = next;
    };

    const removeGuard = () => {
      guard?.remove();
      guard = null;
    };

    const closeProfile = () => {
      const close = root.querySelector<HTMLButtonElement>('.profileCard > div button');
      if (close?.textContent?.trim() === '×') close.click();
    };

    const clearNavigationTimers = () => {
      if (navigationTimer !== null) window.clearTimeout(navigationTimer);
      if (profileTimer !== null) window.clearTimeout(profileTimer);
      navigationTimer = null;
      profileTimer = null;
    };

    const enterNode = (intent: PinchIntent) => {
      const node = nodeById(intent.candidateId);
      if (!node || !node.isConnected || editMode() || realGroupPanel() || inTransition()) {
        clearCandidate(intent.candidateId);
        return;
      }

      closeProfile();
      showCandidate(intent.candidateId);
      const elapsed = performance.now() - intent.startedAt;
      const delay = Math.max(0, CLICK_GUARD_MS - elapsed);

      const confirmProfile = (attempt: number) => {
        if (!mounted || !node.isConnected) {
          clearCandidate(intent.candidateId);
          return;
        }
        const viewNetwork = root.querySelector<HTMLButtonElement>('.profileCard .viewNetwork');
        if (viewNetwork) {
          viewNetwork.click();
          clearCandidate(intent.candidateId);
          return;
        }
        if (attempt >= PROFILE_POLL_ATTEMPTS) {
          clearCandidate(intent.candidateId);
          return;
        }
        profileTimer = window.setTimeout(() => confirmProfile(attempt + 1), PROFILE_POLL_MS);
      };

      navigationTimer = window.setTimeout(() => {
        navigationTimer = null;
        if (!mounted || !node.isConnected) {
          clearCandidate(intent.candidateId);
          return;
        }
        node.querySelector<HTMLElement>('.nodeCircle')?.click();
        profileTimer = window.setTimeout(() => confirmProfile(0), PROFILE_POLL_MS);
      }, delay);
    };

    const goParent = () => {
      if (isRootNetwork() || editMode() || realGroupPanel() || inTransition()) return;
      const inviter = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
        .find((button) => button.textContent?.includes('Inviter'));
      inviter?.click();
    };

    const scheduleAfterTouch = (action: (() => void) | null) => {
      // Keep the hidden guard alive through the entire touchend capture chain so
      // legacy V50 sees a group panel and cannot run its more-sensitive parent
      // return. Remove it on the next task, then run exactly one V72 action.
      window.setTimeout(() => {
        removeGuard();
        action?.();
      }, 0);
    };

    const blockedTarget = (target: Element | null) => Boolean(target?.closest(
      'input,textarea,select,.profileCard,.searchPanel,.v42GroupPanel,.v42RemoveZone,.v42GroupHub,.navActions,.viewActions',
    ));

    const onTouchStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target) || blockedTarget(target)) return;
      if (event.touches.length !== 2 || editMode() || realGroupPanel() || inTransition()) return;

      clearNavigationTimers();
      clearCandidate(pinch?.candidateId ?? null);

      const a = event.touches[0];
      const b = event.touches[1];
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const candidate = targetNode(event, midX, midY);

      pinch = {
        startedAt: performance.now(),
        startDistance: Math.max(1, distance(a, b)),
        startZoom: readZoom(root),
        maxRatio: 1,
        minRatio: 1,
        lastRatio: 1,
        candidateId: candidate?.dataset.nodeId ?? null,
      };
      addGuard();
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = pinch;
      if (!current || event.touches.length !== 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      const ratio = distance(a, b) / current.startDistance;
      current.maxRatio = Math.max(current.maxRatio, ratio);
      current.minRatio = Math.min(current.minRatio, ratio);
      current.lastRatio = ratio;

      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const candidate = nearestNode(midX, midY);
      if (candidate?.dataset.nodeId !== current.candidateId) {
        clearCandidate(current.candidateId);
        current.candidateId = candidate?.dataset.nodeId ?? null;
      }

      const maxMode = current.startZoom >= MAX_ZOOM_START;
      const recognizeAt = maxMode ? MAX_ZOOM_RECOGNIZE_RATIO : ENTER_RECOGNIZE_RATIO;
      if (current.candidateId && ratio >= recognizeAt) showCandidate(current.candidateId);
      else clearCandidate(current.candidateId);
    };

    const onGestureChange = (event: Event) => {
      const current = pinch;
      if (!current || current.startZoom < MAX_ZOOM_START) return;
      const scale = Number((event as GestureLikeEvent).scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      current.maxRatio = Math.max(current.maxRatio, scale);
      current.minRatio = Math.min(current.minRatio, scale);
      current.lastRatio = scale;
      if (current.candidateId && scale >= MAX_ZOOM_RECOGNIZE_RATIO) showCandidate(current.candidateId);
    };

    const finishTouch = (event: TouchEvent) => {
      if (!pinch || event.touches.length > 0) return;
      const intent = pinch;
      pinch = null;

      const maxMode = intent.startZoom >= MAX_ZOOM_START;
      const enterAt = maxMode ? MAX_ZOOM_ENTER_RATIO : ENTER_RATIO;
      const finalMin = maxMode ? MAX_ZOOM_FINAL_RATIO_MIN : ENTER_FINAL_RATIO_MIN;
      let action: (() => void) | null = null;

      if (
        intent.candidateId &&
        intent.maxRatio >= enterAt &&
        intent.lastRatio >= finalMin
      ) {
        action = () => enterNode(intent);
      } else {
        clearCandidate(intent.candidateId);
        if (
          !isRootNetwork() &&
          intent.minRatio <= PARENT_PINCH_RATIO &&
          readZoom(root) <= PARENT_ZOOM_MAX
        ) {
          action = goParent;
        }
      }

      scheduleAfterTouch(action);
    };

    const cancelTouch = (event: TouchEvent) => {
      if (!pinch || event.touches.length > 0) return;
      clearCandidate(pinch.candidateId);
      pinch = null;
      scheduleAfterTouch(null);
    };

    const clearTransient = () => {
      clearNavigationTimers();
      clearCandidate(pinch?.candidateId ?? null);
      pinch = null;
      removeGuard();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearTransient();
    };

    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    window.addEventListener('touchend', finishTouch, { capture: true, passive: true });
    window.addEventListener('touchcancel', cancelTouch, { capture: true, passive: true });
    stage.addEventListener('gesturechange', onGestureChange, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearTransient);

    return () => {
      mounted = false;
      clearTransient();
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', finishTouch, true);
      window.removeEventListener('touchcancel', cancelTouch, true);
      stage.removeEventListener('gesturechange', onGestureChange, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearTransient);
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .personNode.v72NavigationCandidate .nodeCircle {
      border-color: rgba(255,211,77,1) !important;
      box-shadow: 0 0 0 5px rgba(244,183,40,.14), 0 0 38px rgba(244,183,40,.24) !important;
    }
  `}</style>;
}

export function AppNetworkCanaryV72({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV71 locale={locale} />
      <NetworkTouchNavigationV72 />
    </>
  );
}
