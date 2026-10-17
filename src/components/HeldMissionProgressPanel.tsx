'use client';

import { useEffect, useState } from 'react';

import {
  HELD_MISSION_PROGRESS_COPY,
} from '@/lib/i18n/heldMissionProgressCopy';
import { isLocale, type Locale } from '@/lib/i18n/locales';

type MissionProgress = {
  appsCompleted: number;
  rewardsReceived: number;
  vot3Converted: boolean;
  voteCompleted: boolean;
};
type ProgressState =
  | { status: 'loading'; progress: null }
  | { status: 'unavailable' | 'failed'; progress: null }
  | { status: 'ready'; progress: MissionProgress };

function validProgress(value: unknown): value is MissionProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<MissionProgress>;
  return (
    typeof progress.appsCompleted === 'number' &&
    Number.isSafeInteger(progress.appsCompleted) &&
    progress.appsCompleted >= 0 &&
    progress.appsCompleted <= 3 &&
    typeof progress.rewardsReceived === 'number' &&
    Number.isSafeInteger(progress.rewardsReceived) &&
    progress.rewardsReceived >= 0 &&
    progress.rewardsReceived <= 3 &&
    typeof progress.vot3Converted === 'boolean' &&
    typeof progress.voteCompleted === 'boolean'
  );
}

/**
 * Never renders a wallet address, invite code, Sybil detector signal or an
 * action that can authorize claims/rewards. The outer wallet verification gate
 * mounts this only for the matching active PRE_CLAIM_HOLD wallet.
 */
export function HeldMissionProgressPanel({
  walletAddress,
  locale,
}: {
  walletAddress: string;
  locale: Locale;
}) {
  const copy = HELD_MISSION_PROGRESS_COPY[
    isLocale(locale) ? locale : 'en'
  ];
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<ProgressState>({
    status: 'loading',
    progress: null,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: 'loading', progress: null });

    async function readProgress() {
      try {
        const response = await fetch('/api/sybil/hold-progress', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'x-veinvite-session-wallet': walletAddress,
          },
        });
        if (cancelled) return;

        if (!response.ok) {
          setState({
            status: response.status === 401 ||
              response.status === 403 ||
              response.status === 409
              ? 'unavailable'
              : 'failed',
            progress: null,
          });
          return;
        }

        const body: unknown = await response.json();
        if (cancelled) return;

        if (
          body &&
          typeof body === 'object' &&
          (body as Record<string, unknown>).authenticated === true &&
          (body as Record<string, unknown>).progressAvailable === true &&
          (body as Record<string, unknown>).rewardBlocked === true &&
          (body as Record<string, unknown>).reviewPending === true &&
          validProgress((body as Record<string, unknown>).missionProgress)
        ) {
          setState({
            status: 'ready',
            progress: (body as { missionProgress: MissionProgress })
              .missionProgress,
          });
          return;
        }

        setState({ status: 'unavailable', progress: null });
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setState({ status: 'failed', progress: null });
        }
      }
    }

    // A changed wallet remounts this component with a new key in the parent.
    // Aborting and clearing state prevents any previous wallet's progress
    // from appearing after a provider account switch or session renewal.
    if (/^0x[0-9a-f]{40}$/.test(walletAddress)) {
      void readProgress();
    } else {
      setState({ status: 'unavailable', progress: null });
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [walletAddress, requestVersion]);

  const labelStyle = { opacity: 0.82, fontSize: '0.79rem' };
  return (
    <section
      data-veinvite-held-progress="read-only"
      aria-live="polite"
      style={{
        display: 'grid',
        gap: '12px',
        textAlign: 'start',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '16px',
        padding: '14px',
        background: 'rgba(255,255,255,0.035)',
      }}
    >
      <strong style={{ fontSize: '0.93rem' }}>{copy.title}</strong>
      {state.status === 'ready' ? (
        <div style={{ display: 'grid', gap: '9px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={labelStyle}>{copy.apps}</span>
            <strong>{state.progress.appsCompleted}/3</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={labelStyle}>{copy.receipts}</span>
            <strong>{state.progress.rewardsReceived}/3</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={labelStyle}>{copy.conversion}</span>
            <strong>{state.progress.vot3Converted ? copy.yes : copy.no}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span style={labelStyle}>{copy.vote}</span>
            <strong>{state.progress.voteCompleted ? copy.yes : copy.no}</strong>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: '0.84rem', opacity: 0.84 }}>
          {state.status === 'loading'
            ? copy.loading
            : state.status === 'failed'
              ? copy.failed
              : copy.unavailable}
        </span>
      )}
      <span style={{ fontSize: '0.78rem', opacity: 0.76, lineHeight: 1.45 }}>
        {copy.restrictionNote}
      </span>
      <button
        type="button"
        disabled={state.status === 'loading'}
        onClick={() => setRequestVersion((value) => value + 1)}
        style={{
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '12px',
          minHeight: '40px',
          background: 'rgba(255,255,255,0.05)',
          color: 'inherit',
          cursor: state.status === 'loading' ? 'wait' : 'pointer',
          font: 'inherit',
          fontSize: '0.84rem',
        }}
      >
        {copy.refresh}
      </button>
    </section>
  );
}
