'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@/lib/i18n/locales';
import { QaNetworkRadialPlaygroundV45 } from '@/qa/QaNetworkRadialPlaygroundV45';

const MOBILE_SAFE_STAGE_MIN_PX = 420;
const BOTTOM_NAV_GAP_PX = 16;

export function AppNetworkCanaryV45({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [viewActionHost, setViewActionHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // V38→V45 is a cumulative QA wrapper chain. Several legacy wrappers update
    // hidden QA metadata from MutationObservers. Freeze those production-hidden
    // metadata nodes before passive effects install observers so the observers
    // cannot wake each other up while users interact with the real Network UI.
    const textNodes = [
      root.querySelector<HTMLElement>('.labHeader strong'),
      root.querySelector<HTMLElement>('.labHeader > div:first-child span'),
    ].filter((node): node is HTMLElement => Boolean(node));

    textNodes.forEach((node) => {
      const value = node.textContent ?? '';
      try {
        Object.defineProperty(node, 'textContent', {
          configurable: true,
          get: () => value,
          set: () => undefined,
        });
      } catch {
        // Hardened WebViews may reject an instance override. The client-only
        // mount and source-level observer guards still keep the UI functional.
      }
    });

    // V42 historically rewrote hidden rule markup from inside the same observer
    // that watched child-list mutations. Keep these production-hidden nodes
    // immutable as a final safety net even though the source observer is guarded.
    const ruleNodes = Array.from(root.querySelectorAll<HTMLElement>('.rules span'));
    ruleNodes.forEach((node) => {
      const value = node.innerHTML;
      try {
        Object.defineProperty(node, 'innerHTML', {
          configurable: true,
          get: () => value,
          set: () => undefined,
        });
      } catch {
        // Best-effort production guard only.
      }
    });

    return () => {
      // Keep soon-to-be-discarded metadata frozen until nested passive cleanup
      // finishes. Restoring it early can briefly restart the observer chain while
      // switching tabs and make the app appear frozen.
      root.dataset.veinviteCanaryDisposing = 'true';
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>('.stage');
    const navActions = root?.querySelector<HTMLElement>('.navActions');
    if (!root || !stage) return;

    // The toolbar shell is rendered synchronously by V37 and is stable for the
    // lifetime of this Network mount. Resolve it once instead of introducing
    // another MutationObserver on top of the existing V42–V45 observer chain.
    setViewActionHost(navActions ?? null);

    const zoomValue = root.querySelector<HTMLButtonElement>('.zoomValue');
    if (zoomValue) {
      zoomValue.tabIndex = -1;
      zoomValue.setAttribute('aria-disabled', 'true');
      zoomValue.setAttribute('title', 'Current zoom');
    }

    const clearSelectedNode = () => {
      root.querySelectorAll('.personNode.canarySelectedNode').forEach((node) => {
        node.classList.remove('canarySelectedNode');
      });
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const node = target.closest<HTMLButtonElement>('.personNode[data-node-id]');
      if (node && root.contains(node)) {
        clearSelectedNode();
        node.classList.add('canarySelectedNode');
        return;
      }

      const closeButton = target.closest<HTMLButtonElement>('.profileCard > div button');
      if (closeButton?.textContent?.trim() === '×') clearSelectedNode();
    };

    root.addEventListener('click', onClickCapture, true);

    return () => {
      root.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!stage) return;

    const preventNativeStageScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    const preventNativeGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };

    // iOS/WKWebView can still hand touchmove/pinch to the page even when the
    // nested canvas declares touch-action:none. Keep taps native, but make
    // actual movement and Safari's proprietary pinch gesture belong to the
    // Network canvas so the existing V45 pan/pinch handlers receive them.
    stage.addEventListener('touchmove', preventNativeStageScroll, { passive: false });
    stage.addEventListener('gesturestart', preventNativeGesture, { passive: false });
    stage.addEventListener('gesturechange', preventNativeGesture, { passive: false });
    stage.addEventListener('gestureend', preventNativeGesture, { passive: false });

    return () => {
      stage.removeEventListener('touchmove', preventNativeStageScroll);
      stage.removeEventListener('gesturestart', preventNativeGesture);
      stage.removeEventListener('gesturechange', preventNativeGesture);
      stage.removeEventListener('gestureend', preventNativeGesture);
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    const previousHeight = stage.style.height;
    const previousMinHeight = stage.style.minHeight;
    const previousVisibility = stage.style.visibility;
    let fitFrame = 0;
    let revealFrame = 0;

    const applyMobileSafeStage = () => {
      if (window.innerWidth > 700) {
        stage.style.height = previousHeight;
        stage.style.minHeight = previousMinHeight;
        return;
      }

      const navTrack = document.querySelector<HTMLElement>('.bottomNavigation > div');
      if (!navTrack) return;
      const stageRect = stage.getBoundingClientRect();
      const navRect = navTrack.getBoundingClientRect();
      const safeBottom = Math.min(stageRect.bottom, navRect.top - BOTTOM_NAV_GAP_PX);
      const safeHeight = Math.floor(safeBottom - stageRect.top);
      if (safeHeight >= MOBILE_SAFE_STAGE_MIN_PX && safeHeight < stageRect.height - 2) {
        stage.style.height = `${safeHeight}px`;
        stage.style.minHeight = `${MOBILE_SAFE_STAGE_MIN_PX}px`;
      }
    };

    applyMobileSafeStage();

    // Start at the fitted overview without showing a visible 100%→fit jump.
    // The canvas is hidden for two animation frames: first calculate against the
    // final stage size, then reveal after V37 applies the fitted camera state.
    root.classList.add('veinviteInitialFit');
    stage.style.visibility = 'hidden';
    fitFrame = window.requestAnimationFrame(() => {
      const fitButton = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.viewActions button'),
      ).find((button) => button.textContent?.trim() === 'Fit');
      fitButton?.click();
      revealFrame = window.requestAnimationFrame(() => {
        root.classList.remove('veinviteInitialFit');
        stage.style.visibility = previousVisibility;
      });
    });

    window.addEventListener('resize', applyMobileSafeStage);

    return () => {
      window.cancelAnimationFrame(fitFrame);
      window.cancelAnimationFrame(revealFrame);
      window.removeEventListener('resize', applyMobileSafeStage);
      root.classList.remove('veinviteInitialFit');
      stage.style.visibility = previousVisibility;
      stage.style.height = previousHeight;
      stage.style.minHeight = previousMinHeight;
    };
  }, []);

  const triggerViewAction = (action: 'you' | 'fit') => {
    const root = rootRef.current;
    if (!root) return;
    const button = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.viewActions button'),
    ).find((candidate) => {
      const label = candidate.textContent?.trim() ?? '';
      return action === 'fit' ? label === 'Fit' : label.includes('YOU');
    });
    button?.click();
  };

  return (
    <section ref={rootRef} className="productionNetworkCanaryV45" data-locale={locale}>
      <QaNetworkRadialPlaygroundV45 />
      {viewActionHost ? createPortal(
        <div className="canaryViewActions" aria-label="Network view controls">
          <button type="button" onClick={() => triggerViewAction('you')}>◎ YOU</button>
          <button type="button" onClick={() => triggerViewAction('fit')}>Fit</button>
        </div>,
        viewActionHost,
      ) : null}
      <style jsx global>{`
        .productionNetworkCanaryV45{width:100%;position:relative;pointer-events:auto!important}
        .productionNetworkCanaryV45 .v37Page{min-height:0!important;padding:0 0 12px!important;background:transparent!important;pointer-events:auto!important}
        .productionNetworkCanaryV45 .labHeader,
        .productionNetworkCanaryV45 .scenarioBar,
        .productionNetworkCanaryV45 .rules{display:none!important}
        .productionNetworkCanaryV45 .controlBar,
        .productionNetworkCanaryV45 .networkShell{width:min(100%,520px)!important}
        .productionNetworkCanaryV45 .networkShell{border-color:rgba(255,205,80,.14)!important;border-radius:21px!important}
        .productionNetworkCanaryV45 .controlBar:has(.crumbs > span:only-child){display:none!important}
        .productionNetworkCanaryV45 .viewActions{display:none!important}
        .productionNetworkCanaryV45.veinviteInitialFit .cameraTransition .scene{transition:none!important}
        .productionNetworkCanaryV45 .stage{touch-action:none!important;overscroll-behavior:contain!important;pointer-events:auto!important}
        .productionNetworkCanaryV45 .stage:not(.editMode):active{cursor:grabbing}
        .productionNetworkCanaryV45 .stage::after{
          content:'';position:absolute;z-index:20;right:0;bottom:0;left:0;height:30px;
          background:linear-gradient(to bottom,rgba(8,8,7,0),rgba(8,8,7,.34));
          box-shadow:inset 0 -1px 0 rgba(244,183,40,.07);pointer-events:none
        }
        .productionNetworkCanaryV45 .scene,
        .productionNetworkCanaryV45 .ringLayer,
        .productionNetworkCanaryV45 .personNode,
        .productionNetworkCanaryV45 .slotNode,
        .productionNetworkCanaryV45 .clusterNode,
        .productionNetworkCanaryV45 .v42GroupHub{pointer-events:auto}
        .productionNetworkCanaryV45 .controlBar button,
        .productionNetworkCanaryV45 .networkTop button,
        .productionNetworkCanaryV45 .v42GroupToolbarButton,
        .productionNetworkCanaryV45 .canaryViewActions button{touch-action:manipulation;pointer-events:auto!important}
        .productionNetworkCanaryV45 .personNode b,
        .productionNetworkCanaryV45 .personNode small{
          opacity:clamp(.08,calc((var(--networkZoom) - .46) * 2.65),1);
          transition:opacity 180ms ease;
        }
        .productionNetworkCanaryV45 .personNode.canarySelectedNode .nodeCircle{
          transform:scale(1.07)!important;border-color:rgba(244,183,40,.92)!important;
          box-shadow:0 0 0 3px rgba(244,183,40,.1),0 0 28px rgba(244,183,40,.12)!important
        }
        .productionNetworkCanaryV45 .personNode.canarySelectedNode b{color:#efc85a!important}
        .productionNetworkCanaryV45 .networkTop{
          align-items:flex-start!important;flex-direction:column!important;gap:8px!important
        }
        .productionNetworkCanaryV45 .identity b{font-size:.62rem!important}
        .productionNetworkCanaryV45 .identity span{font-size:.48rem!important}
        .productionNetworkCanaryV45 .centerWrap small{font-size:.44rem!important}
        .productionNetworkCanaryV45 .personNode b{font-size:.52rem!important}
        .productionNetworkCanaryV45 .personNode small{font-size:.42rem!important}
        .productionNetworkCanaryV45 .hint{font-size:.43rem!important}
        .productionNetworkCanaryV45 .navActions{
          width:100%!important;justify-content:flex-start!important;gap:4px!important;
          flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none;padding-bottom:1px!important
        }
        .productionNetworkCanaryV45 .navActions::-webkit-scrollbar{display:none}
        .productionNetworkCanaryV45 .navActions > button,
        .productionNetworkCanaryV45 .v42GroupToolbarButton,
        .productionNetworkCanaryV45 .canaryViewActions{flex:0 0 auto!important}
        .productionNetworkCanaryV45 .navActions > button:has(+ .zoomValue){
          margin-left:5px!important;margin-right:0!important;border-radius:8px 3px 3px 8px!important
        }
        .productionNetworkCanaryV45 .navActions .zoomValue{
          margin:0!important;border-radius:3px!important;background:rgba(244,183,40,.06)!important;
          color:#bca66b!important;pointer-events:none!important;cursor:default!important
        }
        .productionNetworkCanaryV45 .navActions .zoomValue + button{
          margin-left:0!important;border-radius:3px 8px 8px 3px!important
        }
        .productionNetworkCanaryV45 .v42GroupToolbarButton{
          order:60!important;margin-left:auto!important;border-color:rgba(244,183,40,.16)!important
        }
        .productionNetworkCanaryV45 .canaryViewActions{order:61;display:flex;align-items:center;gap:4px}
        .productionNetworkCanaryV45 .canaryViewActions button{
          height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;
          background:#0e0e0c;color:#918a7e;font:inherit;font-size:.48rem;font-weight:400;line-height:1;cursor:pointer
        }
        .productionNetworkCanaryV45 .canaryViewActions button:hover{border-color:rgba(244,183,40,.22);color:#c1a75f}
        .productionNetworkCanaryV45 .canaryViewActions button:focus-visible{outline:1px solid rgba(255,205,80,.55);outline-offset:2px}
        .productionNetworkCanaryV45 .canaryViewActions button:active{transform:translateY(1px)}
        @media(max-width:640px){
          .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV45 .networkShell{width:100%!important}
          .productionNetworkCanaryV45 .identity span{font-size:.46rem!important}
          .productionNetworkCanaryV45 .personNode b{font-size:.5rem!important}
          .productionNetworkCanaryV45 .personNode small{font-size:.4rem!important}
          .productionNetworkCanaryV45 .hint{font-size:.41rem!important}
          .productionNetworkCanaryV45 .canaryViewActions button{height:28px;padding:0 8px;font-size:.45rem}
        }
        @media(prefers-reduced-motion:reduce){
          .productionNetworkCanaryV45 .personNode b,
          .productionNetworkCanaryV45 .personNode small{transition:none!important}
          .productionNetworkCanaryV45 .canaryViewActions button:active{transform:none}
        }
      `}</style>
    </section>
  );
}
