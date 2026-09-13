'use client';

import { useLayoutEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV56 } from './AppNetworkCanaryV56';

const GROUP_STORAGE_KEY = 'veinvite:qa:radial-v42:groups-v1';

type Point = { x: number; y: number };
type StoredGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
};

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

function NetworkAuthoritativeEdges() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    const stage = root?.querySelector<HTMLElement>('.stage');
    const scene = root?.querySelector<HTMLElement>('.scene');
    if (!root || !stage || !scene) return;

    const svgNs = 'http://www.w3.org/2000/svg';
    const edgeSvg = document.createElementNS(svgNs, 'svg');
    edgeSvg.setAttribute('class', 'v57AuthoritativeEdges');
    edgeSvg.setAttribute('viewBox', '-2200 -2200 4400 4400');
    edgeSvg.setAttribute('aria-hidden', 'true');
    scene.appendChild(edgeSvg);

    const paths = new Map<string, SVGPathElement>();
    let frame = 0;
    let mounted = true;

    const activeScenarioId = () => {
      const label = root.querySelector<HTMLElement>('.scenarioBar button.active b')?.textContent?.trim() ?? '';
      const map: Record<string, string> = {
        '0명': 'zero', '1명': 'one', '5명': 'five', '30명': 'balanced30',
        '직접 50': 'direct50', '100명': 'hundred', '500명': 'fiveHundred',
      };
      return map[label] ?? (label || 'unknown');
    };

    const currentScope = () => {
      const crumbs = Array.from(root.querySelectorAll<HTMLButtonElement>('.crumbs button'))
        .map((button) => button.textContent?.trim() ?? '')
        .filter(Boolean);
      return `${activeScenarioId()}|${crumbs.join('>') || 'YOU'}`;
    };

    const readGroups = () => {
      try {
        const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (!raw) return [] as StoredGroup[];
        const parsed = JSON.parse(raw) as StoredGroup[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [] as StoredGroup[];
      }
    };

    const nodePoint = (node: HTMLElement): Point => ({
      x: parsePx(node.style.getPropertyValue('--x')) +
        parsePx(node.style.getPropertyValue('--v42-group-dx')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-x')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dx')) +
        parsePx(node.style.getPropertyValue('--v52-drag-dx')),
      y: parsePx(node.style.getPropertyValue('--y')) +
        parsePx(node.style.getPropertyValue('--v42-group-dy')) +
        parsePx(node.style.getPropertyValue('--v50-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v52-adjust-y')) +
        parsePx(node.style.getPropertyValue('--v50-drag-dy')) +
        parsePx(node.style.getPropertyValue('--v52-drag-dy')),
    });

    const groupPoint = (hub: HTMLElement): Point => ({
      x: parsePx(hub.style.getPropertyValue('--gx')),
      y: parsePx(hub.style.getPropertyValue('--gy')),
    });

    const upsert = (key: string, className: string, d: string, keep: Set<string>) => {
      keep.add(key);
      let path = paths.get(key);
      if (!path) {
        path = document.createElementNS(svgNs, 'path');
        path.dataset.edgeKey = key;
        edgeSvg.appendChild(path);
        paths.set(key, path);
      }
      if (path.getAttribute('class') !== className) path.setAttribute('class', className);
      if (path.getAttribute('d') !== d) path.setAttribute('d', d);
    };

    const sync = () => {
      frame = 0;
      if (!mounted || !edgeSvg.isConnected) return;

      const keep = new Set<string>();
      const scope = currentScope();
      const groups = readGroups().filter((group) => group.scope === scope);
      const owner = new Map<string, StoredGroup>();
      groups.forEach((group) => group.members.forEach((memberId) => owner.set(memberId, group)));

      const hubs = new Map<string, HTMLElement>();
      root.querySelectorAll<HTMLElement>('.v42GroupHub[data-group-id]').forEach((hub) => {
        const id = hub.dataset.groupId;
        if (id) hubs.set(id, hub);
      });

      groups.forEach((group) => {
        const hub = hubs.get(group.id);
        if (!hub) return;
        const from = groupPoint(hub);
        upsert(`group:${group.id}:trunk`, 'v57Edge v57GroupTrunk', curveFromCenter(from), keep);

        const expanded = hub.classList.contains('expanded') || stage.classList.contains('editMode');
        if (!expanded) return;
        group.members.forEach((memberId) => {
          const node = root.querySelector<HTMLElement>(`.personNode[data-node-id="${CSS.escape(memberId)}"]`);
          if (!node || node.classList.contains('v42CollapsedMember')) return;
          upsert(
            `group:${group.id}:member:${memberId}`,
            'v57Edge v57GroupMember',
            curveBetween(from, nodePoint(node)),
            keep,
          );
        });
      });

      root.querySelectorAll<HTMLElement>('.personNode[data-node-id]').forEach((node) => {
        const id = node.dataset.nodeId;
        if (!id || node.classList.contains('v42CollapsedMember')) return;
        const group = owner.get(id);
        if (group && hubs.has(group.id)) return;
        const className = node.classList.contains('newArrival')
          ? 'v57Edge v57DirectEdge v57NewEdge'
          : 'v57Edge v57DirectEdge';
        upsert(`person:${id}`, className, curveFromCenter(nodePoint(node)), keep);
      });

      paths.forEach((path, key) => {
        if (keep.has(key)) return;
        path.remove();
        paths.delete(key);
      });
    };

    const schedule = () => {
      if (frame || !mounted) return;
      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const target = mutation.target instanceof Node ? mutation.target : null;
        if (target && (target === edgeSvg || edgeSvg.contains(target))) return false;
        if (mutation.type === 'attributes') {
          const element = mutation.target instanceof Element ? mutation.target : null;
          return Boolean(element && (
            element.matches('.personNode,.v42GroupHub,.stage,.scene') ||
            element.closest('.personNode,.v42GroupHub')
          ));
        }
        return mutation.type === 'childList';
      });
      if (relevant) schedule();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const onInteraction = () => schedule();
    root.addEventListener('pointermove', onInteraction, true);
    root.addEventListener('pointerup', onInteraction, true);
    root.addEventListener('pointercancel', onInteraction, true);
    root.addEventListener('click', onInteraction, true);
    window.addEventListener('resize', onInteraction);

    schedule();

    return () => {
      mounted = false;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onInteraction, true);
      root.removeEventListener('pointerup', onInteraction, true);
      root.removeEventListener('pointercancel', onInteraction, true);
      root.removeEventListener('click', onInteraction, true);
      window.removeEventListener('resize', onInteraction);
      edgeSvg.remove();
    };
  }, []);

  return null;
}

export function AppNetworkCanaryV57({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV56 locale={locale} />
      <NetworkAuthoritativeEdges />
      <style jsx global>{`
        /* V44, V50 and V52 all redraw legacy person/group paths with slightly
           different coordinate models. Keep their interaction logic, but remove
           those competing paths from presentation. V57 is the single geometry
           authority for person and group edges. */
        .productionNetworkCanaryV45 .edges > .spoke:not(.slotSpoke):not(.clusterSpoke),
        .productionNetworkCanaryV45 .v42GroupEdges,
        .productionNetworkCanaryV45 .v50GroupMemberEdges {
          opacity: 0 !important;
          visibility: hidden !important;
        }

        .productionNetworkCanaryV45 .v57AuthoritativeEdges {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4400px;
          height: 4400px;
          transform: translate(-50%, -50%);
          overflow: visible;
          pointer-events: none;
          z-index: 5;
        }

        .productionNetworkCanaryV45 .v57Edge {
          fill: none;
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
          pointer-events: none;
        }

        .productionNetworkCanaryV45 .v57DirectEdge {
          stroke: rgba(239, 205, 111, .24);
          stroke-width: .9;
          opacity: .56;
        }

        .productionNetworkCanaryV45 .v57GroupTrunk {
          stroke: rgba(244, 183, 40, .38);
          stroke-width: 1.05;
          stroke-dasharray: 4 7;
          opacity: .72;
        }

        .productionNetworkCanaryV45 .v57GroupMember {
          stroke: rgba(239, 205, 111, .34);
          stroke-width: .95;
          opacity: .72;
        }

        .productionNetworkCanaryV45 .v57NewEdge {
          stroke: rgba(250, 204, 66, .9);
          stroke-width: 1.5;
          stroke-dasharray: 8 7;
        }
      `}</style>
    </>
  );
}
