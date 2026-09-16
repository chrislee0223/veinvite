'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

const PARENT_RETURN_FALLBACK_MS = 140;

function NetworkCanaryInteractionOwnershipV72() {
  useLayoutEffect(() => {
    let parentReturnTimer: number | null = null;

    const canaryRootFor = (target: Element | null) =>
      target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;

    const groupRootFor = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.v42ManualGroupsRoot');

    const clearCanvasSelection = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
    };

    const releaseParentReturn = (root: HTMLElement) => {
      if (parentReturnTimer !== null) {
        window.clearTimeout(parentReturnTimer);
        parentReturnTimer = null;
      }
      root.classList.remove('v72ParentReturnFreeze');
      root.style.removeProperty('--v72-parent-return-transform');
    };

    const freezeParentReturn = (root: HTMLElement) => {
      const scene = root.querySelector<HTMLElement>('.scene');
      if (!scene) return;

      const transform = window.getComputedStyle(scene).transform;
      root.style.setProperty(
        '--v72-parent-return-transform',
        transform && transform !== 'none' ? transform : 'translate3d(0px,0px,0px) scale(1)',
      );
      root.classList.add('v72ParentReturnFreeze');

      if (parentReturnTimer !== null) window.clearTimeout(parentReturnTimer);
      parentReturnTimer = window.setTimeout(() => {
        parentReturnTimer = null;
        root.classList.remove('v72ParentReturnFreeze');
        root.style.removeProperty('--v72-parent-return-transform');
      }, PARENT_RETURN_FALLBACK_MS);
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
      if (!target || !root || !root.classList.contains('v72ParentReturnFreeze')) return;
      if (!target.classList.contains('stage')) return;

      // V50 restores the saved parent camera with a synthetic stage drag. Keep
      // the old transform frozen through that final pointer event, then release
      // on the next task so React can commit the camera before it becomes visible.
      window.setTimeout(() => releaseParentReturn(root), 0);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root) return;

      const button = target.closest<HTMLButtonElement>('button');
      if (button?.closest('.navActions') && button.textContent?.includes('Inviter')) {
        // V37 first resets the parent to zoom 1 / camera 0, then V50 restores the
        // saved parent view a few frames later. Freeze the currently painted
        // transform across those intermediate states so users see one transition
        // to the final restored parent view instead of a visible two-step jump.
        freezeParentReturn(root);
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
          root.classList.remove('v72ParentReturnFreeze');
          root.style.removeProperty('--v72-parent-return-transform');
          root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
            node.classList.remove('canarySelectedNode');
          });
        });
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.v72ParentReturnFreeze .scene{
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
