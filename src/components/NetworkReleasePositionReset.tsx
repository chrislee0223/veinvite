'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type Point = { x: number; y: number };
type NodeOffsetStore = Record<string, Point>;

const NODE_POSITION_PREFIX = 'veinvite-network-release-node-positions-v1:';

function keyWallet(value: string) {
  return value.toLowerCase();
}

function validWallet(value: string) {
  return /^0x[0-9a-f]{40}$/.test(value);
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readOffsets(storageKey: string): NodeOffsetStore {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as NodeOffsetStore
      : {};
  } catch {
    return {};
  }
}

export function NetworkReleasePositionReset({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { wallet } = useWalletLauncher();
  const walletKey = wallet ? keyWallet(wallet) : '';
  const copy = NETWORK_CANARY_UI_COPY[locale as SupportedLocale] ?? NETWORK_CANARY_UI_COPY.en;
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef('');
  const [hasMovedNodes, setHasMovedNodes] = useState(false);

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    let frame = 0;

    const sync = () => {
      frame = 0;
      const center = boundary.querySelector<HTMLElement>('.releaseCenter[data-release-wallet]');
      const focus = center?.dataset.releaseWallet ? keyWallet(center.dataset.releaseWallet) : '';
      focusRef.current = validWallet(focus) ? focus : '';

      const moved = Array.from(boundary.querySelectorAll<HTMLElement>('.releasePerson[data-release-wallet]')).some((node) => {
        const x = parsePx(node.style.getPropertyValue('--release-node-offset-x'));
        const y = parsePx(node.style.getPropertyValue('--release-node-offset-y'));
        return Math.abs(x) > .01 || Math.abs(y) > .01;
      });
      setHasMovedNodes((current) => current === moved ? current : moved);
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
      attributeFilter: ['style', 'data-release-wallet'],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const resetCurrentFocus = () => {
    const focus = focusRef.current;
    if (!walletKey || !validWallet(focus)) return;
    const storageKey = `${NODE_POSITION_PREFIX}${walletKey}`;
    const prefix = `${focus}|`;
    const current = readOffsets(storageKey);
    let changed = false;

    Object.keys(current).forEach((key) => {
      if (!key.startsWith(prefix)) return;
      delete current[key];
      changed = true;
    });
    if (!changed) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {
      return;
    }

    // Rehydrate the release interaction layer from the saved source of truth.
    // Reset is rare and explicit, so a deterministic reload is safer than
    // leaving an in-memory offset that could later overwrite the cleared store.
    window.location.reload();
  };

  return (
    <div ref={boundaryRef} className="networkReleasePositionResetBoundary">
      {children}
      {hasMovedNodes ? (
        <button
          type="button"
          className="releasePositionReset"
          data-release-interactive="true"
          onClick={resetCurrentFocus}
        >
          {copy.reset}
        </button>
      ) : null}
      <style jsx>{`
        .networkReleasePositionResetBoundary { width: 100%; min-width: 0; position: relative; }
        .releasePositionReset {
          position: absolute;
          z-index: 44;
          left: 10px;
          bottom: 10px;
          min-height: 30px;
          padding: 0 9px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 9px;
          background: rgba(15,15,13,.9);
          color: #8f887c;
          font: inherit;
          font-size: .44rem;
          font-weight: 850;
          cursor: pointer;
          backdrop-filter: blur(10px);
        }
        .releasePositionReset:hover { border-color: rgba(244,183,40,.25); color: #c5a34e; }
      `}</style>
    </div>
  );
}
