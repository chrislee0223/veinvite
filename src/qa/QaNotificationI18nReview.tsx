'use client';

import { useMemo, useState } from 'react';

import {
  LANGUAGE_OPTIONS,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type { QaNotificationStateId } from './QaNotificationStateHarness';

type ReviewViewport = {
  id: 'compact' | 'iphone' | 'wide-mobile' | 'desktop';
  label: string;
  width: number;
  height: number;
};

const REVIEW_VIEWPORTS: ReviewViewport[] = [
  { id: 'compact', label: '320 × 568', width: 320, height: 568 },
  { id: 'iphone', label: '390 × 844', width: 390, height: 844 },
  { id: 'wide-mobile', label: '480 × 840', width: 480, height: 840 },
  { id: 'desktop', label: '1180 × 820', width: 1180, height: 820 },
];

const REVIEW_STATES: Array<{
  id: QaNotificationStateId;
  label: string;
}> = [
  { id: 'NOTI-HISTORY-OPEN', label: '알림 이력 · 혼합' },
  { id: 'NOTI-HISTORY-UNREAD', label: '읽지 않은 알림' },
  { id: 'NOTI-HISTORY-READ', label: '읽은 지급 알림' },
  { id: 'NOTI-HISTORY-MORE', label: '과거 알림 더 보기' },
  { id: 'NOTI-HISTORY-LOADING', label: '로딩' },
  { id: 'NOTI-HISTORY-ERROR', label: '오류' },
  { id: 'NOTI-INELIGIBLE', label: '참여 불가 알림' },
  { id: 'NOTI-REWARD-READY', label: '보상 준비 알림' },
  { id: 'NOTI-REWARD-PAID', label: '보상 지급 알림' },
];

const STRESS_LOCALES: SupportedLocale[] = [
  'ko',
  'de',
  'fr',
  'ar',
  'ur',
  'hi',
  'bn',
  'ja',
  'zh',
  'el',
  'cs',
];

export function QaNotificationI18nReview() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [viewportId, setViewportId] =
    useState<ReviewViewport['id']>('iphone');
  const [stateId, setStateId] =
    useState<QaNotificationStateId>('NOTI-HISTORY-OPEN');

  const viewport = REVIEW_VIEWPORTS.find(
    (item) => item.id === viewportId,
  ) ?? REVIEW_VIEWPORTS[1];

  const frameSrc = useMemo(
    () =>
      `/qa/state?state=${encodeURIComponent(stateId)}&locale=${encodeURIComponent(locale)}`,
    [locale, stateId],
  );

  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '24px',
        background: '#080807',
        color: '#f8f6ef',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>
            알림 다국어 레이아웃 점검
          </h1>
          <p
            style={{
              maxWidth: 760,
              margin: '8px 0 0',
              color: '#9b958b',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            실제 Production 알림 컴포넌트를 29개 지원 언어와 실제 iframe
            viewport로 재현합니다. 320/390/480px에서 헤더 충돌, 줄바꿈, RTL,
            높은 문자 계열의 세로 여백을 우선 확인하세요.
          </p>
        </header>

        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'end',
            marginBottom: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>
            <span style={{ color: '#9b958b' }}>언어</span>
            <select
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as SupportedLocale)
              }
              style={{
                minHeight: 38,
                padding: '0 10px',
                border: '1px solid #3d382d',
                borderRadius: 10,
                background: '#151410',
                color: '#f8f6ef',
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.nativeName} · {option.englishName}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>
            <span style={{ color: '#9b958b' }}>화면</span>
            <select
              value={viewportId}
              onChange={(event) =>
                setViewportId(event.target.value as ReviewViewport['id'])
              }
              style={{
                minHeight: 38,
                padding: '0 10px',
                border: '1px solid #3d382d',
                borderRadius: 10,
                background: '#151410',
                color: '#f8f6ef',
              }}
            >
              {REVIEW_VIEWPORTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>
            <span style={{ color: '#9b958b' }}>알림 상태</span>
            <select
              value={stateId}
              onChange={(event) =>
                setStateId(event.target.value as QaNotificationStateId)
              }
              style={{
                minHeight: 38,
                padding: '0 10px',
                border: '1px solid #3d382d',
                borderRadius: 10,
                background: '#151410',
                color: '#f8f6ef',
              }}
            >
              {REVIEW_STATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 14,
          }}
        >
          {STRESS_LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLocale(item)}
              style={{
                minHeight: 30,
                padding: '4px 9px',
                border: item === locale
                  ? '1px solid #d7ad36'
                  : '1px solid #302d26',
                borderRadius: 999,
                background: item === locale ? '#2b2413' : '#12110e',
                color: item === locale ? '#ffd04a' : '#aaa49b',
                cursor: 'pointer',
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div
          style={{
            overflow: 'auto',
            padding: 12,
            border: '1px solid #2d2921',
            borderRadius: 16,
            background: '#0d0c0a',
          }}
        >
          <iframe
            key={`${frameSrc}:${viewport.id}`}
            title={`Notification i18n review ${locale} ${viewport.label}`}
            src={frameSrc}
            width={viewport.width}
            height={viewport.height}
            style={{
              display: 'block',
              border: '1px solid #443b28',
              borderRadius: 14,
              background: '#080807',
            }}
          />
        </div>
      </div>
    </main>
  );
}
