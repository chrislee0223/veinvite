'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV58 } from './AppNetworkCanaryV58';

const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';
const STORAGE_TEST_KEY = 'veinvite:qa:network-v59-storage-test';
const ATOMIC_VERIFY_TIMEOUT_MS = 2600;
const SUCCESS_HOLD_MS = 240;

type AtomicTransfer = {
  ids: string[];
  beforeGroupIds: Set<string>;
  scope: string;
  groupId: string | null;
  phase: 'wait-group' | 'wait-editor' | 'wait-save' | 'verify';
  startedAt: number;
};

type HiddenA11yState = {
  tabIndex: string | null;
  ariaHidden: string | null;
};

function buttonText(button: HTMLButtonElement | null) {
  return button?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function scenarioId(root: HTMLElement) {
  const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
  const map: Record<string, string> = {
    '0명': 'zero', '1명': 'one', '5명': 'five', '30명': 'balanced30',
    '직접 50': 'direct50', '100명': 'hundred', '500명': 'fiveHundred',
  };
  return map[label] ?? (label || 'unknown');
}

function currentScope(root: HTMLElement) {
  const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean);
  return `${scenarioId(root)}|${crumbs.join('>') || 'YOU'}`;
}

function storageAvailable() {
  try {
    window.localStorage.setItem(STORAGE_TEST_KEY, '1');
    window.localStorage.removeItem(STORAGE_TEST_KEY);
    return true;
  } catch {
    return false;
  }
}

function readStoredGroups() {
  try {
    const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return [] as Array<{ id?: string; scope?: string; members?: string[] }>;
    const parsed = JSON.parse(raw) as Array<{ id?: string; scope?: string; members?: string[] }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Array<{ id?: string; scope?: string; members?: string[] }>;
  }
}

function NetworkGroupLifecycleStability() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let mounted = true;
    let frame = 0;
    let atomic: AtomicTransfer | null = null;
    let presentationIds = new Set<string>();
    let atomicTimer: number | null = null;
    let toastTimer: number | null = null;
    let panelNoticeTimer: number | null = null;
    let syntheticPointerId = 259000;

    const a11yStates = new Map<HTMLElement, HiddenA11yState>();

    const panel = () => root.querySelector<HTMLElement>('.v42GroupPanel');
    const editorInput = () => panel()?.querySelector<HTMLInputElement>('input') ?? null;
    const isCreateEditor = () => {
      const currentPanel = panel();
      if (!currentPanel?.querySelector('input')) return false;
      return (currentPanel.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '')
        .startsWith('Create group');
    };

    const showPanelNotice = (message: string, persistent = false) => {
      const currentPanel = panel();
      if (!currentPanel) return;
      let notice = currentPanel.querySelector<HTMLElement>('.v59PanelNotice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'v59PanelNotice';
        const head = currentPanel.querySelector('.v42PanelHead');
        if (head?.nextSibling) currentPanel.insertBefore(notice, head.nextSibling);
        else currentPanel.appendChild(notice);
      }
      notice.textContent = message;
      if (panelNoticeTimer !== null) window.clearTimeout(panelNoticeTimer);
      if (!persistent) {
        panelNoticeTimer = window.setTimeout(() => {
          panelNoticeTimer = null;
          notice?.remove();
        }, 1400);
      }
    };

    const showToast = (message: string, error = false) => {
      root.querySelector('.v59LifecycleToast')?.remove();
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage) return;
      const toast = document.createElement('div');
      toast.className = `v59LifecycleToast${error ? ' error' : ''}`;
      toast.textContent = message;
      stage.appendChild(toast);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastTimer = null;
        toast.remove();
      }, error ? 2600 : 1300);
    };

    const syncAtomicEdges = () => {
      root.querySelectorAll<SVGPathElement>('.v57Edge[data-edge-key]').forEach((path) => {
        const key = path.dataset.edgeKey ?? '';
        let hidden = false;
        if (key.startsWith('person:')) hidden = presentationIds.has(key.slice('person:'.length));
        const marker = ':member:';
        const index = key.indexOf(marker);
        if (!hidden && index >= 0) hidden = presentationIds.has(key.slice(index + marker.length));
        path.classList.toggle('v59AtomicHiddenEdge', hidden);
      });
    };

    const restoreA11y = (node: HTMLElement, previous: HiddenA11yState) => {
      if (previous.tabIndex === null) {
        if (node.hasAttribute('tabindex')) node.removeAttribute('tabindex');
      } else if (node.getAttribute('tabindex') !== previous.tabIndex) {
        node.setAttribute('tabindex', previous.tabIndex);
      }
      if (previous.ariaHidden === null) {
        if (node.hasAttribute('aria-hidden')) node.removeAttribute('aria-hidden');
      } else if (node.getAttribute('aria-hidden') !== previous.ariaHidden) {
        node.setAttribute('aria-hidden', previous.ariaHidden);
      }
    };

    const syncA11y = () => {
      Array.from(a11yStates.keys()).forEach((node) => {
        if (!node.isConnected) a11yStates.delete(node);
      });

      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        const hidden = node.classList.contains('v58PendingGroupMember') ||
          node.classList.contains('v59AtomicPending') ||
          node.classList.contains('v42CollapsedMember');
        if (hidden) {
          if (!a11yStates.has(node)) {
            a11yStates.set(node, {
              tabIndex: node.getAttribute('tabindex'),
              ariaHidden: node.getAttribute('aria-hidden'),
            });
          }
          if (node.getAttribute('tabindex') !== '-1') node.setAttribute('tabindex', '-1');
          if (node.getAttribute('aria-hidden') !== 'true') node.setAttribute('aria-hidden', 'true');
          if (document.activeElement === node) {
            const input = editorInput();
            if (input) {
              try { input.focus({ preventScroll: true }); } catch { input.focus(); }
            }
          }
          return;
        }
        const previous = a11yStates.get(node);
        if (!previous) return;
        restoreA11y(node, previous);
        a11yStates.delete(node);
      });
    };

    const markAtomicNodes = (ids: string[]) => {
      presentationIds = new Set(ids);
      ids.forEach((id) => {
        root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`)
          ?.classList.add('v59AtomicPending');
      });
      root.classList.add('v59AtomicTransfer');
      syncAtomicEdges();
      syncA11y();
    };

    const clearAtomicPresentation = () => {
      presentationIds.clear();
      root.classList.remove('v59AtomicTransfer');
      root.querySelectorAll('.personNode.v59AtomicPending').forEach((node) => node.classList.remove('v59AtomicPending'));
      root.querySelectorAll('.v57Edge.v59AtomicHiddenEdge').forEach((edge) => edge.classList.remove('v59AtomicHiddenEdge'));
      syncA11y();
    };

    const finishAtomic = (success: boolean, message?: string) => {
      if (atomicTimer !== null) {
        window.clearTimeout(atomicTimer);
        atomicTimer = null;
      }
      atomic = null;
      schedule();
      window.setTimeout(() => {
        if (!mounted) return;
        clearAtomicPresentation();
      }, success ? SUCCESS_HOLD_MS : 0);
      if (message) showToast(message, !success);
    };

    const removeFromV44Pending = (ids: string[]) => {
      ids.forEach((id) => {
        const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`);
        if (!node) return;
        const rect = node.getBoundingClientRect();
        syntheticPointerId += 1;
        const pointerId = syntheticPointerId;
        const common = {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'mouse',
          button: 0,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        } as const;
        node.dispatchEvent(new PointerEvent('pointerdown', common));
        node.dispatchEvent(new PointerEvent('pointerup', common));
      });
    };

    const newGroupId = (before: Set<string>) => {
      for (const row of Array.from(root.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]'))) {
        const id = row.dataset.groupId;
        if (id && !before.has(id)) return id;
      }
      return null;
    };

    const selectPendingMembersForEdit = (ids: string[]) => {
      for (const id of ids) {
        const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`);
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        syntheticPointerId += 1;
        node.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: syntheticPointerId,
          pointerType: 'mouse',
          button: 0,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      }
      return true;
    };

    const storedTransferComplete = (transfer: AtomicTransfer) => {
      if (!transfer.groupId) return false;
      const groups = readStoredGroups();
      const target = groups.find((group) => group.id === transfer.groupId && group.scope === transfer.scope);
      if (!target || !Array.isArray(target.members)) return false;
      if (!transfer.ids.every((id) => target.members!.includes(id))) return false;
      return transfer.ids.every((id) =>
        groups.filter((group) => group.scope === transfer.scope && group.id !== transfer.groupId)
          .every((group) => !Array.isArray(group.members) || !group.members.includes(id)),
      );
    };

    const scheduleAtomicCheck = (delay = 0) => {
      if (atomicTimer !== null) window.clearTimeout(atomicTimer);
      atomicTimer = window.setTimeout(() => {
        atomicTimer = null;
        schedule();
      }, delay);
    };

    const progressAtomic = () => {
      const transfer = atomic;
      if (!transfer) return;
      if (currentScope(root) !== transfer.scope) {
        finishAtomic(false, 'Group move stopped because the network changed.');
        return;
      }
      if (performance.now() - transfer.startedAt > ATOMIC_VERIFY_TIMEOUT_MS) {
        finishAtomic(false, 'Couldn’t finish moving everyone. The group was kept — edit it to retry.');
        return;
      }

      if (transfer.phase === 'wait-group') {
        const id = newGroupId(transfer.beforeGroupIds);
        if (!id) {
          scheduleAtomicCheck(32);
          return;
        }
        transfer.groupId = id;
        const row = root.querySelector<HTMLElement>(`.v42GroupRow[data-group-id="${CSS.escape(id)}"]`);
        const edit = row?.querySelector<HTMLButtonElement>('.v42ManageGroup');
        if (!edit) {
          scheduleAtomicCheck(32);
          return;
        }
        transfer.phase = 'wait-editor';
        edit.click();
        scheduleAtomicCheck(24);
        return;
      }

      if (transfer.phase === 'wait-editor') {
        const currentPanel = panel();
        const input = currentPanel?.querySelector<HTMLInputElement>('input');
        const heading = currentPanel?.querySelector<HTMLElement>('.v42PanelHead b')?.textContent?.trim() ?? '';
        if (!input || !heading.startsWith('Edit ')) {
          scheduleAtomicCheck(24);
          return;
        }
        if (!selectPendingMembersForEdit(transfer.ids)) {
          finishAtomic(false, 'Couldn’t find every selected person. The group was kept.');
          return;
        }
        transfer.phase = 'wait-save';
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (!mounted || !atomic || atomic !== transfer) return;
            const save = panel()?.querySelector<HTMLButtonElement>('.v42CreateActions button.primary');
            if (!save || buttonText(save) !== 'Save changes') {
              scheduleAtomicCheck(24);
              return;
            }
            save.click();
            transfer.phase = 'verify';
            scheduleAtomicCheck(40);
          });
        });
        return;
      }

      if (transfer.phase === 'wait-save') return;

      if (storedTransferComplete(transfer)) {
        const finalHidden = transfer.ids.every((id) =>
          root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(id)}"]`)
            ?.classList.contains('v42CollapsedMember'),
        );
        if (!finalHidden) {
          scheduleAtomicCheck(24);
          return;
        }
        finishAtomic(true, '✓ Group created');
        return;
      }

      scheduleAtomicCheck(40);
    };

    const beginAtomicFromCreate = () => {
      if (atomic || !isCreateEditor()) return;
      const ids = Array.from(root.querySelectorAll<HTMLElement>('.personNode.v44PendingNewGroupMember[data-node-id]'))
        .map((node) => node.dataset.nodeId)
        .filter((id): id is string => Boolean(id));
      if (!ids.length) return;

      atomic = {
        ids: [...new Set(ids)],
        beforeGroupIds: new Set(Array.from(root.querySelectorAll<HTMLElement>('.v42GroupRow[data-group-id]'))
          .map((row) => row.dataset.groupId)
          .filter((id): id is string => Boolean(id))),
        scope: currentScope(root),
        groupId: null,
        phase: 'wait-group',
        startedAt: performance.now(),
      };
      markAtomicNodes(atomic.ids);

      // V44 used to move grouped members one-by-one after Create. Remove them
      // from that pending list just before submit, then reuse V42's Edit/Save
      // path so all ownership changes land in a single React state update.
      removeFromV44Pending(atomic.ids);
      scheduleAtomicCheck(24);
    };

    const blockUnsafeEditorExit = (event: Event, target: Element | null) => {
      const currentPanel = panel();
      if (!currentPanel?.querySelector('input')) return false;
      if (target && currentPanel.contains(target)) return false;
      if (target?.closest('.personNode')) return false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showPanelNotice('Finish or Cancel this group first.');
      return true;
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button') ?? null;

      if (atomic && event.isTrusted) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const currentPanel = panel();
      if (currentPanel?.querySelector('input') && target && !currentPanel.contains(target)) {
        if (blockUnsafeEditorExit(event, target)) return;
      }

      if (!button || !currentPanel || !currentPanel.contains(button)) return;
      const text = buttonText(button);
      if (text !== 'Create' && text !== 'Save changes') return;

      if (!storageAvailable()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showPanelNotice('Couldn’t save groups in this browser. Free storage or retry.', true);
        return;
      }

      if (text === 'Create') beginAtomicFromCreate();
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (!atomic || !event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (atomic) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (!editorInput()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showPanelNotice('Finish or Cancel this group first.');
    };

    const sync = () => {
      frame = 0;
      if (!mounted || !root.isConnected) return;
      syncAtomicEdges();
      syncA11y();
      progressAtomic();
      if (atomic) {
        root.querySelectorAll<HTMLElement>('.v42Notice').forEach((notice) => {
          notice.style.visibility = 'hidden';
        });
      } else {
        root.querySelectorAll<HTMLElement>('.v42Notice').forEach((notice) => {
          notice.style.removeProperty('visibility');
        });
      }
    };

    const schedule = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target instanceof Element ? mutation.target : null;
          return Boolean(target && (
            target.matches('.personNode,.v42GroupPanel,.v42GroupHub,.v42GroupRow,.v57Edge') ||
            target.closest('.v42GroupPanel,.v42GroupRow')
          ));
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
          if (!(node instanceof Element)) return false;
          return node.matches('.personNode,.v42GroupPanel,.v42GroupHub,.v42GroupRow,.v57Edge,.v42Notice') ||
            Boolean(node.querySelector('.personNode,.v42GroupPanel,.v42GroupHub,.v42GroupRow,.v57Edge,.v42Notice'));
        });
      });
      if (relevant) schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'tabindex', 'aria-hidden'],
    });
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('keydown', onKeyDownCapture, true);
    schedule();

    return () => {
      mounted = false;
      observer.disconnect();
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('keydown', onKeyDownCapture, true);
      if (frame) window.cancelAnimationFrame(frame);
      if (atomicTimer !== null) window.clearTimeout(atomicTimer);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      if (panelNoticeTimer !== null) window.clearTimeout(panelNoticeTimer);
      clearAtomicPresentation();
      a11yStates.forEach((previous, node) => restoreA11y(node, previous));
      a11yStates.clear();
      root.querySelectorAll<HTMLElement>('.v42Notice').forEach((notice) => notice.style.removeProperty('visibility'));
      root.querySelector('.v59LifecycleToast')?.remove();
      root.querySelector('.v59PanelNotice')?.remove();
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV59({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV58 locale={locale} />
      <NetworkGroupLifecycleStability />
      <style jsx global>{`
        .productionNetworkCanaryV45 .personNode.v59AtomicPending {
          opacity: 0 !important;
          pointer-events: none !important;
          scale: .82 !important;
          transition: opacity 180ms ease, scale 180ms cubic-bezier(.2,.75,.25,1) !important;
        }

        .productionNetworkCanaryV45 .v57Edge.v59AtomicHiddenEdge {
          opacity: 0 !important;
          visibility: hidden !important;
        }

        .productionNetworkCanaryV45.v59AtomicTransfer .v42GroupToolbarButton,
        .productionNetworkCanaryV45.v59AtomicTransfer .navActions,
        .productionNetworkCanaryV45.v59AtomicTransfer .viewActions,
        .productionNetworkCanaryV45.v59AtomicTransfer .scenarioBar {
          pointer-events: none !important;
        }

        .productionNetworkCanaryV45 .v59PanelNotice {
          margin-top: 7px;
          padding: 6px 8px;
          border: 1px solid rgba(244,183,40,.22);
          border-radius: 8px;
          background: rgba(244,183,40,.07);
          color: #d8b65a;
          font-size: .36rem;
          line-height: 1.35;
        }

        .productionNetworkCanaryV45 .v59LifecycleToast {
          position: absolute;
          z-index: 86;
          left: 50%;
          top: 12px;
          transform: translateX(-50%);
          max-width: calc(100% - 24px);
          padding: 7px 11px;
          border: 1px solid rgba(244,183,40,.28);
          border-radius: 999px;
          background: rgba(18,16,9,.97);
          color: #ddb958;
          font-size: .42rem;
          line-height: 1.25;
          text-align: center;
          white-space: nowrap;
          box-shadow: 0 8px 24px rgba(0,0,0,.2);
          pointer-events: none;
        }

        .productionNetworkCanaryV45 .v59LifecycleToast.error {
          border-color: rgba(230,126,91,.38);
          background: rgba(31,17,13,.97);
          color: #df9a85;
          white-space: normal;
        }

        @media (prefers-reduced-motion: reduce) {
          .productionNetworkCanaryV45 .personNode.v59AtomicPending {
            transition: none !important;
            scale: 1 !important;
          }
        }
      `}</style>
    </>
  );
}
