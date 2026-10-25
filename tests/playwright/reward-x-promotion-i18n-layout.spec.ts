import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const NARROW = { width: 320, height: 740 };
const MOBILE = { width: 393, height: 852 };

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: false,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-26T00:00:00.000Z',
    postDeadlineAt: '2099-10-27T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const SHARDS = Array.from(
  { length: 4 },
  (_, shard) =>
    SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

async function installXPromotionMocks(page: Page) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OPEN_PROMOTION),
      });
    },
  );

  await page.route(
    '**/api/rewards/x-promotion/submit',
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'RAW_ENGLISH_INTERNAL_ERROR_MUST_NOT_RENDER',
        }),
      });
    },
  );
}

async function openRealXPromotionPanel(
  page: Page,
  locale: SupportedLocale,
) {
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );

  await expect(
    page.locator('[data-qa-notification-hydrated]'),
  ).toHaveAttribute(
    'data-qa-notification-hydrated',
    'true',
    { timeout: 10_000 },
  );

  const receiptRow = page
    .locator('.notificationHistoryRow')
    .filter({ has: page.locator('.notificationReceiptAction') })
    .first();
  await expect(receiptRow).toBeVisible({ timeout: 10_000 });
  await receiptRow.click();

  const receipt = page.locator('.notificationReceiptView');
  await expect(receipt).toBeVisible({ timeout: 10_000 });

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });

  return panel;
}

async function inspectPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (left: DOMRect | null, right: DOMRect | null) =>
      Boolean(
        left &&
        right &&
        Math.min(left.right, right.right) - Math.max(left.left, right.left) > 2 &&
        Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow: ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }

    if (
      receiptBox &&
      (
        rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2
      )
    ) {
      issues.push('panel escapes receipt width');
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionConnect',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (
          el.tagName !== 'INPUT' &&
          el.scrollWidth > el.clientWidth + 2
        ) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              el.scrollWidth +
              '>' +
              el.clientWidth,
          );
        }
        if (
          box.left < rootBox.left - 2 ||
          box.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside promotion panel');
        }
      }
    }

    if (
      overlaps(
        rect('.promotionHeading strong'),
        rect('.promotionHeading span'),
      )
    ) {
      issues.push('promotion title overlaps amount');
    }

    if (
      overlaps(
        rect('.promotionSubmit input'),
        rect('.promotionSubmit button'),
      )
    ) {
      issues.push('post URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionHeading span')!,
      ).direction,
      shareAmountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionShare b')!,
      ).direction,
      inputDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionSubmit input')!,
      ).direction,
      inputBottom:
        rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop:
        rect('.promotionSubmit button')?.top ?? null,
    };
  });

  expect(report.direction).toBe(
    isRtlLocale(locale) ? 'rtl' : 'ltr',
  );
  expect(report.amountDirection).toBe('ltr');
  expect(report.shareAmountDirection).toBe('ltr');
  expect(report.inputDirection).toBe('ltr');
  expect(
    report.issues,
    JSON.stringify({ locale, report }),
  ).toEqual([]);

  return report;
}

for (const [index, locales] of SHARDS.entries()) {
  test(
    'X promotion multilingual receipt layout shard ' + (index + 1),
    async ({ page }) => {
      await installXPromotionMocks(page);

      for (const locale of locales) {
        await page.setViewportSize(NARROW);
        await openRealXPromotionPanel(page, locale);
        const narrow = await inspectPanel(page, locale);

        expect(narrow.inputBottom).not.toBeNull();
        expect(narrow.buttonTop).not.toBeNull();
        expect(
          (narrow.buttonTop ?? 0) >=
            (narrow.inputBottom ?? 0) - 1,
        ).toBe(true);

        await page.setViewportSize(MOBILE);
        const mobile = await inspectPanel(page, locale);
        expect(mobile.inputBottom).not.toBeNull();
        expect(mobile.buttonTop).not.toBeNull();
        expect(
          (mobile.buttonTop ?? 0) >=
            (mobile.inputBottom ?? 0) - 1,
        ).toBe(true);

        const input = page.locator('.promotionSubmit input');
        const verify = page.locator('.promotionSubmit button');
        await input.fill(
          'https://x.com/test/status/1234567890123456789',
        );
        await verify.click();

        const error = page.locator('.promotionError');
        await expect(error).toBeVisible();
        await expect(error).toHaveText(
          rewardXPromotionSubmitError(locale, 409),
        );
        await expect(error).not.toContainText(
          'RAW_ENGLISH_INTERNAL_ERROR_MUST_NOT_RENDER',
        );

        await inspectPanel(page, locale);
      }
    },
  );
}
