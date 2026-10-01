'use client';

import type { CSSProperties } from 'react';

import type {
  PublicInviteSlotVisual,
} from '@/lib/networkPublicOwnerLayoutView';

type SlotLabels = {
  available: string;
  pending: string;
  inProgress: string;
};

export function PublicNetworkInviteSlotEdges({
  slots,
  centerX,
  rootY,
  edgePath,
}: {
  slots: PublicInviteSlotVisual[];
  centerX: number;
  rootY: number;
  edgePath: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => string;
}) {
  return (
    <g data-public-slot-edges="true">
      {slots.map((slot, index) => {
        const path = edgePath(
          centerX,
          rootY,
          slot.x,
          slot.y,
        );
        const available =
          slot.state === 'AVAILABLE';

        return (
          <g
            key={`public-slot-edge:${slot.slot}`}
            data-slot-edge-id={slot.slot}
            data-slot-edge-state={slot.state}
          >
            <path
              d={path}
              className={
                available
                  ? 'publicSlotEdgeBase'
                  : 'publicSlotEdgeProgress'
              }
            />
            {available ? (
              <path
                d={path}
                className="publicSlotEdgePulse"
                style={{
                  animationDelay:
                    `${index * -0.92}s`,
                }}
              />
            ) : null}
          </g>
        );
      })}
      <style jsx>{`
        .publicSlotEdgeBase,
        .publicSlotEdgeProgress,
        .publicSlotEdgePulse {
          fill:none;
          stroke-linecap:round;
          pointer-events:none;
          vector-effect:non-scaling-stroke;
        }
        .publicSlotEdgeBase {
          stroke:rgba(226,188,79,.62);
          stroke-width:1.05;
          opacity:.5;
        }
        .publicSlotEdgeProgress {
          stroke:rgba(210,174,65,.48);
          stroke-width:1.15;
          opacity:.72;
        }
        .publicSlotEdgePulse {
          stroke:rgba(255,210,76,.95);
          stroke-width:1.55;
          stroke-dasharray:5 38;
          opacity:.8;
          filter:drop-shadow(0 0 2px rgba(244,183,40,.28));
          animation:publicSlotFlow 2.45s linear infinite;
        }
        @keyframes publicSlotFlow {
          from { stroke-dashoffset:43; }
          to { stroke-dashoffset:0; }
        }
        @media(prefers-reduced-motion:reduce) {
          .publicSlotEdgePulse { animation:none; }
        }
      `}</style>
    </g>
  );
}

export function PublicNetworkInviteSlotNodes({
  slots,
  labels,
}: {
  slots: PublicInviteSlotVisual[];
  labels: SlotLabels;
}) {
  return (
    <>
      {slots.map((slot) => {
        const available =
          slot.state === 'AVAILABLE';
        const pendingAcceptance =
          slot.state === 'PENDING';
        const slotLabel = available
          ? labels.available
          : pendingAcceptance
            ? labels.pending
            : labels.inProgress;

        return (
          <div
            className="publicSlotNode"
            key={`public-slot-${slot.slot}`}
            data-slot-id={slot.slot}
            data-slot-state={slot.state}
            style={{
              left: slot.x,
              top: slot.y,
            } as CSSProperties}
            aria-label={slotLabel}
          >
            <span
              className="publicSlotCircle"
              aria-hidden="true"
            >
              {available
                ? '+'
                : pendingAcceptance
                  ? '…'
                  : '•'}
            </span>
            <strong>{slotLabel}</strong>
          </div>
        );
      })}
      <style jsx>{`
        .publicSlotNode {
          position:absolute;
          z-index:5;
          width:52px;
          height:52px;
          transform:translate(-50%,-50%);
          pointer-events:none;
          color:#c79f36;
        }
        .publicSlotNode::before {
          content:'';
          position:absolute;
          left:50%;
          top:50%;
          width:58px;
          height:58px;
          border-radius:50%;
          transform:translate(-50%,-50%);
          background:radial-gradient(
            circle,
            rgba(8,8,7,.92) 0 86%,
            rgba(8,8,7,.54) 91%,
            rgba(8,8,7,.15) 96%,
            rgba(8,8,7,0) 100%
          );
          z-index:0;
        }
        .publicSlotCircle {
          position:absolute;
          inset:0;
          z-index:1;
          display:grid;
          place-items:center;
          border:1px dashed rgba(226,181,62,.52);
          border-radius:50%;
          box-sizing:border-box;
          background:#0d0d0b;
          color:#c79f36;
          font-size:.9rem;
          animation:publicSlotPulse 5.6s ease-in-out infinite;
        }
        .publicSlotNode[data-slot-state="PENDING"] .publicSlotCircle,
        .publicSlotNode[data-slot-state="IN_PROGRESS"] .publicSlotCircle {
          border-style:solid;
          border-color:rgba(210,174,65,.44);
          color:#a98b46;
          animation:none;
          box-shadow:inset 0 0 0 3px rgba(244,183,40,.025);
        }
        .publicSlotNode[data-slot-state="IN_PROGRESS"] .publicSlotCircle {
          font-size:.72rem;
          color:#d0a644;
        }
        .publicSlotNode > strong {
          position:absolute;
          left:50%;
          top:calc(100% + 5px);
          z-index:2;
          width:92px;
          transform:translateX(-50%);
          overflow:hidden;
          text-overflow:ellipsis;
          color:#a98735;
          font-size:.47rem;
          font-weight:800;
          white-space:nowrap;
          text-align:center;
        }
        .publicSlotNode[data-slot-state="PENDING"] > strong,
        .publicSlotNode[data-slot-state="IN_PROGRESS"] > strong {
          color:#8f805d;
        }
        @keyframes publicSlotPulse {
          0%,100% {
            opacity:.72;
            transform:scale(.98);
          }
          50% {
            opacity:1;
            transform:scale(1.035);
          }
        }
        @media(prefers-reduced-motion:reduce) {
          .publicSlotCircle { animation:none; }
        }
      `}</style>
    </>
  );
}
