import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-24T00:00:00.000Z',
    postDeadlineAt: '2099-10-25T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const SHARDS = Array.from({ length: 8 }, (_, shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 8 === shard),
);

const HIGH_RISK = [
  'ar',
  'ur',
  'arz',
  'de',
  'el',
  'te',
  'sw',
  'ro',
] as const satisfies readonly SupportedLocale[];

async function routePromotion(
  page: Page,
  body: unknown,
  status = 200,
) {
  await page.route('**/api/rewards/x-promotion?*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function openReceipt(
  page: Page,
  locale: SupportedLocale,
) {
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const row = page
    .locator('button.notificationHistoryRow')
    .filter({ has: page.locator('.notificationReceiptAction') })
    .first();

  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 10_000,
  });
}

async function openPromotion(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
  body: unknown = OPEN_PROMOTION,
) {
  await routePromotion(page, body);
  await page.setViewportSize({ width, height });
  await openReceipt(page, locale);

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });

  return panel;
}

async function inspectPromotion(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');
  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('promotion panel horizontally overflows');
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('promotion panel escapes receipt width');
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
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clipped horizontally');
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    if (overlaps(box('.promotionHeading strong'), box('.promotionHeading span'))) {
      issues.push('title overlaps amount');
    }
    if (overlaps(box('.promotionSubmit input'), box('.promotionSubmit button'))) {
      issues.push('URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontally overflows');
    }

    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const input = root.querySelector<HTMLInputElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: input ? getComputedStyle(input).direction : null,
      inputBottom: input?.getBoundingClientRect().bottom ?? null,
      buttonTop:
        root
          .querySelector<HTMLElement>('.promotionSubmit button')
          ?.getBoundingClientRect().top ?? null,
    };
  }).then((report) => ({
    ...report,
    expectedDirection: isRtlLocale(locale) ? 'rtl' : 'ltr',
  }));
}

for (let index = 0; index < SHARDS.length; index += 1) {
  test(
    'X promotion all-locale mobile shard ' + (index + 1),
    async ({ page }) => {
      test.setTimeout(120_000);
      for (const locale of SHARDS[index]) {
        for (const viewport of [
          { width: 320, height: 740 },
          { width: 393, height: 852 },
        ]) {
          const panel = await openPromotion(
            page,
            locale,
            viewport.width,
            viewport.height,
          );
          await expect(panel).toBeVisible();

          const report = await inspectPromotion(page, locale);
          expect(report.direction).toBe(report.expectedDirection);
          expect(report.amountDirection).toBe('ltr');
          expect(report.shareAmountDirection).toBe('ltr');
          expect(report.inputDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, viewport, report }),
          ).toEqual([]);

          expect(report.inputBottom).not.toBeNull();
          expect(report.buttonTop).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
          ).toBe(true);
        }
      }
    },
  );
}

for (const locale of HIGH_RISK) {
  test(
    'X promotion automatic-flow layout / ' + locale,
    async ({ page }) => {
      await openPromotion(
        page,
        locale,
        320,
        740,
        {
          ...OPEN_PROMOTION,
          xUrlLessEnabled: true,
          xConnected: true,
        },
      );
      const report = await inspectPromotion(page, locale);
      expect(report.direction).toBe(report.expectedDirection);
      expect(report.amountDirection).toBe('ltr');
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
      await expect(page.locator('.promotionConnectState')).toBeVisible();
      await expect(page.locator('.promotionSubmit')).toHaveCount(0);
    },
  );

  test(
    'X promotion localized submit error / ' + locale,
    async ({ page }) => {
      await page.route(
        '**/api/rewards/x-promotion/submit',
        async (route) => {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'This English internal error must never render.',
            }),
          });
        },
      );

      await openPromotion(page, locale, 320, 740);
      await page.locator('.promotionSubmit input').fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await page.locator('.promotionSubmit button').click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const report = await inspectPromotion(page, locale);
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    },
  );
}
