'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

function NetworkCanaryInteractionOwnershipV72() {
  useLayoutEffect(() => {
    const canaryRootFor = (target: Element | null) =>
      target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;

    const groupRootFor = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.v42ManualGroupsRoot');

    const clearCanvasSelection = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
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

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const root = canaryRootFor(target);
      if (!target || !root) return;

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
    document.addEventListener('click', onClickCapture, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      document
        .querySelectorAll<HTMLElement>('.productionNetworkCanaryV45 .personNode.canarySelectedNode')
        .forEach((node) => node.classList.remove('canarySelectedNode'));
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV72({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV71 locale={locale} />
      <NetworkCanaryInteractionOwnershipV72 />
    </>
  );
}
