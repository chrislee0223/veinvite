'use client';

import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };

type GraphSnapshot = {
  nodeByKey: Map<string, HTMLElement>;
  parentByNode: Map<HTMLElement, HTMLElement>;
  childrenByNode: Map<HTMLElement, HTMLElement[]>;
  lineByChild: Map<HTMLElement, SVGLineElement>;
};

const CLEANUP_DELAY_MS = 235;
const COLLAPSE_FADE_MS = 155;
const EDGE_NODE_OFFSET = 22;

function pointKey(point: Point) {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function nodePoint(node: HTMLElement): Point | null {
  const x = Number.parseFloat(node.style.left || '');
  const y = Number.parseFloat(node.style.top || '');
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function lineNumber(line: SVGLineElement, name: 'x1' | 'y1' | 'x2' | 'y2') {
  const value = Number.parseFloat(line.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : null;
}

function buildGraph(stage: HTMLElement): GraphSnapshot {
  const personNodes = Array.from(stage.querySelectorAll<HTMLElement>('.personNode'));
  const nodeByKey = new Map<string, HTMLElement>();
  const parentByNode = new Map<HTMLElement, HTMLElement>();
  const childrenByNode = new Map<HTMLElement, HTMLElement[]>();
  const lineByChild = new Map<HTMLElement, SVGLineElement>();

  personNodes.forEach((node) => {
    const point = nodePoint(node);
    if (point) nodeByKey.set(pointKey(point), node);
  });

  const lines = Array.from(stage.querySelectorAll<SVGLineElement>('svg.edges line'));
  lines.forEach((line) => {
    const x1 = lineNumber(line, 'x1');
    const y1 = lineNumber(line, 'y1');
    const x2 = lineNumber(line, 'x2');
    const y2 = lineNumber(line, 'y2');
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    const parent = nodeByKey.get(pointKey({ x: x1, y: y1 - EDGE_NODE_OFFSET }));
    const child = nodeByKey.get(pointKey({ x: x2, y: y2 + EDGE_NODE_OFFSET }));
    if (!parent || !child) return;

    parentByNode.set(child, parent);
    const children = childrenByNode.get(parent) ?? [];
    children.push(child);
    childrenByNode.set(parent, children);
    lineByChild.set(child, line);
  });

  return { nodeByKey, parentByNode, childrenByNode, lineByChild };
}

function ancestry(node: HTMLElement, parentByNode: Map<HTMLElement, HTMLElement>) {
  const result = new Set<HTMLElement>();
  let current: HTMLElement | undefined = node;
  while (current) {
    result.add(current);
    current = parentByNode.get(current);
  }
  return result;
}

function descendants(node: HTMLElement, childrenByNode: Map<HTMLElement, HTMLElement[]>) {
  const result = new Set<HTMLElement>();
  const queue = [...(childrenByNode.get(node) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || result.has(current)) continue;
    result.add(current);
    queue.push(...(childrenByNode.get(current) ?? []));
  }
  return result;
}

function topLevelCloseRoots(
  candidates: Set<HTMLElement>,
  parentByNode: Map<HTMLElement, HTMLElement>,
) {
  return Array.from(candidates).filter((node) => {
    let parent = parentByNode.get(node);
    while (parent) {
      if (candidates.has(parent)) return false;
      parent = parentByNode.get(parent);
    }
    return true;
  });
}

export function ActiveSpinePreviewController() {
  const cleanupTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const clickSequenceRef = useRef(0);

  useEffect(() => {
    const clearTimers = () => {
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const personTap = target?.closest<HTMLElement>('.personTap');
      if (!personTap) return;
      const stage = personTap.closest<HTMLElement>('.networkStage');
      const clickedNode = personTap.closest<HTMLElement>('.personNode');
      if (!stage || !clickedNode) return;

      clickSequenceRef.current += 1;
      const sequence = clickSequenceRef.current;
      clearTimers();

      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null;
        if (sequence !== clickSequenceRef.current) return;

        const graph = buildGraph(stage);
        const keep = ancestry(clickedNode, graph.parentByNode);
        const openHints = Array.from(stage.querySelectorAll<HTMLElement>('.branchHint.open'));
        const closeCandidates = new Set<HTMLElement>();

        openHints.forEach((hint) => {
          const owner = hint.closest<HTMLElement>('.personNode');
          if (owner && !keep.has(owner)) closeCandidates.add(owner);
        });

        const closeRoots = topLevelCloseRoots(closeCandidates, graph.parentByNode);
        if (closeRoots.length === 0) return;

        const fadingNodes = new Set<HTMLElement>();
        const fadingLines = new Set<SVGLineElement>();

        closeRoots.forEach((root) => {
          descendants(root, graph.childrenByNode).forEach((node) => {
            fadingNodes.add(node);
            const line = graph.lineByChild.get(node);
            if (line) fadingLines.add(line);
          });
        });

        fadingNodes.forEach((node) => node.classList.add('spineClosing'));
        fadingLines.forEach((line) => line.classList.add('spineClosingLine'));

        collapseTimerRef.current = window.setTimeout(() => {
          collapseTimerRef.current = null;
          if (sequence !== clickSequenceRef.current) return;

          closeRoots.forEach((root) => {
            const hint = root.querySelector<HTMLButtonElement>('.branchHint.open');
            hint?.click();
          });
        }, COLLAPSE_FADE_MS);
      }, CLEANUP_DELAY_MS);
    };

    document.addEventListener('click', onClickCapture, true);
    return () => {
      clearTimers();
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <style jsx global>{`
      .networkStage .spineClosing {
        opacity: 0 !important;
        transform: translate(-50%, -50%) scale(.78) !important;
        filter: saturate(.35) brightness(.55) !important;
        transition:
          opacity ${COLLAPSE_FADE_MS}ms ease,
          transform ${COLLAPSE_FADE_MS}ms cubic-bezier(.4, 0, .2, 1),
          filter ${COLLAPSE_FADE_MS}ms ease !important;
        pointer-events: none !important;
      }

      .networkStage .spineClosingLine {
        opacity: 0 !important;
        transition: opacity ${COLLAPSE_FADE_MS}ms ease !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .networkStage .spineClosing,
        .networkStage .spineClosingLine {
          transition: none !important;
        }
      }
    `}</style>
  );
}
