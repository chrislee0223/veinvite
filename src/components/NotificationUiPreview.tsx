'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Brand } from './Brand';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import {
  LANGUAGE_OPTIONS,
  isCjkLocale,
  isRtlLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { NOTIFICATION_HISTORY_COPY } from '@/lib/i18n/notificationHistoryCopy';
import { NOTIFICATION_V2_COPY } from '@/lib/i18n/notificationV2Copy';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import type {
  InviteNotificationKindV2,
} from '@/lib/notifications/inviteNotificationStateV2';

type PreviewItem = {
  id: number;
  kind: InviteNotificationKindV2;
  occurredAt: Date;
  read: boolean;
  friendWallet: string;
  dappProgress?: number;
  rewardAmountB3tr?: string;
  actionRequired?: boolean;
};

type PreviewMode = 'history' | 'empty' | 'loading' | 'error';

const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

function localDateDaysAgo(
  base: Date,
  daysAgo: number,
  hour: number,
  minute = 0,
): Date {
  const value = new Date(base);
  value.setDate(value.getDate() - daysAgo);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function sampleItems(now: number): PreviewItem[] {
  const base = new Date(now);

  return [
    {
      id: 6,
      kind: 'REWARD_READY',
      occurredAt: new Date(now - 12 * 60 * 1000),
      read: false,
      friendWallet: '0xABCD···1234',
      rewardAmountB3tr: '147.74',
      actionRequired: true,
    },
    {
      id: 5,
      kind: 'DAPP_PROGRESS',
      occurredAt: new Date(now - 3 * 60 * 60 * 1000),
      read: false,
      friendWallet: '0xBEEF···5678',
      dappProgress: 3,
    },
    {
      id: 4,
      kind: 'INVITE_ACCEPTED',
      occurredAt: new Date(now - 5 * 60 * 60 * 1000),
      read: false,
      friendWallet: '0xBEEF···5678',
    },
    {
      id: 3,
      kind: 'VOT3_CONVERTED',
      occurredAt: localDateDaysAgo(base, 1, 18, 20),
      read: true,
      friendWallet: '0xABCD···1234',
    },
    {
      id: 2,
      kind: 'REWARD_PAID',
      occurredAt: localDateDaysAgo(base, 3, 14, 10),
      read: true,
      friendWallet: '0xCAFE···9012',
      rewardAmountB3tr: '124.50',
    },
    {
      id: 1,
      kind: 'INVITE_INELIGIBLE',
      occurredAt: localDateDaysAgo(base, 5, 10, 35),
      read: true,
      friendWallet: '0xDEAD···2468',
    },
  ];
}

function itemCopy(
  item: PreviewItem,
  locale: SupportedLocale,
): { title: string; body: string; hint?: string } {
  const copy = NOTIFICATION_COPY[locale];
  const v2 = NOTIFICATION_V2_COPY[locale];
  const ineligible =
    INELIGIBLE_INVITER_COPY[locale] ?? INELIGIBLE_INVITER_COPY.en;

  switch (item.kind) {
    case 'INVITE_ACCEPTED':
      return {
        title: copy.acceptedTitle,
        body: copy.acceptedBody,
      };
    case 'DAPP_PROGRESS':
      return {
        title: v2.dappProgressTitle,
        body: v2.dappProgressBody,
        hint: `dApp ${item.dappProgress ?? 0}/3`,
      };
    case 'VOT3_CONVERTED':
      return {
        title: copy.vot3Title,
        body: copy.vot3Body,
        hint: 'VOT3',
      };
    case 'REWARD_READY':
      return {
        title: v2.rewardReadyTitle,
        body: v2.rewardReadyBody,
        hint: item.rewardAmountB3tr
          ? `${item.rewardAmountB3tr} B3TR`
          : undefined,
      };
    case 'REWARD_PAID':
      return {
        title: copy.rewardTitle,
        body: copy.rewardBody,
        hint: item.rewardAmountB3tr
          ? `${item.rewardAmountB3tr} B3TR`
          : undefined,
      };
    case 'INVITE_INELIGIBLE':
      return {
        title: ineligible.title,
        body: ineligible.body,
      };
  }
}

function intlLocale(locale: SupportedLocale): string {
  if (locale === 'zh-tw') return 'zh-TW';
  if (locale === 'arz') return 'ar-EG';
  if (locale === 'pcm') return 'en-NG';
  return locale;
}

function relativeTime(
  date: Date,
  locale: SupportedLocale,
): string {
  const now = Date.now();
  const deltaMs = date.getTime() - now;

  if (!Number.isFinite(deltaMs)) return '';

  const abs = Math.abs(deltaMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const normalizedLocale = intlLocale(locale);

  try {
    const rtf = new Intl.RelativeTimeFormat(normalizedLocale, {
      numeric: 'auto',
    });

    if (deltaMs > 0 && abs < 5 * minute) {
      return rtf.format(0, 'second');
    }
    if (abs < minute) {
      return rtf.format(0, 'second');
    }
    if (abs < hour) {
      return rtf.format(Math.round(deltaMs / minute), 'minute');
    }
    if (abs < day) {
      return rtf.format(Math.round(deltaMs / hour), 'hour');
    }
    if (abs < 7 * day) {
      return rtf.format(Math.round(deltaMs / day), 'day');
    }

    return new Intl.DateTimeFormat(normalizedLocale, {
      year:
        date.getFullYear() === new Date().getFullYear()
          ? undefined
          : 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
}

function localDaySerial(date: Date): number {
  return Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ) /
      (24 * 60 * 60 * 1000),
  );
}

function dayBucket(
  date: Date,
  now: Date,
): 'today' | 'yesterday' | 'earlier' {
  const distance = localDaySerial(now) - localDaySerial(date);
  if (distance <= 0) return 'today';
  if (distance === 1) return 'yesterday';
  return 'earlier';
}

function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 8.5a6 6 0 0 0-12 0c0 7-2.5 7-2.5 8.5h17C20.5 15.5 18 15.5 18 8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 20a3 3 0 0 0 5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NotificationUiPreview() {
  const [locale, setLocale] =
    useState<SupportedLocale>('ko');
  const [open, setOpen] = useState(true);
  const [mode, setMode] =
    useState<PreviewMode>('history');
  const [items, setItems] = useState<PreviewItem[]>(() =>
    sampleItems(Date.now()),
  );
  const [, setClockTick] = useState(0);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];
  const structure = NOTIFICATION_HISTORY_COPY[locale];
  const rtl = isRtlLocale(locale);
  const unreadCount =
    mode === 'history'
      ? items.filter((item) => !item.read).length
      : 0;

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime(),
      ),
    [items],
  );

  const nowForGroups = new Date();
  const todayItems = sorted.filter(
    (item) => dayBucket(item.occurredAt, nowForGroups) === 'today',
  );
  const yesterdayItems = sorted.filter(
    (item) => dayBucket(item.occurredAt, nowForGroups) === 'yesterday',
  );
  const earlierItems = sorted.filter(
    (item) => dayBucket(item.occurredAt, nowForGroups) === 'earlier',
  );

  const closePanel = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      bellRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closePanel, open]);

  const markRead = (id: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    );
  };

  const markAllRead = () => {
    const visibleMaxId = Math.max(
      0,
      ...items.map((item) => item.id),
    );

    setItems((current) =>
      current.map((item) =>
        item.id <= visibleMaxId
          ? { ...item, read: true }
          : item,
      ),
    );
  };

  const resetHistory = () => {
    setItems(sampleItems(Date.now()));
    setMode('history');
    setOpen(true);
  };

  const renderItem = (item: PreviewItem) => {
    const copy = itemCopy(item, locale);

    return (
      <button
        type="button"
        key={item.id}
        className={
          item.read
            ? 'notificationHistoryRow isRead'
            : 'notificationHistoryRow isUnread'
        }
        onClick={() => markRead(item.id)}
      >
        <span className="notificationHistoryContent">
          <span className="notificationHistoryTopLine">
            <span className="notificationHistoryTitleWrap">
              {!item.read ? (
                <i
                  className="notificationUnreadDot"
                  aria-hidden="true"
                />
              ) : null}
              <strong className="notificationHistoryTitle">
                {copy.title}
              </strong>
            </span>
            <time
              className="notificationHistoryTime"
              dateTime={item.occurredAt.toISOString()}
            >
              {relativeTime(item.occurredAt, locale)}
            </time>
          </span>

          <span className="notificationHistoryBody">
            {copy.body}
          </span>

          <span className="notificationHistoryMeta">
            <span
              className="notificationFriendWallet"
              dir="ltr"
            >
              {item.friendWallet}
            </span>
            {copy.hint ? <b>{copy.hint}</b> : null}
            {item.actionRequired ? (
              <em>{structure.action}</em>
            ) : null}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section className="notificationPreview">
      <header className="previewIntro">
        <span>PREVIEW ONLY · PRODUCTION UI SHELL</span>
        <h2>실제 VeInvite 상단 UI에서 보는 알림센터</h2>
        <p>
          실제 앱의 색상·헤더·카드 톤을 기준으로 알림센터만
          테스트합니다. Production DB와 보상·초대 로직은
          사용하지 않습니다.
        </p>
      </header>

      <div className="previewControls">
        <button
          type="button"
          className={mode === 'history' ? 'selected' : ''}
          onClick={resetHistory}
        >
          새 알림 + 과거 이력
        </button>
        <button
          type="button"
          className={mode === 'empty' ? 'selected' : ''}
          onClick={() => {
            setMode('empty');
            setOpen(true);
          }}
        >
          알림 없음
        </button>
        <button
          type="button"
          className={mode === 'loading' ? 'selected' : ''}
          onClick={() => {
            setMode('loading');
            setOpen(true);
          }}
        >
          불러오는 중
        </button>
        <button
          type="button"
          className={mode === 'error' ? 'selected' : ''}
          onClick={() => {
            setMode('error');
            setOpen(true);
          }}
        >
          오류 상태
        </button>
      </div>

      <main className="notificationPreviewScreen">
        <header className="notificationPreviewTopBar">
          <Brand />

          <div className="notificationPreviewActions">
            <div className="notificationPreviewUtilityActions">
              <div className="notificationBellWrap">
                <button
                  ref={bellRef}
                  type="button"
                  className={
                    unreadCount > 0
                      ? 'notificationBellButton hasUnread'
                      : 'notificationBellButton'
                  }
                  aria-label={
                    unreadCount > 0
                      ? `${NOTIFICATION_COPY[locale].bellAria} (${unreadCount})`
                      : NOTIFICATION_COPY[locale].bellAria
                  }
                  aria-expanded={open}
                  onClick={() => {
                    if (open) {
                      closePanel();
                    } else {
                      setOpen(true);
                    }
                  }}
                >
                  <BellIcon />
                  {unreadCount > 0 ? (
                    <span className="notificationUnreadBadge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {open ? (
                  <>
                    <button
                      type="button"
                      className="notificationPanelBackdrop"
                      aria-label={structure.close}
                      onClick={closePanel}
                    />

                    <section
                      className="notificationHistoryPanel"
                      role="dialog"
                      aria-modal="true"
                      aria-label={structure.title}
                      lang={locale}
                      dir={rtl ? 'rtl' : 'ltr'}
                    >
                      <header className="notificationHistoryHeader">
                        <div className="notificationHistoryHeading">
                          <h3>{structure.title}</h3>
                          {unreadCount > 0 ? (
                            <span>
                              {structure.newLabel} · {unreadCount}
                            </span>
                          ) : null}
                        </div>

                        <div className="notificationHistoryHeaderActions">
                          {unreadCount > 0 ? (
                            <button
                              type="button"
                              className="notificationMarkAll"
                              onClick={markAllRead}
                            >
                              {structure.markAll}
                            </button>
                          ) : null}
                          <button
                            ref={closeRef}
                            type="button"
                            className="notificationClosePanel"
                            aria-label={structure.close}
                            onClick={closePanel}
                          >
                            ×
                          </button>
                        </div>
                      </header>

                      {mode === 'loading' ? (
                        <div
                          className="notificationStatePanel"
                          aria-live="polite"
                          aria-busy="true"
                        >
                          <span
                            className="notificationSpinner"
                            aria-hidden="true"
                          />
                          <strong>{structure.loadingTitle}</strong>
                          <p>{structure.loadingBody}</p>
                        </div>
                      ) : mode === 'error' ? (
                        <div
                          className="notificationStatePanel errorState"
                          role="alert"
                        >
                          <span
                            className="notificationStateIcon"
                            aria-hidden="true"
                          >
                            !
                          </span>
                          <strong>{structure.errorTitle}</strong>
                          <p>{structure.errorBody}</p>
                          <button
                            type="button"
                            className="notificationRetry"
                            onClick={resetHistory}
                          >
                            {structure.retry}
                          </button>
                        </div>
                      ) : mode === 'empty' || sorted.length === 0 ? (
                        <div className="notificationStatePanel">
                          <span
                            className="notificationEmptyBell"
                            aria-hidden="true"
                          >
                            <BellIcon size={22} />
                          </span>
                          <strong>{structure.emptyTitle}</strong>
                          <p>{structure.emptyBody}</p>
                        </div>
                      ) : (
                        <div className="notificationHistoryScroll">
                          {todayItems.length > 0 ? (
                            <section className="notificationHistoryGroup">
                              <h4>{structure.today}</h4>
                              <div>
                                {todayItems.map(renderItem)}
                              </div>
                            </section>
                          ) : null}

                          {yesterdayItems.length > 0 ? (
                            <section className="notificationHistoryGroup">
                              <h4>{structure.yesterday}</h4>
                              <div>
                                {yesterdayItems.map(renderItem)}
                              </div>
                            </section>
                          ) : null}

                          {earlierItems.length > 0 ? (
                            <section className="notificationHistoryGroup">
                              <h4>{structure.earlier}</h4>
                              <div>
                                {earlierItems.map(renderItem)}
                              </div>
                            </section>
                          ) : null}
                        </div>
                      )}
                    </section>
                  </>
                ) : null}
              </div>

              <select
                className="notificationLanguageSelect"
                value={locale}
                onChange={(event) =>
                  setLocale(
                    event.target.value as SupportedLocale,
                  )
                }
                aria-label={t.languageAria}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option
                    key={option.locale}
                    value={option.locale}
                  >
                    {option.nativeName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="notificationAccountChip"
              aria-label={t.walletAria}
            >
              <span className="notificationAccountDot" />
              {TEST_WALLET.slice(0, 6)}···
              {TEST_WALLET.slice(-4)}
            </button>
          </div>
        </header>

        <section className="notificationMissionCard">
          <div className="notificationCardGlow" />
          <div
            className={
              isCjkLocale(locale)
                ? 'notificationMissionCopy cjkCopy'
                : 'notificationMissionCopy'
            }
          >
            <h1>{referral.homeTitle}</h1>
          </div>

          <div className="notificationPermanentLinkCard">
            <div className="notificationLinkPreview">
              https://veinvite.app/i/TEST234
            </div>
            <div className="notificationLinkActions">
              <button
                type="button"
                className="notificationPrimaryAction"
              >
                {t.shareInvite}
              </button>
              <button
                type="button"
                className="notificationSecondaryAction"
              >
                {t.copyLink}
              </button>
            </div>
          </div>

          <div className="notificationSlotsBlock">
            <div className="notificationSlotsHeading">
              <strong>{referral.slotsLabel}</strong>
              <span>1/2</span>
            </div>
            <article className="notificationSlotPreview activeSlot">
              <span className="notificationSlotNumber">1</span>
              <div>
                <strong>dApp 3/3</strong>
                <small>0xABCD···1234</small>
              </div>
              <span className="notificationSlotArrow">›</span>
            </article>
            <article className="notificationSlotPreview">
              <span className="notificationSlotNumber">2</span>
              <div>
                <strong>
                  {locale === 'ko'
                    ? '친구 초대하기'
                    : 'Invite a friend'}
                </strong>
                <small>
                  {locale === 'ko'
                    ? '영구 초대 링크 공유'
                    : 'Share permanent invite link'}
                </small>
              </div>
              <span className="notificationSlotArrow">›</span>
            </article>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .notificationPreview {
          width:min(calc(100% - 24px),1120px);
          margin:0 auto;
          color:#fff;
        }
        .notificationPreview .previewIntro {
          width:min(100%,760px);
          margin:0 auto 18px;
        }
        .notificationPreview .previewIntro>span {
          color:#f4b728;
          font-size:.62rem;
          font-weight:950;
          letter-spacing:.11em;
        }
        .notificationPreview .previewIntro h2 {
          margin:6px 0 0;
          font-size:clamp(1.35rem,4vw,1.9rem);
          letter-spacing:-.04em;
        }
        .notificationPreview .previewIntro p {
          margin:8px 0 0;
          color:#8f8992;
          font-size:.72rem;
          line-height:1.6;
        }
        .notificationPreview .previewControls {
          width:min(100%,620px);
          margin:0 auto 12px;
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:7px;
        }
        .notificationPreview .previewControls button {
          min-height:42px;
          padding:7px 8px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:13px;
          background:#11110f;
          color:#8f8992;
          font:inherit;
          font-size:.67rem;
          font-weight:850;
          cursor:pointer;
        }
        .notificationPreview .previewControls button.selected {
          border-color:rgba(244,183,40,.32);
          background:rgba(244,183,40,.09);
          color:#ffd66e;
        }
        .notificationPreviewScreen {
          min-height:720px;
          box-sizing:border-box;
          padding:22px 18px 72px;
          color:#fff;
          background:
            radial-gradient(
              circle at 50% 16%,
              rgba(244,183,40,.14),
              transparent 32%
            ),
            #080807;
          border:1px solid rgba(255,255,255,.045);
          border-radius:30px;
        }
        .notificationPreviewTopBar {
          position:relative;
          z-index:20;
          width:min(100%,520px);
          margin:0 auto 26px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
        }
        .notificationPreviewActions {
          min-width:0;
          display:flex;
          align-items:center;
          gap:10px;
        }
        .notificationPreviewUtilityActions {
          min-width:0;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:8px;
        }
        .notificationLanguageSelect {
          max-width:155px;
          height:40px;
          padding-inline:11px 28px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:#141625;
          color:#fff;
          font:inherit;
          font-size:.76rem;
          font-weight:800;
          cursor:pointer;
        }
        .notificationAccountChip {
          min-height:40px;
          padding-inline:13px;
          display:inline-flex;
          align-items:center;
          gap:8px;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:#141625;
          color:#fff;
          font:inherit;
          font-size:.72rem;
          font-weight:850;
          cursor:pointer;
        }
        .notificationAccountDot {
          width:9px;
          height:9px;
          border-radius:50%;
          background:#f4b728;
          box-shadow:0 0 14px rgba(244,183,40,.68);
        }
        .notificationBellWrap {
          position:relative;
        }
        .notificationBellButton {
          position:relative;
          width:40px;
          height:40px;
          flex:0 0 40px;
          display:grid;
          place-items:center;
          padding:0;
          border:1px solid rgba(255,255,255,.1);
          border-radius:13px;
          background:#141625;
          color:#b6b2bf;
          cursor:pointer;
        }
        .notificationBellButton.hasUnread {
          border-color:rgba(255,205,80,.36);
          color:#ffd04a;
          box-shadow:0 0 0 3px rgba(244,183,40,.05);
        }
        .notificationBellButton:focus-visible,
        .notificationMarkAll:focus-visible,
        .notificationClosePanel:focus-visible,
        .notificationRetry:focus-visible,
        .notificationHistoryRow:focus-visible {
          outline:2px solid rgba(255,208,74,.8);
          outline-offset:2px;
        }
        .notificationUnreadBadge {
          position:absolute;
          top:-7px;
          inset-inline-end:-7px;
          min-width:19px;
          height:19px;
          box-sizing:border-box;
          padding-inline:5px;
          display:grid;
          place-items:center;
          border:2px solid #080807;
          border-radius:999px;
          background:#f4b728;
          color:#17120a;
          font-size:.6rem;
          font-weight:950;
          line-height:1;
        }
        .notificationPanelBackdrop {
          position:fixed;
          z-index:140;
          inset:0;
          border:0;
          background:rgba(2,2,2,.66);
          cursor:default;
        }
        .notificationHistoryPanel {
          position:absolute;
          z-index:141;
          top:50px;
          inset-inline-end:0;
          width:min(400px,calc(100vw - 28px));
          max-height:min(610px,calc(100dvh - 92px));
          overflow:hidden;
          box-sizing:border-box;
          border:1px solid rgba(255,205,80,.22);
          border-radius:22px;
          background:#11110f;
          box-shadow:
            0 32px 90px rgba(0,0,0,.6),
            inset 0 1px 0 rgba(255,255,255,.055);
          text-align:start;
        }
        .notificationHistoryHeader {
          min-height:62px;
          padding-block:12px 11px;
          padding-inline:16px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          border-bottom:1px solid rgba(255,255,255,.07);
          background:rgba(244,183,40,.025);
        }
        .notificationHistoryHeading {
          min-width:0;
          display:flex;
          align-items:center;
          gap:8px;
        }
        .notificationHistoryHeading h3 {
          margin:0;
          color:#f8f6ef;
          font-size:.98rem;
          letter-spacing:-.02em;
        }
        .notificationHistoryHeading>span {
          padding:4px 7px;
          border-radius:999px;
          background:rgba(244,183,40,.13);
          color:#ffd04a;
          font-size:.56rem;
          font-weight:900;
          white-space:nowrap;
        }
        .notificationHistoryHeaderActions {
          flex:0 0 auto;
          display:flex;
          align-items:center;
          gap:2px;
        }
        .notificationMarkAll {
          min-height:32px;
          padding-inline:8px;
          border:0;
          background:transparent;
          color:#a59e91;
          font:inherit;
          font-size:.62rem;
          font-weight:850;
          cursor:pointer;
        }
        .notificationClosePanel {
          width:34px;
          height:34px;
          border:0;
          background:transparent;
          color:#77736f;
          font:inherit;
          font-size:1.4rem;
          cursor:pointer;
        }
        .notificationHistoryScroll {
          max-height:calc(min(610px,calc(100dvh - 92px)) - 63px);
          overflow-y:auto;
          overscroll-behavior:contain;
          scrollbar-width:thin;
          scrollbar-color:#3b3529 transparent;
        }
        .notificationHistoryGroup h4 {
          margin:0;
          padding-block:12px 7px;
          padding-inline:16px;
          color:#6f6a62;
          font-size:.6rem;
          font-weight:900;
        }
        .notificationHistoryGroup>div {
          display:block;
        }
        .notificationHistoryRow {
          width:100%;
          min-width:0;
          box-sizing:border-box;
          padding-block:14px 15px;
          padding-inline:16px;
          display:block;
          border:0;
          border-top:1px solid rgba(255,255,255,.05);
          background:transparent;
          color:#fff;
          text-align:start;
          font:inherit;
          cursor:pointer;
          transition:background .16s ease;
        }
        .notificationHistoryRow.isUnread {
          background:rgba(244,183,40,.055);
        }
        .notificationHistoryRow.isUnread:hover {
          background:rgba(244,183,40,.085);
        }
        .notificationHistoryRow.isRead {
          background:rgba(255,255,255,.008);
        }
        .notificationHistoryContent {
          min-width:0;
          display:block;
        }
        .notificationHistoryTopLine {
          min-width:0;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:start;
          gap:12px;
        }
        .notificationHistoryTitleWrap {
          min-width:0;
          display:flex;
          align-items:flex-start;
          gap:8px;
        }
        .notificationUnreadDot {
          flex:0 0 7px;
          width:7px;
          height:7px;
          margin-top:5px;
          border-radius:50%;
          background:#ffd04a;
          box-shadow:0 0 11px rgba(244,183,40,.45);
        }
        .notificationHistoryTitle {
          min-width:0;
          color:#f5f1e8;
          font-size:.76rem;
          font-weight:850;
          line-height:1.4;
          letter-spacing:-.012em;
          overflow-wrap:anywhere;
        }
        .notificationHistoryTime {
          padding-top:1px;
          color:#746f67;
          font-size:.56rem;
          line-height:1.4;
          white-space:nowrap;
        }
        .notificationHistoryBody {
          display:block;
          margin-top:6px;
          padding-inline-start:15px;
          color:#aaa39a;
          font-size:.65rem;
          line-height:1.55;
          overflow-wrap:anywhere;
        }
        .notificationHistoryMeta {
          margin-top:9px;
          padding-inline-start:15px;
          display:flex;
          align-items:center;
          flex-wrap:wrap;
          gap:6px;
        }
        .notificationFriendWallet {
          color:#777168;
          font-size:.55rem;
          font-weight:800;
          letter-spacing:.01em;
        }
        .notificationHistoryMeta b {
          padding:4px 7px;
          border:1px solid rgba(244,183,40,.14);
          border-radius:999px;
          background:rgba(244,183,40,.07);
          color:#e8c862;
          font-size:.56rem;
          font-weight:900;
        }
        .notificationHistoryMeta em {
          padding:4px 7px;
          border-radius:999px;
          background:#f4b728;
          color:#17120a;
          font-size:.54rem;
          font-style:normal;
          font-weight:950;
        }
        .notificationHistoryRow.isRead .notificationHistoryTitle {
          color:#b3ada4;
          font-weight:760;
        }
        .notificationHistoryRow.isRead .notificationHistoryBody {
          color:#716c65;
        }
        .notificationHistoryRow.isRead .notificationHistoryTime,
        .notificationHistoryRow.isRead .notificationFriendWallet {
          color:#5e5a55;
        }
        .notificationHistoryRow.isRead .notificationHistoryMeta b {
          border-color:rgba(255,255,255,.055);
          background:rgba(255,255,255,.025);
          color:#79746d;
        }
        .notificationStatePanel {
          min-height:270px;
          padding:36px 24px;
          display:grid;
          place-items:center;
          align-content:center;
          text-align:center;
        }
        .notificationEmptyBell,
        .notificationStateIcon {
          width:54px;
          height:54px;
          display:grid;
          place-items:center;
          border-radius:18px;
          background:rgba(244,183,40,.08);
          color:#d5ae42;
        }
        .notificationStateIcon {
          font-size:1.2rem;
          font-weight:950;
        }
        .notificationSpinner {
          width:32px;
          height:32px;
          border:3px solid rgba(244,183,40,.16);
          border-top-color:#e6bd4c;
          border-radius:50%;
          animation:notificationSpin .8s linear infinite;
        }
        @keyframes notificationSpin {
          to { transform:rotate(360deg); }
        }
        .notificationStatePanel strong {
          margin-top:14px;
          color:#ddd8cf;
          font-size:.9rem;
        }
        .notificationStatePanel p {
          max-width:280px;
          margin:7px 0 0;
          color:#77726b;
          font-size:.66rem;
          line-height:1.55;
        }
        .notificationStatePanel.errorState .notificationStateIcon {
          background:rgba(255,110,120,.08);
          color:#ff8f9b;
        }
        .notificationRetry {
          min-height:38px;
          margin-top:16px;
          padding-inline:14px;
          border:1px solid rgba(244,183,40,.25);
          border-radius:12px;
          background:rgba(244,183,40,.08);
          color:#e9c85f;
          font:inherit;
          font-size:.65rem;
          font-weight:900;
          cursor:pointer;
        }
        .notificationMissionCard {
          position:relative;
          overflow:hidden;
          width:min(100%,520px);
          box-sizing:border-box;
          margin:0 auto;
          padding:24px;
          border:1px solid rgba(255,201,61,.28);
          border-radius:30px;
          background:linear-gradient(
            155deg,
            rgba(54,40,14,.98),
            rgba(16,16,14,.99) 66%
          );
          box-shadow:
            0 28px 80px rgba(0,0,0,.44),
            inset 0 1px 0 rgba(255,255,255,.08);
        }
        .notificationCardGlow {
          position:absolute;
          top:-110px;
          inset-inline-end:-90px;
          width:250px;
          height:250px;
          border-radius:50%;
          background:rgba(244,183,40,.22);
          filter:blur(4px);
          pointer-events:none;
        }
        .notificationMissionCopy {
          position:relative;
          z-index:1;
        }
        .notificationMissionCopy h1 {
          max-width:100%;
          margin:0;
          font-size:clamp(2.05rem,8vw,3.05rem);
          line-height:1.04;
          letter-spacing:-.05em;
          text-wrap:balance;
          overflow-wrap:anywhere;
          hyphens:auto;
        }
        .notificationMissionCopy.cjkCopy h1 {
          font-size:clamp(2rem,7vw,2.85rem);
          line-height:1.1;
          letter-spacing:-.035em;
        }
        .notificationPermanentLinkCard {
          position:relative;
          z-index:1;
          margin-top:18px;
          padding:16px;
          border:1px solid rgba(255,205,80,.2);
          border-radius:19px;
          background:rgba(255,205,80,.055);
        }
        .notificationLinkPreview {
          padding:11px 12px;
          overflow:hidden;
          border:1px solid rgba(255,255,255,.08);
          border-radius:13px;
          background:rgba(3,4,5,.42);
          color:#b8b2c2;
          font-size:.68rem;
          font-weight:750;
          white-space:nowrap;
          text-overflow:ellipsis;
          direction:ltr;
          text-align:left;
        }
        .notificationLinkActions {
          margin-top:11px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:9px;
        }
        .notificationPrimaryAction,
        .notificationSecondaryAction {
          width:100%;
          min-height:44px;
          border-radius:13px;
          font:inherit;
          font-size:.75rem;
          font-weight:950;
          cursor:pointer;
        }
        .notificationPrimaryAction {
          border:0;
          background:linear-gradient(135deg,#ffd24d,#efa718);
          color:#17120a;
        }
        .notificationSecondaryAction {
          border:1px solid rgba(255,255,255,.11);
          background:rgba(255,255,255,.045);
          color:#fff;
        }
        .notificationSlotsBlock {
          position:relative;
          z-index:1;
          margin-top:16px;
          display:grid;
          gap:9px;
        }
        .notificationSlotsHeading {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          color:#c7c2d0;
          font-size:.78rem;
        }
        .notificationSlotsHeading span {
          flex:0 0 auto;
          min-width:42px;
          padding:5px 8px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:999px;
          color:#ffd66e;
          text-align:center;
          font-size:.66rem;
          font-weight:950;
        }
        .notificationSlotPreview {
          min-height:68px;
          padding:11px 12px;
          box-sizing:border-box;
          display:grid;
          grid-template-columns:28px minmax(0,1fr) 18px;
          align-items:center;
          gap:10px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:16px;
          background:rgba(255,255,255,.022);
        }
        .notificationSlotPreview.activeSlot {
          border-color:rgba(244,183,40,.16);
          background:rgba(244,183,40,.04);
        }
        .notificationSlotNumber {
          width:27px;
          height:27px;
          display:grid;
          place-items:center;
          border-radius:9px;
          background:rgba(244,183,40,.11);
          color:#ffd04a;
          font-size:.65rem;
          font-weight:950;
        }
        .notificationSlotPreview>div {
          min-width:0;
          display:grid;
          gap:3px;
        }
        .notificationSlotPreview strong {
          font-size:.72rem;
        }
        .notificationSlotPreview small {
          color:#77727d;
          font-size:.59rem;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .notificationSlotArrow {
          color:#8a858e;
          font-size:1.15rem;
        }
        @media(max-width:680px) {
          .notificationPreview {
            width:100%;
          }
          .notificationPreview .previewIntro,
          .notificationPreview .previewControls {
            width:calc(100% - 32px);
          }
          .notificationPreview .previewControls {
            grid-template-columns:1fr 1fr;
          }
          .notificationPreviewScreen {
            min-height:760px;
            padding:18px 16px 72px;
            border-right:0;
            border-left:0;
            border-radius:0;
          }
          .notificationPreviewTopBar {
            gap:8px;
          }
          .notificationPreviewActions {
            gap:6px;
          }
          .notificationPreviewUtilityActions {
            gap:6px;
          }
          .notificationLanguageSelect {
            max-width:118px;
            height:34px;
            font-size:.66rem;
          }
          .notificationAccountChip {
            min-height:34px;
            padding-inline:9px;
            font-size:.62rem;
          }
          .notificationBellButton {
            width:34px;
            height:34px;
            flex-basis:34px;
            border-radius:11px;
          }
          .notificationHistoryPanel {
            position:fixed;
            z-index:141;
            top:auto;
            inset-inline:10px;
            bottom:max(10px,env(safe-area-inset-bottom));
            width:auto;
            max-height:calc(74dvh - env(safe-area-inset-bottom));
            border-radius:24px;
          }
          .notificationHistoryScroll {
            max-height:calc(74dvh - 63px - env(safe-area-inset-bottom));
            padding-bottom:max(6px,env(safe-area-inset-bottom));
          }
          .notificationHistoryRow {
            padding-block:14px 15px;
            padding-inline:15px;
          }
          .notificationHistoryTitle {
            font-size:.75rem;
          }
          .notificationHistoryBody {
            font-size:.64rem;
          }
          .notificationMissionCard {
            padding:22px 20px;
          }
        }
        @media(prefers-reduced-motion:reduce) {
          .notificationSpinner {
            animation-duration:1.8s;
          }
          .notificationHistoryRow {
            transition:none;
          }
        }
      `}</style>
    </section>
  );
}
