import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const HIGH_RISK = ['ar', 'ur', 'arz', 'de', 'el', 'te', 'sw', 'ro'] as const;
const STATE_RISK = ['ar', 'ur', 'te', 'de'] as const;

function promotionResponse(overrides: Record<string, unknown> = {}) {
  return {
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
      openedAt: '2026-10-25T00:00:00.000Z',
      postDeadlineAt: '2099-12-31T23:59:59.000Z',
      submissionGraceSeconds: 900,
      shareToken: '123e4567-e89b-42d3-a456-426614174000',
      submittedAt: null,
      verifyAfter: null,
      paidAt: null,
    },
    ...overrides,
  };
}

async function routePromotion(page: Page, body: unknown, status = 200) {
  await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/).catch(() => {});
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );
}

async function openRewardReceipt(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const receiptRow = page
    .locator('.notificationHistoryRow')
    .filter({ has: page.locator('.notificationReceiptAction') })
    .first();

  await expect(receiptRow).toBeVisible({ timeout: 15_000 });
  await receiptRow.click();

  const receipt = page.locator('.notificationReceiptView');
  await expect(receipt).toBeVisible({ timeout: 10_000 });
  return receipt;
}

async function settleLayout(page: Page) {
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
}

async function inspectPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();
  await settleLayout(page);

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('panel horizontal overflow');
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('panel escapes receipt');
    }

    for (const selector of [
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
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clips horizontally');
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
          issues.push(selector + ' escapes panel');
        }
      }
    }

    if (overlaps(rect('.promotionHeading strong'), rect('.promotionHeading span'))) {
      issues.push('title overlaps amount');
    }
    if (overlaps(rect('.promotionSubmit input'), rect('.promotionSubmit button'))) {
      issues.push('input overlaps verify button');
    }

    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    if (docWidth > window.innerWidth + 1) {
      issues.push('viewport horizontal overflow');
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionHeading span')!,
      ).direction,
      shareAmountDirection:
        root.querySelector<HTMLElement>('.promotionShare b')
          ? getComputedStyle(root.querySelector<HTMLElement>('.promotionShare b')!).direction
          : null,
      inputDirection:
        root.querySelector<HTMLElement>('.promotionSubmit input')
          ? getComputedStyle(root.querySelector<HTMLElement>('.promotionSubmit input')!).direction
          : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

const shards = Array.from({ length: 4 }, () => [] as SupportedLocale[]);
SUPPORTED_LOCALES.forEach((locale, index) => {
  shards[index % shards.length].push(locale);
});

for (const [index, locales] of shards.entries()) {
  test('X promotion manual mobile locales shard ' + (index + 1), async ({ page }) => {
    test.setTimeout(120_000);
    for (const locale of locales) {
      await routePromotion(page, promotionResponse());
      await openRewardReceipt(page, locale, 320, 568);
      const report = await inspectPanel(page);

      expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(report.amountDirection).toBe('ltr');
      expect(report.shareAmountDirection).toBe('ltr');
      expect(report.inputDirection).toBe('ltr');
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
      expect(report.inputBottom).not.toBeNull();
      expect(report.buttonTop).not.toBeNull();
      expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);
    }
  });
}

for (const locale of HIGH_RISK) {
  test('X promotion automatic flow / ' + locale, async ({ page }) => {
    test.setTimeout(60_000);

    await routePromotion(
      page,
      promotionResponse({
        xConnectAvailable: true,
        xConnected: false,
        xUrlLessEnabled: true,
      }),
    );
    await openRewardReceipt(page, locale, 393, 852);
    let report = await inspectPanel(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, state: 'connect', report })).toEqual([]);
    await expect(page.locator('.promotionConnect')).toBeVisible();

    await routePromotion(
      page,
      promotionResponse({
        xConnectAvailable: true,
        xConnected: true,
        xUrlLessEnabled: true,
      }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const receiptRow = page
      .locator('.notificationHistoryRow')
      .filter({ has: page.locator('.notificationReceiptAction') })
      .first();
    await expect(receiptRow).toBeVisible({ timeout: 15_000 });
    await receiptRow.click();
    report = await inspectPanel(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, state: 'connected', report })).toEqual([]);
    await expect(page.locator('.promotionConnectState')).toBeVisible();
  });
}

for (const locale of STATE_RISK) {
  test('X promotion standalone states / ' + locale, async ({ page }) => {
    test.setTimeout(90_000);

    for (const scenario of [
      {
        selector: '.genericShare',
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: false,
          promotion: null,
        },
      },
      {
        selector: '.promotionPreparing',
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: true,
          promotion: null,
        },
      },
      {
        selector: '.promotionStatus',
        status: 503,
        body: { error: 'internal English error' },
      },
    ] as const) {
      await routePromotion(page, scenario.body, scenario.status);
      await openRewardReceipt(page, locale, 320, 568);
      const surface = page.locator(scenario.selector);
      await expect(surface).toBeVisible({ timeout: 10_000 });
      await surface.scrollIntoViewIfNeeded();
      await settleLayout(page);

      const report = await surface.evaluate((node) => {
        const el = node as HTMLElement;
        const box = el.getBoundingClientRect();
        const receipt = el.closest<HTMLElement>('.notificationReceiptView');
        const receiptBox = receipt?.getBoundingClientRect() ?? null;
        return {
          direction: getComputedStyle(el).direction,
          overflow: el.scrollWidth - el.clientWidth,
          escapes: Boolean(
            receiptBox &&
            (box.left < receiptBox.left - 2 || box.right > receiptBox.right + 2),
          ),
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });

      expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(report.overflow).toBeLessThanOrEqual(2);
      expect(report.escapes).toBe(false);
      expect(report.viewportOverflow).toBeLessThanOrEqual(1);
    }

    await routePromotion(page, promotionResponse());
    await page.unroute('**/api/rewards/x-promotion/submit').catch(() => {});
    await page.route('**/api/rewards/x-promotion/submit', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'This raw English API error must never be shown.',
        }),
      });
    });
    await openRewardReceipt(page, locale, 320, 568);
    await page.locator('.promotionSubmit input').fill(
      'https://x.com/test/status/1234567890123456789',
    );
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(rewardXPromotionSubmitError(locale, 409));
    await expect(error).not.toContainText('raw English API error');

    const errorOverflow = await error.evaluate((node) => {
      const el = node as HTMLElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(errorOverflow).toBeLessThanOrEqual(2);
  });
}
