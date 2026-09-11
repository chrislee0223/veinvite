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

        // Freeze the exact visible point before V39's edit-mode layout pass runs.
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
        const start = startsRef.current.get(nodeKey(node, index));
        const current = nodePoint(node);
        const moved = Boolean(start) && Math.hypot(current.x - start!.x, current.y - start!.y) > MOVE_EPSILON;

        if (reset) {
          delete node.dataset.v39Manual;
          setV39Coordinates(node, inverseAutoPoint(current, compact, zoom, clustered), current);
          return;
        }

        if (moved || start?.wasManual) {
          // A node becomes manual only when it truly moved, or if it was already manual.
          node.dataset.v39Manual = '1';
          setV39Coordinates(node, current, current);
        } else {
          // Untouched automatic nodes keep the same visible point when Done is pressed.
          delete node.dataset.v39Manual;
          setV39Coordinates(node, inverseAutoPoint(current, compact, zoom, clustered), current);
        }
      });

      startsRef.current.clear();
      resetDuringEditRef.current = false;
    };

    const syncEditState = () => {
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage) return;
      const editing = stage.classList.contains('editMode');

      if (editing && !editingRef.current) enterEdit(stage);
      if (!editing && editingRef.current) exitEdit(stage);
      editingRef.current = editing;
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('button') as HTMLButtonElement | null
        : null;
      if (!target) return;
      const stage = root.querySelector<HTMLElement>('.stage');
      if (!stage?.classList.contains('editMode')) return;
      if (target.textContent?.trim().toLowerCase().includes('reset')) resetDuringEditRef.current = true;
    };

    // Important: react to the editMode class change synchronously in the observer callback.
    // V39 schedules its layout work in requestAnimationFrame, so these coordinates are frozen first.
    const observer = new MutationObserver(syncEditState);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', syncEditState);
    syncEditState();

    return () => {
      observer.disconnect();
      root.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', syncEditState);
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
