'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

const PARENT_RETURN_RELEASE_POLL_MS = 16;
const PARENT_RETURN_FALLBACK_MS = 220;
const MIN_ZOOM = 0.32;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.12;

type ViewSnapshot = { zoom: number; cameraX: number; cameraY: number };

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function NetworkCanaryInteractionOwnershipV72() {
  useLayoutEffect(() => {
    let parentReturnTimer: number | null = null;
    let parentReturnStartedAt = 0;
    const parentViews: ViewSnapshot[] = [];

    const canaryRootFor = (target: Element | null) =>
      target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;

    const groupRootFor = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.v42ManualGroupsRoot');

    const clearCanvasSelection = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
    };

    const readZoom = (root: HTMLElement) => {
      const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
      const parsed = Number.parseFloat(text.replace('%', ''));
      return Number.isFinite(parsed) ? Math.max(0.01, parsed / 100) : 1;
    };

    const captureView = (root: HTMLElement): ViewSnapshot | null => {
      const scene = root.querySelector<HTMLElement>('.scene');
      if (!scene) return null;
      return {
        zoom: readZoom(root),
        cameraX: parsePx(scene.style.getPropertyValue('--cameraX')),
        cameraY: parsePx(scene.style.getPropertyValue('--cameraY')),
      };
    };

    // V50 restores zoom through +/- button clicks from 100%. Match the exact
    // zoom that those clicks will produce so removing the temporary override
    // cannot introduce a second scale jump.
    const restoredZoom = (snapshot: ViewSnapshot) => {
      const steps = Math.min(16, Math.round(Math.abs(snapshot.zoom - 1) / ZOOM_STEP));
      const direction = snapshot.zoom >= 1 ? 1 : -1;
      return clamp(1 + direction * steps * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    };

    const releaseParentReturn = (root: HTMLElement) => {
      if (parentReturnTimer !== null) {
        window.clearTimeout(parentReturnTimer);
        parentReturnTimer = null;
      }
      parentReturnStartedAt = 0;
      root.classList.remove('v72ParentReturnTarget');
      root.style.removeProperty('--v72-parent-return-transform');
    };

    const targetParentReturn = (root: HTMLElement, snapshot: ViewSnapshot) => {
      const targetZoom = restoredZoom(snapshot);
      root.style.setProperty(
        '--v72-parent-return-transform',
        `translate3d(${snapshot.cameraX}px,${snapshot.cameraY}px,0) scale(${targetZoom})`,
      );
      root.classList.add('v72ParentReturnTarget');
      parentReturnStartedAt = performance.now();

      if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
      parentReturnTimer = window.setTimeout(() => {
        parentReturnTimer = null;
        if (root.classList.contains('v72ParentReturnTarget')) releaseParentReturn(root);
      }, PARENT_RETURN_FALLBACK_MS);
    };

    const releaseWhenInteractionSettles = (root: HTMLElement) => {
      if (!root.classList.contains('v72ParentReturnTarget')) return;
      const expired = parentReturnStartedAt > 0 &&
        performance.now() - parentReturnStartedAt >= PARENT_RETURN_FALLBACK_MS;

      if (!root.classList.contains('veinviteInteracting') || expired) {
        // V50's synthetic pointerup has completed the React camera update by
        // this point. One task boundary lets that state commit before exposing it.
        if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
        parentReturnTimer = window.setTimeout(() => releaseParentReturn(root), 0);
        return;
      }

      if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
      parentReturnTimer = window.setTimeout(
        () => releaseWhenInteractionSettles(root),
        PARENT_RETURN_RELEASE_POLL_MS,
      );
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root) return;

      const groupRoot = groupRootFor(root);
      if (!groupRoot) return;

      const creating = groupRoot.classList.contains('v42Creating');
      const managing = groupRoot.classList.contains('v42Managing');
      const node = target.closest<HTMLElement>('.personNode[data-node-id]');
      if (!node || (!creating && !managing)) return;

      clearCanvasSelection(root);

      // V42 deliberately rejects people that already belong to a group while
      // the Create editor is open. Stop the pointer at document capture before
      // V71's optimistic mobile paint can momentarily mark that locked person as
      // selected. Valid nodes continue to V71/V42 unchanged.
      if (
        creating &&
        (node.classList.contains('v42LockedMember') || node.classList.contains('v42GroupedMember'))
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    const onPointerUpCapture = (event: PointerEvent) => {
      if (event.isTrusted || event.pointerType !== 'mouse') return;
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root || !root.classList.contains('v72ParentReturnTarget')) return;
      if (!target.classList.contains('stage')) return;

      // V50 has now replayed the saved parent camera with its synthetic drag.
      // Keep the final parent transform pinned until the mobile pinch interaction
      // guard releases, otherwise that guard's transition:none makes the scene snap.
      releaseWhenInteractionSettles(root);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root) return;

      const button = target.closest<HTMLButtonElement>('button');

      if (button?.classList.contains('viewNetwork')) {
        const snapshot = captureView(root);
        if (snapshot) parentViews.push(snapshot);
      }

      if (button?.closest('.viewActions') && button.textContent?.includes('YOU')) {
        parentViews.length = 0;
        releaseParentReturn(root);
      }
      if (button?.closest('.crumbs')) {
        parentViews.length = 0;
        releaseParentReturn(root);
      }

      if (button?.closest('.navActions') && button.textContent?.includes('Inviter')) {
        const snapshot = parentViews.pop() ?? null;
        if (snapshot) {
          // Do not freeze the outgoing child transform. Pin the transform that
          // V50 is about to restore for the parent, so when React swaps the node
          // content the very first painted parent frame is already at its final
          // camera. V50 can complete its legacy reset/restore invisibly beneath it.
          targetParentReturn(root, snapshot);
        }
      }

      const groupRoot = groupRootFor(root);
      const editorActive = Boolean(
        groupRoot?.classList.contains('v42Creating') ||
        groupRoot?.classList.contains('v42Managing'),
      );
      if (!editorActive) return;

      const node = target.closest<HTMLElement>('.personNode[data-node-id]');
      if (!node) return;

      // V42 already owns member selection on pointerdown. Swallow the later
      // synthetic click at document capture so V45 cannot paint profile-selection
      // state over the group editor's selected/deselected state.
      clearCanvasSelection(root);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('pointerup', onPointerUpCapture, true);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('pointerup', onPointerUpCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
      document
        .querySelectorAll<HTMLElement>('.productionNetworkCanaryV45')
        .forEach((root) => {
          root.classList.remove('v72ParentReturnTarget');
          root.style.removeProperty('--v72-parent-return-transform');
          root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
            node.classList.remove('canarySelectedNode');
          });
        });
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.v72ParentReturnTarget .scene{
      transform:var(--v72-parent-return-transform)!important;
      transition:none!important
    }
  `}</style>;
}

export function AppNetworkCanaryV72({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV71 locale={locale} />
      <NetworkCanaryInteractionOwnershipV72 />
    </>
  );
}
