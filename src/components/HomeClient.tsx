'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';

import {
  AppBottomNavigation,
  type AppTab,
} from './AppBottomNavigation';
import { Brand } from './Brand';
import { InAppInviteNotifications } from './InAppInviteNotifications';
import {
  TransientSnackbar,
  type TransientFeedback,
  type TransientFeedbackKind,
} from './TransientSnackbar';
import { useWalletLauncher } from './WalletControl';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { PROGRESS_CLAIM_COPY } from '@/lib/i18n/progressClaimCopy';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isCjkLocale,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { isReferralKey, type ReferralLinkRecord } from '@/lib/referralLinks';
import type { InviteRecord } from '@/lib/types';

const AppGuide = dynamic(() =>
  import('./AppGuide').then((module) => module.AppGuide),
);
const AppSettings = dynamic(() =>
  import('./AppSettings').then((module) => module.AppSettings),
);
const PublicLeaderboard = dynamic(() =>
  import('./PublicLeaderboard').then((module) => module.PublicLeaderboard),
);

const VERCEL_SHARE_STORAGE_KEY = 'veinvite_vercel_share';
const REFERRAL_LINK_SESSION_PREFIX = 'veinvite_referral_link_v1:';
const ACTIVE_STATUSES = new Set([
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
]);
const HOME_REFRESH_MS = 60_000;
const EVIDENCE_REFRESH_MS = 120_000;
const B3TR_DECIMALS = 18n;
const B3TR_SCALE = 10n ** B3TR_DECIMALS;

function referralLinkSessionKey(wallet: string): string {
  return `${REFERRAL_LINK_SESSION_PREFIX}${wallet.toLowerCase()}`;
}

function readCachedReferralLink(wallet: string): ReferralLinkRecord | null {
  try {
    const raw = window.sessionStorage.getItem(referralLinkSessionKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      key?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.key !== 'string' ||
      !isReferralKey(parsed.key) ||
      typeof parsed.createdAt !== 'string'
    ) {
      window.sessionStorage.removeItem(referralLinkSessionKey(wallet));
      return null;
    }
    return {
      key: parsed.key,
      createdAt: parsed.createdAt,
      slotsAvailable: 0,
    };
  } catch {
    return null;
  }
}

function writeCachedReferralLink(
  wallet: string,
  link: ReferralLinkRecord,
): void {
  try {
    window.sessionStorage.setItem(
      referralLinkSessionKey(wallet),
      JSON.stringify({ key: link.key, createdAt: link.createdAt }),
    );
  } catch {
    // Storage can be unavailable in hardened/private browser modes. The server
    // remains authoritative, so cache failure should never block the Home UI.
  }
}

function sameWallet(left: string | null, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function formatB3trWei(value: string): string {
  if (!/^\d+$/.test(value)) return '—';
  const wei = BigInt(value);
  const whole = wei / B3TR_SCALE;
  const fraction = (wei % B3TR_SCALE)
    .toString()
    .padStart(Number(B3TR_DECIMALS), '0')
    .slice(0, 2)
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function missionFlags(invite: InviteRecord): boolean[] {
  const apps = Math.max(0, Math.min(3, invite.appsCompleted ?? 0));
  return [
    apps >= 1,
    apps >= 2,
    apps >= 3,
    invite.vot3Converted === true,
    invite.voteCompleted === true,
  ];
}

function nextMissionLabel(invite: InviteRecord): string {
  const flags = missionFlags(invite);
  const next = flags.findIndex((done) => !done);
  if (next === 0) return 'dApp 1/3';
  if (next === 1) return 'dApp 2/3';
  if (next === 2) return 'dApp 3/3';
  if (next === 3) return 'VOT3';
  if (next === 4) return 'Vote';
  return '';
}

export function HomeClient() {
  const {
    wallet,
    openWallet,
    connectAnotherWallet,
    disconnectWallet,
    isWalletActionPending,
    isWalletModalOpen,
  } = useWalletLauncher();

  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [referralLink, setReferralLink] =
    useState<ReferralLinkRecord | null>(null);
  const [invitesReady, setInvitesReady] = useState(false);
  const [referralLinkVerified, setReferralLinkVerified] = useState(false);
  const [referralLinkFailed, setReferralLinkFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] =
    useState<TransientFeedback | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [vercelShareToken, setVercelShareToken] = useState('');
  const [legacyCancelTarget, setLegacyCancelTarget] =
    useState<InviteRecord | null>(null);
  const [claimPendingCode, setClaimPendingCode] =
    useState<string | null>(null);
  const feedbackIdRef = useRef(0);
  const activeWalletRef = useRef<string | null>(wallet);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelKeepRef = useRef<HTMLButtonElement | null>(null);

  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];
  const progressCopy = PROGRESS_CLAIM_COPY[locale];

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const showFeedback = useCallback((
    kind: TransientFeedbackKind,
    text: string,
  ) => {
    feedbackIdRef.current += 1;
    setFeedback({ id: feedbackIdRef.current, kind, text });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const initialLocale = isLocale(saved)
      ? saved
      : resolveBrowserLocale(window.navigator.languages, 'en');

    setLocale(initialLocale);
    document.documentElement.lang = initialLocale;

    const handleLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
    return () => window.removeEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = searchParams.get('_vercel_share');
    const storedToken = window.sessionStorage.getItem(
      VERCEL_SHARE_STORAGE_KEY,
    );
    const token = tokenFromUrl ?? storedToken ?? '';
    if (!token) return;
    window.sessionStorage.setItem(VERCEL_SHARE_STORAGE_KEY, token);
    setVercelShareToken(token);
  }, []);

  useEffect(() => {
    activeWalletRef.current = wallet;
    setInvites([]);
    setInvitesReady(false);
    setReferralLinkVerified(false);
    setReferralLinkFailed(false);
    setReferralLink(wallet ? readCachedReferralLink(wallet) : null);
  }, [wallet]);

  const changeLocale = (nextLocale: SupportedLocale) => {
    clearFeedback();
    setLocale(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(
      new CustomEvent('veinvite-language-change', {
        detail: nextLocale,
      }),
    );
  };

  const changeTab = (nextTab: AppTab) => {
    clearFeedback();
    setActiveTab(nextTab);
    setLegacyCancelTarget(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const load = useCallback(async (quiet = false) => {
    if (!wallet) return;
    const requestWallet = wallet;

    try {
      const [inviteResult, linkResult] = await Promise.allSettled([
        fetch(
          `/api/invites?inviter=${encodeURIComponent(requestWallet)}`,
          { cache: 'no-store' },
        ),
        fetch('/api/referral-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: requestWallet }),
        }),
      ]);

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

      if (inviteResult.status === 'rejected') {
        if (!quiet) {
          setInvitesReady(false);
          showFeedback('error', t.loadError);
        }
      } else {
        try {
          const inviteResponse = inviteResult.value;
          const inviteData = (await inviteResponse.json()) as {
            invites?: InviteRecord[];
            error?: string;
          };
          if (!inviteResponse.ok) {
            throw new Error(inviteData.error ?? t.loadError);
          }
          if (!sameWallet(activeWalletRef.current, requestWallet)) return;
          setInvites(inviteData.invites ?? []);
          setInvitesReady(true);
        } catch (error) {
          if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
            setInvitesReady(false);
            showFeedback(
              'error',
              error instanceof Error ? error.message : t.loadError,
            );
          }
        }
      }

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

      if (linkResult.status === 'rejected') {
        if (!quiet) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback('error', t.createError);
        }
        return;
      }

      try {
        const linkResponse = linkResult.value;
        const linkData = (await linkResponse.json()) as {
          referralLink?: ReferralLinkRecord | null;
          error?: string;
        };
        if (!linkResponse.ok || !linkData.referralLink) {
          throw new Error(linkData.error ?? t.createError);
        }
        if (!sameWallet(activeWalletRef.current, requestWallet)) return;

        setReferralLink(linkData.referralLink);
        setReferralLinkVerified(true);
        setReferralLinkFailed(false);
        writeCachedReferralLink(requestWallet, linkData.referralLink);
      } catch (error) {
        if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback(
            'error',
            error instanceof Error ? error.message : t.createError,
          );
        }
      }
    } catch (error) {
      if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
        setReferralLinkVerified(false);
        setReferralLinkFailed(true);
        showFeedback(
          'error',
          error instanceof Error ? error.message : t.genericError,
        );
      }
    }
  }, [wallet, t.loadError, t.createError, t.genericError, showFeedback]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!wallet) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void load(true);
      }
    };

    const timer = window.setInterval(
      refreshIfVisible,
      HOME_REFRESH_MS,
    );
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [wallet, load]);

  const slotOccupyingInvites = useMemo(
    () => invites
      .filter((invite) => {
        if (invite.sybilStatus === 'BLOCKED') return false;
        if (ACTIVE_STATUSES.has(invite.status)) return true;
        return (
          invite.status === 'COMPLETED' &&
          !invite.slotReleasedAt
        );
      })
      .sort((a, b) =>
        (a.inviteSlot ?? 1) - (b.inviteSlot ?? 1) ||
        b.createdAt.localeCompare(a.createdAt),
      ),
    [invites],
  );

  const slotInvites = useMemo(() => {
    const slots = new Map<1 | 2, InviteRecord>();
    for (const invite of slotOccupyingInvites) {
      const slot = invite.inviteSlot === 2 ? 2 : 1;
      if (!slots.has(slot)) slots.set(slot, invite);
    }
    return slots;
  }, [slotOccupyingInvites]);

  const acceptedActiveInvites = useMemo(
    () => slotOccupyingInvites.filter(
      (invite) =>
        Boolean(invite.inviteeAddress) &&
        invite.status !== 'PENDING_ACCEPTANCE' &&
        invite.status !== 'COMPLETED',
    ),
    [slotOccupyingInvites],
  );

  useEffect(() => {
    if (!wallet || acceptedActiveInvites.length < 1) return;

    let running = false;
    const reconcile = async () => {
      if (
        running ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      running = true;
      try {
        await Promise.allSettled(
          acceptedActiveInvites.slice(0, 2).map((invite) =>
            fetch(`/api/invites/${invite.code}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
              cache: 'no-store',
            }),
          ),
        );
        await load(true);
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(
      () => void reconcile(),
      EVIDENCE_REFRESH_MS,
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reconcile();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [wallet, acceptedActiveInvites, load]);

  const rewardItems = useMemo(
    () => invites.filter((invite) =>
      invite.status === 'COMPLETED' &&
      Boolean(invite.rewardReservedAmountWei) &&
      invite.rewardEligibility !== 'FORFEITED' &&
      invite.rewardQueueStatus !== 'CANCELLED',
    ),
    [invites],
  );

  const outstandingRewards = useMemo(
    () => rewardItems.filter(
      (invite) => invite.rewardEligibility !== 'PAID',
    ),
    [rewardItems],
  );

  const permanentInviteUrl = useMemo(() => {
    if (!referralLink || typeof window === 'undefined') return '';
    const url = new URL(
      `/r/${referralLink.key}`,
      window.location.origin,
    );
    if (vercelShareToken) {
      url.searchParams.set('_vercel_share', vercelShareToken);
    }
    return url.toString();
  }, [referralLink, vercelShareToken]);

  const legacyInviteUrl = useCallback((invite: InviteRecord) => {
    if (typeof window === 'undefined') return '';
    const url = new URL(`/i/${invite.code}`, window.location.origin);
    if (vercelShareToken) {
      url.searchParams.set('_vercel_share', vercelShareToken);
    }
    return url.toString();
  }, [vercelShareToken]);

  const copyUrl = async (url: string) => {
    if (!url) return;
    clearFeedback();
    try {
      await navigator.clipboard.writeText(url);
      showFeedback('success', t.copied);
    } catch {
      showFeedback('error', t.genericError);
    }
  };

  const shareUrl = async (url: string) => {
    if (!url) return;
    clearFeedback();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VeInvite',
          text: t.shareText,
          url,
        });
      } catch {
        return;
      }
      return;
    }
    await copyUrl(url);
  };

  const claimReward = async (invite: InviteRecord) => {
    if (
      claimPendingCode ||
      invite.rewardQueueStatus !== 'AWAITING_CLAIM'
    ) {
      return;
    }

    clearFeedback();
    setClaimPendingCode(invite.code);
    try {
      const response = await fetch('/api/rewards/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: invite.code }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? progressCopy.claimFailed);
      }
      showFeedback('success', progressCopy.claimQueued);
      await load(true);
    } catch (error) {
      showFeedback(
        'error',
        error instanceof Error ? error.message : progressCopy.claimFailed,
      );
    } finally {
      setClaimPendingCode(null);
    }
  };

  const closeCancelModal = useCallback(() => {
    setLegacyCancelTarget(null);
    window.requestAnimationFrame(() =>
      cancelTriggerRef.current?.focus(),
    );
  }, []);

  useEffect(() => {
    if (!legacyCancelTarget) return;
    cancelKeepRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCancelModal();
        return;
      }
      if (event.key !== 'Tab' || !cancelDialogRef.current) return;
      const focusable = Array.from(
        cancelDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length < 1) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [legacyCancelTarget, closeCancelModal]);

  const cancelLegacyInvite = async () => {
    if (
      !wallet ||
      !legacyCancelTarget ||
      legacyCancelTarget.status !== 'PENDING_ACCEPTANCE' ||
      legacyCancelTarget.inviteeAddress
    ) {
      return;
    }

    clearFeedback();
    setLoading(true);
    try {
      const response = await fetch(
        `/api/invites/${legacyCancelTarget.code}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: wallet }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t.cancelError);
      }
      closeCancelModal();
      showFeedback('success', t.cancelled);
      await load();
    } catch (error) {
      showFeedback(
        'error',
        error instanceof Error ? error.message : t.genericError,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <div className="topActions">
          <div className="utilityActions">
            <InAppInviteNotifications locale={locale} />
            <select
              className="languageSelect"
              value={locale}
              onChange={(event) =>
                changeLocale(event.target.value as SupportedLocale)}
              aria-label={t.languageAria}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.nativeName}
                </option>
              ))}
            </select>
          </div>
          {wallet ? (
            <button
              type="button"
              className="accountChip"
              onClick={() => {
                clearFeedback();
                openWallet();
              }}
              aria-label={t.walletAria}
            >
              <span className="accountDot" />
              {wallet.slice(0, 6)}···{wallet.slice(-4)}
            </button>
          ) : null}
        </div>
      </header>

      {activeTab === 'home' ? (
        <section className="missionCard">
          <div className="cardGlow" />

          <div
            className={
              isCjkLocale(locale)
                ? 'missionCopy cjkCopy'
                : 'missionCopy'
            }
          >
            <h1>{referral.homeTitle}</h1>
          </div>

          {!wallet ? (
            <button
              type="button"
              className="primaryAction"
              disabled={isWalletModalOpen}
              onClick={() => {
                clearFeedback();
                openWallet();
              }}
            >
              {isWalletModalOpen ? t.connecting : t.connectStart}
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            <>
              {referralLinkFailed && !referralLink ? (
                <div className="linkErrorCard" role="status">
                  <strong>{t.loadError}</strong>
                </div>
              ) : (
                <div className="permanentLinkCard">
                  {referralLink ? (
                    <div className="linkPreview" title={permanentInviteUrl}>
                      {permanentInviteUrl || '—'}
                    </div>
                  ) : (
                    <div
                      className="linkPreview linkPreviewSkeleton"
                      aria-hidden="true"
                    />
                  )}
                  <div className="linkActions">
                    <button
                      type="button"
                      className="primaryAction compactAction"
                      disabled={!referralLinkVerified || !permanentInviteUrl}
                      onClick={() => void shareUrl(permanentInviteUrl)}
                    >
                      {t.shareInvite}
                    </button>
                    <button
                      type="button"
                      className="secondaryAction compactAction"
                      disabled={!referralLinkVerified || !permanentInviteUrl}
                      onClick={() => void copyUrl(permanentInviteUrl)}
                    >
                      {t.copyLink}
                    </button>
                  </div>
                </div>
              )}

              {invitesReady ? (
                <div className="slotsBlock">
                  <div className="slotsHeading">
                    <strong>{referral.slotsLabel}</strong>
                    <span>{slotInvites.size}/2</span>
                  </div>
                  <FriendSlot
                    number={1}
                    invite={slotInvites.get(1)}
                    copy={referral}
                    progressCopy={progressCopy}
                    onShare={() => void shareUrl(permanentInviteUrl)}
                    shareDisabled={!referralLinkVerified || !permanentInviteUrl}
                    onCopyLegacy={(invite) =>
                      void copyUrl(legacyInviteUrl(invite))}
                    onCancelLegacy={(invite, trigger) => {
                      cancelTriggerRef.current = trigger;
                      setLegacyCancelTarget(invite);
                    }}
                    copyLabel={t.copyLink}
                    cancelLabel={t.cancelInvite}
                  />
                  <FriendSlot
                    number={2}
                    invite={slotInvites.get(2)}
                    copy={referral}
                    progressCopy={progressCopy}
                    onShare={() => void shareUrl(permanentInviteUrl)}
                    shareDisabled={!referralLinkVerified || !permanentInviteUrl}
                    onCopyLegacy={(invite) =>
                      void copyUrl(legacyInviteUrl(invite))}
                    onCancelLegacy={(invite, trigger) => {
                      cancelTriggerRef.current = trigger;
                      setLegacyCancelTarget(invite);
                    }}
                    copyLabel={t.copyLink}
                    cancelLabel={t.cancelInvite}
                  />
                </div>
              ) : (
                <div className="slotsBlock slotsSkeleton" aria-hidden="true">
                  <div className="slotsHeading">
                    <strong>{referral.slotsLabel}</strong>
                    <span>—/2</span>
                  </div>
                  <div className="slotSkeleton" />
                  <div className="slotSkeleton" />
                </div>
              )}
            </>
          )}

          {outstandingRewards.length > 0 ? (
            <section className="rewardsPanel">
              <div className="rewardsHeading">
                <div>
                  <span className="rewardIcon">◆</span>
                  <div>
                    <strong>{progressCopy.rewardsTitle}</strong>
                    <small>{progressCopy.rewardsCount(outstandingRewards.length)}</small>
                  </div>
                </div>
              </div>

              <div className="rewardList">
                {outstandingRewards.map((invite) => {
                  const amount = formatB3trWei(
                    invite.rewardReservedAmountWei ?? '0',
                  );
                  const waiting = invite.rewardQueueStatus === 'AWAITING_CLAIM';
                  const processing =
                    invite.rewardQueueStatus === 'QUEUED' ||
                    invite.rewardQueueStatus === 'ASSIGNED';
                  const pending = claimPendingCode === invite.code;

                  return (
                    <article key={invite.code} className="rewardItem">
                      <div className="rewardMeta">
                        <small>
                          {invite.inviteeAddress
                            ? `${invite.inviteeAddress.slice(0, 7)}…${invite.inviteeAddress.slice(-5)}`
                            : invite.code}
                        </small>
                        <strong>{progressCopy.fixedReward} · {amount} B3TR</strong>
                      </div>
                      {waiting ? (
                        <button
                          type="button"
                          className="claimButton"
                          disabled={Boolean(claimPendingCode)}
                          onClick={() => void claimReward(invite)}
                        >
                          {pending ? progressCopy.claiming : progressCopy.claimReward}
                        </button>
                      ) : processing ? (
                        <span className="processingBadge">{progressCopy.claimQueued}</span>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </section>
      ) : activeTab === 'guide' ? (
        <AppGuide locale={locale} />
      ) : activeTab === 'leaderboard' ? (
        <PublicLeaderboard locale={locale} wallet={wallet} />
      ) : (
        <AppSettings
          locale={locale}
          wallet={wallet}
          isWalletActionPending={isWalletActionPending}
          onLocaleChange={changeLocale}
          onConnect={openWallet}
          onConnectAnother={connectAnotherWallet}
          onDisconnect={disconnectWallet}
        />
      )}

      {legacyCancelTarget ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCancelModal();
          }}
        >
          <div
            ref={cancelDialogRef}
            className="modalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            aria-describedby="cancel-dialog-description"
          >
            <div className="warningIcon">!</div>
            <h2 id="cancel-dialog-title">{t.cancelTitleWaiting}</h2>
            <p id="cancel-dialog-description">
              {t.cancelDescriptionWaiting}
            </p>
            <button
              ref={cancelKeepRef}
              type="button"
              className="primaryAction"
              onClick={closeCancelModal}
            >
              {t.keepInvite}
            </button>
            <button
              type="button"
              className="cancelConfirm"
              disabled={loading}
              onClick={() => void cancelLegacyInvite()}
            >
              {t.confirmCancel}
            </button>
          </div>
        </div>
      ) : null}

      <TransientSnackbar
        feedback={feedback}
        closeLabel={NOTIFICATION_COPY[locale].closeAria}
        onDismiss={clearFeedback}
      />

      <AppBottomNavigation
        activeTab={activeTab}
        locale={locale}
        onChange={changeTab}
      />

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 118px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 26px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .topActions { min-width:0; display:flex; align-items:center; gap:10px; }
        .utilityActions { min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
        .languageSelect { max-width:155px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
        .accountChip { min-height:40px; padding:0 13px; display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.72rem; font-weight:850; cursor:pointer; }
        .accountDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 14px rgba(244,183,40,.68); }
        .missionCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; margin:0 auto; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
        .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); filter:blur(4px); pointer-events:none; }
        .missionCopy { position:relative; z-index:1; }
        .missionCopy h1 { max-width:100%; margin:0; font-size:clamp(2.05rem,8vw,3.05rem); line-height:1.04; letter-spacing:-.05em; text-wrap:balance; overflow-wrap:anywhere; hyphens:auto; }
        .missionCopy.cjkCopy h1 { font-size:clamp(2rem,7vw,2.85rem); line-height:1.1; letter-spacing:-.035em; }
        .permanentLinkCard { position:relative; z-index:1; margin-top:18px; padding:16px; border:1px solid rgba(255,205,80,.2); border-radius:19px; background:rgba(255,205,80,.055); }
        .linkPreview { padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
        .linkPreviewSkeleton { min-height:38px; box-sizing:border-box; position:relative; overflow:hidden; }
        .linkPreviewSkeleton::after { content:''; position:absolute; top:50%; left:12px; width:68%; height:8px; border-radius:999px; background:rgba(255,255,255,.09); transform:translateY(-50%); animation:skeletonPulse 1.5s ease-in-out infinite; }
        .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .primaryAction,.secondaryAction { position:relative; z-index:1; width:100%; min-height:56px; border-radius:18px; font:inherit; font-size:.92rem; font-weight:950; cursor:pointer; overflow-wrap:anywhere; }
        .primaryAction { margin-top:24px; border:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22); }
        .primaryAction span { font-size:1.55rem; line-height:1; }
        .primaryAction:disabled { opacity:.42; cursor:not-allowed; box-shadow:none; }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
        .secondaryAction:disabled { opacity:.42; cursor:not-allowed; }
        .compactAction { min-height:44px; margin-top:0; border-radius:13px; font-size:.75rem; box-shadow:none; }
        .slotsBlock { position:relative; z-index:1; margin-top:16px; display:grid; gap:9px; }
        .slotsHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#c7c2d0; font-size:.78rem; }
        .slotsHeading strong { overflow-wrap:anywhere; }
        .slotsHeading span { flex:0 0 auto; min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
        .slotSkeleton { min-height:68px; box-sizing:border-box; position:relative; overflow:hidden; border:1px solid rgba(255,255,255,.07); border-radius:16px; background:rgba(255,255,255,.022); }
        .slotSkeleton::after { content:''; position:absolute; top:50%; left:14px; width:54%; height:9px; border-radius:999px; background:rgba(255,255,255,.075); transform:translateY(-50%); animation:skeletonPulse 1.5s ease-in-out infinite; }
        .linkErrorCard { position:relative; z-index:1; min-height:58px; margin-top:18px; padding:12px 14px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,201,61,.18); border-radius:17px; background:rgba(244,183,40,.06); color:#ffd66e; text-align:center; }
        .rewardsPanel { position:relative; z-index:1; margin-top:18px; padding:15px; border:1px solid rgba(90,222,166,.18); border-radius:18px; background:linear-gradient(145deg,rgba(35,139,99,.12),rgba(255,255,255,.025)); }
        .rewardsHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .rewardsHeading > div { display:flex; align-items:center; gap:9px; }
        .rewardsHeading > div > div { display:grid; gap:2px; }
        .rewardsHeading strong { font-size:.84rem; }
        .rewardsHeading small { color:#84948a; font-size:.62rem; }
        .rewardIcon { width:33px; height:33px; display:grid; place-items:center; border-radius:11px; background:rgba(64,222,156,.13); color:#77efb9; font-size:.68rem; }
        .rewardList { margin-top:11px; display:grid; gap:8px; }
        .rewardItem { min-width:0; padding:12px; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.07); border-radius:14px; background:rgba(5,8,7,.36); }
        .rewardMeta { min-width:0; display:grid; gap:3px; }
        .rewardMeta small { color:#777e79; font-size:.59rem; direction:ltr; overflow:hidden; text-overflow:ellipsis; }
        .rewardMeta strong { color:#e4eee8; font-size:.75rem; overflow-wrap:anywhere; }
        .claimButton { min-height:38px; padding:0 12px; border:0; border-radius:11px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:.65rem; font-weight:950; cursor:pointer; white-space:nowrap; }
        .claimButton:disabled { opacity:.55; cursor:not-allowed; }
        .processingBadge { max-width:130px; padding:6px 8px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.035); color:#9b979f; font-size:.58rem; font-weight:850; text-align:center; overflow-wrap:anywhere; }
        .modalBackdrop { position:fixed; z-index:100; inset:0; display:grid; place-items:center; padding:20px; background:rgba(2,3,10,.78); backdrop-filter:blur(10px); }
        .modalCard { width:min(100%,410px); max-height:calc(100dvh - 40px); overflow-y:auto; box-sizing:border-box; padding:25px; border:1px solid rgba(255,255,255,.1); border-radius:25px; background:#121421; text-align:center; box-shadow:0 30px 90px rgba(0,0,0,.5); }
        .warningIcon { width:50px; height:50px; margin:0 auto 15px; border-radius:17px; display:grid; place-items:center; background:rgba(255,91,111,.1); color:#ff7186; font-size:1.2rem; font-weight:950; }
        .modalCard h2 { margin:0; font-size:1.4rem; letter-spacing:-.03em; overflow-wrap:anywhere; }
        .modalCard p { margin:11px 0 0; color:#a39eaf; font-size:.88rem; line-height:1.55; overflow-wrap:anywhere; }
        .cancelConfirm { margin-top:16px; border:0; background:transparent; color:#ff7186; font:inherit; font-size:.8rem; font-weight:900; cursor:pointer; }
        @keyframes skeletonPulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
        @media (max-width:560px) {
          .screen { padding:18px 14px 116px; }
          .topBar { align-items:flex-start; }
          .topActions { max-width:58%; align-items:flex-end; flex-direction:column-reverse; gap:7px; }
          .utilityActions { width:100%; }
          .utilityActions .languageSelect { min-width:0; width:auto; flex:1; }
          .languageSelect { width:100%; max-width:155px; height:34px; border-radius:11px; font-size:.68rem; }
          .accountChip { min-height:34px; padding:0 10px; border-radius:11px; font-size:.66rem; }
          .missionCard { padding:21px 18px; border-radius:26px; }
          .missionCopy h1 { font-size:clamp(1.9rem,10vw,2.6rem); }
          .missionCopy.cjkCopy h1 { font-size:clamp(1.9rem,9vw,2.4rem); }
        }
        @media (max-width:420px) {
          .rewardItem { grid-template-columns:1fr; }
          .claimButton,.processingBadge { width:100%; max-width:none; box-sizing:border-box; }
        }
        @media (max-width:340px) {
          .linkActions { grid-template-columns:1fr; }
        }
      `}</style>
    </main>
  );
}

function MissionDots({ invite }: { invite: InviteRecord }) {
  const flags = missionFlags(invite);
  const current = flags.findIndex((done) => !done);

  return (
    <div className="missionDots" aria-label={`${flags.filter(Boolean).length}/5`}>
      {flags.map((done, index) => (
        <span
          key={index}
          className={`missionDot ${done ? 'done' : ''} ${index === current ? 'current' : ''}`}
        />
      ))}
      <style jsx>{`
        .missionDots { display:flex; align-items:center; gap:9px; }
        .missionDot { position:relative; width:9px; height:9px; border-radius:50%; background:rgba(255,255,255,.13); }
        .missionDot.done { background:#f4b728; box-shadow:0 0 10px rgba(244,183,40,.32); }
        .missionDot.current { background:#f4b728; }
        .missionDot.current::after { content:''; position:absolute; inset:-5px; border:1px solid rgba(244,183,40,.48); border-radius:50%; animation:stagePulse 1.8s ease-in-out infinite; }
        @keyframes stagePulse { 0%,100% { transform:scale(.82); opacity:.3; } 50% { transform:scale(1.08); opacity:.9; } }
        @media (prefers-reduced-motion: reduce) { .missionDot.current::after { animation:none; opacity:.65; } }
      `}</style>
    </div>
  );
}

function FriendSlot({
  number,
  invite,
  copy,
  progressCopy,
  onShare,
  shareDisabled,
  onCopyLegacy,
  onCancelLegacy,
  copyLabel,
  cancelLabel,
}: {
  number: 1 | 2;
  invite?: InviteRecord;
  copy: (typeof REFERRAL_LINK_COPY)[SupportedLocale];
  progressCopy: (typeof PROGRESS_CLAIM_COPY)[SupportedLocale];
  onShare: () => void;
  shareDisabled: boolean;
  onCopyLegacy: (invite: InviteRecord) => void;
  onCancelLegacy: (
    invite: InviteRecord,
    trigger: HTMLButtonElement,
  ) => void;
  copyLabel: string;
  cancelLabel: string;
}) {
  const legacyWaiting =
    Boolean(invite) &&
    invite?.status === 'PENDING_ACCEPTANCE' &&
    !invite.inviteeAddress;

  if (!invite) {
    return (
      <button
        type="button"
        className="friendSlot available"
        disabled={shareDisabled}
        onClick={onShare}
      >
        <span className="slotNumber">{number}</span>
        <span className="slotCopy">
          <strong>{progressCopy.inviteFriend}</strong>
          <small>{progressCopy.sharePermanentLink} ↗</small>
        </span>
        <span className="slotState" aria-hidden="true">↗</span>
        <style jsx>{slotStyles}</style>
      </button>
    );
  }

  if (legacyWaiting) {
    return (
      <div className="friendSlot legacy">
        <span className="slotNumber">{number}</span>
        <div className="slotCopy">
          <strong>{copy.slotLegacyWaiting}</strong>
        </div>
        <div className="legacyActions">
          <button type="button" onClick={() => onCopyLegacy(invite)}>
            {copyLabel}
          </button>
          <button
            type="button"
            className="danger"
            onClick={(event) =>
              onCancelLegacy(invite, event.currentTarget)}
          >
            {cancelLabel}
          </button>
        </div>
        <style jsx>{slotStyles}</style>
      </div>
    );
  }

  const allMissions = missionFlags(invite).every(Boolean);
  const finalChecking =
    allMissions &&
    !invite.slotReleasedAt;
  const shortInvitee = invite.inviteeAddress
    ? `${invite.inviteeAddress.slice(0, 7)}…${invite.inviteeAddress.slice(-5)}`
    : '';
  const statusText = finalChecking
    ? progressCopy.finalCheck
    : invite.status === 'UNDER_REVIEW'
      ? copy.slotReview
      : copy.slotInProgress;
  const nextLabel = nextMissionLabel(invite);

  return (
    <div className={`friendSlot detailed ${finalChecking ? 'review' : 'progress'}`}>
      <span className="slotNumber">{number}</span>
      <div className="slotCopy detailedCopy">
        <div className="slotTop">
          <strong>{statusText}</strong>
          {shortInvitee ? <small>{shortInvitee}</small> : null}
        </div>
        <MissionDots invite={invite} />
        <span className="stageText">
          {finalChecking
            ? progressCopy.finalCheck
            : nextLabel
              ? `${progressCopy.currentStep} · ${nextLabel}`
              : progressCopy.finalCheck}
        </span>
      </div>
      <style jsx>{slotStyles}</style>
    </div>
  );
}

const slotStyles = `
  .friendSlot { width:100%; box-sizing:border-box; min-width:0; min-height:68px; padding:12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.085); border-radius:16px; background:rgba(255,255,255,.035); color:#fff; text-align:left; }
  button.friendSlot { font:inherit; cursor:pointer; }
  button.friendSlot:disabled { opacity:.55; cursor:not-allowed; }
  .friendSlot.available { border-style:dashed; background:rgba(255,255,255,.022); }
  .friendSlot.review { border-color:rgba(255,205,80,.2); background:rgba(244,183,40,.055); }
  .friendSlot.progress { border-color:rgba(91,212,162,.16); background:rgba(42,164,116,.05); }
  .friendSlot.detailed { align-items:start; min-height:94px; grid-template-columns:auto minmax(0,1fr); }
  .slotNumber { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.76rem; font-weight:950; }
  .available .slotNumber { background:rgba(255,255,255,.045); color:#8d8797; }
  .slotCopy { min-width:0; display:grid; gap:4px; }
  .slotCopy strong { color:#ded9e7; font-size:.74rem; line-height:1.38; overflow-wrap:anywhere; }
  .slotCopy small { direction:ltr; color:#837e8e; font-size:.62rem; font-weight:750; overflow-wrap:anywhere; }
  .detailedCopy { gap:8px; }
  .slotTop { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .stageText { color:#8f9b91; font-size:.63rem; line-height:1.4; overflow-wrap:anywhere; }
  .review .stageText { color:#b3a681; }
  .slotState { width:28px; height:28px; display:grid; place-items:center; border-radius:10px; color:#ffd66e; background:rgba(244,183,40,.08); font-weight:950; }
  .available .slotState { color:#ffd66e; }
  .legacyActions { display:grid; gap:5px; }
  .legacyActions button { min-height:28px; max-width:110px; padding:4px 8px; border:1px solid rgba(255,255,255,.09); border-radius:9px; background:rgba(255,255,255,.04); color:#d9d5df; font:inherit; font-size:.58rem; font-weight:850; overflow-wrap:anywhere; }
  .legacyActions button.danger { color:#ff8292; border-color:rgba(255,113,134,.13); background:rgba(255,91,111,.045); }
  @media (max-width:360px) {
    .friendSlot.legacy { grid-template-columns:auto minmax(0,1fr); }
    .legacyActions { grid-column:1 / -1; grid-template-columns:1fr 1fr; }
    .legacyActions button { max-width:none; }
    .slotTop { align-items:flex-start; flex-direction:column; gap:3px; }
  }
`;
