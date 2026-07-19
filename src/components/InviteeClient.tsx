'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useConnectModal } from '@vechain/vechain-kit';
import { Brand } from './Brand';
import { useActiveWallet } from './WalletControl';
import type { InviteRecord } from '@/lib/types';

type Step =
  | 'landing'
  | 'wallet'
  | 'checking'
  | 'success'
  | 'missions'
  | 'error'
  | 'review';

type Locale = 'ko' | 'en';

type ErrorCode =
  | 'invalidLink'
  | 'eligibility'
  | 'existing'
  | 'other'
  | 'complete';

const LANGUAGE_STORAGE_KEY = 'veinvite-language';

const COPY = {
  ko: {
    languageContinue: '한국어로 계속',
    languageChanged: '한국어',
    invitationLabel: 'VeInvite 초대',
    landingTitle1: 'VeBetterDAO에',
    landingTitle2: '초대받았어요',
    landingDescription:
      'VeBetterDAO를 처음 시작하고 미션을 완료하면 나도 새로운 친구 한 명을 초대할 수 있어요.',
    eligibilityTitle: '참여 가능 안내',
    eligibilityDescription:
      '기존 VeChain 지갑을 사용 중이어도 VeBetterDAO를 이용한 적이 없다면 참여할 수 있습니다.',
    start: '시작하기',
    connectWalletTitle: '지갑을 연결해 주세요',
    connectWalletDescription:
      '연결된 지갑을 기준으로 VeBetterDAO 이용 여부와 초대 자격을 확인합니다.',
    connectWallet: '지갑 연결하기',
    walletConnected: '연결된 지갑',
    checkEligibility: '자격 확인하기',
    connectThenContinue: '지갑 연결 후 계속',
    checkingTitle: '자격을 확인하고 있어요',
    checkingDescription:
      '기존 이용 이력, 다른 초대 연결 여부, 링크 상태를 확인합니다.',
    checkingLink: '링크 상태 확인 중',
    checkingHistory: '기존 참여 이력 확인 중',
    checkingOtherInvite: '다른 초대 연결 여부 확인 중',
    reviewTitle: '계정을 확인하고 있어요',
    reviewDescription:
      '검토가 완료되면 앱에서 알려드릴게요. 반복해서 연결할 필요는 없습니다.',
    successTitle: '초대가 연결됐어요',
    successDescription:
      '이제 미션을 완료하고 VeBetterDAO를 직접 경험해 보세요.',
    walletMission: '지갑 연결',
    appMission: 'VeBetter 앱 3개 체험하기',
    voteMission: '투표 참여하기',
    viewMissions: '미션 보기',
    invitedFriend: '초대받은 친구',
    myMissions: '나의 미션',
    allMissionsComplete: '모든 미션 완료',
    oneThingToDo: '지금 해야 할 한 가지',
    walletMissionDescription: '참여 지갑이 연결됐어요.',
    appMissionDescription:
      '서로 다른 앱을 이용하고 B3TR를 획득하세요.',
    voteMissionDescription:
      'B3TR를 VOT3로 바꾼 뒤 앱 투표에 참여하세요.',
    complete: '완료',
    inProgress: '진행 중',
    locked: '잠김',
    demoComplete: '데모: 모든 조건 완료 처리',
    activationConfirmed:
      '활성화가 확인됐어요. 이제 나도 한 명을 초대할 수 있어요.',
    requestNewLink: '추천인에게 새로운 링크를 요청해 주세요.',
    home: '홈으로',
    demoResult: '데모 결과',
    demoSuccess: '정상 연결',
    demoExisting: '기존 VeBetter 이용자',
    demoOther: '다른 추천인 연결',
    demoReview: '안전성 검토',
    errors: {
      invalidLink: '유효하지 않거나 사용할 수 없는 초대 링크입니다.',
      eligibility: '초대 자격을 확인하지 못했습니다.',
      existing: '이미 VeBetterDAO를 이용한 기록이 있는 지갑입니다.',
      other: '이미 다른 추천인과 연결된 지갑입니다.',
      complete: '완료 상태를 확인하지 못했습니다.',
    },
  },
  en: {
    languageContinue: 'Continue in English',
    languageChanged: 'English',
    invitationLabel: 'VeInvite Invitation',
    landingTitle1: "You've been invited to",
    landingTitle2: 'VeBetterDAO',
    landingDescription:
      'Start using VeBetterDAO, complete the missions, and unlock one invitation for a new friend.',
    eligibilityTitle: 'Who can join?',
    eligibilityDescription:
      'You can participate even if you already use a VeChain wallet, as long as you have never used VeBetterDAO.',
    start: 'Get Started',
    connectWalletTitle: 'Connect your wallet',
    connectWalletDescription:
      'We use the connected wallet to check VeBetterDAO activity and invitation eligibility.',
    connectWallet: 'Connect Wallet',
    walletConnected: 'Connected wallet',
    checkEligibility: 'Check Eligibility',
    connectThenContinue: 'Connect wallet to continue',
    checkingTitle: 'Checking your eligibility',
    checkingDescription:
      'We are checking previous activity, other invitation links, and the status of this invitation.',
    checkingLink: 'Checking invitation status',
    checkingHistory: 'Checking previous participation',
    checkingOtherInvite: 'Checking other invitation links',
    reviewTitle: 'Your account is being reviewed',
    reviewDescription:
      'We will update you in the app when the review is complete. You do not need to reconnect repeatedly.',
    successTitle: 'Your invitation is connected',
    successDescription:
      'Complete the missions and experience VeBetterDAO for yourself.',
    walletMission: 'Connect wallet',
    appMission: 'Try 3 VeBetter apps',
    voteMission: 'Participate in voting',
    viewMissions: 'View Missions',
    invitedFriend: 'Invited Friend',
    myMissions: 'My Missions',
    allMissionsComplete: 'All missions complete',
    oneThingToDo: 'Your next mission',
    walletMissionDescription: 'Your participation wallet is connected.',
    appMissionDescription:
      'Use three different apps and earn B3TR.',
    voteMissionDescription:
      'Convert B3TR to VOT3 and participate in an app vote.',
    complete: 'Complete',
    inProgress: 'In progress',
    locked: 'Locked',
    demoComplete: 'Demo: Mark all conditions complete',
    activationConfirmed:
      'Activation confirmed. You can now invite one new friend.',
    requestNewLink: 'Ask your inviter for a new invitation link.',
    home: 'Home',
    demoResult: 'Demo result',
    demoSuccess: 'Eligible',
    demoExisting: 'Existing VeBetter user',
    demoOther: 'Connected to another inviter',
    demoReview: 'Security review',
    errors: {
      invalidLink: 'This invitation link is invalid or no longer available.',
      eligibility: 'We could not confirm your invitation eligibility.',
      existing: 'This wallet has already used VeBetterDAO.',
      other: 'This wallet is already connected to another inviter.',
      complete: 'We could not confirm mission completion.',
    },
  },
} as const;

export function InviteeClient({ code }: { code: string }) {
  const wallet = useActiveWallet();
  const { open: openConnectModal } = useConnectModal();

  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [step, setStep] = useState<Step>('landing');
  const [errorCode, setErrorCode] = useState<ErrorCode>('invalidLink');
  const [demoOutcome, setDemoOutcome] = useState('success');

  const [locale, setLocale] = useState<Locale>('en');
  const [languageReady, setLanguageReady] = useState(false);
  const [showLanguageSetup, setShowLanguageSetup] = useState(true);

  const t = COPY[locale];

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');

    const savedLocale: Locale | null =
      saved === 'ko' || saved === 'en' ? saved : null;
    const queryLocale: Locale | null =
      queryLanguage === 'ko' || queryLanguage === 'en'
        ? queryLanguage
        : null;
    const browserLocale: Locale = window.navigator.language
      .toLowerCase()
      .startsWith('ko')
      ? 'ko'
      : 'en';

    const initialLocale = queryLocale ?? savedLocale ?? browserLocale;

    setLocale(initialLocale);
    setShowLanguageSetup(!savedLocale);
    document.documentElement.lang = initialLocale;
    setLanguageReady(true);
  }, []);

  useEffect(() => {
    void fetch(`/api/invites/${code}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error('INVALID_INVITE');
        }

        setInvite(data.invite);
      })
      .catch(() => {
        setErrorCode('invalidLink');
        setStep('error');
      });
  }, [code]);

  const saveLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(
      new CustomEvent('veinvite-language-change', {
        detail: nextLocale,
      }),
    );
  };

  const confirmLanguage = () => {
    saveLocale(locale);
    setShowLanguageSetup(false);
  };

  const changeLocale = (nextLocale: Locale) => {
    saveLocale(nextLocale);
  };

  const claim = async () => {
    if (!wallet) {
      setStep('wallet');
      return;
    }

    setStep('checking');
    await new Promise((resolve) => setTimeout(resolve, 850));

    const response = await fetch(`/api/invites/${code}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteeAddress: wallet,
        demoOutcome: demoOutcome === 'success' ? undefined : demoOutcome,
      }),
    });

    const data = await response.json();

    if (response.status === 202 || data.outcome === 'review') {
      setStep('review');
      return;
    }

    if (!response.ok) {
      if (demoOutcome === 'existing') {
        setErrorCode('existing');
      } else if (demoOutcome === 'other') {
        setErrorCode('other');
      } else {
        setErrorCode('eligibility');
      }

      setStep('error');
      return;
    }

    setInvite(data.invite);
    setStep('success');
  };

  const completeMissions = async () => {
    const response = await fetch(`/api/invites/${code}/complete`, {
      method: 'POST',
    });
    const data = await response.json();

    if (!response.ok) {
      setErrorCode('complete');
      setStep('error');
      return;
    }

    setInvite(data.invite);
  };

  if (!languageReady) {
    return (
      <main className="centeredFlow">
        <Brand compact />
      </main>
    );
  }

  if (showLanguageSetup) {
    return (
      <main className="centeredFlow">
        <Brand compact />

        <div className="inviteOrb" aria-hidden="true">
          🌐
        </div>

        <span className="eyebrow">VeInvite</span>

        <h1>
          언어를 선택하세요
          <br />
          Choose your language
        </h1>

        <p className="muted">
          선택한 언어는 다음 화면부터 유지됩니다.
          <br />
          Your choice will be used throughout VeInvite.
        </p>

        <div className="panel" style={{ width: '100%' }}>
          <div className="buttonGrid">
            <button
              type="button"
              className={
                locale === 'ko' ? 'primaryButton inline' : 'secondaryButton'
              }
              onClick={() => setLocale('ko')}
            >
              한국어
            </button>

            <button
              type="button"
              className={
                locale === 'en' ? 'primaryButton inline' : 'secondaryButton'
              }
              onClick={() => setLocale('en')}
            >
              English
            </button>
          </div>
        </div>

        <button
          type="button"
          className="primaryButton"
          onClick={confirmLanguage}
        >
          {t.languageContinue}
        </button>
      </main>
    );
  }

  if (step === 'error') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="errorIcon">×</div>
        <h1>{t.errors[errorCode]}</h1>
        <p className="muted">{t.requestNewLink}</p>
        <Link className="secondaryButton linkButton" href="/">
          {t.home}
        </Link>
      </Centered>
    );
  }

  if (step === 'review') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="reviewIcon">◷</div>
        <h1>{t.reviewTitle}</h1>
        <p className="muted">{t.reviewDescription}</p>
      </Centered>
    );
  }

  if (step === 'checking') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="spinnerLarge" />
        <h1>{t.checkingTitle}</h1>
        <p className="muted">{t.checkingDescription}</p>

        <div className="checkList">
          <span>○ {t.checkingLink}</span>
          <span>○ {t.checkingHistory}</span>
          <span>○ {t.checkingOtherInvite}</span>
        </div>
      </Centered>
    );
  }

  if (step === 'wallet') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="walletVisual" />
        <h1>{t.connectWalletTitle}</h1>
        <p className="muted">{t.connectWalletDescription}</p>

        {!wallet ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={openConnectModal}
          >
            {t.connectWallet}
          </button>
        ) : (
          <div className="notice successNotice">
            {t.walletConnected}: {shortAddress(wallet)}
          </div>
        )}

        <button
          type="button"
          className="primaryButton"
          disabled={!wallet}
          onClick={() => void claim()}
        >
          {wallet ? t.checkEligibility : t.connectThenContinue}
        </button>
      </Centered>
    );
  }

  if (step === 'success') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="successCircle">✓</div>
        <h1>{t.successTitle}</h1>
        <p className="muted">{t.successDescription}</p>

        <div className="missionSummary">
          <span>✓ {t.walletMission}</span>
          <span>2. {t.appMission}</span>
          <span>3. {t.voteMission}</span>
        </div>

        <button
          type="button"
          className="primaryButton greenButton"
          onClick={() => setStep('missions')}
        >
          {t.viewMissions}
        </button>
      </Centered>
    );
  }

  if (step === 'missions') {
    const completed = invite?.status === 'COMPLETED';

    return (
      <main className="appShell">
        <header className="appHeader">
          <Brand />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span className="chip">{t.invitedFriend}</span>
            <LanguageSwitcher
              locale={locale}
              onChange={changeLocale}
              inline
            />
          </div>
        </header>

        <section className="panel missionPanel">
          <span className="eyebrow">{t.myMissions}</span>
          <h1>
            {completed ? t.allMissionsComplete : t.oneThingToDo}
          </h1>

          <div className="mission done">
            <span>✓</span>
            <div>
              <b>{t.walletMission}</b>
              <p>{t.walletMissionDescription}</p>
            </div>
            <em>{t.complete}</em>
          </div>

          <div
            className={`mission ${completed ? 'done' : 'current'}`}
          >
            <span>{completed ? '✓' : '◎'}</span>
            <div>
              <b>{t.appMission}</b>
              <p>{t.appMissionDescription}</p>
            </div>
            <em>{completed ? t.complete : t.inProgress}</em>
          </div>

          <div
            className={`mission ${completed ? 'done' : 'locked'}`}
          >
            <span>{completed ? '✓' : '◇'}</span>
            <div>
              <b>{t.voteMission}</b>
              <p>{t.voteMissionDescription}</p>
            </div>
            <em>{completed ? t.complete : t.locked}</em>
          </div>

          {!completed ? (
            <button
              type="button"
              className="secondaryButton"
              onClick={() => void completeMissions()}
            >
              {t.demoComplete}
            </button>
          ) : (
            <div className="notice successNotice">
              {t.activationConfirmed}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="inviteLanding">
      <LanguageSwitcher
        locale={locale}
        onChange={changeLocale}
      />

      <Brand compact />

      <div className="inviteOrb">↗</div>

      <span className="eyebrow">{t.invitationLabel}</span>

      <h1>
        {t.landingTitle1}
        <br />
        {t.landingTitle2}
      </h1>

      <p>{t.landingDescription}</p>

      <div className="panel eligibilityInfo">
        <b>{t.eligibilityTitle}</b>
        <p className="muted">{t.eligibilityDescription}</p>
      </div>

      <button
        type="button"
        className="primaryButton"
        onClick={() => {
          if (wallet) {
            void claim();
          } else {
            setStep('wallet');
          }
        }}
        disabled={!invite}
      >
        {t.start}
      </button>

      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? (
        <label className="demoSelect">
          {t.demoResult}

          <select
            value={demoOutcome}
            onChange={(event) =>
              setDemoOutcome(event.target.value)
            }
          >
            <option value="success">{t.demoSuccess}</option>
            <option value="existing">{t.demoExisting}</option>
            <option value="other">{t.demoOther}</option>
            <option value="review">{t.demoReview}</option>
          </select>
        </label>
      ) : null}
    </main>
  );
}

function Centered({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <main className="centeredFlow">
      <LanguageSwitcher
        locale={locale}
        onChange={onLocaleChange}
      />
      <Brand compact />
      {children}
    </main>
  );
}

function LanguageSwitcher({
  locale,
  onChange,
  inline = false,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  inline?: boolean;
}) {
  return (
    <label
      style={
        inline
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.06)',
              color: '#f8f7ff',
              zIndex: 20,
            }
          : {
              position: 'fixed',
              top: '18px',
              right: '18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '12px',
              background: 'rgba(17,20,33,0.92)',
              color: '#f8f7ff',
              zIndex: 20,
            }
      }
    >
      <span aria-hidden="true">🌐</span>

      <select
        aria-label="Language"
        value={locale}
        onChange={(event) =>
          onChange(event.target.value as Locale)
        }
        style={{
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <option value="ko" style={{ color: '#111421' }}>
          한국어
        </option>
        <option value="en" style={{ color: '#111421' }}>
          English
        </option>
      </select>
    </label>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}
