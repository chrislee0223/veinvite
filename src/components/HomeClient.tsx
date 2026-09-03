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
import { GUIDE_REWARD_STEP_COPY } from '@/lib/i18n/guideRewardStepCopy';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isCjkLocale,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type { ReferralLinkRecord } from '@/lib/referralLinks';
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
const ACTIVE_STATUSES = new Set([
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
]);

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
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] =
    useState<TransientFeedback | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [vercelShareToken, setVercelShareToken] = useState('');
  const [legacyCancelTarget, setLegacyCancelTarget] =
    useState<InviteRecord | null>(null);
  const feedbackIdRef = useRef(0);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelKeepRef = useRef<HTMLButtonElement | null>(null);

  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];
  const automaticRewardCopy = GUIDE_REWARD_STEP_COPY[locale];

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

  const load = useCallback(async () => {
    if (!wallet) {
      setInvites([]);
      setReferralLink(null);
      return;
    }

    setLoading(true);
    try {
      const [inviteResponse, linkResponse] = await Promise.all([
        fetch(
          `/api/invites?inviter=${encodeURIComponent(wallet)}`,
          { cache: 'no-store' },
        ),
        fetch('/api/referral-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: wallet }),
        }),
      ]);

      const inviteData = (await inviteResponse.json()) as {
        invites?: InviteRecord[];
        error?: string;
      };
      const linkData = (await linkResponse.json()) as {
        referralLink?: ReferralLinkRecord | null;
        error?: string;
      };

      if (!inviteResponse.ok) {
        throw new Error(inviteData.error ?? t.loadError);
      }
      if (!linkResponse.ok || !linkData.referralLink) {
        throw new Error(linkData.error ?? t.createError);
      }

      setInvites(inviteData.invites ?? []);
      setReferralLink(linkData.referralLink);
    } catch (error) {
      showFeedback(
        'error',
        error instanceof Error ? error.message : t.genericError,
      );
    } finally {
      setLoading(false);
    }
  }, [wallet, t.loadError, t.createError, t.genericError, showFeedback]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeInvites = useMemo(
    () => invites
      .filter((invite) =>
        ACTIVE_STATUSES.has(invite.status) &&
        invite.sybilStatus !== 'BLOCKED',
      )
      .sort((a, b) =>
        (a.inviteSlot ?? 1) - (b.inviteSlot ?? 1) ||
        b.createdAt.localeCompare(a.createdAt),
      ),
    [invites],
  );

  const slotInvites = useMemo(() => {
    const slots = new Map<1 | 2, InviteRecord>();
    for (const invite of activeInvites) {
      const slot = invite.inviteSlot === 2 ? 2 : 1;
      if (!slots.has(slot)) slots.set(slot, invite);
    }
    return slots;
  }, [activeInvites]);

  const completedInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'COMPLETED'),
    [invites],
  );
  const latestCompleted = completedInvites[0];
  const unsettledReward = completedInvites.find(
    (invite) =>
      invite.rewardEligibility !== 'PAID' &&
      invite.rewardEligibility !== 'FORFEITED',
  );
  const rewardRecord = unsettledReward ?? latestCompleted;
  const rewardQueued = rewardRecord?.rewardQueueStatus === 'QUEUED';
  const rewardAssigned = rewardRecord?.rewardQueueStatus === 'ASSIGNED';
  const rewardPaid = rewardRecord?.rewardEligibility === 'PAID';
  const rewardForfeited = rewardRecord?.rewardEligibility === 'FORFEITED';

  const rewardPanelTitle = rewardForfeited
    ? t.rewardForfeited
    : rewardPaid
      ? t.rewardPaid
      : rewardAssigned
        ? t.rewardAssigned
        : rewardQueued
          ? automaticRewardCopy.title
          : t.rewardPending;
  const rewardPanelDescription = rewardForfeited
    ? t.rewardForfeitedDescription
    : rewardPaid
      ? t.rewardPaidDescription
      : rewardAssigned
        ? t.rewardAssignedDescription
        : rewardQueued
          ? automaticRewardCopy.description
          : t.rewardDescription;

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
          <div className="missionHeader">
            <span className="missionLabel">{t.inviteMission}</span>
            <span className="badge">{referral.badge}</span>
          </div>

          <div
            className={
              isCjkLocale(locale)
                ? 'missionCopy cjkCopy'
                : 'missionCopy'
            }
          >
            <h1>{referral.homeTitle}</h1>
            <p>{referral.homeDescription}</p>
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
          ) : referralLink ? (
            <>
              <div className="permanentLinkCard">
                <div className="linkHeading">
                  <div>
                    <small>{referral.linkLabel}</small>
                    <strong>{referral.linkHelp}</strong>
                  </div>
                  <span className="linkMark" aria-hidden="true">∞</span>
                </div>
                <div className="linkPreview" title={permanentInviteUrl}>
                  {permanentInviteUrl || '—'}
                </div>
                <div className="linkActions">
                  <button
                    type="button"
                    className="primaryAction compactAction"
                    onClick={() => void shareUrl(permanentInviteUrl)}
                  >
                    {t.shareInvite}
                  </button>
                  <button
                    type="button"
                    className="secondaryAction compactAction"
                    onClick={() => void copyUrl(permanentInviteUrl)}
                  >
                    {t.copyLink}
                  </button>
                </div>
              </div>

              <div className="slotsBlock">
                <div className="slotsHeading">
                  <strong>{referral.slotsLabel}</strong>
                  <span>{2 - slotInvites.size}/2</span>
                </div>
                <FriendSlot
                  number={1}
                  invite={slotInvites.get(1)}
                  copy={referral}
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
            </>
          ) : (
            <div className="loadingCard" aria-live="polite">
              <span className="pulseDot" />
              <strong>{loading ? t.creating : t.loadError}</strong>
            </div>
          )}

          {rewardRecord ? (
            <div className="completePanel">
              <span className="completeIcon">✓</span>
              <div>
                <strong>{rewardPanelTitle}</strong>
                <p>{rewardPanelDescription}</p>
              </div>
            </div>
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
        .missionHeader { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .badge { width:fit-content; max-width:62%; display:inline-flex; align-items:center; min-height:28px; padding:0 11px; border:1px solid rgba(255,205,80,.3); border-radius:999px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.66rem; font-weight:950; letter-spacing:.05em; overflow-wrap:anywhere; }
        .missionLabel { color:#8f86ae; font-size:.68rem; font-weight:900; letter-spacing:.12em; }
        .missionCopy { position:relative; z-index:1; margin-top:24px; }
        .missionCopy h1 { max-width:100%; margin:0; font-size:clamp(2.05rem,8vw,3.05rem); line-height:1.04; letter-spacing:-.05em; text-wrap:balance; overflow-wrap:anywhere; hyphens:auto; }
        .missionCopy.cjkCopy h1 { font-size:clamp(2rem,7vw,2.85rem); line-height:1.1; letter-spacing:-.035em; }
        .missionCopy p { max-width:430px; margin:13px 0 0; color:#b7b1c7; font-size:.94rem; font-weight:650; line-height:1.58; overflow-wrap:anywhere; }
        .permanentLinkCard { position:relative; z-index:1; margin-top:22px; padding:16px; border:1px solid rgba(255,205,80,.2); border-radius:19px; background:rgba(255,205,80,.055); }
        .linkHeading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .linkHeading > div { min-width:0; display:grid; gap:4px; }
        .linkHeading small { color:#ffd66e; font-size:.66rem; font-weight:950; letter-spacing:.045em; overflow-wrap:anywhere; }
        .linkHeading strong { color:#dad5c9; font-size:.76rem; line-height:1.4; overflow-wrap:anywhere; }
        .linkMark { flex:0 0 auto; width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:rgba(244,183,40,.14); color:#ffd66e; font-size:1.35rem; font-weight:950; }
        .linkPreview { margin-top:13px; padding:11px 12px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(3,4,5,.42); color:#b8b2c2; font-size:.68rem; font-weight:750; white-space:nowrap; text-overflow:ellipsis; direction:ltr; text-align:left; }
        .linkActions { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .primaryAction,.secondaryAction { position:relative; z-index:1; width:100%; min-height:56px; border-radius:18px; font:inherit; font-size:.92rem; font-weight:950; cursor:pointer; overflow-wrap:anywhere; }
        .primaryAction { margin-top:24px; border:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22); }
        .primaryAction span { font-size:1.55rem; line-height:1; }
        .primaryAction:disabled { opacity:.42; cursor:not-allowed; box-shadow:none; }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
        .compactAction { min-height:44px; margin-top:0; border-radius:13px; font-size:.75rem; box-shadow:none; }
        .slotsBlock { position:relative; z-index:1; margin-top:16px; display:grid; gap:9px; }
        .slotsHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#c7c2d0; font-size:.78rem; }
        .slotsHeading strong { overflow-wrap:anywhere; }
        .slotsHeading span { flex:0 0 auto; min-width:42px; padding:5px 8px; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#ffd66e; text-align:center; font-size:.66rem; font-weight:950; }
        .loadingCard { position:relative; z-index:1; min-height:58px; margin-top:22px; padding:12px 14px; display:flex; align-items:center; justify-content:center; gap:10px; border:1px solid rgba(255,201,61,.18); border-radius:17px; background:rgba(244,183,40,.06); color:#ffd66e; text-align:center; }
        .pulseDot { flex:0 0 auto; width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 18px rgba(244,183,40,.72); animation:pulse 1.6s ease-in-out infinite; }
        .completePanel { position:relative; z-index:1; margin-top:20px; padding:16px; display:flex; align-items:flex-start; gap:13px; border:1px solid rgba(90,222,166,.2); border-radius:18px; background:rgba(40,170,118,.08); }
        .completeIcon { flex:0 0 auto; width:38px; height:38px; display:grid; place-items:center; border-radius:50%; background:rgba(64,222,156,.18); color:#77efb9; font-weight:950; }
        .completePanel > div { min-width:0; flex:1; }
        .completePanel strong { font-size:.9rem; overflow-wrap:anywhere; }
        .completePanel p { margin:4px 0 0; color:#9eaa9f; font-size:.75rem; line-height:1.45; overflow-wrap:anywhere; }
        .modalBackdrop { position:fixed; z-index:100; inset:0; display:grid; place-items:center; padding:20px; background:rgba(2,3,10,.78); backdrop-filter:blur(10px); }
        .modalCard { width:min(100%,410px); max-height:calc(100dvh - 40px); overflow-y:auto; box-sizing:border-box; padding:25px; border:1px solid rgba(255,255,255,.1); border-radius:25px; background:#121421; text-align:center; box-shadow:0 30px 90px rgba(0,0,0,.5); }
        .warningIcon { width:50px; height:50px; margin:0 auto 15px; border-radius:17px; display:grid; place-items:center; background:rgba(255,91,111,.1); color:#ff7186; font-size:1.2rem; font-weight:950; }
        .modalCard h2 { margin:0; font-size:1.4rem; letter-spacing:-.03em; overflow-wrap:anywhere; }
        .modalCard p { margin:11px 0 0; color:#a39eaf; font-size:.88rem; line-height:1.55; overflow-wrap:anywhere; }
        .cancelConfirm { margin-top:16px; border:0; background:transparent; color:#ff7186; font:inherit; font-size:.8rem; font-weight:900; cursor:pointer; }
        @keyframes pulse { 0%,100% { opacity:.55; transform:scale(.9); } 50% { opacity:1; transform:scale(1.08); } }
        @media (max-width:560px) {
          .screen { padding:18px 14px 116px; }
          .topBar { align-items:flex-start; }
          .topActions { max-width:58%; align-items:flex-end; flex-direction:column-reverse; gap:7px; }
          .utilityActions { width:100%; }
          .utilityActions .languageSelect { min-width:0; width:auto; flex:1; }
          .languageSelect { width:100%; max-width:155px; height:34px; border-radius:11px; font-size:.68rem; }
          .accountChip { min-height:34px; padding:0 10px; border-radius:11px; font-size:.66rem; }
          .missionCard { padding:21px 18px; border-radius:26px; }
          .missionHeader { align-items:flex-start; }
          .missionCopy { margin-top:28px; }
          .missionCopy h1 { font-size:clamp(1.9rem,10vw,2.6rem); }
          .missionCopy.cjkCopy h1 { font-size:clamp(1.9rem,9vw,2.4rem); }
        }
        @media (max-width:340px) {
          .linkActions { grid-template-columns:1fr; }
          .badge { max-width:58%; }
        }
      `}</style>
    </main>
  );
}

function FriendSlot({
  number,
  invite,
  copy,
  onCopyLegacy,
  onCancelLegacy,
  copyLabel,
  cancelLabel,
}: {
  number: 1 | 2;
  invite?: InviteRecord;
  copy: (typeof REFERRAL_LINK_COPY)[SupportedLocale];
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
  const state = !invite
    ? 'available'
    : legacyWaiting
      ? 'legacy'
      : invite.status === 'UNDER_REVIEW'
        ? 'review'
        : 'progress';
  const text = state === 'available'
    ? copy.slotAvailable
    : state === 'legacy'
      ? copy.slotLegacyWaiting
      : state === 'review'
        ? copy.slotReview
        : copy.slotInProgress;
  const shortInvitee = invite?.inviteeAddress
    ? `${invite.inviteeAddress.slice(0, 7)}…${invite.inviteeAddress.slice(-5)}`
    : '';

  return (
    <div className={`friendSlot ${state}`}>
      <span className="slotNumber">{number}</span>
      <div className="slotCopy">
        <strong>{text}</strong>
        {shortInvitee ? <small>{shortInvitee}</small> : null}
      </div>
      {legacyWaiting && invite ? (
        <div className="legacyActions">
          <button
            type="button"
            onClick={() => onCopyLegacy(invite)}
          >
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
      ) : (
        <span className="slotState" aria-hidden="true">
          {state === 'available' ? '+' : state === 'review' ? '◷' : '•'}
        </span>
      )}

      <style jsx>{`
        .friendSlot { min-width:0; min-height:68px; padding:12px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.085); border-radius:16px; background:rgba(255,255,255,.035); }
        .friendSlot.available { border-style:dashed; background:rgba(255,255,255,.022); }
        .friendSlot.review { border-color:rgba(255,205,80,.2); background:rgba(244,183,40,.055); }
        .friendSlot.progress { border-color:rgba(91,212,162,.16); background:rgba(42,164,116,.05); }
        .slotNumber { width:36px; height:36px; display:grid; place-items:center; border-radius:12px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.76rem; font-weight:950; }
        .available .slotNumber { background:rgba(255,255,255,.045); color:#8d8797; }
        .slotCopy { min-width:0; display:grid; gap:4px; }
        .slotCopy strong { color:#ded9e7; font-size:.74rem; line-height:1.38; overflow-wrap:anywhere; }
        .slotCopy small { direction:ltr; color:#837e8e; font-size:.62rem; font-weight:750; overflow-wrap:anywhere; }
        .slotState { width:28px; height:28px; display:grid; place-items:center; border-radius:10px; color:#ffd66e; background:rgba(244,183,40,.08); font-weight:950; }
        .available .slotState { color:#8d8797; background:rgba(255,255,255,.035); }
        .legacyActions { display:grid; gap:5px; }
        .legacyActions button { min-height:28px; max-width:110px; padding:4px 8px; border:1px solid rgba(255,255,255,.09); border-radius:9px; background:rgba(255,255,255,.04); color:#d9d5df; font:inherit; font-size:.58rem; font-weight:850; overflow-wrap:anywhere; }
        .legacyActions button.danger { color:#ff8292; border-color:rgba(255,113,134,.13); background:rgba(255,91,111,.045); }
        @media (max-width:360px) {
          .friendSlot.legacy { grid-template-columns:auto minmax(0,1fr); }
          .legacyActions { grid-column:1 / -1; grid-template-columns:1fr 1fr; }
          .legacyActions button { max-width:none; }
        }
      `}</style>
    </div>
  );
}
