import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const HIGH_RISK_LOCALES = [
  'ar',
  'arz',
  'ur',
  'hi',
  'bn',
  'mr',
  'te',
  'zh-tw',
  'ko',
  'de',
  'el',
] as const satisfies readonly SupportedLocale[];

const ERROR_LOCALES = [
  'ar',
  'ur',
  'te',
  'de',
  'ro',
] as const satisfies readonly SupportedLocale[];

type PromotionResponse = {
  newOffersEnabled: boolean;
  promotionPending: boolean;
  xConnectAvailable: boolean;
  xConnected: boolean;
  xUrlLessEnabled: boolean;
  promotion: {
    inviteCode: string;
    state: string;
    amountWei: string;
    amountB3tr: string;
    openedAt: string | null;
    postDeadlineAt: string;
    submissionGraceSeconds: number;
    shareToken: string | null;
    submittedAt: string | null;
    verifyAfter: string | null;
    paidAt: string | null;
  };
};

const OPEN_PROMOTION: PromotionResponse = {
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
};

function routePromotion(
  page: Page,
  getResponse: () => PromotionResponse,
) {
  return page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getResponse()),
      });
    },
  );
}

async function openReceiptPromotion({
  page,
  locale,
  width,
  height,
  getResponse,
}: {
  page: Page;
  locale: SupportedLocale;
  width: number;
  height: number;
  getResponse: () => PromotionResponse;
}) {
  await routePromotion(page, getResponse);
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const row = page.locator('.notificationHistoryRow').first();
  await expect(row).toBeVisible();
  await row.click();

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

async function inspectPromotionLayout(panel: Locator) {
  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const visible = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.getClientRects().length > 0
      );
    };

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'promotion panel horizontal overflow: ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
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
        if (!visible(el)) continue;
        const bounds = el.getBoundingClientRect();

        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              (el.textContent ?? '').trim().slice(0, 48),
          );
        }

        if (
          bounds.left < rootBox.left - 2 ||
          bounds.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside promotion panel');
        }
      }
    }

    const title = root
      .querySelector<HTMLElement>('.promotionHeading strong')
      ?.getBoundingClientRect() ?? null;
    const amount = root
      .querySelector<HTMLElement>('.promotionHeading span')
      ?.getBoundingClientRect() ?? null;

    if (
      title &&
      amount &&
      Math.min(title.right, amount.right) - Math.max(title.left, amount.left) > 2 &&
      Math.min(title.bottom, amount.bottom) - Math.max(title.top, amount.top) > 2
    ) {
      issues.push('promotion title overlaps amount');
    }

    const input = root
      .querySelector<HTMLElement>('.promotionSubmit input')
      ?.getBoundingClientRect() ?? null;
    const verify = root
      .querySelector<HTMLElement>('.promotionSubmit button')
      ?.getBoundingClientRect() ?? null;

    if (
      input &&
      verify &&
      Math.min(input.right, verify.right) - Math.max(input.left, verify.left) > 2 &&
      Math.min(input.bottom, verify.bottom) - Math.max(input.top, verify.top) > 2
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
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionHeading span')!,
        ).direction,
      inputDirection:
        root.querySelector<HTMLElement>('.promotionSubmit input')
          ? getComputedStyle(
              root.querySelector<HTMLElement>('.promotionSubmit input')!,
            ).direction
          : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: verify?.top ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test(
    'X promotion manual mobile layout / ' + locale,
    async ({ page }) => {
      const panel = await openReceiptPromotion({
        page,
        locale,
        width: 320,
        height: 740,
        getResponse: () => OPEN_PROMOTION,
      });
      const report = await inspectPromotionLayout(panel);

      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.amountDirection).toBe('ltr');
      expect(report.inputDirection).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({ locale, report }),
      ).toEqual([]);

      expect(report.inputBottom).not.toBeNull();
      expect(report.buttonTop).not.toBeNull();
      expect(
        (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
      ).toBe(true);
    },
  );
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion automatic mobile layout / ' + locale,
    async ({ page }) => {
      let connected = false;
      const response = () => ({
        ...OPEN_PROMOTION,
        xConnectAvailable: true,
        xConnected: connected,
        xUrlLessEnabled: true,
      });

      let panel = await openReceiptPromotion({
        page,
        locale,
        width: 393,
        height: 852,
        getResponse: response,
      });

      let report = await inspectPromotionLayout(panel);
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.amountDirection).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({ locale, connected, report }),
      ).toEqual([]);

      connected = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      const row = page.locator('.notificationHistoryRow').first();
      await expect(row).toBeVisible();
      await row.click();
      panel = page.locator('.promotionPanel');
      await expect(panel).toBeVisible({ timeout: 10_000 });
      await panel.scrollIntoViewIfNeeded();

      report = await inspectPromotionLayout(panel);
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.amountDirection).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({ locale, connected, report }),
      ).toEqual([]);
    },
  );
}

for (const locale of ERROR_LOCALES) {
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

      const panel = await openReceiptPromotion({
        page,
        locale,
        width: 320,
        height: 740,
        getResponse: () => OPEN_PROMOTION,
      });

      const input = panel.locator('.promotionSubmit input');
      const button = panel.locator('.promotionSubmit button');
      await input.fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await button.click();

      const error = panel.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const report = await inspectPromotionLayout(panel);
      expect(
        report.issues,
        JSON.stringify({ locale, report }),
      ).toEqual([]);
    },
  );
}
