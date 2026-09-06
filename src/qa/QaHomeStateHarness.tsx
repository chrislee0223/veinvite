'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Brand } from '@/components/Brand';
import { HomeClient } from '@/components/HomeClient';
import {
  QaWalletLauncherOverrideProvider,
} from '@/components/WalletControl';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { ReferralLinkRecord } from '@/lib/referralLinks';
import type { InviteRecord } from '@/lib/types';

export type QaHomeStateId =
  | 'HOME-NO-WALLET'
  | 'HOME-WALLET-MODAL-PENDING'
  | 'HOME-STARTUP-LOADING'
  | 'HOME-LINK-SKELETON'
  | 'HOME-LINK-ERROR'
  | 'HOME-SLOTS-SKELETON'
  | 'HOME-SLOTS-EMPTY'
  | 'HOME-SLOT-PENDING'
  | 'HOME-SLOT-ACTIVATING'
  | 'HOME-SLOT-REVIEW'
  | 'HOME-SLOT-COMPLETED'
  | 'HOME-SLOTS-FULL'
  | 'HOME-CANCEL-CONFIRM'
  | 'REWARD-AWAITING-CLAIM'
  | 'REWARD-CLAIM-PENDING'
  | 'REWARD-CLAIM-QUEUED';

type AutoAction = 'open-cancel' | 'start-reward-claim';

type QaHomeFixture = {
  wallet: string | null;
  isWalletModalOpen?: boolean;
  invites: InviteRecord[];
  referralLink: ReferralLinkRecord | null;
  holdHomeLoad?: boolean;
  referralLinkFailure?: boolean;
  cacheReferralBeforeMount?: boolean;
  rewardClaimMode?: 'success' | 'pending';
  autoAction?: AutoAction;
};

const QA_INVITER =
  '0x0000000000000000000000000000000000000a11';
const QA_INVITEE_A =
  '0x0000000000000000000000000000000000000b01';
const QA_INVITEE_B =
  '0x0000000000000000000000000000000000000b02';
const QA_NOW = '2026-09-06T00:00:00.000Z';
const QA_REWARD_WEI = '262970000000000000000';
const QA_REFERRAL_LINK: ReferralLinkRecord = {
  key: 'QA_HOME_STATE_REFERRAL_01',
  createdAt: QA_NOW,
  slotsAvailable: 2,
};

function invite(
  overrides: Partial<InviteRecord> & Pick<InviteRecord, 'code' | 'status'>,
): InviteRecord {
  return {
    code: overrides.code,
    inviterAddress: QA_INVITER,
    status: overrides.status,
    createdAt: QA_NOW,
    updatedAt: QA_NOW,
    rewardEligibility: 'NONE',
    sybilStatus: 'CLEAR',
    ...overrides,
  };
}

function legacyWaitingInvite(): InviteRecord {
  return invite({
    code: 'QALEGACY01',
    status: 'PENDING_ACCEPTANCE',
    inviteSlot: 1,
  });
}

function activatingInvite(
  slot: 1 | 2 = 1,
  wallet = QA_INVITEE_A,
): InviteRecord {
  return invite({
    code: `QAACTIVE0${slot}`,
    status: 'ACTIVATING',
    inviteeAddress: wallet,
    inviteSlot: slot,
    appsCompleted: 1,
    vot3Converted: false,
    voteCompleted: false,
  });
}

function reviewInvite(): InviteRecord {
  return invite({
    code: 'QAREVIEW01',
    status: 'UNDER_REVIEW',
    inviteeAddress: QA_INVITEE_A,
    inviteSlot: 1,
    appsCompleted: 3,
    vot3Converted: true,
    voteCompleted: false,
  });
}

function completedSlotInvite(): InviteRecord {
  return invite({
    code: 'QACOMPLETE01',
    status: 'COMPLETED',
    inviteeAddress: QA_INVITEE_A,
    inviteSlot: 1,
    appsCompleted: 3,
    vot3Converted: true,
    voteCompleted: true,
    rewardEligibility: 'PENDING',
  });
}

function rewardInvite(
  queueStatus: 'AWAITING_CLAIM' | 'QUEUED',
): InviteRecord {
  return invite({
    code: 'QAREWARD01',
    status: 'COMPLETED',
    inviteeAddress: QA_INVITEE_A,
    inviteSlot: 1,
    slotReleasedAt: QA_NOW,
    appsCompleted: 3,
    vot3Converted: true,
    voteCompleted: true,
    rewardEligibility: 'ELIGIBLE',
    rewardQueueStatus: queueStatus,
    rewardReservedAmountWei: QA_REWARD_WEI,
    rewardReservedAt: QA_NOW,
  });
}

function fixtureForState(stateId: QaHomeStateId): QaHomeFixture {
  const readyBase: QaHomeFixture = {
    wallet: QA_INVITER,
    invites: [],
    referralLink: QA_REFERRAL_LINK,
  };

  switch (stateId) {
    case 'HOME-NO-WALLET':
      return {
        ...readyBase,
        wallet: null,
        referralLink: null,
      };
    case 'HOME-WALLET-MODAL-PENDING':
      return {
        ...readyBase,
        wallet: null,
        referralLink: null,
        isWalletModalOpen: true,
      };
    case 'HOME-STARTUP-LOADING':
    case 'HOME-LINK-SKELETON':
      return {
        ...readyBase,
        referralLink: null,
        holdHomeLoad: true,
      };
    case 'HOME-LINK-ERROR':
      return {
        ...readyBase,
        referralLink: null,
        referralLinkFailure: true,
      };
    case 'HOME-SLOTS-SKELETON':
      return {
        ...readyBase,
        holdHomeLoad: true,
        cacheReferralBeforeMount: true,
      };
    case 'HOME-SLOTS-EMPTY':
      return readyBase;
    case 'HOME-SLOT-PENDING':
      return {
        ...readyBase,
        invites: [legacyWaitingInvite()],
      };
    case 'HOME-SLOT-ACTIVATING':
      return {
        ...readyBase,
        invites: [activatingInvite()],
      };
    case 'HOME-SLOT-REVIEW':
      return {
        ...readyBase,
        invites: [reviewInvite()],
      };
    case 'HOME-SLOT-COMPLETED':
      return {
        ...readyBase,
        invites: [completedSlotInvite()],
      };
    case 'HOME-SLOTS-FULL':
      return {
        ...readyBase,
        invites: [
          activatingInvite(1, QA_INVITEE_A),
          activatingInvite(2, QA_INVITEE_B),
        ],
      };
    case 'HOME-CANCEL-CONFIRM':
      return {
        ...readyBase,
        invites: [legacyWaitingInvite()],
        autoAction: 'open-cancel',
      };
    case 'REWARD-AWAITING-CLAIM':
      return {
        ...readyBase,
        invites: [rewardInvite('AWAITING_CLAIM')],
      };
    case 'REWARD-CLAIM-PENDING':
      return {
        ...readyBase,
        invites: [rewardInvite('AWAITING_CLAIM')],
        rewardClaimMode: 'pending',
        autoAction: 'start-reward-claim',
      };
    case 'REWARD-CLAIM-QUEUED':
      return {
        ...readyBase,
        invites: [rewardInvite('QUEUED')],
      };
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function pendingResponse(): Promise<Response> {
  return new Promise<Response>(() => {});
}

function createQaFetch(
  fixture: QaHomeFixture,
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

    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith('/api/')
    ) {
      return originalFetch(input, init);
    }

    if (url.pathname === '/api/invites') {
      if (fixture.holdHomeLoad) {
        return pendingResponse();
      }
      return jsonResponse({ invites: fixture.invites });
    }

    if (url.pathname === '/api/referral-links') {
      if (fixture.holdHomeLoad) {
        return pendingResponse();
      }
      if (fixture.referralLinkFailure) {
        return jsonResponse(
          { error: 'QA referral-link failure.' },
          500,
        );
      }
      return jsonResponse({
        referralLink: fixture.referralLink ?? QA_REFERRAL_LINK,
      });
    }

    if (url.pathname === '/api/notifications') {
      return jsonResponse({
        notification: null,
        notifications: [],
        unreadCount: 0,
      });
    }

    if (url.pathname === '/api/notifications/history') {
      return jsonResponse({
        items: [],
        unreadCount: 0,
        nextCursor: null,
      });
    }

    if (url.pathname === '/api/rewards/claims') {
      if (fixture.rewardClaimMode === 'pending') {
        return pendingResponse();
      }
      return jsonResponse({ queued: true });
    }

    if (
      /^\/api\/invites\/[^/]+$/.test(url.pathname) ||
      /^\/api\/invites\/[^/]+\/cancel$/.test(url.pathname)
    ) {
      return jsonResponse({ ok: true });
    }

    return jsonResponse(
      {
        error:
          'QA Home harness blocked an unmocked application API request.',
      },
      503,
    );
  };
}

function referralCacheKey(wallet: string): string {
  return `veinvite_referral_link_v1:${wallet.toLowerCase()}`;
}

export function QaHomeStateHarness({
  stateId,
  locale,
}: {
  stateId: QaHomeStateId;
  locale: SupportedLocale;
}) {
  const fixture = useMemo(
    () => fixtureForState(stateId),
    [stateId],
  );
  const [installed, setInstalled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const previousLanguage = document.documentElement.lang;
    const cacheKey = fixture.wallet
      ? referralCacheKey(fixture.wallet)
      : null;
    const previousCache = cacheKey
      ? window.sessionStorage.getItem(cacheKey)
      : null;

    window.fetch = createQaFetch(
      fixture,
      originalFetch,
    );
    document.documentElement.lang = locale;

    if (
      cacheKey &&
      fixture.cacheReferralBeforeMount &&
      fixture.referralLink
    ) {
      window.sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          key: fixture.referralLink.key,
          createdAt: fixture.referralLink.createdAt,
        }),
      );
    } else if (cacheKey) {
      window.sessionStorage.removeItem(cacheKey);
    }

    setInstalled(true);

    return () => {
      window.fetch = originalFetch;
      document.documentElement.lang = previousLanguage;
      if (cacheKey) {
        if (previousCache === null) {
          window.sessionStorage.removeItem(cacheKey);
        } else {
          window.sessionStorage.setItem(
            cacheKey,
            previousCache,
          );
        }
      }
    };
  }, [fixture, locale]);

  useEffect(() => {
    if (!installed || !fixture.autoAction) return;

    let frame = 0;
    let cancelled = false;
    let requestId = 0;

    const attempt = () => {
      if (cancelled) return;

      const selector =
        fixture.autoAction === 'open-cancel'
          ? '.friendSlot.legacy .danger'
          : '.claimButton';
      const button =
        rootRef.current?.querySelector<HTMLButtonElement>(
          selector,
        );

      if (button && !button.disabled) {
        button.click();
        return;
      }

      frame += 1;
      if (frame < 120) {
        requestId = window.requestAnimationFrame(attempt);
      }
    };

    requestId = window.requestAnimationFrame(attempt);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(requestId);
    };
  }, [fixture, installed]);

  if (!installed) {
    return (
      <main
        aria-hidden="true"
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
        }}
      >
        <Brand compact />
      </main>
    );
  }

  return (
    <div ref={rootRef} data-qa-home-state={stateId}>
      <QaWalletLauncherOverrideProvider
        value={{
          wallet: fixture.wallet,
          isWalletModalOpen:
            fixture.isWalletModalOpen ?? false,
          isWalletActionPending: false,
        }}
      >
        <HomeClient />
      </QaWalletLauncherOverrideProvider>
    </div>
  );
}
