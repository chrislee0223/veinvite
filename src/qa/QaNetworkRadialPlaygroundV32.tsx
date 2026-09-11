'use client';

import { useEffect, useRef } from 'react';
import { QaNetworkRadialPlaygroundV31 } from './QaNetworkRadialPlaygroundV31';

export function QaNetworkRadialPlaygroundV32() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const activeNodeTouches = new Set<number>();

    const onTouchStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.ringNode')) return;
      Array.from(event.changedTouches).forEach((touch) => activeNodeTouches.add(touch.identifier));
    };

    const hasActiveNodeTouch = (touches: TouchList) => Array.from(touches).some((touch) => activeNodeTouches.has(touch.identifier));

    const onTouchMove = (event: TouchEvent) => {
      if (!activeNodeTouches.size || !hasActiveNodeTouch(event.touches)) return;
      if (event.cancelable) event.preventDefault();
    };

    const releaseTouches = (event: TouchEvent) => {
      Array.from(event.changedTouches).forEach((touch) => activeNodeTouches.delete(touch.identifier));
    };

    const clearTouches = () => activeNodeTouches.clear();

    root.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    root.addEventListener('touchend', releaseTouches, { passive: true, capture: true });
    root.addEventListener('touchcancel', releaseTouches, { passive: true, capture: true });
    window.addEventListener('blur', clearTouches);
    window.addEventListener('pagehide', clearTouches);
    document.addEventListener('visibilitychange', clearTouches);

    return () => {
      root.removeEventListener('touchstart', onTouchStart, true);
      root.removeEventListener('touchmove', onTouchMove, true);
      root.removeEventListener('touchend', releaseTouches, true);
      root.removeEventListener('touchcancel', releaseTouches, true);
      window.removeEventListener('blur', clearTouches);
      window.removeEventListener('pagehide', clearTouches);
      document.removeEventListener('visibilitychange', clearTouches);
      activeNodeTouches.clear();
    };
  }, []);

  return (
    <div ref={rootRef} className="v32Root">
      <QaNetworkRadialPlaygroundV31 />
      <style jsx global>{`
        .v32Root .labHeader strong{font-size:0}
        .v32Root .labHeader strong::after{content:'RADIAL NETWORK PLAYGROUND · V32';font-size:.58rem}
        .v32Root .labHeader span{font-size:0}
        .v32Root .labHeader span::after{content:'Mobile-safe node drag · stable pages · balanced vertical framing';font-size:.48rem}

        /* A touch that starts on a person or Available belongs to the network, not page scrolling. */
        .v32Root .ringNode{touch-action:none!important}

        /* Move the network's visual center slightly upward without rewriting saved/custom coordinates. */
        .v32Root .stage{height:calc(min(72svh,680px) - 36px);min-height:504px}

        @media(max-width:640px){
          .v32Root .stage{height:calc(min(70svh,610px) - 24px);min-height:486px}
        }
      `}</style>
    </div>
  );
}
