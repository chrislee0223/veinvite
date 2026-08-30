'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import {
  AppBottomNavigation,
  type AppTab,
} from './AppBottomNavigation';
import { Brand } from './Brand';
import { useWalletLauncher } from './WalletControl';
import { GUIDE_REWARD_STEP_COPY } from '@/lib/i18n/guideRewardStepCopy';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isCjkLocale,
  isLocale,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
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

export function HomeClient() {
  const {
    wallet,
    openWallet,
    connectAnotherWallet,
    disconnectWallet,
    isWalletActionPending,
    isWalletModalOpen,
  } = useWalletLauncher();

  const [locale, setLocale] = useState<Locale>('en');
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingReward, setClaimingReward] = useState(false);
  const [message, setMessage] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [vercelShareToken, setVercelShareToken] = useState('');
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelKeepRef = useRef<HTMLButtonElement | null>(null);

  const t = HOME_COPY[locale];
  const automaticRewardCopy = GUIDE_REWARD_STEP_COPY[locale];

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

    window.addEventListener('veinvite-language-change', handleLanguageChange);
    return () => window.removeEventListener('veinvite-language-change', handleLanguageChange);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = searchParams.get('_vercel_share');
    const storedToken = window.sessionStorage.getItem(VERCEL_SHARE_STORAGE_KEY);
    const token = tokenFromUrl ?? storedToken ?? '';
    if (!token) return;
    window.sessionStorage.setItem(VERCEL_SHARE_STORAGE_KEY, token);
    setVercelShareToken(token);
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(new CustomEvent('veinvite-language-change', { detail: nextLocale }));
  };

  const changeTab = (nextTab: AppTab) => {
    setActiveTab(nextTab);
    setShowCancel(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const latest = invites[0];
  const active = latest && ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW'].includes(latest.status)
    ? latest
    : undefined;
  const completedInvites = invites.filter((invite) => invite.status === 'COMPLETED');
  const latestCompleted = completedInvites[0];
  const displayCompleted = active ? undefined : latestCompleted;

  const claimableReward = completedInvites.find(
    (invite) => invite.rewardEligibility === 'ELIGIBLE' && invite.rewardQueueStatus === 'AWAITING_CLAIM',
  );
  const unsettledReward = completedInvites.find(
    (invite) => invite.rewardEligibility !== 'PAID' && invite.rewardEligibility !== 'FORFEITED',
  );
  const rewardRecord = claimableReward ?? unsettledReward ?? (active ? undefined : latestCompleted);

  const waitingForFriend = active?.status === 'PENDING_ACCEPTANCE' && !active.inviteeAddress;
  const activating = active?.status === 'ACTIVATING';
  const underReview = active?.status === 'UNDER_REVIEW';
  const claimAvailable = rewardRecord?.rewardEligibility === 'ELIGIBLE' && rewardRecord.rewardQueueStatus === 'AWAITING_CLAIM';
  const claimRequested = rewardRecord?.rewardQueueStatus === 'QUEUED';
  const rewardAssigned = rewardRecord?.rewardQueueStatus === 'ASSIGNED';
  const rewardPaid = rewardRecord?.rewardEligibility === 'PAID';
  const rewardForfeited = rewardRecord?.rewardEligibility === 'FORFEITED';
  const inviteSlotAvailable = !active;

  const rewardPanelTitle = rewardForfeited
    ? t.rewardForfeited
    : rewardPaid
      ? t.rewardPaid
      : rewardAssigned
        ? t.rewardAssigned
        : claimRequested
          ? automaticRewardCopy.title
          : claimAvailable
            ? t.rewardClaimReady
            : t.rewardPending;

  const rewardPanelDescription = rewardForfeited
    ? t.rewardForfeitedDescription
    : rewardPaid
      ? t.rewardPaidDescription
      : rewardAssigned
        ? t.rewardAssignedDescription
        : claimRequested
          ? automaticRewardCopy.description
          : claimAvailable
            ? t.rewardClaimDescription
            : t.rewardDescription;

  const load = useCallback(async () => {
    if (!wallet) {
      setInvites([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/invites?inviter=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
      const data = (await response.json()) as { invites?: InviteRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? t.loadError);
      setInvites(data.invites ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.genericError);
    } finally {
      setLoading(false);
    }
  }, [wallet, t.loadError, t.genericError]);

  useEffect(() => { void load(); }, [load]);

  const createInvite = async () => {
    if (!wallet) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviterAddress: wallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t.createError);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.genericError);
    } finally {
      setLoading(false);
    }
  };

  const closeCancelModal = useCallback(() => {
    setShowCancel(false);
    window.requestAnimationFrame(() => cancelTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!showCancel) return;
    cancelKeepRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCancelModal();
        return;
      }
      if (event.key !== 'Tab' || !cancelDialogRef.current) return;
      const focusable = Array.from(
        cancelDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select, [tabindex]:not([tabindex="-1"])'),
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
  }, [showCancel, closeCancelModal]);

  const cancelInvite = async () => {
    if (!wallet || !active || !waitingForFriend) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/invites/${active.code}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviterAddress: wallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t.cancelError);
      closeCancelModal();
      setMessage(t.cancelled);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.genericError);
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = useMemo(() => {
    if (!active || typeof window === 'undefined') return '';
    const url = new URL(`/i/${active.code}`, window.location.origin);
    if (vercelShareToken) url.searchParams.set('_vercel_share', vercelShareToken);
    return url.toString();
  }, [active, vercelShareToken]);

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setMessage(t.copied);
  };

  const shareInvite = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'VeInvite', text: t.shareText, url: inviteUrl });
      } catch {
        return;
      }
      return;
    }
    await copyInvite();
  };

  const claimReward = async () => {
    if (!rewardRecord || !claimAvailable || claimingReward) return;
    setClaimingReward(true);
    setMessage('');
    try {
      const response = await fetch('/api/rewards/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: rewardRecord.code }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t.claimError);
      setMessage(t.claimSuccess);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.claimError);
    } finally {
      setClaimingReward(false);
    }
  };

  const stageIndex = waitingForFriend ? 1 : activating || underReview ? 2 : displayCompleted ? 3 : 0;
  const badge = waitingForFriend ? t.inviteReadyBadge : activating ? t.friendJoinedBadge : underReview ? t.reviewBadge : displayCompleted ? t.completeBadge : t.inviteAvailable;
  const title = waitingForFriend ? t.inviteReadyTitle : activating ? t.friendJoinedTitle : underReview ? t.reviewTitle : displayCompleted ? t.completeTitle : t.emptyTitle;
  const description = waitingForFriend ? t.inviteReadyDescription : activating ? t.friendJoinedDescription : underReview ? t.reviewDescription : displayCompleted ? t.completeDescription : t.emptyDescription;
  const statusText = waitingForFriend ? t.waiting : activating ? t.inProgress : underReview ? t.checking : displayCompleted ? t.completed : t.noActive;

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <div className="topActions">
          <select
            className="languageSelect"
            value={locale}
            onChange={(event) => changeLocale(event.target.value as Locale)}
            aria-label={t.languageAria}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.locale} value={option.locale}>{option.nativeName}</option>
            ))}
          </select>
          {wallet ? (
            <button type="button" className="accountChip" onClick={openWallet} aria-label={t.walletAria}>
              <span className="accountDot" />{wallet.slice(0, 6)}···{wallet.slice(-4)}
            </button>
          ) : null}
        </div>
      </header>

      {activeTab === 'home' ? (
        <>
          <section className="missionCard">
            <div className="cardGlow" />
            <div className="missionHeader"><span className="badge">{badge}</span><span className="missionLabel">{t.inviteMission}</span></div>
            <div className={isCjkLocale(locale) ? 'missionCopy cjkCopy' : 'missionCopy'}><h1>{title}</h1><p>{description}</p></div>

            <div className={displayCompleted ? 'rewardObjective unlocked' : 'rewardObjective'}>
              <span className="rewardIcon">{displayCompleted ? '✓' : '◇'}</span>
              <div className="rewardCopy"><small>{t.rewardLabel}</small><strong>{displayCompleted ? t.rewardUnlocked : t.rewardLocked}</strong></div>
              <span className="rewardState">{displayCompleted ? t.unlocked : t.locked}</span>
            </div>

            {active ? <div className="inviteCodeCard"><span>{t.codeLabel}</span><strong>{active.code}</strong></div> : null}

            <div className="progressTrack" aria-label={statusText}>
              <div className="progressLine">
                <span className={stageIndex >= 1 ? 'lineFill stageOne' : 'lineFill'} />
                <span className={stageIndex >= 2 ? 'lineFill stageTwo' : 'lineFill'} />
              </div>
              <ProgressStep number="1" label={stageIndex >= 1 ? t.linkCreated : t.createLink} state={stageIndex >= 1 ? 'complete' : 'idle'} />
              <ProgressStep number="2" label={stageIndex === 1 ? t.waitingForFriendStep : t.friendJoins} state={stageIndex >= 2 ? 'complete' : stageIndex === 1 ? 'waiting' : 'idle'} />
              <ProgressStep number="3" label={t.activation} state={stageIndex >= 3 ? 'complete' : stageIndex === 2 ? 'active' : 'idle'} />
            </div>

            {inviteSlotAvailable ? (
              <button type="button" className="primaryAction" disabled={loading || isWalletModalOpen} onClick={wallet ? createInvite : openWallet}>
                {wallet ? (loading ? t.creating : completedInvites.length > 0 ? t.createNextInvite : t.createInvite) : isWalletModalOpen ? t.connecting : t.connectStart}
                <span aria-hidden="true">›</span>
              </button>
            ) : null}

            {waitingForFriend ? (
              <div className="actionStack">
                <button type="button" className="primaryAction" onClick={shareInvite}>{t.shareInvite}<span aria-hidden="true">›</span></button>
                <button type="button" className="secondaryAction" onClick={copyInvite}>{t.copyLink}</button>
              </div>
            ) : null}

            {(activating || underReview) ? <div className="liveStatus"><span className="pulseDot" /><strong>{statusText}</strong></div> : null}

            {rewardRecord ? (
              <div className="completePanel">
                <span className="completeIcon">✓</span>
                <div><strong>{rewardPanelTitle}</strong><p>{rewardPanelDescription}</p>
                  {claimAvailable ? (
                    <button type="button" className="primaryAction claimAction" disabled={claimingReward} onClick={() => void claimReward()}>
                      {claimingReward ? t.claimingReward : t.claimReward}<span aria-hidden="true">›</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {waitingForFriend ? (
              <button ref={cancelTriggerRef} type="button" className="cancelLink" onClick={() => setShowCancel(true)}>{t.cancelInvite}</button>
            ) : null}
          </section>

          {message ? <div className="toast" role="status">{message}</div> : null}
          <section className="dappInfo"><span className="dappInfoLabel">{t.dappTitle}</span><p>{t.dappDescription}</p></section>
          <footer className="footerLinks"><Link href="/privacy">{t.privacy}</Link><Link href="/terms">{t.terms}</Link></footer>
        </>
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

      {showCancel && waitingForFriend ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCancelModal(); }}>
          <div ref={cancelDialogRef} className="modalCard" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title" aria-describedby="cancel-dialog-description">
            <div className="warningIcon">!</div>
            <h2 id="cancel-dialog-title">{t.cancelTitleWaiting}</h2>
            <p id="cancel-dialog-description">{t.cancelDescriptionWaiting}</p>
            <button ref={cancelKeepRef} type="button" className="primaryAction" onClick={closeCancelModal}>{t.keepInvite}</button>
            <button type="button" className="cancelConfirm" disabled={loading} onClick={() => void cancelInvite()}>{t.confirmCancel}</button>
          </div>
        </div>
      ) : null}

      <AppBottomNavigation activeTab={activeTab} locale={locale} onChange={changeTab} />

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 118px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 26px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .topActions { min-width:0; display:flex; align-items:center; gap:10px; }
        .languageSelect { max-width:155px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
        .accountChip { min-height:40px; padding:0 13px; display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.72rem; font-weight:850; cursor:pointer; }
        .accountDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 14px rgba(244,183,40,.68); }
        .missionCard { position:relative; overflow:hidden; width:min(100%,520px); box-sizing:border-box; margin:0 auto; padding:24px; border:1px solid rgba(255,201,61,.28); border-radius:30px; background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%); box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08); }
        .cardGlow { position:absolute; top:-110px; right:-90px; width:250px; height:250px; border-radius:50%; background:rgba(244,183,40,.22); filter:blur(4px); pointer-events:none; }
        .missionHeader { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .missionHeader .missionLabel { order:-1; }
        .badge { width:fit-content; max-width:62%; display:inline-flex; align-items:center; min-height:28px; padding:0 11px; border:1px solid rgba(255,205,80,.3); border-radius:999px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.66rem; font-weight:950; letter-spacing:.05em; overflow-wrap:anywhere; }
        .missionLabel { color:#8f86ae; font-size:.68rem; font-weight:900; letter-spacing:.12em; }
        .missionCopy { position:relative; z-index:1; margin-top:24px; }
        .missionCopy h1 { max-width:100%; margin:0; font-size:clamp(2.05rem,8vw,3.05rem); line-height:1.04; letter-spacing:-.05em; text-wrap:balance; overflow-wrap:anywhere; hyphens:auto; }
        .missionCopy.cjkCopy h1 { font-size:clamp(2rem,7vw,2.85rem); line-height:1.1; letter-spacing:-.035em; }
        .missionCopy p { max-width:410px; margin:13px 0 0; color:#b7b1c7; font-size:.94rem; font-weight:650; line-height:1.58; overflow-wrap:anywhere; }
        .rewardObjective { position:relative; z-index:1; margin-top:22px; padding:14px 15px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; border:1px solid rgba(255,255,255,.09); border-radius:17px; background:rgba(255,255,255,.045); }
        .rewardObjective.unlocked { border-color:rgba(82,225,164,.22); background:rgba(37,170,115,.09); }
        .rewardIcon { width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:rgba(244,183,40,.13); color:#ffd66e; font-size:1.25rem; font-weight:950; }
        .rewardObjective.unlocked .rewardIcon { background:rgba(52,212,142,.16); color:#75efb8; }
        .rewardCopy { min-width:0; display:grid; gap:3px; }
        .rewardCopy small { color:#858097; font-size:.6rem; font-weight:900; letter-spacing:.08em; overflow-wrap:anywhere; }
        .rewardCopy strong { color:#f5f2ff; font-size:.81rem; line-height:1.3; overflow-wrap:anywhere; }
        .rewardState { min-height:25px; padding:0 9px; display:inline-flex; align-items:center; border:1px solid rgba(255,255,255,.08); border-radius:999px; color:#777184; font-size:.56rem; font-weight:950; letter-spacing:.04em; }
        .rewardObjective.unlocked .rewardState { border-color:rgba(82,225,164,.2); color:#77efb9; }
        .inviteCodeCard { position:relative; z-index:1; margin-top:22px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid rgba(255,255,255,.09); border-radius:16px; background:rgba(255,255,255,.045); }
        .inviteCodeCard span { color:#8f899e; font-size:.72rem; font-weight:800; }
        .inviteCodeCard strong { color:#ffd66e; font-size:1rem; letter-spacing:.08em; overflow-wrap:anywhere; }
        .progressTrack { position:relative; z-index:1; display:grid; grid-template-columns:repeat(3,1fr); margin-top:25px; }
        .progressLine { position:absolute; top:15px; left:16.66%; right:16.66%; height:2px; display:grid; grid-template-columns:1fr 1fr; background:rgba(255,255,255,.09); }
        .lineFill { height:2px; background:transparent; }.lineFill.stageOne,.lineFill.stageTwo { background:#f4b728; box-shadow:0 0 12px rgba(244,183,40,.45); }
        .primaryAction,.secondaryAction { position:relative; z-index:1; width:100%; min-height:58px; border-radius:18px; font:inherit; font-size:.96rem; font-weight:950; cursor:pointer; overflow-wrap:anywhere; }
        .primaryAction { margin-top:24px; border:0; display:flex; align-items:center; justify-content:center; gap:10px; padding:10px 16px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22); }
        .primaryAction span { font-size:1.55rem; line-height:1; }.primaryAction:disabled { opacity:.42; cursor:not-allowed; box-shadow:none; }
        .secondaryAction { border:1px solid rgba(255,255,255,.11); background:rgba(255,255,255,.045); color:#fff; }
        .actionStack { display:grid; gap:11px; }
        .liveStatus { position:relative; z-index:1; min-height:58px; margin-top:24px; padding:8px 14px; display:flex; align-items:center; justify-content:center; gap:10px; border:1px solid rgba(255,201,61,.24); border-radius:18px; background:rgba(244,183,40,.08); color:#ffd66e; text-align:center; }
        .pulseDot { flex:0 0 auto; width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 18px rgba(244,183,40,.72); animation:pulse 1.6s ease-in-out infinite; }
        .completePanel { position:relative; z-index:1; margin-top:24px; padding:16px; display:flex; align-items:flex-start; gap:13px; border:1px solid rgba(90,222,166,.2); border-radius:18px; background:rgba(40,170,118,.08); }
        .completeIcon { flex:0 0 auto; width:38px; height:38px; display:grid; place-items:center; border-radius:50%; background:rgba(64,222,156,.18); color:#77efb9; font-weight:950; }
        .completePanel > div { min-width:0; flex:1; }.completePanel strong { font-size:.9rem; overflow-wrap:anywhere; }.completePanel p { margin:4px 0 0; color:#9eaa9f; font-size:.75rem; line-height:1.45; overflow-wrap:anywhere; }
        .claimAction { min-height:46px; margin-top:13px; border-radius:14px; font-size:.84rem; }
        .cancelLink { position:relative; z-index:1; display:block; margin:18px auto 0; border:0; background:transparent; color:#8d879a; font:inherit; font-size:.74rem; font-weight:800; cursor:pointer; }
        .toast { width:min(100%,520px); box-sizing:border-box; margin:14px auto 0; padding:13px 15px; border:1px solid rgba(77,224,167,.18); border-radius:15px; background:rgba(33,159,111,.1); color:#7cefc0; font-size:.82rem; font-weight:800; overflow-wrap:anywhere; }
        .dappInfo { width:min(100%,520px); box-sizing:border-box; margin:18px auto 0; padding:16px 18px; border:1px solid rgba(255,255,255,.08); border-radius:16px; background:rgba(255,255,255,.035); }
        .dappInfoLabel { display:block; color:#ffd66e; font-size:.78rem; font-weight:900; overflow-wrap:anywhere; }.dappInfo p { margin:7px 0 0; color:#8f899e; font-size:.74rem; line-height:1.55; overflow-wrap:anywhere; }
        .footerLinks { width:min(100%,520px); margin:24px auto 0; display:flex; justify-content:center; flex-wrap:wrap; gap:20px; }.footerLinks :global(a) { color:#706b7d; font-size:.72rem; font-weight:750; text-decoration:none; }
        .modalBackdrop { position:fixed; z-index:100; inset:0; display:grid; place-items:center; padding:20px; background:rgba(2,3,10,.78); backdrop-filter:blur(10px); }
        .modalCard { width:min(100%,410px); box-sizing:border-box; padding:25px; border:1px solid rgba(255,255,255,.1); border-radius:25px; background:#121421; text-align:center; box-shadow:0 30px 90px rgba(0,0,0,.5); }
        .warningIcon { width:50px; height:50px; margin:0 auto 15px; display:grid; place-items:center; border-radius:17px; background:rgba(255,91,111,.1); color:#ff7186; font-size:1.2rem; font-weight:950; }.modalCard h2 { margin:0; font-size:1.4rem; letter-spacing:-.03em; overflow-wrap:anywhere; }.modalCard p { margin:11px 0 0; color:#a39eaf; font-size:.88rem; line-height:1.55; overflow-wrap:anywhere; }.cancelConfirm { margin-top:16px; border:0; background:transparent; color:#ff7186; font:inherit; font-size:.8rem; font-weight:900; cursor:pointer; }
        @keyframes pulse { 0%,100% { opacity:.55; transform:scale(.9); } 50% { opacity:1; transform:scale(1.08); } }
        @media (max-width:560px) { .screen { padding:18px 14px 116px; }.topBar { align-items:flex-start; }.topActions { max-width:58%; align-items:flex-end; flex-direction:column-reverse; gap:7px; }.languageSelect { width:100%; max-width:155px; height:34px; border-radius:11px; font-size:.68rem; }.accountChip { min-height:34px; padding:0 10px; border-radius:11px; font-size:.66rem; }.missionCard { padding:21px 18px; border-radius:26px; }.missionHeader { align-items:flex-start; }.missionCopy { margin-top:30px; }.missionCopy h1 { font-size:clamp(1.9rem,10vw,2.6rem); }.missionCopy.cjkCopy h1 { font-size:clamp(1.9rem,9vw,2.4rem); } }
      `}</style>
    </main>
  );
}

function ProgressStep({
  number,
  label,
  state,
}: {
  number: string;
  label: string;
  state: 'idle' | 'active' | 'waiting' | 'complete';
}) {
  return (
    <div className={`step ${state}`}>
      <span className="stepCircle">{state === 'complete' ? '✓' : number}</span>
      <span className="stepLabel">{label}</span>
      <style jsx>{`
        .step { position:relative; z-index:2; min-width:0; display:grid; justify-items:center; gap:8px; color:#777282; }
        .stepCircle { width:31px; height:31px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.11); border-radius:50%; background:#171927; color:#777282; font-size:.72rem; font-weight:950; }
        .stepLabel { max-width:100%; text-align:center; font-size:.65rem; line-height:1.25; font-weight:850; overflow-wrap:anywhere; }
        .step.active,.step.waiting,.step.complete { color:#ffd66e; }
        .step.active .stepCircle { border-color:#ffd24d; background:#f4b728; color:#17120a; box-shadow:0 0 22px rgba(244,183,40,.38); }
        .step.waiting .stepCircle { border-color:#f4b728; color:#ffd66e; box-shadow:0 0 0 4px rgba(244,183,40,.08),0 0 20px rgba(244,183,40,.24); }
        .step.complete .stepCircle { border-color:rgba(244,183,40,.46); background:rgba(244,183,40,.14); color:#ffd66e; }
      `}</style>
    </div>
  );
}
