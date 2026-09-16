'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

const PARENT_RETURN_RELEASE_POLL_MS = 16;
const PARENT_RETURN_FALLBACK_MS = 300;
const MIN_ZOOM = 0.32;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.12;

type LayoutSnapshot = {
  people: Record<string, string>;
  groups: Record<string, string>;
  slots: string[];
};

type ViewSnapshot = {
  zoom: number;
  cameraX: number;
  cameraY: number;
  layout: LayoutSnapshot;
};

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
    let parentLayoutObserver: MutationObserver | null = null;
    let releaseFrameOne = 0;
    let releaseFrameTwo = 0;
    let activeParentSnapshot: ViewSnapshot | null = null;
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

    const renderedTransform = (element: HTMLElement) => {
      const transform = window.getComputedStyle(element).transform;
      return transform && transform !== 'none' ? transform : '';
    };

    const captureLayout = (root: HTMLElement): LayoutSnapshot => {
      const people: Record<string, string> = {};
      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        const transform = id ? renderedTransform(node) : '';
        if (id && transform) people[id] = transform;
      });

      const groups: Record<string, string> = {};
      root.querySelectorAll<HTMLElement>('.v42GroupHub[data-group-id]').forEach((hub) => {
        const id = hub.dataset.groupId;
        const transform = id ? renderedTransform(hub) : '';
        if (id && transform) groups[id] = transform;
      });

      const slots = Array.from(root.querySelectorAll<HTMLElement>('.slotNode'))
        .map((slot) => renderedTransform(slot));

      return { people, groups, slots };
    };

    const captureView = (root: HTMLElement): ViewSnapshot | null => {
      const scene = root.querySelector<HTMLElement>('.scene');
      if (!scene) return null;
      return {
        zoom: readZoom(root),
        cameraX: parsePx(scene.style.getPropertyValue('--cameraX')),
        cameraY: parsePx(scene.style.getPropertyValue('--cameraY')),
        layout: captureLayout(root),
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

    const clearParentLayoutLocks = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('[data-v72-parent-return-node="1"]').forEach((node) => {
        delete node.dataset.v72ParentReturnNode;
        node.style.removeProperty('--v72-parent-node-transform');
      });
      root.querySelectorAll<HTMLElement>('[data-v72-parent-return-group="1"]').forEach((hub) => {
        delete hub.dataset.v72ParentReturnGroup;
        hub.style.removeProperty('--v72-parent-group-transform');
      });
      root.querySelectorAll<HTMLElement>('[data-v72-parent-return-slot="1"]').forEach((slot) => {
        delete slot.dataset.v72ParentReturnSlot;
        slot.style.removeProperty('--v72-parent-slot-transform');
      });
    };

    const applyParentLayoutLocks = (root: HTMLElement, snapshot: ViewSnapshot) => {
      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        const transform = id ? snapshot.layout.people[id] : '';
        if (!transform) return;
        node.style.setProperty('--v72-parent-node-transform', transform);
        node.dataset.v72ParentReturnNode = '1';
      });

      root.querySelectorAll<HTMLElement>('.v42GroupHub[data-group-id]').forEach((hub) => {
        const id = hub.dataset.groupId;
        const transform = id ? snapshot.layout.groups[id] : '';
        if (!transform) return;
        hub.style.setProperty('--v72-parent-group-transform', transform);
        hub.dataset.v72ParentReturnGroup = '1';
      });

      Array.from(root.querySelectorAll<HTMLElement>('.slotNode')).forEach((slot, index) => {
        const transform = snapshot.layout.slots[index];
        if (!transform) return;
        slot.style.setProperty('--v72-parent-slot-transform', transform);
        slot.dataset.v72ParentReturnSlot = '1';
      });
    };

    const stopParentLayoutObserver = () => {
      parentLayoutObserver?.disconnect();
      parentLayoutObserver = null;
    };

    const cancelReleaseFrames = () => {
      if (releaseFrameOne) window.cancelAnimationFrame(releaseFrameOne);
      if (releaseFrameTwo) window.cancelAnimationFrame(releaseFrameTwo);
      releaseFrameOne = 0;
      releaseFrameTwo = 0;
    };

    const releaseParentReturn = (root: HTMLElement) => {
      if (parentReturnTimer !== null) {
        window.clearTimeout(parentReturnTimer);
        parentReturnTimer = null;
      }
      cancelReleaseFrames();
      stopParentLayoutObserver();
      parentReturnStartedAt = 0;
      activeParentSnapshot = null;
      root.classList.remove('v72ParentReturnTarget');
      root.style.removeProperty('--v72-parent-return-transform');
      clearParentLayoutLocks(root);
    };

    const releaseAfterLayoutSettles = (root: HTMLElement) => {
      cancelReleaseFrames();
      releaseFrameOne = window.requestAnimationFrame(() => {
        releaseFrameOne = 0;
        if (!root.classList.contains('v72ParentReturnTarget')) return;
        if (activeParentSnapshot) applyParentLayoutLocks(root, activeParentSnapshot);

        releaseFrameTwo = window.requestAnimationFrame(() => {
          releaseFrameTwo = 0;
          if (!root.classList.contains('v72ParentReturnTarget')) return;
          if (activeParentSnapshot) applyParentLayoutLocks(root, activeParentSnapshot);
          releaseParentReturn(root);
        });
      });
    };

    const targetParentReturn = (root: HTMLElement, snapshot: ViewSnapshot) => {
      const targetZoom = restoredZoom(snapshot);
      activeParentSnapshot = snapshot;
      root.style.setProperty(
        '--v72-parent-return-transform',
        `translate3d(${snapshot.cameraX}px,${snapshot.cameraY}px,0) scale(${targetZoom})`,
      );
      root.classList.add('v72ParentReturnTarget');
      parentReturnStartedAt = performance.now();

      // Parent nodes are replaced by React after the Inviter click. Observe only
      // child-list changes during this short transition and pin each recreated
      // element to the exact transform it had before entering the child network.
      // V39/V42/V50 can finish their internal layout work underneath this lock.
      stopParentLayoutObserver();
      parentLayoutObserver = new MutationObserver(() => {
        if (activeParentSnapshot) applyParentLayoutLocks(root, activeParentSnapshot);
      });
      parentLayoutObserver.observe(root, { childList: true, subtree: true });
      applyParentLayoutLocks(root, snapshot);

      if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
      parentReturnTimer = window.setTimeout(() => {
        parentReturnTimer = null;
        if (root.classList.contains('v72ParentReturnTarget')) releaseAfterLayoutSettles(root);
      }, PARENT_RETURN_FALLBACK_MS);
    };

    const releaseWhenInteractionSettles = (root: HTMLElement) => {
      if (!root.classList.contains('v72ParentReturnTarget')) return;
      const expired = parentReturnStartedAt > 0 &&
        performance.now() - parentReturnStartedAt >= PARENT_RETURN_FALLBACK_MS;

      if (!root.classList.contains('veinviteInteracting') || expired) {
        if (parentReturnTimer !== null) {
          window.clearTimeout(parentReturnTimer);
          parentReturnTimer = null;
        }
        // Let V39/V42 consume the final parent DOM and V50 camera replay for two
        // paint boundaries while the captured parent element positions stay fixed.
        releaseAfterLayoutSettles(root);
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

      // V50 has replayed the saved parent camera. Keep camera and recreated node
      // geometry pinned until the mobile pinch interaction and delayed layout
      // observers have both settled.
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
      cancelReleaseFrames();
      stopParentLayoutObserver();
      document
        .querySelectorAll<HTMLElement>('.productionNetworkCanaryV45')
        .forEach((root) => {
          root.classList.remove('v72ParentReturnTarget');
          root.style.removeProperty('--v72-parent-return-transform');
          clearParentLayoutLocks(root);
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
    .productionNetworkCanaryV45.v72ParentReturnTarget .personNode[data-v72-parent-return-node="1"]{
      transform:var(--v72-parent-node-transform)!important;
      transition:none!important
    }
    .productionNetworkCanaryV45.v72ParentReturnTarget .v42GroupHub[data-v72-parent-return-group="1"]{
      transform:var(--v72-parent-group-transform)!important;
      transition:none!important
    }
    .productionNetworkCanaryV45.v72ParentReturnTarget .slotNode[data-v72-parent-return-slot="1"]{
      transform:var(--v72-parent-slot-transform)!important;
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
