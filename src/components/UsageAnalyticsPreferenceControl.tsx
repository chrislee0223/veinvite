'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import {
  PRIVACY_USAGE_ANALYTICS_CONTROL_COPY,
} from '@/lib/i18n/privacyUsageAnalyticsControlCopy';
import {
  PRIVACY_USAGE_ANALYTICS_COPY,
} from '@/lib/i18n/privacyUsageAnalyticsCopy';
import {
  isLocale,
  localeFromLanguageTag,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  readUsageAnalyticsEnabled,
  setUsageAnalyticsEnabled,
  USAGE_ANALYTICS_PREFERENCE_EVENT,
} from '@/lib/usageAnalyticsPreference';

function currentLocale(): SupportedLocale {
  const fromDocument =
    localeFromLanguageTag(
      document.documentElement.lang,
    );
  return fromDocument ?? 'en';
}

export function UsageAnalyticsPreferenceControl() {
  const pathname = usePathname();
  const [locale, setLocale] =
    useState<SupportedLocale>('en');
  const [enabled, setEnabled] =
    useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname !== '/privacy') return;

    setLocale(currentLocale());
    setEnabled(readUsageAnalyticsEnabled());
    setReady(true);

    const onLanguageChange = (event: Event) => {
      const detail =
        (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) {
        setLocale(detail);
      }
    };
    const onPreferenceChange = (event: Event) => {
      const detail =
        (event as CustomEvent<unknown>).detail;
      if (typeof detail === 'boolean') {
        setEnabled(detail);
      }
    };

    window.addEventListener(
      'veinvite-language-change',
      onLanguageChange,
    );
    window.addEventListener(
      USAGE_ANALYTICS_PREFERENCE_EVENT,
      onPreferenceChange,
    );

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        onLanguageChange,
      );
      window.removeEventListener(
        USAGE_ANALYTICS_PREFERENCE_EVENT,
        onPreferenceChange,
      );
    };
  }, [pathname]);

  if (pathname !== '/privacy' || !ready) {
    return null;
  }

  const title =
    PRIVACY_USAGE_ANALYTICS_COPY[locale].heading;
  const note =
    PRIVACY_USAGE_ANALYTICS_CONTROL_COPY[locale].note;

  const toggle = () => {
    const next = !enabled;
    setUsageAnalyticsEnabled(next);
    setEnabled(next);
  };

  return (
    <aside
      className="analyticsPreference"
      lang={locale}
    >
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        className={enabled ? 'enabled' : ''}
        onClick={toggle}
      >
        <span aria-hidden="true" />
      </button>

      <style jsx>{`
        .analyticsPreference {
          width:min(calc(100% - 32px),716px);
          box-sizing:border-box;
          margin:0 auto 64px;
          padding:16px 17px;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
          gap:18px;
          border:1px solid rgba(244,183,40,.2);
          border-radius:18px;
          background:rgba(244,183,40,.055);
          color:#f4f0e7;
        }
        strong {
          display:block;
          font-size:.9rem;
          line-height:1.4;
        }
        p {
          margin:6px 0 0;
          color:#9e998f;
          font-size:.75rem;
          line-height:1.6;
          overflow-wrap:anywhere;
        }
        button {
          position:relative;
          width:48px;
          height:28px;
          padding:0;
          border:1px solid rgba(255,255,255,.13);
          border-radius:999px;
          background:#292925;
          cursor:pointer;
          transition:background .16s ease,border-color .16s ease;
        }
        button span {
          position:absolute;
          top:3px;
          left:3px;
          width:20px;
          height:20px;
          border-radius:50%;
          background:#b9b4aa;
          transition:transform .16s ease,background .16s ease;
        }
        button.enabled {
          border-color:rgba(244,183,40,.55);
          background:rgba(244,183,40,.2);
        }
        button.enabled span {
          transform:translateX(20px);
          background:#f4b728;
        }
        button:focus-visible {
          outline:2px solid rgba(255,205,80,.78);
          outline-offset:3px;
        }
        @media (max-width:560px) {
          .analyticsPreference {
            width:calc(100% - 32px);
            margin-bottom:48px;
            gap:13px;
          }
        }
      `}</style>
    </aside>
  );
}
