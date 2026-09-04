'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import { NOTIFICATION_HISTORY_COPY } from '@/lib/i18n/notificationHistoryCopy';
import { NOTIFICATION_V2_COPY } from '@/lib/i18n/notificationV2Copy';
import {
  isRtlLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import type {
  InviteNotificationHistoryItem,
} from '@/lib/notifications/inviteNotificationHistory';

const B3TR_SCALE = 10n ** 18n;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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

function intlLocale(locale: SupportedLocale): string {
  if (locale === 'zh-tw') return 'zh-TW';
  if (locale === 'arz') return 'ar-EG';
  if (locale === 'pcm') return 'en-NG';
  return locale;
}

function relativeTime(
  value: string,
  locale: SupportedLocale,
): string {
  const eventTime = Date.parse(value);
  if (!Number.isFinite(eventTime)) return '';

  const deltaMs = eventTime - Date.now();
  const abs = Math.abs(deltaMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const normalizedLocale = intlLocale(locale);

  try {
    const rtf = new Intl.RelativeTimeFormat(normalizedLocale, {
      numeric: 'auto',
    });

    if (abs < minute) return rtf.format(0, 'second');
    if (abs < hour) {
      return rtf.format(Math.round(deltaMs / minute), 'minute');
    }
    if (abs < day) {
      return rtf.format(Math.round(deltaMs / hour), 'hour');
    }
    if (abs < 7 * day) {
      return rtf.format(Math.round(deltaMs / day), 'day');
    }

    const date = new Date(eventTime);
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
    }).format(new Date(eventTime));
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
  value: string,
  now: Date,
): 'today' | 'yesterday' | 'earlier' {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'earlier';
  const distance = localDaySerial(now) - localDaySerial(date);
  if (distance <= 0) return 'today';
  if (distance === 1) return 'yesterday';
  return 'earlier';
}

function formatB3trWei(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;

  try {
    const amount = BigInt(value);
    const whole = amount / B3TR_SCALE;
    const fraction = (amount % B3TR_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 4)
      .replace(/0+$/u, '');
    return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return null;
  }
}

function shortWallet(value: string | null): string | null {
  if (!value || !/^0x[0-9a-f]{40}$/i.test(value)) return null;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function itemCopy(
  item: InviteNotificationHistoryItem,
  locale: SupportedLocale,
): { title: string; body: string; hint: string | null } {
  const copy = NOTIFICATION_COPY[locale];
  const v2 = NOTIFICATION_V2_COPY[locale];
  const ineligible =
    INELIGIBLE_INVITER_COPY[locale] ?? INELIGIBLE_INVITER_COPY.en;
  const amount = formatB3trWei(item.rewardAmountWei);

  switch (item.kind) {
    case 'INVITE_ACCEPTED':
      return {
        title: copy.acceptedTitle,
        body: copy.acceptedBody,
        hint: null,
      };
    case 'DAPP_PROGRESS':
      return {
        title: v2.dappProgressTitle,
        body: v2.dappProgressBody,
        hint: `dApp ${item.dappProgress ?? 0}/3`,
      };
    case 'VOT3_CONVERTED':
      return item.collapsedProgress
        ? {
            title: copy.progressTitle,
            body: copy.progressVot3Body,
            hint: copy.vot3Hint,
          }
        : {
            title: copy.vot3Title,
            body: copy.vot3Body,
            hint: copy.vot3Hint,
          };
    case 'REWARD_READY':
      return {
        title: v2.rewardReadyTitle,
        body: v2.rewardReadyBody,
        hint: amount ? `${amount} B3TR` : null,
      };
    case 'REWARD_PAID':
      return {
        title: copy.rewardTitle,
        body: copy.rewardBody,
        hint: amount ? `${amount} B3TR` : null,
      };
    case 'INVITE_INELIGIBLE':
      return {
        title: ineligible.title,
        body: ineligible.body,
        hint: null,
      };
  }
}

export function InviteNotificationHistoryCenter({
  locale,
  items,
  unreadCount,
  open,
  loading,
  busy,
  errorMessage,
  hasMore,
  onOpen,
  onClose,
  onRetry,
  onMarkRead,
  onMarkAll,
  onLoadMore,
}: {
  locale: Locale;
  items: InviteNotificationHistoryItem[];
  unreadCount: number;
  open: boolean;
  loading: boolean;
  busy: boolean;
  errorMessage: string;
  hasMore: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkAll: () => void | Promise<void>;
  onLoadMore: () => void | Promise<void>;
}) {
  const supportedLocale = locale as SupportedLocale;
  const structure = NOTIFICATION_HISTORY_COPY[supportedLocale];
  const notificationCopy = NOTIFICATION_COPY[supportedLocale];
  const rtl = isRtlLocale(supportedLocale);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [, setClockTick] = useState(0);

  const sorted = useMemo(
    () => [...items].sort((left, right) => {
      const timeDelta = Date.parse(right.eventAt) - Date.parse(left.eventAt);
      if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
      return BigInt(right.id) > BigInt(left.id) ? 1 : -1;
    }),
    [items],
  );

  const groups = useMemo(() => {
    const now = new Date();
    return {
      today: sorted.filter((item) => dayBucket(item.eventAt, now) === 'today'),
      yesterday: sorted.filter(
        (item) => dayBucket(item.eventAt, now) === 'yesterday',
      ),
      earlier: sorted.filter((item) => dayBucket(item.eventAt, now) === 'earlier'),
    };
  }, [sorted]);

  const closePanel = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => {
      bellRef.current?.focus();
    });
  }, [onClose]);

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
      panelRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getAttribute('aria-hidden') !== 'true' &&
          element.getClientRects().length > 0,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeInside =
        active instanceof Node && panelRef.current.contains(active);

      if (event.shiftKey) {
        if (!activeInside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!activeInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closePanel, open]);

  const renderItem = (item: InviteNotificationHistoryItem) => {
    const copy = itemCopy(item, supportedLocale);
    const friend = shortWallet(item.friendWallet);
    const unread = item.readAt === null;

    return (
      <button
        key={item.id}
        type="button"
        className={
          unread
            ? 'notificationHistoryRow isUnread'
            : 'notificationHistoryRow isRead'
        }
        aria-label={copy.title}
        aria-pressed={!unread}
        onClick={() => {
          if (unread && !busy) void onMarkRead(item.id);
        }}
      >
        <span className="notificationHistoryContent">
          <span className="notificationHistoryTopLine">
            <span className="notificationHistoryTitleWrap">
              {unread ? (
                <i className="notificationUnreadDot" aria-hidden="true" />
              ) : null}
              <strong className="notificationHistoryTitle">
                {copy.title}
              </strong>
            </span>
            <time
              className="notificationHistoryTime"
              dateTime={item.eventAt}
            >
              {relativeTime(item.eventAt, supportedLocale)}
            </time>
          </span>

          <span className="notificationHistoryBody">{copy.body}</span>

          <span className="notificationHistoryMeta">
            {friend ? (
              <span className="notificationFriendWallet" dir="ltr">
                {friend}
              </span>
            ) : null}
            {copy.hint ? <b>{copy.hint}</b> : null}
            {item.kind === 'REWARD_READY' ? (
              <em>{structure.action}</em>
            ) : null}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="notificationHistoryRoot">
      <button
        ref={bellRef}
        type="button"
        className={
          unreadCount > 0
            ? 'notificationHistoryBell hasUnread'
            : 'notificationHistoryBell'
        }
        aria-label={
          unreadCount > 0
            ? `${notificationCopy.bellAria} (${unreadCount})`
            : notificationCopy.bellAria
        }
        aria-expanded={open}
        onClick={() => {
          if (open) closePanel();
          else onOpen();
        }}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="notificationHistoryBadge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="notificationHistoryBackdrop"
            aria-label={structure.close}
            onClick={closePanel}
          />
          <section
            ref={panelRef}
            className="notificationHistoryPanel"
            role="dialog"
            aria-modal="true"
            aria-label={structure.title}
            tabIndex={-1}
            lang={supportedLocale}
            dir={rtl ? 'rtl' : 'ltr'}
          >
            <header className="notificationHistoryHeader">
              <div className="notificationHistoryHeading">
                <h3>{structure.title}</h3>
                {unreadCount > 0 ? (
                  <span>{structure.newLabel} · {unreadCount}</span>
                ) : null}
              </div>
              <div className="notificationHistoryHeaderActions">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="notificationHistoryMarkAll"
                    disabled={busy}
                    onClick={() => void onMarkAll()}
                  >
                    {structure.markAll}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="notificationHistoryClose"
                  aria-label={structure.close}
                  onClick={closePanel}
                >
                  ×
                </button>
              </div>
            </header>

            {loading && items.length === 0 ? (
              <div
                className="notificationHistoryState"
                aria-live="polite"
                aria-busy="true"
              >
                <span className="notificationHistorySpinner" aria-hidden="true" />
                <strong>{structure.loadingTitle}</strong>
                <p>{structure.loadingBody}</p>
              </div>
            ) : errorMessage && items.length === 0 ? (
              <div className="notificationHistoryState errorState" role="alert">
                <span className="notificationHistoryStateIcon" aria-hidden="true">!</span>
                <strong>{structure.errorTitle}</strong>
                <p>{structure.errorBody}</p>
                <button
                  type="button"
                  className="notificationHistoryRetry"
                  onClick={onRetry}
                >
                  {structure.retry}
                </button>
              </div>
            ) : sorted.length === 0 ? (
              <div className="notificationHistoryState">
                <span className="notificationHistoryEmptyBell" aria-hidden="true">
                  <BellIcon size={22} />
                </span>
                <strong>{structure.emptyTitle}</strong>
                <p>{structure.emptyBody}</p>
              </div>
            ) : (
              <div className="notificationHistoryScroll">
                {groups.today.length > 0 ? (
                  <section className="notificationHistoryGroup">
                    <h4>{structure.today}</h4>
                    <div>{groups.today.map(renderItem)}</div>
                  </section>
                ) : null}
                {groups.yesterday.length > 0 ? (
                  <section className="notificationHistoryGroup">
                    <h4>{structure.yesterday}</h4>
                    <div>{groups.yesterday.map(renderItem)}</div>
                  </section>
                ) : null}
                {groups.earlier.length > 0 ? (
                  <section className="notificationHistoryGroup">
                    <h4>{structure.earlier}</h4>
                    <div>{groups.earlier.map(renderItem)}</div>
                  </section>
                ) : null}
                {hasMore ? (
                  <button
                    type="button"
                    className="notificationHistoryMore"
                    disabled={loading || busy}
                    onClick={() => void onLoadMore()}
                  >
                    {structure.earlier} ↓
                  </button>
                ) : null}
                {errorMessage ? (
                  <div className="notificationHistoryInlineError" role="alert">
                    <span>{structure.errorBody}</span>
                    <button type="button" onClick={onRetry}>
                      {structure.retry}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </>
      ) : null}

      <style jsx>{`
        .notificationHistoryRoot{position:relative;display:flex;align-items:center}.notificationHistoryBell{position:relative;width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#b6b2bf;cursor:pointer}.notificationHistoryBell.hasUnread{border-color:rgba(255,205,80,.36);color:#ffd04a;box-shadow:0 0 0 3px rgba(244,183,40,.05)}.notificationHistoryBadge{position:absolute;top:-7px;inset-inline-end:-7px;min-width:19px;height:19px;box-sizing:border-box;padding-inline:5px;display:grid;place-items:center;border:2px solid #080807;border-radius:999px;background:#f4b728;color:#17120a;font-size:.6rem;font-weight:950;line-height:1}.notificationHistoryBackdrop{position:fixed;z-index:140;inset:0;border:0;background:rgba(2,2,2,.66);cursor:default}.notificationHistoryPanel{position:absolute;z-index:141;top:50px;inset-inline-end:0;width:min(400px,calc(100vw - 28px));max-height:min(610px,calc(100dvh - 92px));overflow:hidden;box-sizing:border-box;border:1px solid rgba(255,205,80,.22);border-radius:22px;background:#11110f;color:#fff;box-shadow:0 32px 90px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.055);text-align:start}.notificationHistoryPanel:focus{outline:none}.notificationHistoryHeader{min-height:62px;padding-block:12px 11px;padding-inline:16px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(244,183,40,.025)}.notificationHistoryHeading{min-width:0;display:flex;align-items:center;gap:8px}.notificationHistoryHeading h3{margin:0;color:#f8f6ef;font-size:.98rem;letter-spacing:-.02em}.notificationHistoryHeading>span{padding:4px 7px;border-radius:999px;background:rgba(244,183,40,.13);color:#ffd04a;font-size:.56rem;font-weight:900;white-space:nowrap}.notificationHistoryHeaderActions{flex:0 0 auto;display:flex;align-items:center;gap:2px}.notificationHistoryMarkAll{min-height:32px;padding-inline:8px;border:0;background:transparent;color:#a59e91;font:inherit;font-size:.62rem;font-weight:850;cursor:pointer}.notificationHistoryClose{width:34px;height:34px;border:0;background:transparent;color:#77736f;font:inherit;font-size:1.4rem;cursor:pointer}.notificationHistoryScroll{max-height:calc(min(610px,calc(100dvh - 92px)) - 63px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#3b3529 transparent}.notificationHistoryGroup h4{margin:0;padding-block:12px 7px;padding-inline:16px;color:#6f6a62;font-size:.6rem;font-weight:900}.notificationHistoryRow{width:100%;min-width:0;box-sizing:border-box;padding-block:14px 15px;padding-inline:16px;display:block;border:0;border-top:1px solid rgba(255,255,255,.05);background:transparent;color:#fff;text-align:start;font:inherit;cursor:pointer;transition:background .16s ease}.notificationHistoryRow.isUnread{background:rgba(244,183,40,.055)}.notificationHistoryRow.isUnread:hover{background:rgba(244,183,40,.085)}.notificationHistoryRow.isRead{background:rgba(255,255,255,.008);cursor:default}.notificationHistoryContent{min-width:0;display:block}.notificationHistoryTopLine{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px}.notificationHistoryTitleWrap{min-width:0;display:flex;align-items:flex-start;gap:8px}.notificationUnreadDot{flex:0 0 7px;width:7px;height:7px;margin-top:5px;border-radius:50%;background:#ffd04a;box-shadow:0 0 11px rgba(244,183,40,.45)}.notificationHistoryTitle{min-width:0;color:#f5f1e8;font-size:.76rem;font-weight:850;line-height:1.4;letter-spacing:-.012em;overflow-wrap:normal;word-break:keep-all}.notificationHistoryTime{padding-top:1px;color:#746f67;font-size:.56rem;line-height:1.4;white-space:nowrap}.notificationHistoryBody{display:block;margin-top:6px;padding-inline-start:15px;color:#aaa39a;font-size:.65rem;line-height:1.55;overflow-wrap:normal;word-break:keep-all}.notificationHistoryMeta{margin-top:9px;padding-inline-start:15px;display:flex;align-items:center;flex-wrap:wrap;gap:6px}.notificationFriendWallet{color:#777168;font-size:.55rem;font-weight:800;letter-spacing:.01em;unicode-bidi:isolate}.notificationHistoryMeta b{padding:4px 7px;border:1px solid rgba(244,183,40,.14);border-radius:999px;background:rgba(244,183,40,.07);color:#e8c862;font-size:.56rem;font-weight:900}.notificationHistoryMeta em{padding:4px 7px;border-radius:999px;background:#f4b728;color:#17120a;font-size:.54rem;font-style:normal;font-weight:950}.notificationHistoryRow.isRead .notificationHistoryTitle{color:#b3ada4;font-weight:760}.notificationHistoryRow.isRead .notificationHistoryBody{color:#716c65}.notificationHistoryRow.isRead .notificationHistoryTime,.notificationHistoryRow.isRead .notificationFriendWallet{color:#5e5a55}.notificationHistoryRow.isRead .notificationHistoryMeta b{border-color:rgba(255,255,255,.055);background:rgba(255,255,255,.025);color:#79746d}.notificationHistoryState{min-height:270px;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}.notificationHistoryEmptyBell,.notificationHistoryStateIcon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(244,183,40,.08);color:#d5ae42}.notificationHistoryStateIcon{font-size:1.2rem;font-weight:950}.notificationHistorySpinner{width:32px;height:32px;border:3px solid rgba(244,183,40,.16);border-top-color:#e6bd4c;border-radius:50%;animation:notificationHistorySpin .8s linear infinite}@keyframes notificationHistorySpin{to{transform:rotate(360deg)}}.notificationHistoryState strong{margin-top:14px;color:#ddd8cf;font-size:.9rem}.notificationHistoryState p{max-width:280px;margin:7px 0 0;color:#77726b;font-size:.66rem;line-height:1.55}.notificationHistoryState.errorState .notificationHistoryStateIcon{background:rgba(255,110,120,.08);color:#ff8f9b}.notificationHistoryRetry,.notificationHistoryMore{min-height:38px;margin:16px auto;padding-inline:14px;border:1px solid rgba(244,183,40,.25);border-radius:12px;background:rgba(244,183,40,.08);color:#e9c85f;font:inherit;font-size:.65rem;font-weight:900;cursor:pointer}.notificationHistoryMore{display:block}.notificationHistoryInlineError{padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,110,120,.12);color:#cf8b92;font-size:.62rem}.notificationHistoryInlineError button{border:0;background:transparent;color:#e9c85f;font:inherit;font-size:.62rem;font-weight:900;cursor:pointer}.notificationHistoryBell:focus-visible,.notificationHistoryMarkAll:focus-visible,.notificationHistoryClose:focus-visible,.notificationHistoryRetry:focus-visible,.notificationHistoryMore:focus-visible,.notificationHistoryRow:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}.notificationHistoryMarkAll:disabled,.notificationHistoryMore:disabled{opacity:.45;cursor:not-allowed}@media(max-width:560px){.notificationHistoryBell{width:34px;height:34px;flex-basis:34px;border-radius:11px}.notificationHistoryPanel{position:fixed;z-index:141;top:auto;inset-inline:10px;bottom:max(10px,env(safe-area-inset-bottom));width:auto;max-height:calc(74dvh - env(safe-area-inset-bottom));border-radius:22px}.notificationHistoryScroll{max-height:calc(74dvh - 73px - env(safe-area-inset-bottom))}.notificationHistoryHeader{padding-inline:14px 9px}.notificationHistoryRow{padding-inline:14px}.notificationHistoryTopLine{gap:8px}}@media(prefers-reduced-motion:reduce){.notificationHistoryRow{transition:none}.notificationHistorySpinner{animation:none}}
      `}</style>
    </div>
  );
}
