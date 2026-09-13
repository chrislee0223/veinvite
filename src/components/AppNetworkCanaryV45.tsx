'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@/lib/i18n/locales';
import { QaNetworkRadialPlaygroundV45 } from '@/qa/QaNetworkRadialPlaygroundV45';

const MOBILE_SAFE_STAGE_MIN_PX = 420;
const BOTTOM_NAV_GAP_PX = 16;
const NETWORK_INTRO_SESSION_KEY = 'veinvite:network:intro-v1';
const NETWORK_INTRO_HOLD_MS = 300;
const NETWORK_INTRO_TOTAL_MS = 1120;

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

  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>('.stage');
    if (!root || !stage) return;

    const activePointers = new Set<number>();
    let releaseTimer: number | null = null;

    const groupRoot = () => root.querySelector<HTMLElement>('.v42ManualGroupsRoot');
    const beginInteraction = () => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      root.classList.add('veinviteInteracting');
      const groups = groupRoot();
      if (groups && groups.dataset.v42TransientDrag !== '1') {
        groups.dataset.veinviteCameraInteraction = '1';
        groups.dataset.v42TransientDrag = '1';
      }
    };
    const finishInteraction = () => {
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null;
        root.classList.remove('veinviteInteracting');
        const groups = groupRoot();
        if (groups?.dataset.veinviteCameraInteraction === '1') {
          delete groups.dataset.veinviteCameraInteraction;
          delete groups.dataset.v42TransientDrag;
        }
      }, 80);
    };
    const isCanvasBackground = (target: Element) => !target.closest('button,.profileCard,.searchPanel,.v42GroupPanel,.v42RemoveZone');
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !stage.contains(target) || !isCanvasBackground(target)) return;
      activePointers.add(event.pointerId);
      beginInteraction();
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!activePointers.delete(event.pointerId)) return;
      if (!activePointers.size) finishInteraction();
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) beginInteraction();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2 && !activePointers.size) finishInteraction();
    };
    const onGestureStart = () => beginInteraction();
    const onGestureEnd = () => {
      if (!activePointers.size) finishInteraction();
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointerup', onPointerEnd, true);
    root.addEventListener('pointercancel', onPointerEnd, true);
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });
    stage.addEventListener('gesturestart', onGestureStart);
    stage.addEventListener('gestureend', onGestureEnd);

    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointerup', onPointerEnd, true);
      root.removeEventListener('pointercancel', onPointerEnd, true);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      stage.removeEventListener('gesturestart', onGestureStart);
      stage.removeEventListener('gestureend', onGestureEnd);
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      root.classList.remove('veinviteInteracting');
      const groups = groupRoot();
      if (groups?.dataset.veinviteCameraInteraction === '1') {
        delete groups.dataset.veinviteCameraInteraction;
        delete groups.dataset.v42TransientDrag;
      }
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
    let introTimer: number | null = null;
    let introEndTimer: number | null = null;

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

    const fitButton = () => Array.from(
      root.querySelectorAll<HTMLButtonElement>('.viewActions button'),
    ).find((button) => button.textContent?.trim() === 'Fit') ?? null;

    const showFittedWithoutJump = () => {
      root.classList.add('veinviteInitialFit');
      stage.style.visibility = 'hidden';
      fitFrame = window.requestAnimationFrame(() => {
        fitButton()?.click();
        revealFrame = window.requestAnimationFrame(() => {
          root.classList.remove('veinviteInitialFit');
          stage.style.visibility = previousVisibility;
        });
      });
    };

    applyMobileSafeStage();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let introSeen = false;
    try { introSeen = window.sessionStorage.getItem(NETWORK_INTRO_SESSION_KEY) === '1'; } catch { introSeen = false; }

    if (reducedMotion || introSeen) {
      showFittedWithoutJump();
    } else {
      try { window.sessionStorage.setItem(NETWORK_INTRO_SESSION_KEY, '1'); } catch { /* optional session hint */ }
      stage.style.visibility = previousVisibility;
      root.classList.add('veinviteIntroActive');
      introTimer = window.setTimeout(() => {
        fitButton()?.click();
      }, NETWORK_INTRO_HOLD_MS);
      introEndTimer = window.setTimeout(() => {
        root.classList.remove('veinviteIntroActive');
      }, NETWORK_INTRO_TOTAL_MS);
    }

    window.addEventListener('resize', applyMobileSafeStage);

    return () => {
      window.cancelAnimationFrame(fitFrame);
      window.cancelAnimationFrame(revealFrame);
      if (introTimer !== null) window.clearTimeout(introTimer);
      if (introEndTimer !== null) window.clearTimeout(introEndTimer);
      window.removeEventListener('resize', applyMobileSafeStage);
      root.classList.remove('veinviteInitialFit', 'veinviteIntroActive');
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
        .productionNetworkCanaryV45 .scene{
          will-change:transform;backface-visibility:hidden;transform-style:preserve-3d
        }
        .productionNetworkCanaryV45.veinviteInteracting .scene{transition:none!important}
        .productionNetworkCanaryV45.veinviteInteracting .waterGlow{filter:none!important;opacity:.42!important}
        .productionNetworkCanaryV45.veinviteInteracting .personNode b,
        .productionNetworkCanaryV45.veinviteInteracting .personNode small{transition:none!important}
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
        .productionNetworkCanaryV45 .centerCircle{
          position:relative!important;font-size:0!important;color:transparent!important;
          border-color:rgba(255,207,71,.82)!important;background:radial-gradient(circle at 50% 45%,rgba(255,212,83,.095),rgba(13,13,11,.98) 58%)!important;
          box-shadow:0 0 0 1px rgba(244,183,40,.07),0 0 28px rgba(244,183,40,.08)!important
        }
        .productionNetworkCanaryV45 .centerCircle::before{
          content:'';position:absolute;inset:-7px;border:1px solid rgba(244,183,40,.42);border-radius:50%;
          box-shadow:0 0 18px rgba(244,183,40,.055);animation:veinviteYouBreath 2.8s ease-in-out infinite;pointer-events:none
        }
        .productionNetworkCanaryV45 .centerCircle::after{
          content:'';position:absolute;left:50%;top:50%;width:9px;height:9px;transform:translate(-50%,-50%);border-radius:50%;
          background:#e9bd49;box-shadow:0 0 0 3px rgba(244,183,40,.08),0 0 14px rgba(244,183,40,.28);pointer-events:none
        }
        .productionNetworkCanaryV45.veinviteIntroActive .centerCircle::before{animation:veinviteYouIntro .72s ease-out 1,veinviteYouBreath 2.8s .72s ease-in-out infinite}
        .productionNetworkCanaryV45.veinviteIntroActive .cameraTransition .scene{transition:transform 760ms cubic-bezier(.18,.82,.2,1)!important}
        .productionNetworkCanaryV45.veinviteIntroActive .zoomValue{opacity:.24!important}
        .productionNetworkCanaryV45 .slotSpoke{
          stroke:rgba(244,183,40,.5)!important;stroke-width:1.3!important;stroke-dasharray:4 34!important;
          filter:drop-shadow(0 0 2px rgba(244,183,40,.34));animation:veinviteSlotFlow 2.45s linear infinite
        }
        .productionNetworkCanaryV45 .slotSpoke:nth-last-of-type(1){animation-delay:-1.15s}
        .productionNetworkCanaryV45.veinviteInteracting .slotSpoke,
        .productionNetworkCanaryV45.veinviteInteracting .slotCircle,
        .productionNetworkCanaryV45 .v42ManualGroupsRoot[data-v42-transient-drag="1"] .slotSpoke,
        .productionNetworkCanaryV45 .v42ManualGroupsRoot[data-v42-transient-drag="1"] .slotCircle{
          animation-play-state:paused!important;filter:none!important
        }
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
          color:#bca66b!important;pointer-events:none!important;cursor:default!important;transition:opacity 180ms ease
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
        .productionNetworkCanaryV45 .v42GroupPanel{
          width:min(286px,calc(100% - 20px))!important;padding:9px!important;max-height:min(330px,calc(100% - 18px))!important;
          overflow:auto!important;border-radius:13px!important;box-shadow:0 14px 34px rgba(0,0,0,.34)!important
        }
        .productionNetworkCanaryV45 .v42PanelHead>div{gap:0!important}.productionNetworkCanaryV45 .v42PanelHead>button{width:26px!important;height:26px!important}
        .productionNetworkCanaryV45 .v42CreateButton{margin-top:6px!important;height:31px!important}
        .productionNetworkCanaryV45 .v42GroupList{gap:4px!important;margin-top:5px!important;max-height:155px!important}
        .productionNetworkCanaryV45 .v42GroupRowMain{min-height:34px!important;padding:5px 7px!important}.productionNetworkCanaryV45 .v42ManageGroup{height:28px!important}
        .productionNetworkCanaryV45 .v42EmptyGroups{font-size:0!important;padding:4px 2px!important;line-height:1!important}.productionNetworkCanaryV45 .v42EmptyGroups::after{content:'No groups yet';font-size:.37rem;color:#6e675c}
        .productionNetworkCanaryV45 .v42PanelNote{display:none!important}
        .productionNetworkCanaryV45 .v44NewGroupDrop.first{min-height:44px!important;padding:7px 9px!important;margin-top:5px!important}
        .productionNetworkCanaryV45 .v42SelectionCount{margin-top:6px!important}.productionNetworkCanaryV45 .v42SelectionCount b{font-size:.88rem!important}
        .productionNetworkCanaryV45 .v42GroupPanel input{height:34px!important;margin-top:6px!important}.productionNetworkCanaryV45 .v42CreateActions{margin-top:5px!important;padding-top:4px!important}.productionNetworkCanaryV45 .v42CreateActions button{height:31px!important}
        .productionNetworkCanaryV45 .v44CreateDropMore{margin-top:5px!important;padding:7px!important}.productionNetworkCanaryV45 .v44SelectedPeople{max-height:54px!important}
        @keyframes veinviteYouBreath{0%,100%{opacity:.46;transform:scale(.96)}50%{opacity:.92;transform:scale(1.06)}}
        @keyframes veinviteYouIntro{0%{opacity:.25;transform:scale(.78)}58%{opacity:1;transform:scale(1.14)}100%{opacity:.62;transform:scale(1)}}
        @keyframes veinviteSlotFlow{from{stroke-dashoffset:38}to{stroke-dashoffset:-38}}
        @media(max-width:640px){
          .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV45 .networkShell{width:100%!important}
          .productionNetworkCanaryV45 .identity span{font-size:.46rem!important}
          .productionNetworkCanaryV45 .personNode b{font-size:.5rem!important}
          .productionNetworkCanaryV45 .personNode small{font-size:.4rem!important}
          .productionNetworkCanaryV45 .hint{font-size:.41rem!important}
          .productionNetworkCanaryV45 .canaryViewActions button{height:28px;padding:0 8px;font-size:.45rem}
          .productionNetworkCanaryV45 .v42GroupPanel{left:9px!important;width:min(278px,calc(100% - 18px))!important;max-height:min(315px,calc(100% - 18px))!important}
        }
        @media(prefers-reduced-motion:reduce){
          .productionNetworkCanaryV45 .personNode b,
          .productionNetworkCanaryV45 .personNode small,
          .productionNetworkCanaryV45 .centerCircle::before,
          .productionNetworkCanaryV45 .slotSpoke{transition:none!important;animation:none!important;filter:none!important}
          .productionNetworkCanaryV45 .canaryViewActions button:active{transform:none}
        }
      `}</style>
    </section>
  );
}
