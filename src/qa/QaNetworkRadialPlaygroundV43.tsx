'use client';

import { useEffect, useRef } from 'react';

import { QaNetworkRadialPlaygroundV42 } from './QaNetworkRadialPlaygroundV42';

type Point = { x: number; y: number };
type EditStart = Point & { wasManual: boolean };

const DETAIL_ZOOM = 0.98;
const MOVE_EPSILON = 1;

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readZoom(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('.zoomValue')?.textContent ?? '100%';
  const value = Number.parseFloat(text.replace('%', ''));
  return Number.isFinite(value) ? Math.max(.01, value / 100) : 1;
}

function nodePoint(node: HTMLButtonElement): Point {
  return {
    x: parsePx(node.style.getPropertyValue('--x')),
    y: parsePx(node.style.getPropertyValue('--y')),
  };
}

function setV39Coordinates(node: HTMLButtonElement, base: Point, applied: Point) {
  node.dataset.v39BaseX = String(base.x);
  node.dataset.v39BaseY = String(base.y);
  node.dataset.v39AppliedX = String(applied.x);
  node.dataset.v39AppliedY = String(applied.y);
}

function inverseAutoPoint(point: Point, compact: boolean, zoom: number, clustered: boolean): Point {
  const safeRadius = compact ? 168 : 228;
  const midZoom = !clustered && zoom < DETAIL_ZOOM;
  const compression = midZoom ? (compact ? .82 : .84) : (compact ? .89 : .9);
  const radius = Math.hypot(point.x, point.y);
  if (radius <= .001) return point;

  const baseRadius = radius <= safeRadius + .5
    ? safeRadius
    : safeRadius + (radius - safeRadius) / compression;
  const ratio = baseRadius / radius;
  return { x: point.x * ratio, y: point.y * ratio };
}

export function QaNetworkRadialPlaygroundV43() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editingRef = useRef(false);
  const startsRef = useRef(new Map<string, EditStart>());
  const resetDuringEditRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodeKey = (node: HTMLButtonElement, index: number) => node.dataset.nodeId ?? `node-${index}`;

    const enterEdit = (stage: HTMLElement) => {
      startsRef.current.clear();
      resetDuringEditRef.current = false;
      const nodes = Array.from(stage.querySelectorAll<HTMLButtonElement>('.personNode'));
      nodes.forEach((node, index) => {
        const point = nodePoint(node);
        startsRef.current.set(nodeKey(node, index), {
          ...point,
          wasManual: node.dataset.v39Manual === '1',
        });

        // Edit mode must begin exactly where the user was already looking.
        setV39Coordinates(node, point, point);
      });
    };

    const exitEdit = (stage: HTMLElement) => {
      const nodes = Array.from(stage.querySelectorAll<HTMLButtonElement>('.personNode'));
      const compact = window.innerWidth <= 640;
      const zoom = readZoom(root);
      const clustered = stage.classList.contains('clusterMode');
      const reset = resetDuringEditRef.current;

      nodes.forEach((node, index) => {
        const key = nodeKey(node, index);
        const start = startsRef.current.get(key);
        const current = nodePoint(node);
        const moved = Boolean(start) && Math.hypot(current.x - start!.x, current.y - start!.y) > MOVE_EPSILON;

        if (reset) {
          delete node.dataset.v39Manual;
          setV39Coordinates(node, inverseAutoPoint(current, compact, zoom, clustered), current);
          return;
        }

        if (moved || start?.wasManual) {
          // Only genuinely moved (or previously manual) nodes remain manual.
          node.dataset.v39Manual = '1';
          setV39Coordinates(node, current, current);
        } else {
          // Untouched automatic nodes keep the exact same visible point after Done.
          delete node.dataset.v39Manual;
          setV39Coordinates(node, inverseAutoPoint(current, compact, zoom, clustered), current);
        }
      });

      startsRef.current.clear();
      resetDuringEditRef.current = false;
    };

    const syncEditState = () => {
      frameRef.current = null;
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage) return;
      const editing = stage.classList.contains('editMode');

      if (editing && !editingRef.current) enterEdit(stage);
      if (!editing && editingRef.current) exitEdit(stage);
      editingRef.current = editing;
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(syncEditState);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') as HTMLButtonElement | null : null;
      if (!target) return;
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage?.classList.contains('editMode')) return;
      if (target.textContent?.trim().toLowerCase().includes('reset')) resetDuringEditRef.current = true;
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', schedule);
    syncEditState();

    return () => {
      observer.disconnect();
      root.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', schedule);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="v43EditStabilityRoot">
      <QaNetworkRadialPlaygroundV42 />
      <style jsx global>{`
        .v43EditStabilityRoot .personNode{will-change:transform}
      `}</style>
    </div>
  );
}
