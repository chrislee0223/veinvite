'use client';

import { useEffect, useRef } from 'react';

import { QaNetworkRadialPlaygroundV38 } from './QaNetworkRadialPlaygroundV38';

const DETAIL_ZOOM = 0.98;
const STORAGE_KEY = 'veinvite:qa:radial-v37:positions-v2';

function curvePath(x: number, y: number) {
  const bend = Math.sign(x || 1) * Math.min(64, Math.abs(x) * .17);
  return `M 0 0 C ${bend} ${y * .22}, ${x - bend} ${y * .78}, ${x} ${y}`;
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activeScenarioId(root: HTMLElement) {
  const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
  const map: Record<string, string> = {
    '0명': 'zero',
    '1명': 'one',
    '5명': 'five',
    '30명': 'balanced30',
    '직접 50': 'direct50',
    '100명': 'hundred',
    '500명': 'fiveHundred',
  };
  return map[label] ?? '';
}

function hasSavedManualPosition(root: HTMLElement, node: HTMLButtonElement, compact: boolean) {
  if (node.dataset.v39Manual === '1') return true;
  const id = node.dataset.nodeId;
  if (!id) return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const scenario = activeScenarioId(root);
    const device = compact ? 'mobile' : 'desktop';
    return Object.keys(saved).some((key) =>
      (!scenario || key.startsWith(`${scenario}|`)) &&
      key.includes(`|${device}|person|${id}`),
    );
  } catch {
    return false;
  }
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const value = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(value) ? value / 100 : 1;
}

export function QaNetworkRadialPlaygroundV39() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scheduleLayout = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const stage = root.querySelector<HTMLElement>('.stage');
        if (!stage) return;

        const title = root.querySelector<HTMLElement>('.labHeader strong');
        const subtitle = root.querySelector<HTMLElement>('.labHeader > div:first-child span');
        if (title) title.textContent = 'RADIAL NETWORK PLAYGROUND · V39';
        if (subtitle) subtitle.textContent = 'Center safe zone · tighter spacing · cleaner mid zoom';

        const zoom = readZoom(root);
        const clustered = stage.classList.contains('clusterMode');
        const editing = stage.classList.contains('editMode');
        const compact = window.innerWidth <= 640;
        const midZoom = !clustered && zoom < DETAIL_ZOOM;

        root.classList.toggle('v39MidZoom', midZoom);
        root.classList.toggle('v39DetailZoom', !clustered && !midZoom);

        const nodes = Array.from(stage.querySelectorAll<HTMLButtonElement>('.personNode'));
        const paths = Array.from(stage.querySelectorAll<SVGPathElement>('.spoke:not(.slotSpoke):not(.clusterSpoke)'));
        const safeRadius = compact ? 168 : 228;
        const compression = midZoom ? (compact ? .82 : .84) : (compact ? .89 : .9);

        nodes.forEach((node, index) => {
          const currentX = parsePx(node.style.getPropertyValue('--x'));
          const currentY = parsePx(node.style.getPropertyValue('--y'));
          const lastAppliedX = Number.parseFloat(node.dataset.v39AppliedX ?? 'NaN');
          const lastAppliedY = Number.parseFloat(node.dataset.v39AppliedY ?? 'NaN');
          let baseX = Number.parseFloat(node.dataset.v39BaseX ?? 'NaN');
          let baseY = Number.parseFloat(node.dataset.v39BaseY ?? 'NaN');

          const reactUpdatedPosition =
            !Number.isFinite(baseX) ||
            !Number.isFinite(baseY) ||
            !Number.isFinite(lastAppliedX) ||
            !Number.isFinite(lastAppliedY) ||
            Math.abs(currentX - lastAppliedX) > .5 ||
            Math.abs(currentY - lastAppliedY) > .5;

          if (reactUpdatedPosition) {
            baseX = currentX;
            baseY = currentY;
            node.dataset.v39BaseX = String(baseX);
            node.dataset.v39BaseY = String(baseY);
          }

          const manual = hasSavedManualPosition(root, node, compact);
          const radius = Math.hypot(baseX, baseY);
          let nextX = baseX;
          let nextY = baseY;

          if (!editing && !manual && radius > 0) {
            const nextRadius = radius < safeRadius
              ? safeRadius
              : safeRadius + (radius - safeRadius) * compression;
            const ratio = nextRadius / radius;
            nextX = baseX * ratio;
            nextY = baseY * ratio;
          }

          if (Math.abs(currentX - nextX) > .2) node.style.setProperty('--x', `${nextX}px`);
          if (Math.abs(currentY - nextY) > .2) node.style.setProperty('--y', `${nextY}px`);
          node.dataset.v39AppliedX = String(nextX);
          node.dataset.v39AppliedY = String(nextY);

          const path = paths[index];
          if (path) {
            const nextPath = curvePath(nextX, nextY);
            if (path.getAttribute('d') !== nextPath) path.setAttribute('d', nextPath);
          }
        });
      });
    };

    const markManualDuringEdit = (event: PointerEvent) => {
      const stage = root.querySelector<HTMLElement>('.stage.editMode');
      if (!stage) return;
      const target = event.target instanceof Element ? event.target.closest('button.personNode') as HTMLButtonElement | null : null;
      if (target && stage.contains(target)) target.dataset.v39Manual = '1';
    };

    const observer = new MutationObserver(scheduleLayout);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    root.addEventListener('pointerdown', markManualDuringEdit, true);
    root.addEventListener('pointermove', markManualDuringEdit, true);
    window.addEventListener('resize', scheduleLayout);
    scheduleLayout();

    return () => {
      observer.disconnect();
      root.removeEventListener('pointerdown', markManualDuringEdit, true);
      root.removeEventListener('pointermove', markManualDuringEdit, true);
      window.removeEventListener('resize', scheduleLayout);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="v39RefinementRoot">
      <QaNetworkRadialPlaygroundV38 />
      <style jsx global>{`
        .v39RefinementRoot .personNode,
        .v39RefinementRoot .spoke{transition:opacity 180ms ease,stroke-width 180ms ease}
        .v39RefinementRoot .personNode{transition:opacity 180ms ease}
        .v39RefinementRoot.v39MidZoom .personNode b,
        .v39RefinementRoot.v39MidZoom .personNode small{opacity:0!important;pointer-events:none!important}
        .v39RefinementRoot.v39MidZoom .nodeCircle{width:46px!important;height:46px!important;box-shadow:none!important}
        .v39RefinementRoot.v39MidZoom .spoke:not(.slotSpoke):not(.clusterSpoke){opacity:.2!important;stroke-width:.72!important}
        .v39RefinementRoot.v39MidZoom .slotSpoke{opacity:.12!important}
        .v39RefinementRoot.v39MidZoom .slotNode b{opacity:.35!important}
        .v39RefinementRoot.v39DetailZoom .spoke:not(.slotSpoke):not(.clusterSpoke){opacity:.72}
        .v39RefinementRoot .centerWrap{z-index:12!important}
        .v39RefinementRoot .centerWrap small{white-space:nowrap}
        @media(max-width:640px){
          .v39RefinementRoot.v39MidZoom .nodeCircle{width:44px!important;height:44px!important}
          .v39RefinementRoot.v39MidZoom .slotNode b{display:none!important}
        }
      `}</style>
    </div>
  );
}
