'use client';

import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type ReferralLinkResponse = {
  referralLink: {
    key: string;
    createdAt: string;
    slotsAvailable: number;
  } | null;
};

type Point = { x: number; y: number };

function goHomeWithoutReload() {
  const button = document.querySelector<HTMLButtonElement>('[data-veinvite-tab="home"]');
  if (button) {
    button.click();
    return;
  }
  window.location.assign('/');
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function samePoints(left: Point[], right: Point[]) {
  if (left.length !== right.length) return false;
  return left.every((point, index) => {
    const other = right[index];
    return Boolean(other) && Math.abs(point.x - other.x) < .25 && Math.abs(point.y - other.y) < .25;
  });
}

function chooseSlotPoints(count: number, occupied: Point[]): Point[] {
  if (count <= 0) return [];
  if (!occupied.length) {
    if (count === 1) return [{ x: 0, y: -126 }];
    return [{ x: -88, y: -102 }, { x: 88, y: -102 }];
  }

  const averageRadius = occupied.reduce((sum, point) => sum + Math.hypot(point.x, point.y), 0) / occupied.length;
  const radius = clamp(averageRadius, 126, 192);
  const candidates = Array.from({ length: 20 }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 20;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const chosen: Point[] = [];

  while (chosen.length < count && candidates.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    candidates.forEach((candidate, index) => {
      const blockers = [...occupied, ...chosen];
      const nearest = Math.min(...blockers.map((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y)));
      if (nearest > bestScore) {
        bestScore = nearest;
        bestIndex = index;
      }
    });
    chosen.push(candidates.splice(bestIndex, 1)[0]);
  }

  return chosen;
}

function slotPath(x: number, y: number) {
  const bend = Math.sign(x || 1) * Math.min(28, Math.abs(x) * .24);
  return `M 0 0 C ${bend} ${y * .26}, ${x - bend} ${y * .74}, ${x} ${y}`;
}

export function NetworkReleaseSlots({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { wallet } = useWalletLauncher();
  const [scene, setScene] = useState<HTMLElement | null>(null);
  const [isRoot, setIsRoot] = useState(false);
  const [slotsAvailable, setSlotsAvailable] = useState(0);
  const [occupiedPoints, setOccupiedPoints] = useState<Point[]>([]);
  const copy = NETWORK_CANARY_UI_COPY[locale as SupportedLocale] ?? NETWORK_CANARY_UI_COPY.en;

  useLayoutEffect(() => {
    const boundary = document.querySelector<HTMLElement>('.networkReleaseSlotsBoundary');
    if (!boundary) return;
    let frame = 0;

    const sync = () => {
      frame = 0;
      const nextScene = boundary.querySelector<HTMLElement>('.releaseScene');
      setScene((current) => current === nextScene ? current : nextScene);
      setIsRoot(Boolean(boundary.querySelector('.releaseCenter.root')));

      const people = Array.from(boundary.querySelectorAll<HTMLElement>('.releasePerson')).map((node) => ({
        x: parsePx(node.style.getPropertyValue('--node-x')),
        y: parsePx(node.style.getPropertyValue('--node-y')),
      }));
      const groupHubs = Array.from(boundary.querySelectorAll<HTMLElement>('.releaseGroupHub')).map((node) => ({
        x: parsePx(node.style.getPropertyValue('--group-x')),
        y: parsePx(node.style.getPropertyValue('--group-y')),
      }));
      const nextOccupied = [...people, ...groupHubs];
      setOccupiedPoints((current) => samePoints(current, nextOccupied) ? current : nextOccupied);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(boundary, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    setSlotsAvailable(0);
    if (!wallet) return;

    const controller = new AbortController();
    const address = wallet.toLowerCase();
    void fetch(`/api/referral-links?inviter=${encodeURIComponent(address)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('slot-read-failed');
        return response.json() as Promise<ReferralLinkResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const count = payload.referralLink?.slotsAvailable;
        setSlotsAvailable(Number.isFinite(count) ? Math.max(0, Math.min(2, Math.trunc(count!))) : 0);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSlotsAvailable(0);
      });

    return () => controller.abort();
  }, [wallet]);

  const slotCount = isRoot ? slotsAvailable : 0;
  const slotPoints = useMemo(
    () => chooseSlotPoints(slotCount, occupiedPoints),
    [slotCount, occupiedPoints],
  );

  return (
    <div className="networkReleaseSlotsBoundary">
      {children}
      {scene && slotPoints.length > 0 ? createPortal(
        <>
          <svg className="releaseSlotEdges" viewBox="-260 -260 520 520" aria-hidden="true">
            {slotPoints.map((point, index) => (
              <path key={index} d={slotPath(point.x, point.y)} />
            ))}
          </svg>
          {slotPoints.map((point, index) => (
            <button
              key={index}
              type="button"
              className="releaseInviteSlot"
              style={{ '--release-slot-x': `${point.x}px`, '--release-slot-y': `${point.y}px` } as React.CSSProperties}
              data-release-interactive="true"
              onClick={goHomeWithoutReload}
              aria-label={copy.available}
            >
              <span aria-hidden="true">＋</span>
              <b>{copy.available}</b>
            </button>
          ))}
        </>,
        scene,
      ) : null}
      <style jsx global>{`
        .networkReleaseSlotsBoundary { width: 100%; min-width: 0; }
        .releaseScene > .releaseSlotEdges {
          position: absolute;
          z-index: 2;
          left: -260px;
          top: -260px;
          width: 520px;
          height: 520px;
          overflow: visible;
          pointer-events: none;
        }
        .releaseScene > .releaseSlotEdges path {
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke: rgba(239, 198, 76, .42);
          stroke-width: 1.15;
          stroke-linecap: round;
          stroke-dasharray: 4 12;
          animation: releaseSlotFlow 1.9s linear infinite;
          filter: drop-shadow(0 0 3px rgba(239, 198, 76, .18));
        }
        .releaseScene > .releaseInviteSlot {
          position: absolute;
          z-index: 7;
          left: var(--release-slot-x);
          top: var(--release-slot-y);
          width: 54px;
          min-height: 58px;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transform: translate(-50%, -50%);
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }
        .releaseScene > .releaseInviteSlot > span {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px dashed rgba(239, 198, 76, .42);
          border-radius: 50%;
          background: rgba(239, 198, 76, .035);
          color: rgba(239, 198, 76, .72);
          font-size: .76rem;
          font-weight: 700;
          box-shadow: 0 0 0 0 rgba(239, 198, 76, .14);
          animation: releaseSlotPulse 2.2s ease-in-out infinite;
        }
        .releaseScene > .releaseInviteSlot > b {
          max-width: 74px;
          color: #86764d;
          font-size: .41rem;
          font-weight: 850;
          line-height: 1.15;
          text-align: center;
          white-space: nowrap;
        }
        @keyframes releaseSlotFlow {
          to { stroke-dashoffset: -32; }
        }
        @keyframes releaseSlotPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 198, 76, .08); }
          50% { box-shadow: 0 0 0 6px rgba(239, 198, 76, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .releaseScene > .releaseSlotEdges path,
          .releaseScene > .releaseInviteSlot > span { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
