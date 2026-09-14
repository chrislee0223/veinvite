'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV59 } from './AppNetworkCanaryV59';

const DRAG_THRESHOLD_PX = 10;
const MEMBER_ADDED_MS = 900;

type PointerDrag = {
  pointerId: number;
  startX: number;
  startY: number;
};

type DropCandidate = {
  element: HTMLElement;
  kind: 'remove' | 'create' | 'new' | 'existing';
};

function NetworkGroupDropFeedback() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let mounted = true;
    let drag: PointerDrag | null = null;
    let preview: HTMLElement | null = null;
    let frame = 0;
    let createDrop: HTMLElement | null = null;
    let firstPendingShown = false;
    let memberTimer: number | null = null;

    const clearPreview = () => {
      preview?.classList.remove('v60DropPreview');
      preview = null;
    };

    const setPreview = (next: HTMLElement | null) => {
      if (preview === next) return;
      clearPreview();
      preview = next;
      preview?.classList.add('v60DropPreview');
    };

    const targetAt = (clientX: number, clientY: number): DropCandidate | null => {
      const candidates: Array<{ selector: string; kind: DropCandidate['kind']; pad: number }> = [
        { selector: '.v42RemoveZone', kind: 'remove', pad: 5 },
        { selector: '.v44CreateDropMore', kind: 'create', pad: 7 },
        { selector: '.v44NewGroupDrop', kind: 'new', pad: 7 },
        { selector: '.v42GroupRow[data-v42-group-drop]', kind: 'existing', pad: 6 },
        { selector: '.v42GroupHub[data-v42-group-drop]', kind: 'existing', pad: 10 },
      ];

      for (const candidate of candidates) {
        for (const element of Array.from(root.querySelectorAll<HTMLElement>(candidate.selector))) {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (
            clientX >= rect.left - candidate.pad &&
            clientX <= rect.right + candidate.pad &&
            clientY >= rect.top - candidate.pad &&
            clientY <= rect.bottom + candidate.pad
          ) {
            return { element, kind: candidate.kind };
          }
        }
      }
      return null;
    };

    const flashInitialMemberAdded = (drop: HTMLElement) => {
      drop.classList.add('v60InitialMemberAdded');
      if (memberTimer !== null) window.clearTimeout(memberTimer);
      memberTimer = window.setTimeout(() => {
        memberTimer = null;
        drop.classList.remove('v60InitialMemberAdded');
      }, MEMBER_ADDED_MS + 30);
    };

    const sync = () => {
      frame = 0;
      if (!mounted || !root.isConnected) return;

      const nextCreateDrop = root.querySelector<HTMLElement>('.v44CreateDropMore');
      if (nextCreateDrop !== createDrop) {
        createDrop?.classList.remove('v60InitialMemberAdded');
        createDrop = nextCreateDrop;
        firstPendingShown = false;
      }

      if (!createDrop) return;
      const pendingCount = root.querySelectorAll(
        '.personNode.v42SelectedMember[data-node-id],.personNode.v44PendingNewGroupMember[data-node-id]',
      ).length;
      if (pendingCount > 0 && !firstPendingShown) {
        firstPendingShown = true;
        flashInitialMemberAdded(createDrop);
      }
    };

    const schedule = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(sync);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest<HTMLButtonElement>('button.personNode[data-node-id]') ?? null;
      const groupPanel = root.querySelector<HTMLElement>('.v42GroupPanel');
      if (!node || !root.contains(node) || !groupPanel || groupPanel.querySelector('input')) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      clearPreview();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!event.isTrusted || !drag || drag.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < DRAG_THRESHOLD_PX) {
        clearPreview();
        return;
      }
      setPreview(targetAt(event.clientX, event.clientY)?.element ?? null);
    };

    const finishPointer = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      clearPreview();
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target instanceof Element ? mutation.target : null;
          return Boolean(target && target.matches(
            '.personNode,.v42GroupPanel,.v44CreateDropMore,.v44NewGroupDrop,.v42GroupRow,.v42GroupHub',
          ));
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
          if (!(node instanceof Element)) return false;
          const selector = '.personNode,.v42GroupPanel,.v44CreateDropMore,.v44NewGroupDrop,.v42GroupRow,.v42GroupHub';
          return node.matches(selector) || Boolean(node.querySelector(selector));
        });
      });
      if (relevant) schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finishPointer, true);
    window.addEventListener('pointercancel', finishPointer, true);
    schedule();

    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishPointer, true);
      window.removeEventListener('pointercancel', finishPointer, true);
      if (frame) window.cancelAnimationFrame(frame);
      if (memberTimer !== null) window.clearTimeout(memberTimer);
      clearPreview();
      createDrop?.classList.remove('v60InitialMemberAdded');
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV60({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV59 locale={locale} />
      <NetworkGroupDropFeedback />
      <style jsx global>{`
        .productionNetworkCanaryV45 .v44NewGroupDrop.v60DropPreview,
        .productionNetworkCanaryV45 .v44CreateDropMore.v60DropPreview {
          border-style: solid !important;
          border-color: rgba(255,207,71,1) !important;
          background: rgba(42,33,10,.98) !important;
          box-shadow: 0 0 0 5px rgba(244,183,40,.13), 0 0 34px rgba(244,183,40,.2) !important;
          transform: scale(1.018) !important;
        }

        .productionNetworkCanaryV45 .v42GroupRow.v60DropPreview,
        .productionNetworkCanaryV45 .v42GroupHub.v60DropPreview {
          border-color: rgba(255,207,71,1) !important;
          background: rgba(42,33,10,.98) !important;
          box-shadow: 0 0 0 4px rgba(244,183,40,.12), 0 0 32px rgba(244,183,40,.18) !important;
        }

        .productionNetworkCanaryV45 .v60DropPreview small {
          color: #e4bb50 !important;
        }

        .productionNetworkCanaryV45 .v42RemoveZone.v60DropPreview {
          border-style: solid !important;
          border-color: rgba(242,126,91,.95) !important;
          background: rgba(51,20,14,.97) !important;
          box-shadow: 0 0 0 5px rgba(242,126,91,.08), 0 0 30px rgba(242,126,91,.1) !important;
          color: #e69a84 !important;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore.v60InitialMemberAdded {
          position: relative;
          border-color: rgba(255,207,71,.9) !important;
          background: rgba(42,33,10,.84) !important;
          box-shadow: 0 0 0 3px rgba(244,183,40,.11), 0 0 26px rgba(244,183,40,.14) !important;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore.v60InitialMemberAdded::after {
          content: '✓ Member added';
          position: absolute;
          top: 6px;
          right: 7px;
          padding: 3px 6px;
          border: 1px solid rgba(244,183,40,.3);
          border-radius: 999px;
          background: rgba(18,16,9,.96);
          color: #e0ba55;
          font-size: .31rem;
          line-height: 1;
          pointer-events: none;
          animation: v60MemberAddedIn 180ms ease-out both;
        }

        @keyframes v60MemberAddedIn {
          from { opacity: 0; translate: 0 -3px; }
          to { opacity: 1; translate: 0 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .v44NewGroupDrop.v60DropPreview,
          .productionNetworkCanaryV45 .v44CreateDropMore.v60DropPreview {
            transform: none !important;
          }
          .productionNetworkCanaryV45 .v44CreateDropMore.v60InitialMemberAdded::after {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
