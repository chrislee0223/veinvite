'use client';

import { useEffect, useRef } from 'react';

import { QaNetworkRadialPlaygroundV37 } from './QaNetworkRadialPlaygroundV37';

const HOLD_MS = 520;
const MOVE_CANCEL_PX = 10;

type HoldState = {
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
  target: HTMLButtonElement;
};

function curvePath(x: number, y: number) {
  const bend = Math.sign(x || 1) * Math.min(64, Math.abs(x) * .17);
  return `M 0 0 C ${bend} ${y * .22}, ${x - bend} ${y * .78}, ${x} ${y}`;
}

export function QaNetworkRadialPlaygroundV38() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<HoldState | null>(null);
  const swallowUntilRef = useRef(0);
  const layoutFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const clearHold = () => {
      const hold = holdRef.current;
      if (hold) window.clearTimeout(hold.timer);
      holdRef.current = null;
      root.classList.remove('v38ClusterHolding');
    };

    const editButton = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
      .find((button) => button.textContent?.includes('Edit layout')) ?? null;

    const applyHeader = () => {
      const title = root.querySelector<HTMLElement>('.labHeader strong');
      const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
      if (title && title.dataset.v38 !== '1') {
        title.textContent = 'RADIAL NETWORK PLAYGROUND · V38';
        title.dataset.v38 = '1';
      }
      if (subtitle && subtitle.dataset.v38 !== '1') {
        subtitle.textContent = 'Stability pass · safer gestures · clearer +N groups';
        subtitle.dataset.v38 = '1';
      }
    };

    const spreadClusters = () => {
      if (layoutFrameRef.current !== null) return;
      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        applyHeader();
        const stage = root.querySelector<HTMLElement>('.stage.clusterMode');
        if (!stage) return;
        const nodes = Array.from(stage.querySelectorAll<HTMLButtonElement>('.clusterNode'));
        const paths = Array.from(stage.querySelectorAll<SVGPathElement>('.clusterSpoke'));
        if (nodes.length < 2) return;

        const compact = window.innerWidth <= 640;
        const radius = compact ? Math.max(218, 156 + nodes.length * 8) : Math.max(314, 238 + nodes.length * 10);
        nodes.forEach((node, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / nodes.length;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * (compact ? .9 : .82);
          node.style.setProperty('--x', `${x}px`);
          node.style.setProperty('--y', `${y}px`);
          node.setAttribute('aria-label', `${node.textContent?.trim() ?? '+N'} grouped branches`);
          const path = paths[index];
          if (path) path.setAttribute('d', curvePath(x, y));
        });
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button.clusterNode') as HTMLButtonElement | null : null;
      if (!target || !root.contains(target)) {
        if (holdRef.current && event.isPrimary === false) clearHold();
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearHold();
      root.classList.add('v38ClusterHolding');
      const hold: HoldState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        timer: 0,
        target,
      };
      hold.timer = window.setTimeout(() => {
        if (holdRef.current !== hold) return;
        swallowUntilRef.current = performance.now() + 900;
        clearHold();
        const button = editButton();
        if (button) button.click();
      }, HOLD_MS);
      holdRef.current = hold;
    };

    const onPointerMove = (event: PointerEvent) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - hold.startX, event.clientY - hold.startY) > MOVE_CANCEL_PX) clearHold();
    };

    const onPointerEnd = (event: PointerEvent) => {
      const hold = holdRef.current;
      if (hold && hold.pointerId === event.pointerId) clearHold();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() >= swallowUntilRef.current) return;
      const target = event.target instanceof Element ? event.target.closest('.clusterNode') : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('.clusterNode') : null;
      if (target) event.preventDefault();
    };

    const observer = new MutationObserver(spreadClusters);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', onPointerEnd, true);
    root.addEventListener('pointercancel', onPointerEnd, true);
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('resize', spreadClusters);
    spreadClusters();

    return () => {
      clearHold();
      observer.disconnect();
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', onPointerEnd, true);
      root.removeEventListener('pointercancel', onPointerEnd, true);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('resize', spreadClusters);
      if (layoutFrameRef.current !== null) window.cancelAnimationFrame(layoutFrameRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="v38StabilityRoot">
      <QaNetworkRadialPlaygroundV37 />
      <style jsx global>{`
        .v38StabilityRoot .clusterMode .slotNode b{display:none!important}
        .v38StabilityRoot .clusterMode .slotLayer{opacity:.2!important;pointer-events:none!important}
        .v38StabilityRoot .clusterNode{width:82px!important}
        .v38StabilityRoot .clusterNode::after{content:'group';margin-top:2px;font-size:.32rem;color:#5f594f;letter-spacing:.02em}
        .v38StabilityRoot.v38ClusterHolding .clusterNode:active span{transform:scale(1.08);border-color:rgba(244,183,40,.95);box-shadow:0 0 32px rgba(244,183,40,.13)}
        .v38StabilityRoot .clusterMode .centerWrap small{opacity:.55!important}
        @media(max-width:640px){.v38StabilityRoot .clusterNode{width:76px!important}.v38StabilityRoot .clusterMode .centerWrap small{display:none!important}}
      `}</style>
    </div>
  );
}
