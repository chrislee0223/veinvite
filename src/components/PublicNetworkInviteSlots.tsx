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
    <>
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
    </>
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
    </>
  );
}
