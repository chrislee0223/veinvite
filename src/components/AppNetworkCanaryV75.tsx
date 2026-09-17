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
    .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion{
      transform-origin:50% 50%!important;
      animation:v75ParentReturnReveal 280ms cubic-bezier(.18,.82,.2,1) both!important;
      will-change:transform,opacity
    }

    @keyframes v75ParentReturnReveal{
      from{
        transform:scale(1.035);
        opacity:.96
      }
      to{
        transform:scale(1);
        opacity:1
      }
    }

    @media(prefers-reduced-motion:reduce){
      .productionNetworkCanaryV45.v73ParentVisualOverlay.v75ParentReturnMotion{
        animation:none!important;
        transform:none!important;
        opacity:1!important;
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
