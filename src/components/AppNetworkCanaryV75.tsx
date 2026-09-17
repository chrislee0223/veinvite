'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV74 } from './AppNetworkCanaryV74';

const PARENT_RETURN_OVERLAY_SELECTOR = '.productionNetworkCanaryV45.v73ParentVisualOverlay';

function NetworkParentReturnMotionV75() {
  useLayoutEffect(() => {
    const applyMotionClass = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(PARENT_RETURN_OVERLAY_SELECTOR)) {
        node.classList.add('v75ParentReturnMotion');
      }
    };

    document.querySelectorAll<HTMLElement>(PARENT_RETURN_OVERLAY_SELECTOR)
      .forEach((overlay) => overlay.classList.add('v75ParentReturnMotion'));

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(applyMotionClass);
      }
    });

    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion .scene{
      transform-origin:50% 50%!important;
      animation:v75ParentReturnReveal 1180ms both!important;
      will-change:transform
    }

    @keyframes v75ParentReturnReveal{
      0%{
        scale:1.05;
        animation-timing-function:cubic-bezier(.18,.82,.2,1)
      }
      61%{
        scale:1.003;
        animation-timing-function:linear
      }
      100%{scale:1}
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion .scene{
        animation:none!important;
        scale:1!important;
        will-change:auto
      }
    }
  `}</style>;
}

export function AppNetworkCanaryV75({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV74 locale={locale} />
      <NetworkParentReturnMotionV75 />
    </>
  );
}
