'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import {
  AppBottomNavigation,
  type AppTab,
} from './AppBottomNavigation';
import { Brand } from './Brand';
import {
  useWalletLauncher,
} from './WalletControl';
import type { InviteRecord } from '@/lib/types';

const AppGuide = dynamic(() =>
  import('./AppGuide').then(
    (module) => module.AppGuide,
  ),
);

const AppSettings = dynamic(() =>
  import('./AppSettings').then(
    (module) => module.AppSettings,
  ),
);

const PublicLeaderboard = dynamic(() =>
  import('./PublicLeaderboard').then(
    (module) => module.PublicLeaderboard,
  ),
);

type Locale = 'en' | 'ko';

const LANGUAGE_STORAGE_KEY =
  'veinvite-language';

const VERCEL_SHARE_STORAGE_KEY =
  'veinvite_vercel_share';

const COPY = {
  en: {
    language: 'English',
    inviteAvailable: '1 INVITE SLOT READY',
    inviteMission: 'QUEST 01',
    emptyTitle: 'Invite Your First Friend',
    emptyDescription:
      'Create one invite and help a new or returning user complete a VeInvite onboarding mission.',
    createInvite: 'Create Invite',
    createNextInvite: 'Invite another friend',
    creating: 'Creating…',
    connectStart: 'Connect Wallet & Start',
    connecting: 'Opening wallet…',
    rewardLabel: 'ONBOARDING STATUS',
    rewardLocked: 'Complete the mission to finish onboarding',
    rewardUnlocked: 'Onboarding complete',
    locked: 'LOCKED',
    unlocked: 'UNLOCKED',
    inviteReadyBadge: 'INVITE READY',
    inviteReadyTitle: 'Your invite is ready',
    inviteReadyDescription:
      'Send the link to one friend. The next step starts when they join.',
    friendJoinedBadge: 'FRIEND JOINED',
    friendJoinedTitle: 'Your friend joined',
    friendJoinedDescription:
      'Your friend is completing their VeInvite missions now.',
    reviewBadge: 'ACTIVATION CHECK',
    reviewTitle: 'Checking the final step',
    reviewDescription:
      'Hang tight. This step must be verified before completion.',
    completeBadge: 'MISSION COMPLETE',
    completeTitle: 'Invite completed',
    completeDescription:
      'Your friend completed the mission. Onboarding is verified.',
    shareInvite: 'Share Invite',
    copyLink: 'Copy Link',
    copied: 'Invite link copied.',
    cancelInvite: 'Cancel invite',
    cancelTitleWaiting: 'Cancel this invite link?',
    cancelDescriptionWaiting:
      'This link will stop working and your invite slot will be restored.',
    keepInvite: 'Keep Invite',
    confirmCancel: 'Cancel Invite',
    cancelled:
      'Invite cancelled. You can create a new one.',
    noActive: 'No active invite',
    createLink: 'Invite',
    linkCreated: 'Link ready',
    waitingForFriendStep: 'Waiting for friend',
    friendJoins: 'Friend joined',
    activation: 'Final verification',
    waiting: 'Waiting for friend',
    inProgress: 'In progress',
    checking: 'Checking',
    completed: 'Completed',
    codeLabel: 'Invite code',
    rewardTitle: 'Referral status',
    rewardPending: 'Onboarding verified',
    rewardDescription:
      'The final reward and anti-abuse checks are still in progress.',
    rewardClaimReady:
      'Your reward is ready to claim',
    rewardClaimDescription:
      'Your referral passed the final checks. Request the reward now and it will be included in the next funded reward round.',
    claimReward: 'Claim reward',
    claimingReward: 'Claiming…',
    rewardClaimed:
      'Reward claim submitted',
    rewardClaimedDescription:
      'Your reward is queued for the next funded reward round. No additional action is needed.',
    rewardAssigned:
      'Reward payout is being prepared',
    rewardAssignedDescription:
      'Your amount has been reserved in a payout round and is awaiting finalized distribution.',
    rewardPaid: 'Reward paid',
    rewardPaidDescription:
      'The B3TR reward was verified on-chain and recorded in your reward history.',
    rewardForfeited: 'Reward not approved',
    rewardForfeitedDescription:
      'This referral did not pass the final reward checks. Your invite slot is ready for another friend.',
    claimSuccess:
      'Reward requested. It will be included in the next funded reward round.',
    claimError:
      'Could not request the reward.',
    privacy: 'Privacy',
    terms: 'Terms',
    genericError: 'Something went wrong.',
    loadError: 'Could not load invitation data.',
    createError: 'Could not create an invitation.',
    cancelError: 'Could not cancel the invitation.',
    dappTitle: 'Built for the VeBetterDAO ecosystem',
    dappDescription:
      'VeInvite helps new users get started and gives returning users a clear path back. Support for dApp-specific referral campaigns is planned for a future update.',
  },
  ko: {
    language: '한국어',
    inviteAvailable: '초대 슬롯 1개 준비',
    inviteMission: '퀘스트 01',
    emptyTitle: '첫 친구를 초대하세요',
    emptyDescription:
      '초대 링크를 만들고 신규 또는 복귀 사용자의 VeBetterDAO 참여를 도와주세요.',
    createInvite: '초대 만들기',
    createNextInvite: '다음 친구 초대하기',
    creating: '만드는 중…',
    connectStart: '지갑 연결하고 시작하기',
    connecting: '지갑 여는 중…',
    rewardLabel: '온보딩 상태',
    rewardLocked: '친구가 미션을 완료하면 확인돼요',
    rewardUnlocked: '온보딩 완료',
    locked: '잠김',
    unlocked: '해제',
    inviteReadyBadge: '초대 준비 완료',
    inviteReadyTitle: '초대가 준비됐어요',
    inviteReadyDescription:
      '친구 한 명에게 링크를 보내세요. 친구가 참여하면 다음 단계가 시작돼요.',
    friendJoinedBadge: '친구 참여',
    friendJoinedTitle: '친구가 참여했어요',
    friendJoinedDescription:
      '친구가 VeInvite 미션을 진행하고 있어요.',
    reviewBadge: '활성화 확인 중',
    reviewTitle: '마지막 단계를 확인하고 있어요',
    reviewDescription:
      '잠시만 기다려 주세요. 완료 전 마지막 확인이 필요해요.',
    completeBadge: '미션 완료',
    completeTitle: '초대가 완료됐어요',
    completeDescription:
      '친구가 미션을 완료했고 온보딩이 확인됐어요.',
    shareInvite: '초대 공유하기',
    copyLink: '링크 복사',
    copied: '초대 링크를 복사했어요.',
    cancelInvite: '초대 취소',
    cancelTitleWaiting: '이 초대 링크를 취소할까요?',
    cancelDescriptionWaiting:
      '현재 링크는 더 이상 작동하지 않고 초대 가능 횟수가 복구됩니다.',
    keepInvite: '초대 유지',
    confirmCancel: '초대 취소',
    cancelled:
      '초대가 취소됐어요. 새 초대를 만들 수 있어요.',
    noActive: '진행 중인 초대 없음',
    createLink: '초대',
    linkCreated: '링크 준비 완료',
    waitingForFriendStep: '친구 대기',
    friendJoins: '친구 참여 완료',
    activation: '최종 확인',
    waiting: '친구 대기 중',
    inProgress: '진행 중',
    checking: '확인 중',
    completed: '완료',
    codeLabel: '초대 코드',
    rewardTitle: '추천 결과',
    rewardPending: '온보딩 확인 완료',
    rewardDescription:
      '현재 최종 보상 자격과 부정 활동 여부를 확인하고 있어요.',
    rewardClaimReady:
      '보상을 수령할 수 있어요',
    rewardClaimDescription:
      '추천 활동이 최종 검증을 통과했어요. 지금 수령 요청하면 다음 보상 라운드에 자동 반영됩니다.',
    claimReward: '보상 수령 요청',
    claimingReward: '요청하는 중…',
    rewardClaimed:
      '보상 수령 요청 완료',
    rewardClaimedDescription:
      '다음 보상 라운드 지급 대기열에 등록됐어요. 추가로 할 일은 없습니다.',
    rewardAssigned:
      '보상 지급 준비 중',
    rewardAssignedDescription:
      '받을 금액이 지급 라운드에 배정됐으며 최종 전송을 준비하고 있어요.',
    rewardPaid: '보상 지급 완료',
    rewardPaidDescription:
      'B3TR 지급이 온체인에서 확인되고 보상 내역에 기록됐어요.',
    rewardForfeited: '보상 지급 대상이 아니에요',
    rewardForfeitedDescription:
      '이번 초대는 최종 보상 검토를 통과하지 못했어요. 다른 친구를 새로 초대할 수 있어요.',
    claimSuccess:
      '보상 수령을 요청했어요. 다음 보상 라운드에 자동 반영됩니다.',
    claimError:
      '보상 수령을 요청하지 못했습니다.',
    privacy: '개인정보처리방침',
    terms: '이용약관',
    genericError: '오류가 발생했습니다.',
    loadError: '초대 정보를 불러오지 못했습니다.',
    createError: '초대 링크를 만들지 못했습니다.',
    cancelError: '초대를 취소하지 못했습니다.',
    dappTitle: 'VeBetterDAO 생태계를 위한 VeInvite',
    dappDescription:
      'VeInvite는 신규 사용자가 생태계를 처음 경험하고, 쉬었던 사용자가 다시 돌아오도록 돕는 초대 앱이에요. dApp별 추천 캠페인 기능도 차차 지원할 예정이에요.',
  },
} as const;

export function HomeClient() {
  const {
    wallet,
    openWallet,
    connectAnotherWallet,
    disconnectWallet,
    isWalletActionPending,
    isWalletModalOpen,
  } = useWalletLauncher();

  const [locale, setLocale] =
    useState<Locale>('en');
  const [invites, setInvites] = useState<
    InviteRecord[]
  >([]);
  const [loading, setLoading] =
    useState(false);
  const [
    claimingReward,
    setClaimingReward,
  ] = useState(false);
  const [message, setMessage] =
    useState('');
  const [showCancel, setShowCancel] =
    useState(false);
  const [activeTab, setActiveTab] =
    useState<AppTab>('home');
  const [
    vercelShareToken,
    setVercelShareToken,
  ] = useState('');

  const t = COPY[locale];

  useEffect(() => {
    const saved =
      window.localStorage.getItem(
        LANGUAGE_STORAGE_KEY,
      );

    const initialLocale: Locale =
      saved === 'ko' || saved === 'en'
        ? saved
        : 'en';

    setLocale(initialLocale);
    document.documentElement.lang =
      initialLocale;

    const handleLanguageChange = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<Locale>;

      if (
        customEvent.detail === 'en' ||
        customEvent.detail === 'ko'
      ) {
        setLocale(customEvent.detail);
      }
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
    };
  }, []);

  useEffect(() => {
    const searchParams =
      new URLSearchParams(
        window.location.search,
      );

    const tokenFromUrl =
      searchParams.get('_vercel_share');

    const storedToken =
      window.sessionStorage.getItem(
        VERCEL_SHARE_STORAGE_KEY,
      );

    const token =
      tokenFromUrl ?? storedToken ?? '';

    if (!token) {
      return;
    }

    window.sessionStorage.setItem(
      VERCEL_SHARE_STORAGE_KEY,
      token,
    );

    setVercelShareToken(token);
  }, []);

  const changeLocale = (
    nextLocale: Locale,
  ) => {
    setLocale(nextLocale);

    window.localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      nextLocale,
    );

    document.documentElement.lang =
      nextLocale;

    window.dispatchEvent(
      new CustomEvent(
        'veinvite-language-change',
        {
          detail: nextLocale,
        },
      ),
    );
  };

  const changeTab = (nextTab: AppTab) => {
    setActiveTab(nextTab);
    setShowCancel(false);
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const active = invites.find((invite) =>
    [
      'PENDING_ACCEPTANCE',
      'ACTIVATING',
      'UNDER_REVIEW',
    ].includes(invite.status),
  );

  const completedInvites = invites.filter(
    (invite) => invite.status === 'COMPLETED',
  );

  const latestCompleted = completedInvites[0];
  const displayCompleted = active
    ? undefined
    : latestCompleted;

  const claimableReward = completedInvites.find(
    (invite) =>
      invite.rewardEligibility === 'ELIGIBLE' &&
      invite.rewardQueueStatus ===
        'AWAITING_CLAIM',
  );

  const unsettledReward = completedInvites.find(
    (invite) =>
      invite.rewardEligibility !== 'PAID' &&
      invite.rewardEligibility !== 'FORFEITED',
  );

  const rewardRecord =
    claimableReward ??
    unsettledReward ??
    (active ? undefined : latestCompleted);

  const waitingForFriend =
    active?.status ===
      'PENDING_ACCEPTANCE' &&
    !active.inviteeAddress;

  const activating =
    active?.status === 'ACTIVATING';

  const underReview =
    active?.status === 'UNDER_REVIEW';

  const claimAvailable =
    rewardRecord?.rewardEligibility ===
      'ELIGIBLE' &&
    rewardRecord.rewardQueueStatus ===
      'AWAITING_CLAIM';

  const claimRequested =
    rewardRecord?.rewardQueueStatus ===
      'QUEUED';

  const rewardAssigned =
    rewardRecord?.rewardQueueStatus ===
      'ASSIGNED';

  const rewardPaid =
    rewardRecord?.rewardEligibility ===
      'PAID';

  const rewardForfeited =
    rewardRecord?.rewardEligibility ===
      'FORFEITED';

  const inviteSlotAvailable = !active;

  const rewardPanelTitle = rewardForfeited
    ? t.rewardForfeited
    : rewardPaid
      ? t.rewardPaid
      : rewardAssigned
        ? t.rewardAssigned
        : claimRequested
          ? t.rewardClaimed
          : claimAvailable
            ? t.rewardClaimReady
            : t.rewardPending;

  const rewardPanelDescription =
    rewardForfeited
      ? t.rewardForfeitedDescription
      : rewardPaid
        ? t.rewardPaidDescription
        : rewardAssigned
          ? t.rewardAssignedDescription
          : claimRequested
            ? t.rewardClaimedDescription
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
      const response = await fetch(
        `/api/invites?inviter=${encodeURIComponent(
          wallet,
        )}`,
        {
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as {
        invites?: InviteRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? t.loadError,
        );
      }

      setInvites(data.invites ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t.genericError,
      );
    } finally {
      setLoading(false);
    }
  }, [wallet, t.loadError, t.genericError]);

  useEffect(() => {
    void load();
  }, [load]);

  const createInvite = async () => {
    if (!wallet) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/invites',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            inviterAddress: wallet,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? t.createError,
        );
      }

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t.genericError,
      );
    } finally {
      setLoading(false);
    }
  };

  const cancelInvite = async () => {
    if (!wallet || !active || !waitingForFriend) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(
        `/api/invites/${active.code}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            inviterAddress: wallet,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? t.cancelError,
        );
      }

      setShowCancel(false);
      setMessage(t.cancelled);

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t.genericError,
      );
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = useMemo(() => {
    if (
      !active ||
      typeof window === 'undefined'
    ) {
      return '';
    }

    const url = new URL(
      `/i/${active.code}`,
      window.location.origin,
    );

    if (vercelShareToken) {
      url.searchParams.set(
        '_vercel_share',
        vercelShareToken,
      );
    }

    return url.toString();
  }, [active, vercelShareToken]);

  const copyInvite = async () => {
    if (!inviteUrl) {
      return;
    }

    await navigator.clipboard.writeText(
      inviteUrl,
    );

    setMessage(t.copied);
  };

  const shareInvite = async () => {
    if (!inviteUrl) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VeInvite',
          text:
            locale === 'ko'
              ? 'VeInvite와 함께 VeBetterDAO 미션에 참여해 보세요.'
              : 'Join a VeBetterDAO mission with VeInvite.',
          url: inviteUrl,
        });
      } catch {
        return;
      }

      return;
    }

    await copyInvite();
  };

  const claimReward = async () => {
    if (
      !rewardRecord ||
      !claimAvailable ||
      claimingReward
    ) {
      return;
    }

    setClaimingReward(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/rewards/claims',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            inviteCode: rewardRecord.code,
          }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? t.claimError,
        );
      }

      setMessage(t.claimSuccess);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t.claimError,
      );
    } finally {
      setClaimingReward(false);
    }
  };

  const stageIndex = waitingForFriend
    ? 1
    : activating
      ? 2
      : underReview
        ? 2
        : displayCompleted
          ? 3
          : 0;

  const badge = waitingForFriend
    ? t.inviteReadyBadge
    : activating
      ? t.friendJoinedBadge
      : underReview
        ? t.reviewBadge
        : displayCompleted
          ? t.completeBadge
          : t.inviteAvailable;

  const title = waitingForFriend
    ? t.inviteReadyTitle
    : activating
      ? t.friendJoinedTitle
      : underReview
        ? t.reviewTitle
        : displayCompleted
          ? t.completeTitle
          : t.emptyTitle;

  const description = waitingForFriend
    ? t.inviteReadyDescription
    : activating
      ? t.friendJoinedDescription
      : underReview
        ? t.reviewDescription
        : displayCompleted
          ? t.completeDescription
          : t.emptyDescription;

  const statusText = waitingForFriend
    ? t.waiting
    : activating
      ? t.inProgress
      : underReview
        ? t.checking
        : displayCompleted
          ? t.completed
          : t.noActive;

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />

        <div className="topActions">
          <select
            className="languageSelect"
            value={locale}
            onChange={(event) =>
              changeLocale(
                event.target.value as Locale,
              )
            }
            aria-label="Language"
          >
            <option value="en">
              English
            </option>

            <option value="ko">
              한국어
            </option>
          </select>

          {wallet ? (
            <button
              type="button"
              className="accountChip"
              onClick={openWallet}
              aria-label="Open wallet account"
            >
              <span className="accountDot" />
              {wallet.slice(0, 6)}
              ···
              {wallet.slice(-4)}
            </button>
          ) : null}
        </div>
      </header>

      {activeTab === 'home' ? (
        <>
      <section className="missionCard">
        <div className="cardGlow" />

        <div className="missionHeader">
          <span className="badge">
            {badge}
          </span>

          <span className="missionLabel">
            {t.inviteMission}
          </span>
        </div>

        <div
          className={
            locale === 'ko'
              ? 'missionCopy koreanCopy'
              : 'missionCopy'
          }
        >
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div
          className={
            displayCompleted
              ? 'rewardObjective unlocked'
              : 'rewardObjective'
          }
        >
          <span className="rewardIcon">
            {displayCompleted ? '✓' : '◇'}
          </span>

          <div className="rewardCopy">
            <small>{t.rewardLabel}</small>
            <strong>
              {displayCompleted
                ? t.rewardUnlocked
                : t.rewardLocked}
            </strong>
          </div>

          <span className="rewardState">
            {displayCompleted
              ? t.unlocked
              : t.locked}
          </span>
        </div>

        {active ? (
          <div className="inviteCodeCard">
            <span>{t.codeLabel}</span>
            <strong>{active.code}</strong>
          </div>
        ) : null}

        <div
          className="progressTrack"
          aria-label={statusText}
        >
          <div className="progressLine">
            <span
              className={
                stageIndex >= 1
                  ? 'lineFill stageOne'
                  : 'lineFill'
              }
            />
            <span
              className={
                stageIndex >= 2
                  ? 'lineFill stageTwo'
                  : 'lineFill'
              }
            />
          </div>

          <ProgressStep
            number="1"
            label={
              stageIndex >= 1
                ? t.linkCreated
                : t.createLink
            }
            state={
              stageIndex >= 1
                ? 'complete'
                : 'idle'
            }
          />

          <ProgressStep
            number="2"
            label={
              stageIndex === 1
                ? t.waitingForFriendStep
                : t.friendJoins
            }
            state={
              stageIndex >= 2
                ? 'complete'
                : stageIndex === 1
                  ? 'waiting'
                  : 'idle'
            }
          />

          <ProgressStep
            number="3"
            label={t.activation}
            state={
              stageIndex >= 3
                ? 'complete'
                : stageIndex === 2
                  ? 'active'
                  : 'idle'
            }
          />
        </div>

        {inviteSlotAvailable ? (
          <button
            type="button"
            className="primaryAction"
            disabled={
              loading ||
              isWalletModalOpen
            }
            onClick={
              wallet
                ? createInvite
                : openWallet
            }
          >
            {wallet
              ? loading
                ? t.creating
                : completedInvites.length > 0
                  ? t.createNextInvite
                  : t.createInvite
              : isWalletModalOpen
                ? t.connecting
                : t.connectStart}
            <span aria-hidden="true">›</span>
          </button>
        ) : null}

        {waitingForFriend ? (
          <div className="actionStack">
            <button
              type="button"
              className="primaryAction"
              onClick={shareInvite}
            >
              {t.shareInvite}
              <span aria-hidden="true">›</span>
            </button>

            <button
              type="button"
              className="secondaryAction"
              onClick={copyInvite}
            >
              {t.copyLink}
            </button>
          </div>
        ) : null}

        {(activating || underReview) ? (
          <div className="liveStatus">
            <span className="pulseDot" />
            <strong>{statusText}</strong>
          </div>
        ) : null}

        {rewardRecord ? (
          <div className="completePanel">
            <span className="completeIcon">
              ✓
            </span>

            <div>
              <strong>
                {rewardPanelTitle}
              </strong>
              <p>
                {rewardPanelDescription}
              </p>

              {claimAvailable ? (
                <button
                  type="button"
                  className="primaryAction claimAction"
                  disabled={claimingReward}
                  onClick={() => {
                    void claimReward();
                  }}
                >
                  {claimingReward
                    ? t.claimingReward
                    : t.claimReward}
                  <span aria-hidden="true">
                    ›
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {waitingForFriend ? (
          <button
            type="button"
            className="cancelLink"
            onClick={() =>
              setShowCancel(true)
            }
          >
            {t.cancelInvite}
          </button>
        ) : null}
      </section>

      {message ? (
        <div className="toast">
          {message}
        </div>
      ) : null}

      <section className="dappInfo">
        <span className="dappInfoLabel">
          {t.dappTitle}
        </span>
        <p>{t.dappDescription}</p>
      </section>

      <footer className="footerLinks">
        <Link href="/privacy">
          {t.privacy}
        </Link>

        <Link href="/terms">
          {t.terms}
        </Link>
      </footer>
        </>
      ) : activeTab === 'guide' ? (
        <AppGuide locale={locale} />
      ) : activeTab === 'leaderboard' ? (
        <PublicLeaderboard
          locale={locale}
          wallet={wallet}
        />
      ) : (
        <AppSettings
          locale={locale}
          wallet={wallet}
          isWalletActionPending={
            isWalletActionPending
          }
          onLocaleChange={changeLocale}
          onConnect={openWallet}
          onConnectAnother={
            connectAnotherWallet
          }
          onDisconnect={disconnectWallet}
        />
      )}

      {showCancel && waitingForFriend ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="modalCard">
            <div className="warningIcon">
              !
            </div>

            <h2>{t.cancelTitleWaiting}</h2>
            <p>{t.cancelDescriptionWaiting}</p>

            <button
              type="button"
              className="primaryAction"
              onClick={() =>
                setShowCancel(false)
              }
            >
              {t.keepInvite}
            </button>

            <button
              type="button"
              className="cancelConfirm"
              disabled={loading}
              onClick={cancelInvite}
            >
              {t.confirmCancel}
            </button>
          </div>
        </div>
      ) : null}

      <AppBottomNavigation
        activeTab={activeTab}
        locale={locale}
        onChange={changeTab}
      />

      <style jsx>{`
        .screen {
          min-height: 100svh;
          box-sizing: border-box;
          padding: 22px 18px 118px;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 50% 16%,
              rgba(244, 183, 40, 0.14),
              transparent 32%
            ),
            #080807;
        }

        .topBar {
          width: min(100%, 520px);
          margin: 0 auto 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .topActions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .languageSelect {
          height: 40px;
          padding: 0 30px 0 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 13px;
          background: #141625;
          color: #ffffff;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }

        .accountChip {
          min-height: 40px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 13px;
          background: #141625;
          color: #ffffff;
          font: inherit;
          font-size: 0.72rem;
          font-weight: 850;
          cursor: pointer;
        }

        .accountDot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #f4b728;
          box-shadow: 0 0 14px rgba(244, 183, 40, 0.68);
        }

        .missionCard {
          position: relative;
          overflow: hidden;
          width: min(100%, 520px);
          box-sizing: border-box;
          margin: 0 auto;
          padding: 24px;
          border: 1px solid rgba(255, 201, 61, 0.28);
          border-radius: 30px;
          background:
            linear-gradient(
              155deg,
              rgba(54, 40, 14, 0.98),
              rgba(16, 16, 14, 0.99) 66%
            );
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.44),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .cardGlow {
          position: absolute;
          top: -110px;
          right: -90px;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          background: rgba(244, 183, 40, 0.22);
          filter: blur(4px);
          pointer-events: none;
        }

        .missionHeader {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .missionHeader .missionLabel {
          order: -1;
        }

        .badge {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 11px;
          border: 1px solid rgba(255, 205, 80, 0.3);
          border-radius: 999px;
          background: rgba(244, 183, 40, 0.12);
          color: #ffd66e;
          font-size: 0.68rem;
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .missionLabel {
          color: #8f86ae;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        .missionCopy {
          position: relative;
          z-index: 1;
          margin-top: 24px;
        }

        .missionCopy h1 {
          max-width: 100%;
          margin: 0;
          font-size: clamp(2.15rem, 8vw, 3.15rem);
          line-height: 1.02;
          letter-spacing: -0.055em;
          word-break: keep-all;
          overflow-wrap: normal;
          text-wrap: balance;
          hyphens: none;
        }

        .missionCopy.koreanCopy h1 {
          font-size: clamp(2.15rem, 7vw, 2.9rem);
          line-height: 1.08;
          letter-spacing: -0.045em;
        }

        .missionCopy p {
          max-width: 410px;
          margin: 13px 0 0;
          color: #b7b1c7;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.58;
        }

        .rewardObjective {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          padding: 14px 15px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 17px;
          background: rgba(255, 255, 255, 0.045);
        }

        .rewardObjective.unlocked {
          border-color: rgba(82, 225, 164, 0.22);
          background: rgba(37, 170, 115, 0.09);
        }

        .rewardIcon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: rgba(244, 183, 40, 0.13);
          color: #ffd66e;
          font-size: 1.25rem;
          font-weight: 950;
        }

        .rewardObjective.unlocked .rewardIcon {
          background: rgba(52, 212, 142, 0.16);
          color: #75efb8;
        }

        .rewardCopy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .rewardCopy small {
          color: #858097;
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .rewardCopy strong {
          overflow: hidden;
          color: #f5f2ff;
          font-size: 0.83rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rewardState {
          min-height: 25px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          color: #777184;
          font-size: 0.58rem;
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .rewardObjective.unlocked .rewardState {
          border-color: rgba(82, 225, 164, 0.2);
          color: #77efb9;
        }

        .inviteCodeCard {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.045);
        }

        .inviteCodeCard span {
          color: #8f899e;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .inviteCodeCard strong {
          color: #ffd66e;
          font-size: 1rem;
          letter-spacing: 0.1em;
        }

        .progressTrack {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin-top: 25px;
        }

        .progressLine {
          position: absolute;
          top: 15px;
          left: 16.66%;
          right: 16.66%;
          height: 2px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          background: rgba(255, 255, 255, 0.09);
        }

        .lineFill {
          height: 2px;
          background: transparent;
        }

        .lineFill.stageOne,
        .lineFill.stageTwo {
          background: #f4b728;
          box-shadow: 0 0 12px rgba(244, 183, 40, 0.45);
        }

        .primaryAction,
        .secondaryAction {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 58px;
          border-radius: 18px;
          font: inherit;
          font-size: 1rem;
          font-weight: 950;
          cursor: pointer;
        }

        .primaryAction {
          margin-top: 24px;
          border: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background:
            linear-gradient(
              135deg,
              #ffd24d,
              #efa718
            );
          color: #17120a;
          box-shadow:
            0 16px 35px rgba(190, 126, 12, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .primaryAction span {
          font-size: 1.55rem;
          line-height: 1;
          margin-top: -2px;
        }

        .primaryAction:disabled {
          opacity: 0.42;
          cursor: not-allowed;
          box-shadow: none;
        }

        .secondaryAction {
          border: 1px solid rgba(255, 255, 255, 0.11);
          background: rgba(255, 255, 255, 0.045);
          color: #ffffff;
        }

        .actionStack {
          display: grid;
          gap: 11px;
        }

        .liveStatus {
          position: relative;
          z-index: 1;
          min-height: 58px;
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid rgba(255, 201, 61, 0.24);
          border-radius: 18px;
          background: rgba(244, 183, 40, 0.08);
          color: #ffd66e;
        }

        .pulseDot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #f4b728;
          box-shadow: 0 0 18px rgba(244, 183, 40, 0.72);
          animation: pulse 1.6s ease-in-out infinite;
        }

        .completePanel {
          position: relative;
          z-index: 1;
          margin-top: 24px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid rgba(90, 222, 166, 0.2);
          border-radius: 18px;
          background: rgba(40, 170, 118, 0.08);
        }

        .completeIcon {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(64, 222, 156, 0.18);
          color: #77efb9;
          font-weight: 950;
        }

        .completePanel strong {
          font-size: 0.9rem;
        }

        .completePanel > div {
          min-width: 0;
          flex: 1;
        }

        .completePanel p {
          margin: 4px 0 0;
          color: #9eaa9f;
          font-size: 0.75rem;
          line-height: 1.45;
        }

        .claimAction {
          min-height: 46px;
          margin-top: 13px;
          border-radius: 14px;
          font-size: 0.84rem;
        }

        .cancelLink {
          position: relative;
          z-index: 1;
          display: block;
          margin: 18px auto 0;
          border: 0;
          background: transparent;
          color: #8d879a;
          font: inherit;
          font-size: 0.74rem;
          font-weight: 800;
          cursor: pointer;
        }

        .toast {
          width: min(100%, 520px);
          box-sizing: border-box;
          margin: 14px auto 0;
          padding: 13px 15px;
          border: 1px solid rgba(77, 224, 167, 0.18);
          border-radius: 15px;
          background: rgba(33, 159, 111, 0.1);
          color: #7cefc0;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .dappInfo {
          width: min(100%, 520px);
          box-sizing: border-box;
          margin: 18px auto 0;
          padding: 16px 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.035);
        }

        .dappInfoLabel {
          display: block;
          color: #ffd66e;
          font-size: 0.78rem;
          font-weight: 900;
        }

        .dappInfo p {
          margin: 7px 0 0;
          color: #8f899e;
          font-size: 0.74rem;
          line-height: 1.55;
        }

        .footerLinks {
          width: min(100%, 520px);
          margin: 24px auto 0;
          display: flex;
          justify-content: center;
          gap: 20px;
        }

        .footerLinks :global(a) {
          color: #706b7d;
          font-size: 0.72rem;
          font-weight: 750;
          text-decoration: none;
        }

        .modalBackdrop {
          position: fixed;
          z-index: 100;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(2, 3, 10, 0.78);
          backdrop-filter: blur(10px);
        }

        .modalCard {
          width: min(100%, 410px);
          box-sizing: border-box;
          padding: 25px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 25px;
          background: #121421;
          text-align: center;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
        }

        .warningIcon {
          width: 50px;
          height: 50px;
          margin: 0 auto 15px;
          display: grid;
          place-items: center;
          border-radius: 17px;
          background: rgba(255, 91, 111, 0.1);
          color: #ff7186;
          font-size: 1.2rem;
          font-weight: 950;
        }

        .modalCard h2 {
          margin: 0;
          font-size: 1.45rem;
          letter-spacing: -0.035em;
        }

        .modalCard p {
          margin: 11px 0 0;
          color: #a39eaf;
          font-size: 0.88rem;
          line-height: 1.55;
        }

        .cancelConfirm {
          margin-top: 16px;
          border: 0;
          background: transparent;
          color: #ff7186;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 900;
          cursor: pointer;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.9);
          }

          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }

        @media (max-width: 560px) {
          .screen {
            padding: 18px 14px 116px;
          }

          .topBar {
            align-items: flex-start;
          }

          .topActions {
            align-items: flex-end;
            flex-direction: column-reverse;
            gap: 7px;
          }

          .languageSelect {
            height: 34px;
            border-radius: 11px;
            font-size: 0.7rem;
          }

          .accountChip {
            min-height: 34px;
            padding: 0 10px;
            border-radius: 11px;
            font-size: 0.66rem;
          }

          .missionCard {
            padding: 21px 18px;
            border-radius: 26px;
          }

          .missionHeader {
            align-items: flex-start;
          }

          .missionCopy {
            margin-top: 30px;
          }

          .missionCopy h1 {
            font-size: clamp(2.05rem, 10.5vw, 2.7rem);
          }

          .missionCopy.koreanCopy h1 {
            font-size: clamp(2rem, 9.4vw, 2.45rem);
          }
        }
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
      <span className="stepCircle">
        {state === 'complete'
          ? '✓'
          : number}
      </span>

      <span className="stepLabel">
        {label}
      </span>

      <style jsx>{`
        .step {
          position: relative;
          z-index: 2;
          display: grid;
          justify-items: center;
          gap: 8px;
          color: #777282;
        }

        .stepCircle {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 50%;
          background: #171927;
          color: #777282;
          font-size: 0.72rem;
          font-weight: 950;
        }

        .stepLabel {
          text-align: center;
          font-size: 0.68rem;
          font-weight: 850;
        }

        .step.active,
        .step.waiting,
        .step.complete {
          color: #ffd66e;
        }

        .step.active .stepCircle {
          border-color: #ffd24d;
          background: #f4b728;
          color: #17120a;
          box-shadow: 0 0 22px rgba(244, 183, 40, 0.38);
        }

        .step.waiting .stepCircle {
          border-color: #f4b728;
          background: #171927;
          color: #ffd66e;
          box-shadow:
            0 0 0 4px rgba(244, 183, 40, 0.08),
            0 0 20px rgba(244, 183, 40, 0.24);
          animation: waitingPulse 1.7s ease-in-out infinite;
        }

        .step.complete .stepCircle {
          border-color: rgba(244, 183, 40, 0.46);
          background: rgba(244, 183, 40, 0.14);
          color: #ffd66e;
        }

        @keyframes waitingPulse {
          0%,
          100% {
            box-shadow:
              0 0 0 3px rgba(244, 183, 40, 0.06),
              0 0 14px rgba(244, 183, 40, 0.18);
          }

          50% {
            box-shadow:
              0 0 0 7px rgba(244, 183, 40, 0.1),
              0 0 24px rgba(244, 183, 40, 0.3);
          }
        }
      `}</style>
    </div>
  );
}
