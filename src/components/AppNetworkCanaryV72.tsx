'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV71 } from './AppNetworkCanaryV71';

const GROUP_COMMIT_TRANSITION_MS = 190;
const GROUP_COMMIT_CLEANUP_MS = 260;

function NetworkCanaryInteractionOwnershipV72() {
  useLayoutEffect(() => {
    let commitTimer: number | null = null;

    const canaryRootFor = (target: Element | null) =>
      target?.closest<HTMLElement>('.productionNetworkCanaryV45') ?? null;

    const groupRootFor = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.v42ManualGroupsRoot');

    const clearCanvasSelection = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
    };

    const clearCommitTransition = () => {
      if (commitTimer !== null) {
        window.clearTimeout(commitTimer);
        commitTimer = null;
      }
      document
        .querySelectorAll<HTMLElement>('.productionNetworkCanaryV45 .personNode.v72GroupCommitTransition')
        .forEach((node) => node.classList.remove('v72GroupCommitTransition'));
    };

    const armCommitTransition = (root: HTMLElement) => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) return;

      clearCommitTransition();
      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        node.classList.add('v72GroupCommitTransition');
      });
      commitTimer = window.setTimeout(clearCommitTransition, GROUP_COMMIT_CLEANUP_MS);
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
      if (node && (creating || managing)) {
        clearCanvasSelection(root);

        // V42 deliberately rejects people that already belong to a group while
        // the Create editor is open. Stop the pointer before V71's optimistic
        // mobile paint can momentarily mark that locked person as selected.
        if (
          creating &&
          (node.classList.contains('v42LockedMember') || node.classList.contains('v42GroupedMember'))
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        return;
      }

      const saveButton = target.closest<HTMLButtonElement>(
        '.v42GroupPanel .v42CreateActions button.primary',
      );
      if (!saveButton || !managing) return;

      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      if (event.pointerType !== 'touch' && !coarsePointer) return;

      // Save itself is a click action. Stop only this pointerdown from reaching
      // V71's legacy clone-freeze layer; do not preventDefault, so the normal
      // button click and V42 save handler still run. Animate the real nodes so
      // their geometry and the real referral edges stay in the same coordinate
      // system during the membership commit.
      event.stopPropagation();
      armCommitTransition(root);
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
      // synthetic click before V45 can paint profile-selection state over the
      // group editor's selected/deselected state.
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
      clearCommitTransition();
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
      <style jsx global>{`
        .productionNetworkCanaryV45 .personNode.v72GroupCommitTransition {
          transition:
            transform ${GROUP_COMMIT_TRANSITION_MS}ms cubic-bezier(.18,.82,.2,1),
            opacity ${GROUP_COMMIT_TRANSITION_MS}ms ease !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .personNode.v72GroupCommitTransition {
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
