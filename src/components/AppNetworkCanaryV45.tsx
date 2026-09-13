'use client';

import { useEffect, useRef } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { QaNetworkRadialPlaygroundV45 } from '@/qa/QaNetworkRadialPlaygroundV45';

export function AppNetworkCanaryV45({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLElement | null>(null);

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

  return (
    <section ref={rootRef} className="productionNetworkCanaryV45" data-locale={locale}>
      <QaNetworkRadialPlaygroundV45 />
      <style jsx global>{`
        .productionNetworkCanaryV45{width:100%;position:relative;pointer-events:auto!important}
        .productionNetworkCanaryV45 .v37Page{min-height:0!important;padding:0 0 12px!important;background:transparent!important;pointer-events:auto!important}
        .productionNetworkCanaryV45 .labHeader,
        .productionNetworkCanaryV45 .scenarioBar,
        .productionNetworkCanaryV45 .rules{display:none!important}
        .productionNetworkCanaryV45 .controlBar,
        .productionNetworkCanaryV45 .networkShell{width:min(calc(100% - 20px),960px)!important}
        .productionNetworkCanaryV45 .stage{touch-action:none!important;overscroll-behavior:contain!important;pointer-events:auto!important}
        .productionNetworkCanaryV45 .scene,
        .productionNetworkCanaryV45 .ringLayer,
        .productionNetworkCanaryV45 .personNode,
        .productionNetworkCanaryV45 .slotNode,
        .productionNetworkCanaryV45 .clusterNode,
        .productionNetworkCanaryV45 .v42GroupHub{pointer-events:auto}
        .productionNetworkCanaryV45 .controlBar button,
        .productionNetworkCanaryV45 .networkTop button,
        .productionNetworkCanaryV45 .v42GroupToolbarButton{touch-action:manipulation;pointer-events:auto!important}
        @media(max-width:640px){
          .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV45 .networkShell{width:calc(100% - 12px)!important}
        }
      `}</style>
    </section>
  );
}
