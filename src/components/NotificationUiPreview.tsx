'use client';

import { useMemo, useState } from 'react';

import { Brand } from './Brand';
import { HOME_COPY } from '@/lib/i18n/homeCopy';
import { INELIGIBLE_INVITER_COPY } from '@/lib/i18n/ineligibleInviterCopy';
import {
  LANGUAGE_OPTIONS,
  isCjkLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
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
  dappProgress?: number;
  rewardAmountB3tr?: string;
  actionRequired?: boolean;
};

type PreviewMode = 'history' | 'empty';

const TEST_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

function sampleItems(now: number): PreviewItem[] {
  return [
    {
      id: 7,
      kind: 'REWARD_READY',
      occurredAt: new Date(now - 12 * 60 * 1000),
      read: false,
      rewardAmountB3tr: '147.74',
      actionRequired: true,
    },
    {
      id: 6,
      kind: 'DAPP_PROGRESS',
      occurredAt: new Date(now - 3 * 60 * 60 * 1000),
      read: false,
      dappProgress: 3,
    },
    {
      id: 5,
      kind: 'INVITE_ACCEPTED',
      occurredAt: new Date(now - 5 * 60 * 60 * 1000),
      read: false,
    },
    {
      id: 4,
      kind: 'VOT3_CONVERTED',
      occurredAt: new Date(now - 28 * 60 * 60 * 1000),
      read: true,
    },
    {
      id: 3,
      kind: 'REWARD_PAID',
      occurredAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      read: true,
      rewardAmountB3tr: '124.50',
    },
    {
      id: 2,
      kind: 'INVITE_INELIGIBLE',
      occurredAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      read: true,
    },
    {
      id: 1,
      kind: 'DAPP_PROGRESS',
      occurredAt: new Date(now - 9 * 24 * 60 * 60 * 1000),
      read: true,
      dappProgress: 1,
    },
  ];
}

function structuralCopy(locale: SupportedLocale) {
  if (locale === 'ko') {
    return {
      title: '알림',
      newLabel: '새 알림',
      markAll: '모두 읽음',
      today: '오늘',
      earlier: '이전 알림',
      emptyTitle: '새 알림이 없어요',
      emptyBody: '새로운 소식이 생기면 여기에 표시됩니다.',
      action: '확인 필요',
      close: '닫기',
      unreadAria: (count: number) => `알림 열기, 읽지 않은 알림 ${count}개`,
    };
  }

  return {
    title: 'Notifications',
    newLabel: 'new',
    markAll: 'Mark all as read',
    today: 'Today',
    earlier: 'Earlier',
    emptyTitle: "You're all caught up",
    emptyBody: 'New notifications will appear here.',
    action: 'Action needed',
    close: 'Close',
    unreadAria: (count: number) => `Open notifications, ${count} unread`,
  };
}

function itemCopy(
  item: PreviewItem,
  locale: SupportedLocale,
): { title: string; body: string; hint?: string } {
  const copy = NOTIFICATION_COPY[locale];
  const v2 = NOTIFICATION_V2_COPY[locale];
  const ineligible = INELIGIBLE_INVITER_COPY[locale] ??
    INELIGIBLE_INVITER_COPY.en;

  switch (item.kind) {
    case 'INVITE_ACCEPTED':
      return { title: copy.acceptedTitle, body: copy.acceptedBody };
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
      return { title: ineligible.title, body: ineligible.body };
  }
}

function relativeTime(date: Date, locale: SupportedLocale): string {
  const now = Date.now();
  const deltaMs = date.getTime() - now;
  const abs = Math.abs(deltaMs);

  if (deltaMs > 0 && abs < 5 * 60 * 1000) {
    return locale === 'ko' ? '방금 전' : 'just now';
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return locale === 'ko' ? '방금 전' : 'just now';
  if (abs < hour) return rtf.format(Math.round(deltaMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(deltaMs / hour), 'hour');
  if (abs < 7 * day) return rtf.format(Math.round(deltaMs / day), 'day');

  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function itemIcon(kind: InviteNotificationKindV2): string {
  if (kind === 'REWARD_READY' || kind === 'REWARD_PAID') return '◆';
  if (kind === 'DAPP_PROGRESS') return '↗';
  if (kind === 'VOT3_CONVERTED') return 'V';
  if (kind === 'INVITE_INELIGIBLE') return '!';
  return '•';
}

export function NotificationUiPreview() {
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<PreviewMode>('history');
  const [items, setItems] = useState<PreviewItem[]>(() =>
    sampleItems(Date.now()),
  );

  const t = HOME_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];
  const structure = structuralCopy(locale);
  const unreadCount = mode === 'history'
    ? items.filter((item) => !item.read).length
    : 0;

  const sorted = useMemo(
    () => [...items].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    [items],
  );

  const todayItems = sorted.filter(
    (item) => Date.now() - item.occurredAt.getTime() < 24 * 60 * 60 * 1000,
  );
  const earlierItems = sorted.filter(
    (item) => Date.now() - item.occurredAt.getTime() >= 24 * 60 * 60 * 1000,
  );

  const markRead = (id: number) => {
    setItems((current) =>
      current.map((item) => item.id === id ? { ...item, read: true } : item),
    );
  };

  const markAllRead = () => {
    const visibleMaxId = Math.max(0, ...items.map((item) => item.id));
    setItems((current) =>
      current.map((item) =>
        item.id <= visibleMaxId ? { ...item, read: true } : item,
      ),
    );
  };

  const renderItem = (item: PreviewItem) => {
    const copy = itemCopy(item, locale);
    return (
      <button
        type="button"
        key={item.id}
        className={item.read ? 'historyRow read' : 'historyRow unread'}
        onClick={() => markRead(item.id)}
      >
        <span className="rowStatus" aria-hidden="true">
          {!item.read ? <i /> : null}
        </span>
        <span className="rowIcon" aria-hidden="true">{itemIcon(item.kind)}</span>
        <span className="rowCopy">
          <span className="rowTopLine">
            <strong>{copy.title}</strong>
            <time dateTime={item.occurredAt.toISOString()}>
              {relativeTime(item.occurredAt, locale)}
            </time>
          </span>
          <span className="rowBody">{copy.body}</span>
          <span className="rowMeta">
            {copy.hint ? <b>{copy.hint}</b> : null}
            {item.actionRequired ? <em>{structure.action}</em> : null}
          </span>
        </span>
        <span className="rowChevron" aria-hidden="true">›</span>
      </button>
    );
  };

  return (
    <section className="notificationPreview">
      <header className="previewIntro">
        <span>PREVIEW ONLY · PRODUCTION UI SHELL</span>
        <h2>실제 VeInvite 상단 UI에서 보는 알림센터</h2>
        <p>
          현재 main의 Brand, 헤더 크기·간격·색상·카드 스타일을 그대로 기준으로 잡고,
          알림센터에만 테스트 데이터를 넣었습니다. Production DB와 보상 로직은 사용하지 않습니다.
        </p>
      </header>

      <div className="previewControls">
        <button
          type="button"
          className={mode === 'history' ? 'selected' : ''}
          onClick={() => {
            setMode('history');
            setItems(sampleItems(Date.now()));
            setOpen(true);
          }}
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
      </div>

      <main className="screen">
        <header className="topBar">
          <Brand />
          <div className="topActions">
            <div className="utilityActions">
              <div className="bellWrap">
                <button
                  type="button"
                  className={unreadCount > 0 ? 'bellButton unread' : 'bellButton'}
                  aria-label={
                    unreadCount > 0
                      ? structure.unreadAria(unreadCount)
                      : NOTIFICATION_COPY[locale].bellAria
                  }
                  aria-expanded={open}
                  onClick={() => setOpen((current) => !current)}
                >
                  <BellIcon />
                  {unreadCount > 0 ? (
                    <span className="unreadBadge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {open ? (
                  <>
                    <button
                      type="button"
                      className="panelBackdrop"
                      aria-label={structure.close}
                      onClick={() => setOpen(false)}
                    />
                    <section
                      className="historyPanel"
                      role="dialog"
                      aria-modal="true"
                      aria-label={structure.title}
                    >
                      <header className="historyHeader">
                        <div>
                          <h3>{structure.title}</h3>
                          {unreadCount > 0 ? (
                            <span>{unreadCount} {structure.newLabel}</span>
                          ) : null}
                        </div>
                        <div className="historyHeaderActions">
                          {unreadCount > 0 ? (
                            <button type="button" onClick={markAllRead}>
                              {structure.markAll}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="closePanel"
                            aria-label={structure.close}
                            onClick={() => setOpen(false)}
                          >
                            ×
                          </button>
                        </div>
                      </header>

                      {mode === 'empty' || sorted.length === 0 ? (
                        <div className="emptyState">
                          <span className="emptyBell" aria-hidden="true"><BellIcon /></span>
                          <strong>{structure.emptyTitle}</strong>
                          <p>{structure.emptyBody}</p>
                        </div>
                      ) : (
                        <div className="historyScroll">
                          {todayItems.length > 0 ? (
                            <section className="historyGroup">
                              <h4>{structure.today}</h4>
                              <div>{todayItems.map(renderItem)}</div>
                            </section>
                          ) : null}
                          {earlierItems.length > 0 ? (
                            <section className="historyGroup">
                              <h4>{structure.earlier}</h4>
                              <div>{earlierItems.map(renderItem)}</div>
                            </section>
                          ) : null}
                        </div>
                      )}
                    </section>
                  </>
                ) : null}
              </div>

              <select
                className="languageSelect"
                value={locale}
                onChange={(event) =>
                  setLocale(event.target.value as SupportedLocale)}
                aria-label={t.languageAria}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.locale} value={option.locale}>
                    {option.nativeName}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="accountChip" aria-label={t.walletAria}>
              <span className="accountDot" />
              {TEST_WALLET.slice(0, 6)}···{TEST_WALLET.slice(-4)}
            </button>
          </div>
        </header>

        <section className="missionCard">
          <div className="cardGlow" />
          <div className={isCjkLocale(locale) ? 'missionCopy cjkCopy' : 'missionCopy'}>
            <h1>{referral.homeTitle}</h1>
          </div>

          <div className="permanentLinkCard">
            <div className="linkPreview">
              https://veinvite.app/i/TEST234
            </div>
            <div className="linkActions">
              <button type="button" className="primaryAction compactAction">
                {t.shareInvite}
              </button>
              <button type="button" className="secondaryAction compactAction">
                {t.copyLink}
              </button>
            </div>
          </div>

          <div className="slotsBlock">
            <div className="slotsHeading">
              <strong>{referral.slotsLabel}</strong>
              <span>1/2</span>
            </div>
            <article className="slotPreview activeSlot">
              <span className="slotNumber">1</span>
              <div>
                <strong>dApp 3/3</strong>
                <small>0xABCD···1234</small>
              </div>
              <span className="slotArrow">›</span>
            </article>
            <article className="slotPreview">
              <span className="slotNumber">2</span>
              <div>
                <strong>{locale === 'ko' ? '친구 초대하기' : 'Invite a friend'}</strong>
                <small>{locale === 'ko' ? '영구 초대 링크 공유' : 'Share permanent invite link'}</small>
              </div>
              <span className="slotArrow">›</span>
            </article>
          </div>
        </section>
      </main>

      <style jsx>{`
        .notificationPreview{width:min(calc(100% - 24px),1120px);margin:0 auto;color:#fff}.previewIntro{width:min(100%,760px);margin:0 auto 18px}.previewIntro>span{color:#f4b728;font-size:.62rem;font-weight:950;letter-spacing:.11em}.previewIntro h2{margin:6px 0 0;font-size:clamp(1.35rem,4vw,1.9rem);letter-spacing:-.04em}.previewIntro p{margin:8px 0 0;color:#8f8992;font-size:.72rem;line-height:1.6}.previewControls{width:min(100%,520px);margin:0 auto 12px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.previewControls button{min-height:42px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#11110f;color:#8f8992;font:inherit;font-size:.69rem;font-weight:850;cursor:pointer}.previewControls button.selected{border-color:rgba(244,183,40,.32);background:rgba(244,183,40,.09);color:#ffd66e}
        .screen{min-height:720px;box-sizing:border-box;padding:22px 18px 72px;color:#fff;background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807;border:1px solid rgba(255,255,255,.045);border-radius:30px}.topBar{position:relative;z-index:20;width:min(100%,520px);margin:0 auto 26px;display:flex;align-items:center;justify-content:space-between;gap:16px}.topActions{min-width:0;display:flex;align-items:center;gap:10px}.utilityActions{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px}.languageSelect{max-width:155px;height:40px;padding:0 28px 0 11px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#fff;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}.accountChip{min-height:40px;padding:0 13px;display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#fff;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.accountDot{width:9px;height:9px;border-radius:50%;background:#f4b728;box-shadow:0 0 14px rgba(244,183,40,.68)}
        .bellWrap{position:relative}.bellButton{position:relative;width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#b6b2bf;cursor:pointer}.bellButton.unread{border-color:rgba(255,205,80,.36);color:#ffd04a;box-shadow:0 0 0 3px rgba(244,183,40,.05)}.unreadBadge{position:absolute;top:-7px;inset-inline-end:-7px;min-width:19px;height:19px;box-sizing:border-box;padding:0 5px;display:grid;place-items:center;border:2px solid #080807;border-radius:999px;background:#f4b728;color:#17120a;font-size:.6rem;font-weight:950;line-height:1}
        .panelBackdrop{position:fixed;z-index:140;inset:0;border:0;background:rgba(2,2,2,.74);cursor:default}.historyPanel{position:absolute;z-index:141;top:50px;right:0;width:min(420px,calc(100vw - 32px));max-height:min(620px,calc(100dvh - 92px));overflow:hidden;box-sizing:border-box;border:1px solid rgba(255,205,80,.24);border-radius:22px;background:linear-gradient(155deg,#211b10,#11110f 66%);box-shadow:0 32px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07);text-align:left}.historyHeader{min-height:64px;padding:13px 14px 12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.065)}.historyHeader>div:first-child{min-width:0;display:flex;align-items:center;gap:8px}.historyHeader h3{margin:0;font-size:1rem;letter-spacing:-.02em}.historyHeader>div:first-child>span{padding:4px 7px;border-radius:999px;background:rgba(244,183,40,.14);color:#ffd04a;font-size:.58rem;font-weight:950;white-space:nowrap}.historyHeaderActions{display:flex;align-items:center;gap:4px}.historyHeaderActions button{border:0;background:transparent;color:#9d988f;font:inherit;font-size:.64rem;font-weight:850;cursor:pointer}.historyHeaderActions .closePanel{width:34px;height:34px;color:#77736f;font-size:1.45rem}.historyScroll{max-height:calc(min(620px,calc(100dvh - 92px)) - 65px);overflow-y:auto;overscroll-behavior:contain}.historyGroup h4{margin:0;padding:11px 16px 7px;color:#77736f;font-size:.61rem;font-weight:900;text-transform:none}.historyGroup>div{display:grid}.historyRow{width:100%;min-width:0;padding:13px 12px 13px 8px;display:grid;grid-template-columns:10px 34px minmax(0,1fr) 18px;gap:8px;align-items:start;border:0;border-top:1px solid rgba(255,255,255,.045);background:transparent;color:#fff;text-align:left;font:inherit;cursor:pointer}.historyRow.unread{background:linear-gradient(90deg,rgba(244,183,40,.08),rgba(244,183,40,.025))}.historyRow.read{background:rgba(255,255,255,.012);color:#aaa5ad}.rowStatus{padding-top:6px;display:grid;place-items:center}.rowStatus i{width:7px;height:7px;border-radius:50%;background:#ffd04a;box-shadow:0 0 12px rgba(244,183,40,.5)}.rowIcon{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:rgba(244,183,40,.12);color:#ffd04a;font-size:.67rem;font-weight:950}.read .rowIcon{background:rgba(255,255,255,.045);color:#747078}.rowCopy{min-width:0;display:grid;gap:4px}.rowTopLine{min-width:0;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.rowTopLine strong{min-width:0;font-size:.72rem;line-height:1.35;overflow-wrap:normal}.rowTopLine time{flex:0 0 auto;color:#76717a;font-size:.56rem;white-space:nowrap}.rowBody{color:#9a949f;font-size:.63rem;line-height:1.45;overflow-wrap:normal}.read .rowBody{color:#6f6a72}.rowMeta{display:flex;align-items:center;gap:6px;min-height:16px}.rowMeta b{color:#ffd04a;font-size:.57rem;font-weight:950}.rowMeta em{padding:3px 6px;border-radius:999px;background:rgba(244,183,40,.13);color:#ffd04a;font-size:.52rem;font-style:normal;font-weight:950}.rowChevron{padding-top:7px;color:#69656e;font-size:1.15rem}.emptyState{min-height:280px;padding:36px 24px;display:grid;place-items:center;align-content:center;text-align:center}.emptyBell{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(244,183,40,.1);color:#ffd04a}.emptyState strong{margin-top:14px;font-size:.94rem}.emptyState p{max-width:280px;margin:7px 0 0;color:#817c85;font-size:.68rem;line-height:1.55}
        .missionCard{position:relative;overflow:hidden;width:min(100%,520px);box-sizing:border-box;margin:0 auto;padding:24px;border:1px solid rgba(255,201,61,.28);border-radius:30px;background:linear-gradient(155deg,rgba(54,40,14,.98),rgba(16,16,14,.99) 66%);box-shadow:0 28px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.08)}.cardGlow{position:absolute;top:-110px;right:-90px;width:250px;height:250px;border-radius:50%;background:rgba(244,183,40,.22);filter:blur(4px);pointer-events:none}.missionCopy{position:relative;z-index:1}.missionCopy h1{max-width:100%;margin:0;font-size:clamp(2.05rem,8vw,3.05rem);line-height:1.04;letter-spacing:-.05em;text-wrap:balance;overflow-wrap:anywhere;hyphens:auto}.missionCopy.cjkCopy h1{font-size:clamp(2rem,7vw,2.85rem);line-height:1.1;letter-spacing:-.035em}.permanentLinkCard{position:relative;z-index:1;margin-top:18px;padding:16px;border:1px solid rgba(255,205,80,.2);border-radius:19px;background:rgba(255,205,80,.055)}.linkPreview{padding:11px 12px;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(3,4,5,.42);color:#b8b2c2;font-size:.68rem;font-weight:750;white-space:nowrap;text-overflow:ellipsis;direction:ltr;text-align:left}.linkActions{margin-top:11px;display:grid;grid-template-columns:1fr 1fr;gap:9px}.primaryAction,.secondaryAction{position:relative;z-index:1;width:100%;min-height:56px;border-radius:18px;font:inherit;font-size:.92rem;font-weight:950;cursor:pointer;overflow-wrap:anywhere}.primaryAction{margin-top:24px;border:0;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 16px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;box-shadow:0 16px 35px rgba(190,126,12,.25),inset 0 1px 0 rgba(255,255,255,.22)}.secondaryAction{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.045);color:#fff}.compactAction{min-height:44px;margin-top:0;border-radius:13px;font-size:.75rem;box-shadow:none}.slotsBlock{position:relative;z-index:1;margin-top:16px;display:grid;gap:9px}.slotsHeading{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#c7c2d0;font-size:.78rem}.slotsHeading span{flex:0 0 auto;min-width:42px;padding:5px 8px;border:1px solid rgba(255,255,255,.08);border-radius:999px;color:#ffd66e;text-align:center;font-size:.66rem;font-weight:950}.slotPreview{min-height:68px;padding:11px 12px;box-sizing:border-box;display:grid;grid-template-columns:28px minmax(0,1fr) 18px;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.022)}.activeSlot{border-color:rgba(244,183,40,.16);background:rgba(244,183,40,.04)}.slotNumber{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:rgba(244,183,40,.11);color:#ffd04a;font-size:.65rem;font-weight:950}.slotPreview>div{min-width:0;display:grid;gap:3px}.slotPreview strong{font-size:.72rem}.slotPreview small{color:#77727d;font-size:.59rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slotArrow{color:#8a858e;font-size:1.15rem}
        @media(max-width:680px){.notificationPreview{width:100%}.previewIntro,.previewControls{width:calc(100% - 32px)}.screen{min-height:760px;padding:18px 16px 72px;border-right:0;border-left:0;border-radius:0}.topBar{gap:8px}.topActions{gap:6px}.utilityActions{gap:6px}.languageSelect{max-width:118px;height:34px;font-size:.66rem}.accountChip{min-height:34px;padding:0 9px;font-size:.62rem}.bellButton{width:34px;height:34px;flex-basis:34px;border-radius:11px}.historyPanel{position:fixed;z-index:141;top:auto;right:0;bottom:0;left:0;width:100%;max-height:78dvh;border-right:0;border-bottom:0;border-left:0;border-radius:27px 27px 0 0}.historyScroll{max-height:calc(78dvh - 65px)}.rowTopLine{display:grid;grid-template-columns:minmax(0,1fr) auto}.missionCard{padding:22px 20px}}
      `}</style>
    </section>
  );
}
