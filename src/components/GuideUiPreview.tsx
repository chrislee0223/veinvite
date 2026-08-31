'use client';

import { useEffect, useState } from 'react';

import { AppGuide } from './AppGuide';
import {
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';

function currentLocale(): Locale {
  return localeFromLanguageTag(document.documentElement.lang) ?? 'en';
}

export function GuideUiPreview() {
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
    <section className="guidePreview">
      <div className="previewHeading">
        <span>PRODUCTION GUIDE</span>
        <h2>실제 가이드 미리보기</h2>
        <p>
          실제 앱의 Guide 컴포넌트를 그대로 표시합니다. 현재 선택된 언어와
          동일하게 바뀌며, 미션 완료 후 보상 안내도 production과 같은 문구를 사용해요.
        </p>
      </div>

      <div className="previewFrame">
        <AppGuide locale={locale} />
      </div>

      <style jsx>{`
        .guidePreview {
          width:min(calc(100% - 32px),1120px);
          margin:28px auto 0;
          padding:22px;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.16);
          border-radius:24px;
          background:#090907;
        }
        .previewHeading,.previewFrame {
          width:min(100%,560px);
          margin-left:auto;
          margin-right:auto;
        }
        .previewHeading {
          margin-bottom:22px;
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
        @media (max-width:560px) {
          .guidePreview {
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
