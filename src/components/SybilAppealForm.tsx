'use client';

import { useEffect, useRef, useState } from 'react';

import { sybilAppealCopy } from '@/lib/i18n/sybilAppealCopy';
import { isLocale, type Locale } from '@/lib/i18n/locales';

type AppealCategory =
  | 'DISTINCT_PERSON_SHARED_DEVICE'
  | 'INCORRECT_IDENTITY_LINK'
  | 'MISSING_ACTIVITY'
  | 'OTHER';
type FormState = 'idle' | 'sending' | 'submitted' | 'duplicate' | 'failed';

export function SybilAppealForm({
  walletAddress,
  locale,
}: {
  walletAddress: string;
  locale: Locale;
}) {
  const copy = sybilAppealCopy(isLocale(locale) ? locale : 'en');
  const [category, setCategory] = useState<AppealCategory>(
    'DISTINCT_PERSON_SHARED_DEVICE',
  );
  const [explanation, setExplanation] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, []);

  async function submitAppeal() {
    if (state === 'sending' || state === 'submitted' ||
        state === 'duplicate' || !/^0x[0-9a-f]{40}$/.test(walletAddress) ||
        explanation.trim().length < 25 ||
        explanation.trim().length > 600) {
      return;
    }

    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState('sending');
    try {
      const response = await fetch('/api/sybil/appeal', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-veinvite-appeal-intent': 'REQUEST_SYBIL_REVIEW',
          'x-veinvite-session-wallet': walletAddress,
        },
        body: JSON.stringify({ category, explanation: explanation.trim() }),
      });
      if (controller.signal.aborted) return;
      const body: unknown = await response.json();
      if (
        response.ok &&
        body && typeof body === 'object' &&
        (body as Record<string, unknown>).received === true &&
        (body as Record<string, unknown>).status === 'PENDING' &&
        (body as Record<string, unknown>).reviewOnly === true &&
        (body as Record<string, unknown>).restrictionUnchanged === true &&
        (body as Record<string, unknown>).rewardUnchanged === true
      ) {
        setExplanation('');
        setState((body as Record<string, unknown>).alreadySubmitted === true
          ? 'duplicate' : 'submitted');
      } else {
        setState('failed');
      }
    } catch {
      if (!controller.signal.aborted) setState('failed');
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  const disabled = state === 'sending' || state === 'submitted' ||
    state === 'duplicate';
  const formLabelStyle = {
    fontSize: '0.79rem',
    opacity: 0.85,
    display: 'block',
    marginBottom: '6px',
  } as const;
  const fieldStyle = {
    boxSizing: 'border-box',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.19)',
    borderRadius: '12px',
    background: 'rgba(0,0,0,0.20)',
    color: 'inherit',
    font: 'inherit',
    fontSize: '0.85rem',
    padding: '11px',
  } as const;

  return (
    <section
      data-veinvite-sybil-appeal="review-only"
      style={{
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '16px',
        display: 'grid',
        textAlign: 'start',
        gap: '12px',
        padding: '14px',
      }}
    >
      <strong>{copy.title}</strong>
      <span style={{ fontSize: '0.83rem', opacity: 0.88 }}>
        {copy.explanation}
      </span>
      {state === 'submitted' || state === 'duplicate' ? (
        <p role="status" aria-live="polite">
          {state === 'duplicate' ? copy.duplicate : copy.submitted}
        </p>
      ) : (
        <>
          <label>
            <span style={formLabelStyle}>{copy.category}</span>
            <select
              disabled={disabled}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as AppealCategory)
              }
              style={fieldStyle}
            >
              <option value="DISTINCT_PERSON_SHARED_DEVICE">{copy.sharedDevice}</option>
              <option value="INCORRECT_IDENTITY_LINK">{copy.identityLink}</option>
              <option value="MISSING_ACTIVITY">{copy.missingActivity}</option>
              <option value="OTHER">{copy.other}</option>
            </select>
          </label>
          <label>
            <span style={formLabelStyle}>{copy.details}</span>
            <textarea
              rows={4}
              maxLength={600}
              disabled={disabled}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder={copy.placeholder}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
            <span style={{ opacity: 0.65, fontSize: '0.75rem' }}>
              {explanation.trim().length}/600
            </span>
          </label>
          <button
            type="button"
            disabled={disabled || explanation.trim().length < 25}
            onClick={() => void submitAppeal()}
            style={{
              minHeight: '44px',
              borderRadius: '12px',
              border: 0,
              background: 'rgba(255,210,77,0.95)',
              color: '#17120a',
              font: 'inherit',
              fontWeight: 750,
              opacity: disabled || explanation.trim().length < 25 ? 0.55 : 1,
              cursor: disabled ? 'wait' : 'pointer',
            }}
          >
            {state === 'sending' ? copy.submitting : copy.submit}
          </button>
          {state === 'failed' ? (
            <p role="alert" style={{ fontSize: '0.78rem', color: '#ffb9c5' }}>
              {copy.failed}
            </p>
          ) : null}
        </>
      )}
      <small style={{ opacity: 0.75, lineHeight: 1.55 }}>
        {copy.note}
      </small>
    </section>
  );
}
