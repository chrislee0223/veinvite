'use client';

import { useLayoutEffect } from 'react';

import {
  isLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { AppNetworkCanaryV70 } from './AppNetworkCanaryV70';

const MOBILE_GROUP_COMMIT_FREEZE_FRAMES = 4;

type FrozenPerson = {
  person: HTMLElement;
  previousVisibility: string;
  previousVisibilityPriority: string;
  clone: HTMLElement;
};

function resolveLocale(locale: Locale): SupportedLocale {
  return isLocale(locale) ? locale : 'en';
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const parsed = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(parsed) ? Math.max(.01, parsed / 100) : 1;
}

function readCenterScale(root: HTMLElement) {
  const parsed = Number.parseFloat(root.style.getPropertyValue('--v46-center-scale'));
  return Number.isFinite(parsed) ? parsed : 1;
}

function NetworkGroupEditMobileStabilityV71() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let syncFrame = 0;
    let transientFrame = 0;
    let freezeFrame = 0;
    let transientOwned = false;
    let frozenPeople: FrozenPerson[] = [];
    let freezeLayer: HTMLElement | null = null;

    const manualRoot = () => root.querySelector<HTMLElement>('.v42ManualGroupsRoot');
    const managing = () => Boolean(manualRoot()?.classList.contains('v42Managing'));
    const editing = () => Boolean(
      manualRoot()?.classList.contains('v42Managing') ||
      manualRoot()?.classList.contains('v42Creating'),
    );

    const clearCanvasSelection = () => {
      root.querySelectorAll<HTMLElement>('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
    };

    const syncEditorVisuals = () => {
      syncFrame = 0;
      const groupRoot = manualRoot();
      if (!groupRoot || !editing()) return;

      clearCanvasSelection();
      if (!groupRoot.classList.contains('v42Managing')) return;

      // During Edit, group membership is the only visual selection authority.
      // Every person not present in selectedIds must look deselected immediately,
      // including somebody who already belonged to the group before Edit opened.
      groupRoot.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        node.classList.toggle('v71GroupEditDeselected', !node.classList.contains('v42SelectedMember'));
      });
    };

    const scheduleSync = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(syncEditorVisuals);
    };

    const clearTransientSuppression = () => {
      transientFrame = 0;
      const groupRoot = manualRoot();
      if (transientOwned && groupRoot?.dataset.v42TransientDrag === '1') {
        delete groupRoot.dataset.v42TransientDrag;
      }
      transientOwned = false;
    };

    const suppressLegacyObserverBriefly = () => {
      const groupRoot = manualRoot();
      if (!groupRoot) return;
      groupRoot.dataset.v42TransientDrag = '1';
      transientOwned = true;
      if (transientFrame) window.cancelAnimationFrame(transientFrame);
      transientFrame = window.requestAnimationFrame(() => {
        transientFrame = window.requestAnimationFrame(clearTransientSuppression);
      });
    };

    const clearCommitFreeze = () => {
      if (freezeFrame) {
        window.cancelAnimationFrame(freezeFrame);
        freezeFrame = 0;
      }
      frozenPeople.forEach(({ person, previousVisibility, previousVisibilityPriority, clone }) => {
        if (person.isConnected) {
          if (previousVisibility) {
            person.style.setProperty('visibility', previousVisibility, previousVisibilityPriority);
          } else {
            person.style.removeProperty('visibility');
          }
        }
        clone.remove();
      });
      frozenPeople = [];
      freezeLayer?.remove();
      freezeLayer = null;
    };

    const releaseCommitFreezeAfterFrames = (remaining: number) => {
      if (remaining <= 0) {
        clearCommitFreeze();
        return;
      }
      freezeFrame = window.requestAnimationFrame(() => {
        freezeFrame = 0;
        releaseCommitFreezeAfterFrames(remaining - 1);
      });
    };

    const freezeMobileCommit = (pointerType: string) => {
      const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      if (pointerType !== 'touch' && !coarsePointer) return;
      const groupRoot = manualRoot();
      if (!groupRoot || !managing()) return;

      clearCommitFreeze();

      freezeLayer = document.createElement('div');
      freezeLayer.className = 'v42ManualGroupsRoot v71MobileCommitFreezeLayer';
      freezeLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(freezeLayer);

      groupRoot.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((person) => {
        const computed = window.getComputedStyle(person);
        if (
          computed.display === 'none' ||
          computed.visibility === 'hidden' ||
          Number.parseFloat(computed.opacity || '1') <= 0.01
        ) return;

        const rect = person.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const clone = person.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.setAttribute('aria-hidden', 'true');
        clone.style.setProperty('position', 'fixed', 'important');
        clone.style.setProperty('left', `${rect.left}px`, 'important');
        clone.style.setProperty('top', `${rect.top}px`, 'important');
        clone.style.setProperty('width', `${rect.width}px`, 'important');
        clone.style.setProperty('height', `${rect.height}px`, 'important');
        clone.style.setProperty('margin', '0', 'important');
        clone.style.setProperty('transform', 'none', 'important');
        clone.style.setProperty('transition', 'none', 'important');
        clone.style.setProperty('animation', 'none', 'important');
        clone.style.setProperty('pointer-events', 'none', 'important');
        clone.style.setProperty('visibility', 'visible', 'important');
        clone.style.setProperty('opacity', computed.opacity, 'important');
        clone.style.setProperty('filter', computed.filter, 'important');
        clone.style.setProperty('z-index', '2147483000', 'important');
        freezeLayer?.appendChild(clone);

        const previousVisibility = person.style.getPropertyValue('visibility');
        const previousVisibilityPriority = person.style.getPropertyPriority('visibility');
        person.style.setProperty('visibility', 'hidden', 'important');
        frozenPeople.push({ person, previousVisibility, previousVisibilityPriority, clone });
      });

      if (frozenPeople.length) {
        releaseCommitFreezeAfterFrames(MOBILE_GROUP_COMMIT_FREEZE_FRAMES);
      } else {
        clearCommitFreeze();
      }
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const node = target.closest<HTMLElement>('.personNode[data-node-id]');
      if (node && root.contains(node) && editing()) {
        clearCanvasSelection();
        suppressLegacyObserverBriefly();

        // V42 updates selectedIds correctly on both desktop and mobile. Mirror
        // that next value into the DOM before the synthetic click/effect phase so
        // iOS/WKWebView cannot show the stale bright state for another frame.
        const nextSelected = !node.classList.contains('v42SelectedMember');
        node.classList.toggle('v42SelectedMember', nextSelected);
        node.classList.toggle('v71GroupEditDeselected', managing() && !nextSelected);
        scheduleSync();
        return;
      }

      const saveButton = target.closest<HTMLButtonElement>('.v42GroupPanel .v42CreateActions button.primary');
      if (saveButton && root.contains(saveButton) && managing()) {
        freezeMobileCommit(event.pointerType || '');
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!editing()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      // V45 normally paints canarySelectedNode for profile selection before the
      // inner V42 click-swallow runs. Group Edit owns node selection instead.
      if (target.closest('.personNode[data-node-id]')) {
        clearCanvasSelection();
        scheduleSync();
      }
    };

    const observer = new MutationObserver((records) => {
      if (!editing()) {
        root.querySelectorAll<HTMLElement>('.personNode.v71GroupEditDeselected').forEach((node) => {
          node.classList.remove('v71GroupEditDeselected');
        });
        return;
      }
      if (records.some((record) => record.type === 'childList' || record.attributeName === 'class')) {
        scheduleSync();
      }
    });

    root.addEventListener('pointerdown', onPointerDownCapture, true);
    root.addEventListener('click', onClickCapture, true);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    syncEditorVisuals();

    return () => {
      root.removeEventListener('pointerdown', onPointerDownCapture, true);
      root.removeEventListener('click', onClickCapture, true);
      observer.disconnect();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (transientFrame) window.cancelAnimationFrame(transientFrame);
      clearTransientSuppression();
      clearCommitFreeze();
      root.querySelectorAll<HTMLElement>('.personNode.v71GroupEditDeselected').forEach((node) => {
        node.classList.remove('v71GroupEditDeselected');
      });
      clearCanvasSelection();
    };
  }, []);

  return null;
}

function NetworkRootIdentityPlacementV71({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const resolvedLocale = resolveLocale(locale);
    const rootCopy = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale].you;
    let frame = 0;

    const clearRootIdentity = (wrap: HTMLElement | null) => {
      if (!wrap) return;
      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');

      circle?.removeAttribute('data-v71-root-copy');
      circle?.removeAttribute('data-v71-root-length');
      source?.classList.remove('v71RootIdentitySource');
      wrap.classList.remove('v71RootIdentityWrap');
      wrap.style.removeProperty('--v71-root-summary-y');

      // Remove the previous V71 injected-label implementation if it exists in a
      // live session. The root identity now replaces the original center dot.
      circle?.querySelector<HTMLElement>(':scope > .v71CenterIdentityLabel')?.remove();
    };

    const apply = () => {
      const wrap = root.querySelector<HTMLElement>('.centerWrap');
      if (!wrap) return;

      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');
      if (!circle || !source) {
        clearRootIdentity(wrap);
        return;
      }

      // V70 marks only the actual root identity. Descendant networks keep the
      // mature center-dot behavior and their normal wallet label.
      if (source.dataset.v70RootLabel !== '1') {
        clearRootIdentity(wrap);
        return;
      }

      source.classList.add('v71RootIdentitySource');
      wrap.classList.add('v71RootIdentityWrap');
      circle.dataset.v71RootCopy = rootCopy;

      const visibleLength = Array.from(rootCopy).length;
      circle.dataset.v71RootLength = visibleLength > 6
        ? 'long'
        : visibleLength > 4
          ? 'compact'
          : 'normal';

      // V47 positions root metadata absolutely, while V46 scales the center
      // circle independently at high zoom. Keep the summary a constant ~7px
      // below the circle's *visible* edge rather than leaving it at a fixed 82px.
      const zoom = readZoom(root);
      const centerScale = readCenterScale(root);
      const circleCenterY = 37;
      const circleRadius = 37;
      const screenGapPx = 7;
      const summaryY = circleCenterY + circleRadius * centerScale + screenGapPx / zoom;
      wrap.style.setProperty('--v71-root-summary-y', `${summaryY.toFixed(2)}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();

    const observer = new MutationObserver(() => schedule());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-v70-root-label'],
    });

    window.addEventListener('resize', schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      clearRootIdentity(root.querySelector<HTMLElement>('.centerWrap'));
    };
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV71({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV70 locale={locale} />
      <NetworkGroupEditMobileStabilityV71 />
      <NetworkRootIdentityPlacementV71 locale={locale} />
      <style jsx global>{`
        /* Root identity: replace the existing V45 center dot itself. */
        .productionNetworkCanaryV45 .centerWrap > b.v71RootIdentitySource {
          display: none !important;
        }

        /* During group Edit, membership is the only visual selection state. */
        .productionNetworkCanaryV45 .v42ManualGroupsRoot.v42Managing .personNode:not(.v42SelectedMember),
        .productionNetworkCanaryV45 .v42ManualGroupsRoot.v42Managing .personNode.v71GroupEditDeselected {
          opacity: .48 !important;
        }

        .productionNetworkCanaryV45 .v42ManualGroupsRoot.v42Managing .personNode.v42SelectedMember {
          opacity: 1 !important;
        }

        .v71MobileCommitFreezeLayer {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147482999 !important;
          pointer-events: none !important;
          overflow: visible !important;
        }

        /* V65 owns localized stats by hiding the raw English source at
           font-size:0 and painting exactly one localized ::after string. Never
           restore a font-size on the source element here, or both languages are
           rendered at once. */
        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small {
          top: var(--v71-root-summary-y, 81px) !important;
          margin: 0 !important;
          color: #6c655b !important;
          white-space: nowrap !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small.v65LocalizedUiCopy {
          font-size: 0 !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small.v65LocalizedUiCopy::after {
          font-size: .38rem !important;
          line-height: 1.15 !important;
        }

        .productionNetworkCanaryV45 .centerWrap.v71RootIdentityWrap > small:not(.v65LocalizedUiCopy) {
          font-size: .38rem !important;
          line-height: 1.15 !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          content: attr(data-v71-root-copy) !important;
          left: 50% !important;
          top: 50% !important;
          width: auto !important;
          height: auto !important;
          min-width: 0 !important;
          max-width: calc(100% - 16px) !important;
          transform: translate(-50%, -50%) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #efc64c !important;
          font-size: .58rem !important;
          font-family: inherit !important;
          font-weight: 850 !important;
          line-height: 1.12 !important;
          letter-spacing: 0 !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          unicode-bidi: plaintext;
          text-shadow: 0 0 10px rgba(239, 198, 76, .18);
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='compact']::after {
          font-size: .53rem !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='long']::after {
          font-size: .48rem !important;
          max-width: calc(100% - 10px) !important;
        }

        html[data-locale-typography='arabic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after,
        html[data-locale-typography='indic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          line-height: 1.28 !important;
        }

        /* Person and available-slot hold timers are both 500 ms in V52/V53.
           Give the slot the same transition cadence as a person node and stop
           its idle pulse while armed so the visible long-press response lands
           at the same moment instead of feeling delayed by the pulse cycle. */
        .productionNetworkCanaryV45 .slotCircle {
          transition: transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease !important;
        }

        .productionNetworkCanaryV45 .slotNode.v53SlotHoldArmed .slotCircle,
        .productionNetworkCanaryV45 .slotNode.v53SlotLongDragging .slotCircle {
          animation: none !important;
        }
      `}</style>
    </>
  );
}
