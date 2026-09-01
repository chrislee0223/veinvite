'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';

export type ReferralCanvasStatus =
  | 'ROOT'
  | 'NEW'
  | 'RETURNING'
  | 'PENDING'
  | 'OPEN';

export type ReferralCanvasNode = {
  id: string;
  parentId: string | null;
  slot?: 1 | 2;
  walletLabel: string;
  status: ReferralCanvasStatus;
  missionProgress?: 0 | 1 | 2 | 3 | 4;
};

type Locale = 'ko' | 'en';

type PositionedNode = ReferralCanvasNode & {
  x: number;
  y: number;
  depth: number;
};

type CanvasView = {
  x: number;
  y: number;
  scale: number;
};

type PointerPoint = {
  x: number;
  y: number;
};

const MIN_SCALE = 0.42;
const MAX_SCALE = 2.35;
const NODE_WIDTH = 124;
const NODE_HEIGHT = 70;
const VERTICAL_GAP = 178;
const ROOT_SPAN = 720;
const PLANE_PADDING = 420;

const copy = {
  ko: {
    root: '나',
    new: '신규',
    returning: '복귀',
    pending: '진행 중',
    open: '초대 슬롯',
    progress: '미션',
    invite: '+ 초대',
    selected: '선택한 노드',
    drag: '드래그로 이동 · 휠/핀치로 확대',
    reset: '전체 보기',
    zoomIn: '확대',
    zoomOut: '축소',
  },
  en: {
    root: 'Me',
    new: 'New',
    returning: 'Returning',
    pending: 'In progress',
    open: 'Invite slot',
    progress: 'Missions',
    invite: '+ Invite',
    selected: 'Selected node',
    drag: 'Drag to move · Wheel/pinch to zoom',
    reset: 'Fit tree',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: PointerPoint, b: PointerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint): PointerPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function buildLayout(nodes: ReferralCanvasNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, ReferralCanvasNode[]>();

  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }

    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  for (const list of children.values()) {
    list.sort((left, right) => (left.slot ?? 1) - (right.slot ?? 1));
  }

  const root = nodes.find((node) => node.parentId === null) ?? nodes[0];

  if (!root) {
    return {
      nodes: [] as PositionedNode[],
      width: 900,
      height: 620,
      rootX: 450,
      rootY: 160,
    };
  }

  const positions = new Map<string, PositionedNode>();

  const place = (
    node: ReferralCanvasNode,
    x: number,
    y: number,
    depth: number,
    span: number,
  ) => {
    positions.set(node.id, {
      ...node,
      x,
      y,
      depth,
    });

    const nodeChildren = children.get(node.id) ?? [];

    for (const child of nodeChildren) {
      const direction = child.slot === 2 ? 1 : -1;
      place(
        child,
        x + direction * span,
        y + VERTICAL_GAP,
        depth + 1,
        Math.max(96, span * 0.53),
      );
    }
  };

  place(root, 0, 0, 0, ROOT_SPAN);

  const raw = [...positions.values()];
  const minX = Math.min(...raw.map((node) => node.x)) - PLANE_PADDING;
  const maxX = Math.max(...raw.map((node) => node.x)) + PLANE_PADDING;
  const minY = Math.min(...raw.map((node) => node.y)) - PLANE_PADDING / 2;
  const maxY = Math.max(...raw.map((node) => node.y)) + PLANE_PADDING;
  const width = Math.max(1100, maxX - minX);
  const height = Math.max(760, maxY - minY);
  const shiftX = -minX;
  const shiftY = -minY;
  const shifted = raw.map((node) => ({
    ...node,
    x: node.x + shiftX,
    y: node.y + shiftY,
  }));
  const shiftedRoot = shifted.find((node) => node.id === root.id);

  return {
    nodes: shifted,
    width,
    height,
    rootX: shiftedRoot?.x ?? width / 2,
    rootY: shiftedRoot?.y ?? 160,
    byId,
  };
}

function statusLabel(status: ReferralCanvasStatus, locale: Locale) {
  const labels = copy[locale];

  switch (status) {
    case 'ROOT':
      return labels.root;
    case 'NEW':
      return labels.new;
    case 'RETURNING':
      return labels.returning;
    case 'PENDING':
      return labels.pending;
    case 'OPEN':
      return labels.open;
  }
}

export function InfiniteReferralCanvas({
  nodes,
  locale = 'ko',
  onInviteSlotClick,
}: {
  nodes: ReferralCanvasNode[];
  locale?: Locale;
  onInviteSlotClick?: (node: ReferralCanvasNode) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const lastSingleRef = useRef<PointerPoint | null>(null);
  const lastPinchRef = useRef<{
    center: PointerPoint;
    distance: number;
  } | null>(null);
  const layout = useMemo(() => buildLayout(nodes), [nodes]);
  const positionedById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const [view, setView] = useState<CanvasView>({
    x: 0,
    y: 0,
    scale: 0.72,
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    layout.nodes.find((node) => node.status === 'ROOT')?.id ?? null,
  );
  const labels = copy[locale];

  const fitTree = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const scale = clamp(
      Math.min(
        (rect.width - 48) / Math.max(layout.width, 1),
        (rect.height - 70) / Math.max(layout.height, 1),
      ) * 1.7,
      MIN_SCALE,
      0.92,
    );

    setView({
      x: rect.width / 2 - layout.rootX * scale,
      y: 96 - layout.rootY * scale,
      scale,
    });
  }, [layout.height, layout.rootX, layout.rootY, layout.width]);

  useEffect(() => {
    fitTree();

    const handleResize = () => fitTree();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [fitTree]);

  const zoomAround = useCallback(
    (point: PointerPoint, multiplier: number) => {
      setView((previous) => {
        const nextScale = clamp(
          previous.scale * multiplier,
          MIN_SCALE,
          MAX_SCALE,
        );
        const worldX = (point.x - previous.x) / previous.scale;
        const worldY = (point.y - previous.y) / previous.scale;

        return {
          scale: nextScale,
          x: point.x - worldX * nextScale,
          y: point.y - worldY * nextScale,
        };
      });
    },
    [],
  );

  const focusNode = useCallback((node: PositionedNode) => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const nextScale = 1.18;

    setSelectedId(node.id);
    setView({
      scale: nextScale,
      x: rect.width / 2 - node.x * nextScale,
      y: rect.height * 0.42 - node.y * nextScale,
    });
  }, []);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): PointerPoint => {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
      return;
    }

    const [first, second] = [...pointersRef.current.values()];

    if (first && second) {
      lastPinchRef.current = {
        center: midpoint(first, second),
        distance: Math.max(1, distance(first, second)),
      };
      lastSingleRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
      const previous = lastSingleRef.current;

      if (previous) {
        setView((current) => ({
          ...current,
          x: current.x + point.x - previous.x,
          y: current.y + point.y - previous.y,
        }));
      }

      lastSingleRef.current = point;
      return;
    }

    const [first, second] = [...pointersRef.current.values()];
    const previousPinch = lastPinchRef.current;

    if (!first || !second || !previousPinch) {
      return;
    }

    const center = midpoint(first, second);
    const nextDistance = Math.max(1, distance(first, second));
    const ratio = nextDistance / previousPinch.distance;

    setView((previous) => {
      const nextScale = clamp(
        previous.scale * ratio,
        MIN_SCALE,
        MAX_SCALE,
      );
      const worldX =
        (previousPinch.center.x - previous.x) / previous.scale;
      const worldY =
        (previousPinch.center.y - previous.y) / previous.scale;

      return {
        scale: nextScale,
        x: center.x - worldX * nextScale,
        y: center.y - worldY * nextScale,
      };
    });

    lastPinchRef.current = {
      center,
      distance: nextDistance,
    };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      lastSingleRef.current = remaining ?? null;
      lastPinchRef.current = null;
    } else {
      lastSingleRef.current = null;
      lastPinchRef.current = null;
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAround(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      event.deltaY < 0 ? 1.11 : 0.9,
    );
  };

  const selected = selectedId
    ? positionedById.get(selectedId) ?? null
    : null;

  return (
    <div className="infiniteReferralCanvasShell">
      <div className="infiniteReferralToolbar">
        <span>{labels.drag}</span>
        <div>
          <button
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const rect = viewport.getBoundingClientRect();
              zoomAround(
                { x: rect.width / 2, y: rect.height / 2 },
                1.18,
              );
            }}
            aria-label={labels.zoomIn}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const rect = viewport.getBoundingClientRect();
              zoomAround(
                { x: rect.width / 2, y: rect.height / 2 },
                0.84,
              );
            }}
            aria-label={labels.zoomOut}
          >
            −
          </button>
          <button type="button" onClick={fitTree} className="fitButton">
            {labels.reset}
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="infiniteReferralViewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        <div
          className="infiniteReferralPlane"
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          }}
        >
          <svg
            className="infiniteReferralEdges"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.nodes.map((node) => {
              if (!node.parentId) {
                return null;
              }

              const parent = positionedById.get(node.parentId);

              if (!parent) {
                return null;
              }

              const bendY = (parent.y + node.y) / 2;

              return (
                <path
                  key={`${parent.id}-${node.id}`}
                  d={`M ${parent.x} ${parent.y + NODE_HEIGHT / 2 - 4} C ${parent.x} ${bendY}, ${node.x} ${bendY}, ${node.x} ${node.y - NODE_HEIGHT / 2 + 4}`}
                  className={`edge edge-${node.status.toLowerCase()}`}
                />
              );
            })}
          </svg>

          {layout.nodes.map((node) => {
            const isOpen = node.status === 'OPEN';
            const isSelected = selectedId === node.id;

            return (
              <button
                key={node.id}
                type="button"
                className={`referralNode node-${node.status.toLowerCase()}${isSelected ? ' isSelected' : ''}`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${NODE_WIDTH}px`,
                  minHeight: `${NODE_HEIGHT}px`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  if (isOpen) {
                    onInviteSlotClick?.(node);
                    return;
                  }
                  focusNode(node);
                }}
              >
                <span className="nodeStatus">
                  {isOpen ? labels.invite : statusLabel(node.status, locale)}
                </span>
                {!isOpen && (
                  <>
                    <strong>{node.walletLabel}</strong>
                    {node.status !== 'ROOT' && (
                      <small>
                        {labels.progress} {node.missionProgress ?? 0}/4
                      </small>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {selected && selected.status !== 'OPEN' && (
          <aside className="selectedNodeCard">
            <span>{labels.selected}</span>
            <strong>{selected.walletLabel}</strong>
            <em>{statusLabel(selected.status, locale)}</em>
            {selected.status !== 'ROOT' && (
              <small>
                {labels.progress} {selected.missionProgress ?? 0}/4
              </small>
            )}
          </aside>
        )}
      </div>

      <style>{`
        .infiniteReferralCanvasShell {
          width:100%;
          min-width:0;
          overflow:hidden;
          border:1px solid rgba(244,183,40,.16);
          border-radius:24px;
          background:#0e0b14;
          box-shadow:0 22px 70px rgba(0,0,0,.3);
        }
        .infiniteReferralToolbar {
          min-height:56px;
          padding:9px 12px 9px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          border-bottom:1px solid rgba(255,255,255,.06);
          background:rgba(255,255,255,.025);
          color:#8e8797;
          font-size:.72rem;
          font-weight:750;
        }
        .infiniteReferralToolbar > div {
          display:flex;
          align-items:center;
          gap:7px;
        }
        .infiniteReferralToolbar button {
          height:34px;
          min-width:34px;
          border:1px solid rgba(244,183,40,.18);
          border-radius:10px;
          background:rgba(244,183,40,.08);
          color:#f5c95c;
          font:inherit;
          font-size:.92rem;
          font-weight:950;
          cursor:pointer;
        }
        .infiniteReferralToolbar .fitButton {
          padding:0 11px;
          font-size:.68rem;
        }
        .infiniteReferralViewport {
          position:relative;
          width:100%;
          height:min(68vh,680px);
          min-height:480px;
          overflow:hidden;
          touch-action:none;
          cursor:grab;
          user-select:none;
          background:
            radial-gradient(circle at 50% 18%, rgba(99,53,143,.22), transparent 38%),
            radial-gradient(circle at 50% 58%, rgba(244,183,40,.055), transparent 34%),
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
            #0b0810;
          background-size:auto,auto,42px 42px,42px 42px,auto;
        }
        .infiniteReferralViewport:active { cursor:grabbing; }
        .infiniteReferralPlane {
          position:absolute;
          left:0;
          top:0;
          transform-origin:0 0;
          will-change:transform;
        }
        .infiniteReferralEdges {
          position:absolute;
          inset:0;
          overflow:visible;
          pointer-events:none;
        }
        .edge {
          fill:none;
          stroke:rgba(166,123,214,.38);
          stroke-width:3;
          vector-effect:non-scaling-stroke;
        }
        .edge-new { stroke:rgba(244,183,40,.58); }
        .edge-returning { stroke:rgba(167,130,218,.66); }
        .edge-pending { stroke:rgba(255,255,255,.22); stroke-dasharray:7 7; }
        .edge-open { stroke:rgba(255,255,255,.1); stroke-dasharray:5 9; }
        .referralNode {
          position:absolute;
          z-index:2;
          transform:translate(-50%,-50%);
          padding:10px 11px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:4px;
          border:1px solid rgba(255,255,255,.13);
          border-radius:18px;
          background:linear-gradient(160deg,rgba(31,23,41,.98),rgba(13,10,18,.98));
          color:#f8f4e9;
          box-shadow:0 12px 28px rgba(0,0,0,.32);
          cursor:pointer;
          transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease;
        }
        .referralNode:hover,
        .referralNode.isSelected {
          border-color:rgba(244,183,40,.62);
          box-shadow:0 0 0 3px rgba(244,183,40,.08),0 14px 34px rgba(0,0,0,.36);
        }
        .referralNode:hover { transform:translate(-50%,-50%) scale(1.035); }
        .referralNode strong {
          max-width:100%;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-size:.78rem;
          letter-spacing:-.02em;
        }
        .referralNode small {
          color:#91899a;
          font-size:.61rem;
          font-weight:750;
        }
        .nodeStatus {
          color:#f4b728;
          font-size:.58rem;
          font-weight:950;
          letter-spacing:.055em;
          text-transform:uppercase;
        }
        .node-root {
          border-color:rgba(244,183,40,.6);
          background:linear-gradient(150deg,rgba(244,183,40,.2),rgba(70,38,94,.85));
          box-shadow:0 0 42px rgba(244,183,40,.12),0 14px 34px rgba(0,0,0,.38);
        }
        .node-returning .nodeStatus { color:#c6a5ee; }
        .node-pending { opacity:.78; }
        .node-pending .nodeStatus { color:#b8b0be; }
        .node-open {
          border-style:dashed;
          border-color:rgba(244,183,40,.22);
          background:rgba(244,183,40,.035);
          color:#8f7b48;
          box-shadow:none;
        }
        .node-open:hover {
          color:#f4c85a;
          border-color:rgba(244,183,40,.52);
          background:rgba(244,183,40,.075);
        }
        .selectedNodeCard {
          position:absolute;
          z-index:6;
          left:14px;
          bottom:14px;
          min-width:168px;
          max-width:calc(100% - 28px);
          padding:12px 14px;
          display:grid;
          gap:3px;
          border:1px solid rgba(244,183,40,.16);
          border-radius:15px;
          background:rgba(14,10,20,.9);
          color:#f8f4e9;
          box-shadow:0 12px 34px rgba(0,0,0,.3);
          backdrop-filter:blur(12px);
          pointer-events:none;
        }
        .selectedNodeCard span {
          color:#857e8c;
          font-size:.58rem;
          font-weight:850;
          letter-spacing:.06em;
          text-transform:uppercase;
        }
        .selectedNodeCard strong { font-size:.76rem; }
        .selectedNodeCard em {
          color:#f4c85a;
          font-size:.64rem;
          font-style:normal;
          font-weight:900;
        }
        .selectedNodeCard small {
          color:#938c99;
          font-size:.62rem;
          font-weight:700;
        }
        @media (max-width:600px) {
          .infiniteReferralToolbar {
            min-height:52px;
            padding:8px 9px 8px 12px;
          }
          .infiniteReferralToolbar > span { display:none; }
          .infiniteReferralToolbar > div { margin-left:auto; }
          .infiniteReferralViewport {
            height:62vh;
            min-height:430px;
          }
          .referralNode { border-radius:16px; }
        }
      `}</style>
    </div>
  );
}
