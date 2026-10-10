import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

// The generic viewport QA misses the notification row's STRONG and SPAN
// content, title/time collisions, and long translated Mark-all labels.
const NARROW = { width: 320, height: 740 };
const MOBILE = { width: 393, height: 852 };
const WIDE = { width: 480, height: 840 };
const DESKTOP = { width: 1280, height: 900 };

const FULL_LANGUAGE_STATES = [
  'NOTI-HISTORY-OPEN',          // multiple cards, unread badge and Mark-all
  'NOTI-REFERRAL-RESTORED',     // longest localized security body
  'NOTI-POST-PAYOUT-REVIEW',   // long post-payout notice
  'NOTI-REWARD-PAID',          // reward amount and receipt action
] as const;

const HIGH_RISK_LOCALES = [
  'ar', 'arz', 'ur', 'hi', 'bn', 'mr', 'te', 'zh-tw', 'ko', 'de', 'el',
] as const satisfies readonly SupportedLocale[];

const EXTRA_STATES = [
  'NOTI-REFERRAL-INVALIDATED',
  'NOTI-REWARD-ADJUSTED',
  'NOTI-SECURITY-CLEARED',
] as const;

async function verifyNotificationLayout(page: Page, locale: SupportedLocale) {
  const panel = page.locator('.notificationHistoryPanel');
  await expect(panel).toBeVisible();
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>(resolve => setTimeout(resolve, 1500)),
    ]);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const box = (element: Element | null) => element?.getBoundingClientRect() ?? null;
    const overlaps = (left: DOMRect | null, right: DOMRect | null) =>
      Boolean(left && right
        && Math.min(left.right, right.right) - Math.max(left.left, right.left) > 2
        && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 2);
    const header = root.querySelector('.notificationHistoryHeader');
    const heading = box(header?.querySelector('.notificationHistoryHeading') ?? null);
    const close = box(header?.querySelector('.notificationHistoryClose') ?? null);
    const markAll = box(header?.querySelector('.notificationHistoryMarkAll') ?? null);
    if (overlaps(heading, close)) issues.push('header title and close overlap');
    if (overlaps(heading, markAll)) issues.push('header title and Mark-all overlap');
    if (overlaps(close, markAll)) issues.push('close and Mark-all overlap');

    const selectors = [
      '.notificationHistoryHeading h3',
      '.notificationHistoryHeading > span',
      '.notificationHistoryMarkAll',
      '.notificationHistoryTitle',
      '.notificationHistoryBody',
      '.notificationHistoryTime',
      '.notificationHistoryMeta b',
      '.notificationReceiptAction',
      '.notificationReceiptAction span',
      '.notificationHistoryGroup h4',
      '.notificationActionCopy strong',
      '.notificationActionCopy small',
      '.notificationReceiptFacts dd',
      '.notificationReceiptView > p',
    ];
    for (const el of root.querySelectorAll<HTMLElement>(selectors.join(','))) {
      const value = el.textContent?.trim() ?? '';
      if (!value) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const bounds = el.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const name = el.className || el.tagName;
      const ancestor = el.closest('.notificationHistoryRow, .notificationHistoryHeader, .notificationReceiptView, .notificationHistoryGroup') ?? root;
      const limit = ancestor.getBoundingClientRect();
      if (bounds.left < limit.left - 2 || bounds.right > limit.right + 2) {
        issues.push(name + ' outside horizontal container: ' + value.slice(0, 32));
      }
      // Ordinary rows may be vertically scrolled, but their text must not be
      // clipped inside its own line box or a fixed-height action control.
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 2) {
        issues.push(name + ' horizontally clipped: ' + value.slice(0, 32));
      }
      if (el.clientHeight && el.scrollHeight > el.clientHeight + 2
        && (style.overflowY === 'clip' || style.overflowY === 'hidden')) {
        issues.push(name + ' vertically clipped: ' + value.slice(0, 32));
      }
    }
    for (const row of root.querySelectorAll('.notificationHistoryRow')) {
      const title = box(row.querySelector('.notificationHistoryTitle'));
      const when = box(row.querySelector('.notificationHistoryTime'));
      const body = box(row.querySelector('.notificationHistoryBody'));
      const meta = box(row.querySelector('.notificationHistoryMeta'));
      if (overlaps(title, when)) issues.push('card title collides with event time');
      if (overlaps(body, when)) issues.push('card body collides with event time');
      if (overlaps(body, meta)) issues.push('card body collides with metadata');
    }

    const viewportOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      - window.innerWidth;
    if (viewportOverflow > 1) issues.push('viewport overflows horizontally: ' + viewportOverflow);
    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('notification panel internally overflows horizontally');
    }
    const text = root.textContent ?? '';
    if (/\bundefined\b|\[missing translation\]|\{\{[^}]+\}\}/i.test(text)) {
      issues.push('unresolved translation');
    }
    return { issues, direction: getComputedStyle(root).direction };
  });
  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
}

for (const locale of SUPPORTED_LOCALES) {
  for (const state of FULL_LANGUAGE_STATES) {
    test('all 29 locales: notification ' + locale + ' / ' + state, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await page.goto('/qa/notification-state?state=' + state + '&locale=' + locale, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await verifyNotificationLayout(page, locale);
      // Verify resizing the same real component to a typical phone width.
      await page.setViewportSize(MOBILE);
      await verifyNotificationLayout(page, locale);
    });
  }
}

for (const locale of HIGH_RISK_LOCALES) {
  for (const state of EXTRA_STATES) {
    test('high-risk scripts: notification ' + locale + ' / ' + state, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.goto('/qa/notification-state?state=' + state + '&locale=' + locale, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await verifyNotificationLayout(page, locale);
      await page.setViewportSize(DESKTOP);
      await verifyNotificationLayout(page, locale);
    });
  }
}