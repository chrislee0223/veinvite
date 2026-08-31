'use client';

import { useEffect, useState } from 'react';

import { PublicLeaderboard } from './PublicLeaderboard';
import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';
import type { PublicLeaderboardResponse } from '@/lib/types';

const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

const PREVIEW_DATA: PublicLeaderboardResponse = {
  generatedAt: '2026-08-31T12:00:00.000Z',
  network: 'mainnet',
  currentRoundId: 114,
  reportingStartRound: 113,
  impact: {
    totalActivatedUsers: 128,
    newUsers: 93,
    returningUsers: 35,
  },
  leaders: [
    {
      rank: 1,
      walletAddress:
        '0x9a2d35cc7e28f0b9aa735e1098267a3ce880aa11',
      completedReferrals: 12,
      totalRewardWei: '1245000000000000000000',
      isCurrentWallet: false,
    },
    {
      rank: 2,
      walletAddress:
        '0x38ef4af4c72c018653d547861940676a96bc2202',
      completedReferrals: 8,
      totalRewardWei: '881500000000000000000',
      isCurrentWallet: false,
    },
    {
      rank: 3,
      walletAddress: TEST_WALLET,
      completedReferrals: 5,
      totalRewardWei: '604250000000000000000',
      isCurrentWallet: true,
    },
    {
      rank: 4,
      walletAddress:
        '0x7f293fcb1767136c7b58588eb81834f1182cab40',
      completedReferrals: 4,
      totalRewardWei: '487000000000000000000',
      isCurrentWallet: false,
    },
    {
      rank: 5,
      walletAddress:
        '0x11a4b662993863356199e36cc04a948a213e2d55',
      completedReferrals: 3,
      totalRewardWei: '332500000000000000000',
      isCurrentWallet: false,
    },
  ],
  currentUser: {
    rank: 3,
    walletAddress: TEST_WALLET,
    completedReferrals: 5,
    totalRewardWei: '604250000000000000000',
    isCurrentWallet: true,
  },
};

function currentLocale(): Locale {
  return (
    localeFromLanguageTag(document.documentElement.lang) ?? 'en'
  );
}

export function LeaderboardUiPreview() {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const sync = () => setLocale(currentLocale());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
    window.addEventListener('veinvite-language-change', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('veinvite-language-change', sync);
    };
  }, []);

  return (
    <section className="leaderboardPreview">
      <div className="previewHeading">
        <span>PRODUCTION LEADERBOARD</span>
        <h2>폰 우선 리더보드 미리보기</h2>
        <p>
          실제 리더보드 컴포넌트에 가짜 데이터만 넣은 화면입니다.
          가로 스크롤 없이 모바일과 PC 비율을 함께 확인할 수 있어요.
        </p>
      </div>

      <div className="previewFrame">
        <PublicLeaderboard
          locale={locale}
          wallet={TEST_WALLET}
          previewData={PREVIEW_DATA}
        />
      </div>

      <style jsx>{`
        .leaderboardPreview {
          width:min(calc(100% - 32px),1120px);
          margin:28px auto 0;
          padding:22px;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.16);
          border-radius:24px;
          background:#090907;
        }
        .previewHeading {
          width:min(100%,560px);
          margin:0 auto 22px;
        }
        .previewHeading > span {
          color:#f4b728;
          font-size:.68rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .previewHeading h2 {
          margin:7px 0 0;
          color:#f7f3e8;
          font-size:1.25rem;
          letter-spacing:-.03em;
        }
        .previewHeading p {
          margin:8px 0 0;
          color:#8f8a80;
          font-size:.76rem;
          line-height:1.6;
        }
        .previewFrame {
          width:min(100%,560px);
          margin:0 auto;
        }
        @media (max-width:560px) {
          .leaderboardPreview {
            width:100%;
            margin-top:20px;
            padding:20px 16px;
            border-right:0;
            border-left:0;
            border-radius:0;
          }
        }
      `}</style>
    </section>
  );
}
