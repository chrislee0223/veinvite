'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { InviteeClient } from '@/components/InviteeClient';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';
import {
  LANGUAGE_STORAGE_KEY,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type { InviteRecord, InviteStatus } from '@/lib/types';

export type QaLegacyInviteStateId =
  | 'LEG-LANGUAGE-SETUP'
  | 'LEG-LANDING'
  | 'LEG-WALLET-REQUIRED'
  | 'LEG-ELIGIBILITY-CHECKING'
  | 'LEG-UNDER-REVIEW'
  | 'LEG-SUCCESS-NEW'
  | 'LEG-SUCCESS-RETURNING'
  | 'LEG-MISSION-0-3'
  | 'LEG-MISSION-1-3'
  | 'LEG-MISSION-2-3'
  | 'LEG-MISSION-3-3'
  | 'LEG-VOT3-LOCKED'
  | 'LEG-VOT3-READY'
  | 'LEG-VOT3-DONE'
  | 'LEG-VOTE-LOCKED'
  | 'LEG-VOTE-READY'
  | 'LEG-ALL-MISSIONS-DONE'
  | 'LEG-COMPLETED-INCOMPLETE'
  | 'LEG-ERROR-INVALID'
  | 'LEG-ERROR-USED'
  | 'LEG-ERROR-EXISTING'
  | 'LEG-ERROR-SELF'
  | 'LEG-ERROR-ALREADY-REFERRED'
  | 'LEG-ERROR-ELIGIBILITY';

type LegacyProgress = {
  appsCompleted: number;
  appsRequired: number;
  rewardsReceived: number;
  vot3Converted: boolean;
  vot3MinimumAmountWei: string;
  vot3ConversionAmountWei: string | null;
  voteCompleted: boolean;
  uniqueAppIds: string[];
  activationBlock: number | null;
  latestBlock: number | null;
};

type AutoAction = 'open-wallet' | 'claim' | null;
type ClaimMode =
  | 'pending'
  | 'success-new'
  | 'success-returning'
  | 'used'
  | 'self'
  | 'already-referred'
  | null;

type InitialFailure = 'invalid' | 'existing' | 'eligibility' | null;

type LegacyFixture = {
  wallet: string | null;
  savedLanguage: boolean;
  invite: InviteRecord;
  progress: LegacyProgress;
  autoAction: AutoAction;
  claimMode: ClaimMode;
  initialFailure: InitialFailure;
};

const CODE = 'QALEGACY01';
const QA_INVITER = '0x0000000000000000000000000000000000000a11';
const QA_INVITEE = '0x0000000000000000000000000000000000000b01';
const QA_NOW = '2026-09-06T05:00:00.000Z';

function progress(overrides: Partial<LegacyProgress> = {}): LegacyProgress {
  return {
    appsCompleted: 0,
    appsRequired: 3,
    rewardsReceived: 0,
    vot3Converted: false,
    vot3MinimumAmountWei: '1',
    vot3ConversionAmountWei: null,
    voteCompleted: false,
    uniqueAppIds: [],
    activationBlock: 22000000,
    latestBlock: 22000100,
    ...overrides,
  };
}

function invite(
  status: InviteStatus = 'PENDING_ACCEPTANCE',
  overrides: Partial<InviteRecord> = {},
): InviteRecord {
  return {
    code: CODE,
    inviterAddress: QA_INVITER,
    status,
    createdAt: QA_NOW,
    updatedAt: QA_NOW,
    rewardEligibility: status === 'COMPLETED' ? 'PAID' : 'NONE',
    sybilStatus: 'CLEAR',
    ...overrides,
  };
}

function activeInvite(status: InviteStatus = 'ACTIVATING'): InviteRecord {
  return invite(status, {
    inviteeAddress: QA_INVITEE,
    rewardEligibility: status === 'COMPLETED' ? 'PAID' : 'NONE',
  });
}

function fixtureForState(stateId: QaLegacyInviteStateId): LegacyFixture {
  const base: LegacyFixture = {
    wallet: null,
    savedLanguage: true,
    invite: invite(),
    progress: progress(),
    autoAction: null,
    claimMode: null,
    initialFailure: null,
  };

  switch (stateId) {
    case 'LEG-LANGUAGE-SETUP':
      return { ...base, savedLanguage: false };
    case 'LEG-LANDING':
      return base;
    case 'LEG-WALLET-REQUIRED':
      return { ...base, autoAction: 'open-wallet' };
    case 'LEG-ELIGIBILITY-CHECKING':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'pending',
      };
    case 'LEG-UNDER-REVIEW':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite('UNDER_REVIEW'),
      };
    case 'LEG-SUCCESS-NEW':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'success-new',
      };
    case 'LEG-SUCCESS-RETURNING':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'success-returning',
      };
    case 'LEG-MISSION-0-3':
    case 'LEG-VOT3-LOCKED':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite(),
        progress: progress(),
      };
    case 'LEG-MISSION-1-3':
    case 'LEG-VOT3-READY':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite(),
        progress: progress({ appsCompleted: 1, rewardsReceived: 1, uniqueAppIds: ['qa-app-1'] }),
      };
    case 'LEG-MISSION-2-3':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite(),
        progress: progress({ appsCompleted: 2, rewardsReceived: 2, uniqueAppIds: ['qa-app-1', 'qa-app-2'] }),
      };
    case 'LEG-MISSION-3-3':
    case 'LEG-VOTE-LOCKED':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite(),
        progress: progress({
          appsCompleted: 3,
          rewardsReceived: 3,
          uniqueAppIds: ['qa-app-1', 'qa-app-2', 'qa-app-3'],
        }),
      };
    case 'LEG-VOT3-DONE':
    case 'LEG-VOTE-READY':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite(),
        progress: progress({
          appsCompleted: 3,
          rewardsReceived: 3,
          uniqueAppIds: ['qa-app-1', 'qa-app-2', 'qa-app-3'],
          vot3Converted: true,
          vot3ConversionAmountWei: '1000000000000000000',
        }),
      };
    case 'LEG-ALL-MISSIONS-DONE':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite('COMPLETED'),
        progress: progress({
          appsCompleted: 3,
          rewardsReceived: 3,
          uniqueAppIds: ['qa-app-1', 'qa-app-2', 'qa-app-3'],
          vot3Converted: true,
          vot3ConversionAmountWei: '1000000000000000000',
          voteCompleted: true,
        }),
      };
    case 'LEG-COMPLETED-INCOMPLETE':
      return {
        ...base,
        wallet: QA_INVITEE,
        invite: activeInvite('COMPLETED'),
        progress: progress({ appsCompleted: 1, rewardsReceived: 1, uniqueAppIds: ['qa-app-1'] }),
      };
    case 'LEG-ERROR-INVALID':
      return { ...base, initialFailure: 'invalid' };
    case 'LEG-ERROR-USED':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'used',
      };
    case 'LEG-ERROR-EXISTING':
      return { ...base, initialFailure: 'existing' };
    case 'LEG-ERROR-SELF':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'self',
      };
    case 'LEG-ERROR-ALREADY-REFERRED':
      return {
        ...base,
        wallet: QA_INVITEE,
        autoAction: 'claim',
        claimMode: 'already-referred',
      };
    case 'LEG-ERROR-ELIGIBILITY':
      return { ...base, initialFailure: 'eligibility' };
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pendingResponse(): Promise<Response> {
  return new Promise<Response>(() => {});
}

function initialResponse(fixture: LegacyFixture): Response {
  if (fixture.initialFailure === 'invalid') {
    return jsonResponse({ outcome: 'not_found' }, 404);
  }
  if (fixture.initialFailure === 'existing') {
    return jsonResponse({ outcome: 'active_existing_user' }, 409);
  }
  if (fixture.initialFailure === 'eligibility') {
    return jsonResponse({ outcome: 'eligibility_check_failed' }, 503);
  }
  return jsonResponse({ invite: fixture.invite, progress: fixture.progress });
}

function claimResponse(fixture: LegacyFixture): Response | Promise<Response> {
  if (fixture.claimMode === 'pending') return pendingResponse();
  if (fixture.claimMode === 'used') {
    return jsonResponse({ outcome: 'already_used' }, 409);
  }
  if (fixture.claimMode === 'self') {
    return jsonResponse({ outcome: 'self_referral' }, 422);
  }
  if (fixture.claimMode === 'already-referred') {
    return jsonResponse({ outcome: 'already_referred' }, 422);
  }

  const returning = fixture.claimMode === 'success-returning';
  const accepted = activeInvite();
  return jsonResponse({
    invite: accepted,
    progress: progress(),
    entryClass: returning ? 'returning_user' : 'new_user',
    outcome: 'eligible',
  });
}

function createQaFetch(
  fixture: LegacyFixture,
  originalFetch: typeof window.fetch,
): typeof window.fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl, window.location.origin);

    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    if (url.pathname === `/api/invites/${CODE}/claim`) {
      return claimResponse(fixture);
    }

    if (url.pathname === `/api/invites/${CODE}`) {
      return initialResponse(fixture);
    }

    return jsonResponse({ error: 'QA legacy invite harness blocked an unmocked application API request.' }, 503);
  };
}

export function QaLegacyInviteStateHarness({
  stateId,
  locale,
}: {
  stateId: QaLegacyInviteStateId;
  locale: SupportedLocale;
}) {
  const fixture = useMemo(() => fixtureForState(stateId), [stateId]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [installed, setInstalled] = useState(false);

  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    const previousLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const previousDocumentLanguage = document.documentElement.lang;

    window.fetch = createQaFetch(fixture, originalFetch);
    document.documentElement.lang = locale;
    if (fixture.savedLanguage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    } else {
      window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    }
    setInstalled(true);

    return () => {
      window.fetch = originalFetch;
      document.documentElement.lang = previousDocumentLanguage;
      if (previousLocale === null) {
        window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, previousLocale);
      }
    };
  }, [fixture, locale]);

  useEffect(() => {
    if (!installed || !fixture.autoAction) return;

    let cancelled = false;
    let requestId = 0;
    let frame = 0;

    const attempt = () => {
      if (cancelled) return;
      const selector = fixture.autoAction === 'open-wallet' ? '.startButton' : '.walletLink';
      const button = rootRef.current?.querySelector<HTMLButtonElement>(selector);
      if (button && !button.disabled) {
        button.click();
        return;
      }
      frame += 1;
      if (frame < 180) requestId = window.requestAnimationFrame(attempt);
    };

    requestId = window.requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(requestId);
    };
  }, [fixture, installed]);

  if (!installed) return null;

  return (
    <div ref={rootRef} data-qa-legacy-state={stateId}>
      <QaWalletLauncherOverrideProvider
        value={{
          wallet: fixture.wallet,
          isWalletModalOpen: false,
          isWalletActionPending: false,
        }}
      >
        <InviteeClient code={CODE} />
      </QaWalletLauncherOverrideProvider>
    </div>
  );
}
