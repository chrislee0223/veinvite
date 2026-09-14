'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV57 } from './AppNetworkCanaryV57';

const MEMBER_SETTLE_MIN_MS = 700;
const MEMBER_MOVE_INTERVAL_MS = 90;
const MEMBER_SETTLE_BUFFER_MS = 260;
const MEMBER_SETTLE_MAX_MS = 5000;
const MEMBER_ADDED_FEEDBACK_MS = 900;
const GROUP_REVEAL_MS = 300;

type FinishIntent = 'create' | 'cancel' | null;
type EdgeInlineState = {
  opacity: string;
  opacityPriority: string;
  visibility: string;
  visibilityPriority: string;
};

function buttonText(button: HTMLButtonElement | null) {
  return button?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function settleDuration(memberCount: number) {
  return Math.min(
    MEMBER_SETTLE_MAX_MS,
    Math.max(MEMBER_SETTLE_MIN_MS, MEMBER_SETTLE_BUFFER_MS + memberCount * MEMBER_MOVE_INTERVAL_MS),
  );
}

function PendingGroupCreationUx() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let mounted = true;
    let frame = 0;
    let feedbackUntil = 0;
    let settleUntil = 0;
    let groupRevealUntil = 0;
    let feedbackTimer: number | null = null;
    let settleTimer: number | null = null;
    let finishIntent: FinishIntent = null;
    let previousCreateOpen = false;
    let lastPendingIds = new Set<string>();
    let settlingIds = new Set<string>();
    let createBaselineGroupIds = new Set<string>();
    let pendingRevealGroupId: string | null = null;

    const hubTimers = new Set<number>();
    const hiddenEdges = new Map<SVGPathElement, EdgeInlineState>();

    const createPanel = () => {
      const panel = root.querySelector<HTMLElement>('.v42GroupPanel');
      const input = panel?.querySelector<HTMLInputElement>('input');
      const heading = panel?.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
      return panel && input && heading.startsWith('Create group') ? panel : null;
    };

    const currentGroupIds = () => {
      const ids = new Set<string>();
      root.querySelectorAll<HTMLElement>('.v42GroupHub[data-group-id]').forEach((hub) => {
        const id = hub.dataset.groupId;
        if (id) ids.add(id);
      });
      return ids;
    };

    const createdGroupId = () => {
      const current = currentGroupIds();
      for (const id of current) {
        if (!createBaselineGroupIds.has(id)) return id;
      }
      return null;
    };

    const pendingIdsFromDom = () => {
      const ids = new Set<string>();
      root.querySelectorAll<HTMLElement>(
        '.personNode.v42SelectedMember[data-node-id],.personNode.v44PendingNewGroupMember[data-node-id]',
      ).forEach((node) => {
        const id = node.dataset.nodeId;
        if (id) ids.add(id);
      });
      return ids;
    };

    const restoreEdge = (path: SVGPathElement) => {
      const previous = hiddenEdges.get(path);
      if (!previous) return;
      if (previous.opacity) path.style.setProperty('opacity', previous.opacity, previous.opacityPriority);
      else path.style.removeProperty('opacity');
      if (previous.visibility) path.style.setProperty('visibility', previous.visibility, previous.visibilityPriority);
      else path.style.removeProperty('visibility');
      hiddenEdges.delete(path);
    };

    const edgeMatchesPending = (path: SVGPathElement, pending: Set<string>) => {
      const key = path.dataset.edgeKey ?? '';
      if (key.startsWith('person:')) return pending.has(key.slice('person:'.length));
      const memberMarker = ':member:';
      const markerIndex = key.indexOf(memberMarker);
      return markerIndex >= 0 && pending.has(key.slice(markerIndex + memberMarker.length));
    };

    const syncPendingEdges = (pending: Set<string>) => {
      Array.from(hiddenEdges.keys()).forEach((path) => {
        if (!path.isConnected || !edgeMatchesPending(path, pending)) restoreEdge(path);
      });

      if (!pending.size) return;

      root.querySelectorAll<SVGPathElement>('.v57Edge[data-edge-key]').forEach((path) => {
        if (!edgeMatchesPending(path, pending)) return;
        if (!hiddenEdges.has(path)) {
          hiddenEdges.set(path, {
            opacity: path.style.getPropertyValue('opacity'),
            opacityPriority: path.style.getPropertyPriority('opacity'),
            visibility: path.style.getPropertyValue('visibility'),
            visibilityPriority: path.style.getPropertyPriority('visibility'),
          });
        }
        path.style.setProperty('opacity', '0', 'important');
        path.style.setProperty('visibility', 'hidden', 'important');
      });
    };

    const flashMemberAdded = () => {
      feedbackUntil = performance.now() + MEMBER_ADDED_FEEDBACK_MS;
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        feedbackTimer = null;
        schedule();
      }, MEMBER_ADDED_FEEDBACK_MS + 20);
    };

    const markNewGroupHub = (hub: HTMLElement) => {
      hub.classList.add('v58GroupJustCreated');
      const timer = window.setTimeout(() => {
        hubTimers.delete(timer);
        hub.classList.remove('v58GroupJustCreated');
      }, GROUP_REVEAL_MS + 40);
      hubTimers.add(timer);
    };

    const sync = () => {
      frame = 0;
      if (!mounted || !root.isConnected) return;

      const now = performance.now();
      const panel = createPanel();
      const createOpen = Boolean(panel);
      const activePending = createOpen ? pendingIdsFromDom() : new Set<string>();

      if (!previousCreateOpen && createOpen) {
        createBaselineGroupIds = currentGroupIds();
        lastPendingIds = new Set(activePending);
        settlingIds.clear();
        settleUntil = 0;
      } else if (previousCreateOpen && createOpen) {
        const added = Array.from(activePending).some((id) => !lastPendingIds.has(id));
        if (added) flashMemberAdded();
        lastPendingIds = new Set(activePending);
      }

      if (previousCreateOpen && !createOpen) {
        const closingPending = new Set(lastPendingIds);
        const committedGroupId = finishIntent === 'create' ? createdGroupId() : null;

        if (committedGroupId) {
          settlingIds = closingPending;
          const duration = settleDuration(settlingIds.size);
          settleUntil = now + duration;
          groupRevealUntil = now + duration + 420;
          pendingRevealGroupId = committedGroupId;
          if (settleTimer !== null) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => {
            settleTimer = null;
            schedule();
          }, duration + 20);
        } else {
          settlingIds.clear();
          settleUntil = 0;
          pendingRevealGroupId = null;
          groupRevealUntil = 0;
          if (settleTimer !== null) {
            window.clearTimeout(settleTimer);
            settleTimer = null;
          }
        }

        finishIntent = null;
        createBaselineGroupIds.clear();
        lastPendingIds.clear();
      }

      const visualPending = new Set(activePending);
      if (!createOpen && settlingIds.size) {
        const remaining = new Set<string>();
        settlingIds.forEach((id) => {
          const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`);
          if (!node) return;

          // V42 owns the final hidden state for a newly-created collapsed group.
          // Keep V58 hiding only until that authoritative state has taken over.
          if (node.classList.contains('v42CollapsedMember')) return;

          if (now < settleUntil) {
            remaining.add(id);
            visualPending.add(id);
          }
        });
        settlingIds = remaining;

        if (!settlingIds.size && settleTimer !== null) {
          window.clearTimeout(settleTimer);
          settleTimer = null;
        }
      }

      if (!createOpen && now >= settleUntil && settlingIds.size) {
        settlingIds.clear();
      }

      root.querySelectorAll<HTMLElement>('.personNode.v58PendingGroupMember[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id || !visualPending.has(id)) node.classList.remove('v58PendingGroupMember');
      });
      visualPending.forEach((id) => {
        const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`);
        if (node && !node.classList.contains('v58PendingGroupMember')) node.classList.add('v58PendingGroupMember');
      });

      syncPendingEdges(visualPending);

      const dropTarget = root.querySelector<HTMLElement>('.v44CreateDropMore');
      if (dropTarget) dropTarget.classList.toggle('v58MemberAdded', now < feedbackUntil);

      if (pendingRevealGroupId) {
        if (now >= groupRevealUntil) {
          pendingRevealGroupId = null;
        } else {
          const hub = root.querySelector<HTMLElement>(
            `.v42GroupHub[data-group-id="${CSS.escape(pendingRevealGroupId)}"]`,
          );
          if (hub) {
            markNewGroupHub(hub);
            pendingRevealGroupId = null;
          }
        }
      }

      previousCreateOpen = createOpen;
    };

    const schedule = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(sync);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const panel = createPanel();
      const button = target.closest<HTMLButtonElement>('button');
      if (!panel || !button || !panel.contains(button)) return;
      const text = buttonText(button);
      if (text === 'Create') finishIntent = 'create';
      else if (text === 'Cancel' || text === '×') finishIntent = 'cancel';
    };

    const childListIsRelevant = (mutation: MutationRecord) => {
      const target = mutation.target instanceof Element ? mutation.target : null;
      if (target?.matches('.v57AuthoritativeEdges,.v42GroupLayer,.v42GroupPanel') ||
          target?.closest('.v42GroupPanel')) return true;

      const selector = '.v42GroupPanel,.v44CreateDropMore,.v42GroupHub,.personNode,.v57Edge';
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches(selector) || Boolean(node.querySelector(selector));
      });
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') return childListIsRelevant(mutation);
        const target = mutation.target instanceof Element ? mutation.target : null;
        if (!target) return false;
        return target.matches('.personNode,.v42GroupPanel,.v44CreateDropMore,.v42GroupHub') ||
          Boolean(target.closest('.v42GroupPanel,.v42GroupHub'));
      });
      if (relevant) schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    root.addEventListener('click', onClickCapture, true);
    schedule();

    return () => {
      mounted = false;
      observer.disconnect();
      root.removeEventListener('click', onClickCapture, true);
      if (frame) window.cancelAnimationFrame(frame);
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      hubTimers.forEach((timer) => window.clearTimeout(timer));
      root.querySelectorAll('.personNode.v58PendingGroupMember').forEach((node) => node.classList.remove('v58PendingGroupMember'));
      root.querySelectorAll('.v44CreateDropMore.v58MemberAdded').forEach((node) => node.classList.remove('v58MemberAdded'));
      root.querySelectorAll('.v42GroupHub.v58GroupJustCreated').forEach((node) => node.classList.remove('v58GroupJustCreated'));
      Array.from(hiddenEdges.keys()).forEach(restoreEdge);
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV58({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV57 locale={locale} />
      <PendingGroupCreationUx />
      <style jsx global>{`
        /* Pending group members stay in the DOM at their exact coordinates so
           cancel/remove can restore them without re-layout. Only presentation is
           folded away while the create draft owns them. */
        .productionNetworkCanaryV45 .personNode.v58PendingGroupMember {
          opacity: 0 !important;
          pointer-events: none !important;
          scale: .82 !important;
          transition: opacity 180ms ease, scale 180ms cubic-bezier(.2,.75,.25,1) !important;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore {
          position: relative;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore.dropTarget {
          transform: scale(1.018) !important;
          border-color: rgba(255,207,71,1) !important;
          box-shadow: 0 0 0 5px rgba(244,183,40,.13), 0 0 34px rgba(244,183,40,.2) !important;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore.v58MemberAdded {
          border-color: rgba(255,207,71,.86) !important;
          background: rgba(42,33,10,.82) !important;
          box-shadow: 0 0 0 3px rgba(244,183,40,.1), 0 0 24px rgba(244,183,40,.12) !important;
        }

        .productionNetworkCanaryV45 .v44CreateDropMore.v58MemberAdded::after {
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
          animation: v58MemberAddedIn 180ms ease-out both;
        }

        .productionNetworkCanaryV45 .v42GroupHub.v58GroupJustCreated {
          animation: v58GroupHubIn ${GROUP_REVEAL_MS}ms cubic-bezier(.2,.8,.25,1) both;
        }

        @keyframes v58MemberAddedIn {
          from { opacity: 0; translate: 0 -3px; }
          to { opacity: 1; translate: 0 0; }
        }

        @keyframes v58GroupHubIn {
          from { opacity: .28; scale: .9; }
          to { opacity: 1; scale: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .personNode.v58PendingGroupMember {
            transition: none !important;
            scale: 1 !important;
          }
          .productionNetworkCanaryV45 .v44CreateDropMore.v58MemberAdded::after,
          .productionNetworkCanaryV45 .v42GroupHub.v58GroupJustCreated {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
