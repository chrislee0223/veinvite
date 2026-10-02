'use client';

import {
  PublicNetworkInviteSlotEdges,
  PublicNetworkInviteSlotNodes,
} from '@/components/PublicNetworkInviteSlots';
import type {
  PublicInviteSlotVisual,
} from '@/lib/networkPublicOwnerLayoutView';

const SLOT_PROBE: PublicInviteSlotVisual[] = [
  { slot: 1, state: 'AVAILABLE', x: 112, y: 228 },
  { slot: 2, state: 'IN_PROGRESS', x: 248, y: 228 },
];

function straightEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export default function QaNetworkSlotVisualPage() {
  return (
    <main
      data-qa-slot-visual="ready"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        boxSizing: 'border-box',
        background: '#080807',
        color: '#f8f6ef',
      }}
    >
      <section
        aria-label="Public Network invite slot visual QA"
        style={{
          position: 'relative',
          width: 360,
          height: 320,
          overflow: 'visible',
          border: '1px solid rgba(255,205,80,.08)',
          borderRadius: 18,
          background: '#090907',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 180,
            top: 128,
            width: 74,
            height: 74,
            transform: 'translate(-50%,-50%)',
            border: '1px solid rgba(244,183,40,.42)',
            borderRadius: '50%',
            background: '#0d0d0b',
          }}
        />
        <div
          data-qa-slot-overlap-blocker="true"
          aria-hidden="true"
          style={{
            position: 'absolute',
            zIndex: 7,
            left: 112,
            top: 228,
            width: 86,
            height: 58,
            transform: 'translate(-50%,-50%)',
            borderRadius: 14,
            background: 'rgba(80,80,80,.92)',
          }}
        />
        <svg
          width="360"
          height="320"
          viewBox="0 0 360 320"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <PublicNetworkInviteSlotEdges
            slots={SLOT_PROBE}
            centerX={180}
            rootY={128}
            edgePath={straightEdgePath}
          />
        </svg>
        <PublicNetworkInviteSlotNodes
          slots={SLOT_PROBE}
          labels={{
            available: 'Available',
            pending: 'Pending',
            inProgress: 'In progress',
          }}
        />
      </section>
    </main>
  );
}
