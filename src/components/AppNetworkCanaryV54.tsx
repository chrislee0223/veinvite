'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV53 } from './AppNetworkCanaryV53';

type Point = { x: number; y: number };

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function curveFromCenter(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(64, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function curveBetween(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = Math.sign(dx || 1) * Math.min(54, Math.abs(dx) * .14);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y + dy * .28}, ${to.x - bend} ${from.y + dy * .72}, ${to.x} ${to.y}`;
}

function NetworkNodeAxisAlignmentController() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    let mounted = true;
    let frame = 0;

    const nodeAnchor = (node: HTMLButtonElement): Point => {
      const circle = node.querySelector<HTMLElement>('.nodeCircle');
      const circleCenterOffsetY = circle
        ? circle.offsetTop + circle.offsetHeight / 2 - node.offsetHeight / 2
        : 0;

      return {
        x:
          parsePx(node.style.getPropertyValue('--x')) +
          parsePx(node.style.getPropertyValue('--v42-group-dx')) +
          parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
          parsePx(node.style.getPropertyValue('--v52-adjust-x')) +
          parsePx(node.style.getPropertyValue('--v50-drag-dx')) +
          parsePx(node.style.getPropertyValue('--v52-drag-dx')),
        y:
          parsePx(node.style.getPropertyValue('--y')) +
          parsePx(node.style.getPropertyValue('--v42-group-dy')) +
          parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
          parsePx(node.style.getPropertyValue('--v52-adjust-y')) +
          parsePx(node.style.getPropertyValue('--v50-drag-dy')) +
          parsePx(node.style.getPropertyValue('--v52-drag-dy')) +
          circleCenterOffsetY,
      };
    };

    const sync = () => {
      frame = 0;
      if (!mounted) return;

      const nodes = Array.from(
        root.querySelectorAll<HTMLButtonElement>('.personNode[data-node-id]'),
      );
      const basePaths = Array.from(
        root.querySelectorAll<SVGPathElement>(
          'svg.edges > path.spoke:not(.slotSpoke):not(.clusterSpoke)',
        ),
      );

      nodes.forEach((node, index) => {
        const id = node.dataset.nodeId;
        const fallbackPath = basePaths[index];
        if (id && fallbackPath && !fallbackPath.dataset.nodeId) {
          fallbackPath.dataset.nodeId = id;
        }
      });

      nodes.forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id) return;
        const path = root.querySelector<SVGPathElement>(
          `svg.edges > path.spoke[data-node-id="${CSS.escape(id)}"]`,
        );
        if (!path) return;
        const next = curveFromCenter(nodeAnchor(node));
        if (path.getAttribute('d') !== next) path.setAttribute('d', next);
      });

      root.querySelectorAll<SVGPathElement>('.v50GroupMemberEdge[data-edge-key]').forEach((path) => {
        const key = path.dataset.edgeKey;
        if (!key) return;
        const separator = key.indexOf(':');
        if (separator < 0) return;
        const groupId = key.slice(0, separator);
        const memberId = key.slice(separator + 1);
        const hub = root.querySelector<HTMLElement>(
          `.v42GroupHub[data-group-id="${CSS.escape(groupId)}"]`,
        );
        const node = root.querySelector<HTMLButtonElement>(
          `.personNode[data-node-id="${CSS.escape(memberId)}"]`,
        );
        if (!hub || !node) return;
        const from = {
          x: parsePx(hub.style.getPropertyValue('--gx')),
          y: parsePx(hub.style.getPropertyValue('--gy')),
        };
        const next = curveBetween(from, nodeAnchor(node));
        if (path.getAttribute('d') !== next) path.setAttribute('d', next);
      });
    };

    const scheduleSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : null;
        if (mutation.type === 'attributes') {
          return Boolean(
            target?.matches(
              '.personNode[data-node-id], .nodeCircle, .v42GroupHub[data-group-id], svg.edges > path.spoke, .v50GroupMemberEdge',
            ),
          );
        }
        if (mutation.type === 'childList') {
          return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
            node instanceof Element &&
            (node.matches('.personNode,.nodeCircle,.spoke,.v50GroupMemberEdge') ||
              Boolean(node.querySelector('.personNode,.nodeCircle,.spoke,.v50GroupMemberEdge'))),
          );
        }
        return false;
      });
      if (relevant) scheduleSync();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'd'],
    });
    window.addEventListener('resize', scheduleSync);

    scheduleSync();

    return () => {
      mounted = false;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleSync);
    };
  }, []);

  return <style jsx global>{`
    .productionNetworkCanaryV45 .personNode{
      width:116px!important;height:78px!important;padding:0!important;
      box-sizing:border-box!important;display:block!important;
      overflow:visible!important;text-align:center!important
    }
    .productionNetworkCanaryV45 .personNode .nodeCircle{
      position:absolute!important;left:50%!important;top:0!important;margin:0!important;
      transform:translateX(-50%) scale(var(--v46-node-scale,1))!important;
      transform-origin:50% 50%!important
    }
    .productionNetworkCanaryV45 .personNode.canarySelectedNode .nodeCircle,
    .productionNetworkCanaryV45 .v42ManualGroupsRoot .personNode.v42SelectedMember .nodeCircle,
    .productionNetworkCanaryV45 .v44GroupUxRoot .personNode.v44PendingNewGroupMember .nodeCircle,
    .productionNetworkCanaryV45 .personNode.pressing .nodeCircle{
      transform:translateX(-50%) scale(var(--v46-selected-scale,1.07))!important
    }
    .productionNetworkCanaryV45 .personNode>b,
    .productionNetworkCanaryV45 .personNode>small{
      position:absolute!important;left:50%!important;right:auto!important;
      width:116px!important;max-width:116px!important;margin:0!important;padding:0!important;
      box-sizing:border-box!important;display:block!important;text-align:center!important;
      white-space:nowrap!important;direction:ltr!important;unicode-bidi:isolate!important;
      transform:translateX(-50%)!important;transform-origin:50% 0!important;
      line-height:1.15!important
    }
    .productionNetworkCanaryV45 .personNode>b{
      top:var(--v48-person-label-y,59px)!important
    }
    .productionNetworkCanaryV45 .personNode>small{
      top:var(--v48-person-meta-y,78px)!important
    }
  `}</style>;
}

export function AppNetworkCanaryV54({ locale }: { locale: Locale }) {
  return <>
    <AppNetworkCanaryV53 locale={locale} />
    <NetworkNodeAxisAlignmentController />
  </>;
}
