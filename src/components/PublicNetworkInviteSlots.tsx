'use client';

import type { CSSProperties } from 'react';

import type {
  PublicInviteSlotVisual,
} from '@/lib/networkPublicOwnerLayoutView';

import styles from './PublicNetworkInviteSlots.module.css';

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
              className={`${
                available
                  ? styles.edgeBase
                  : styles.edgeProgress
              } ${
                available
                  ? 'publicSlotEdgeBase'
                  : 'publicSlotEdgeProgress'
              }`}
            />
            {available ? (
              <path
                d={path}
                className={`${styles.edgePulse} publicSlotEdgePulse`}
                style={{
                  animationDelay:
                    `${index * -0.92}s`,
                }}
              />
            ) : null}
          </g>
        );
      })}
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
            className={`${styles.slotNode} publicSlotNode`}
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
              className={`${styles.slotCircle} publicSlotCircle`}
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
