import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const HIGH_RISK_LOCALES = [
  'ar',
  'ur',
  'arz',
  'de',
  'fr',
  'el',
  'te',
  'sw',
  'ro',
] as const;

const OPEN_PROMOTION = {
  inviteCode: 'QA-NOTI-22',
  state: 'OPEN',
  amountWei: '10000000000000000000',
  amountB3tr: '10',
  openedAt: '2026-10-22T00:00:00.000Z',
  postDeadlineAt: '2026-10-23T00:00:00.000Z',
  submissionGraceSeconds: 900,
  shareToken: '123e4567-e89b-42d3-a456-426614174000',
  submittedAt: null,
  verifyAfter: null,
  paidAt: null,
} as const;

async function openReceipt(
  page: Page,
  locale: SupportedLocale,
  body: Record<string, unknown>,
  width: number,
  height: number,
) {
  await page.route(
    /\/api\/rewards\/x-promotion\?inviteCode=/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );

  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-RECEIPT&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const receipt = page.locator('.notificationReceiptView');
  await expect(receipt).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function layoutReport(page: Page) {
  return page.locator('.notificationReceiptView').evaluate((node) => {
    const receipt = node as HTMLElement;
    const panel = receipt.querySelector<HTMLElement>('.promotionPanel');
    const issues: string[] = [];
    const visible = (el: HTMLElement) =>
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden' &&
      getComputedStyle(el).display !== 'none';

    if (receipt.scrollWidth > receipt.clientWidth + 2) {
      issues.push('receipt horizontal overflow');
    }

    if (panel) {
      if (panel.scrollWidth > panel.clientWidth + 2) {
        issues.push('promotion panel horizontal overflow');
      }

      const panelBox = panel.getBoundingClientRect();
      const selectors = [
        '.promotionHeading strong',
        '.promotionHeading span',
        '.promotionPanel p',
        '.promotionShare',
        '.promotionShare span',
        '.promotionShare b',
        '.promotionConnect',
        '.promotionConnectState',
        '.promotionSubmit input',
        '.promotionSubmit button',
        '.promotionError',
      ];

      for (const selector of selectors) {
        for (const el of panel.querySelectorAll<HTMLElement>(selector)) {
          if (!visible(el) || !el.textContent?.trim()) continue;
          const box = el.getBoundingClientRect();
          if (el.scrollWidth > el.clientWidth + 2) {
            issues.push(selector + ' clipped horizontally');
          }
          if (box.left < panelBox.left - 2 || box.right > panelBox.right + 2) {
            issues.push(selector + ' escaped panel');
          }
        }
      }

      const title = panel.querySelector<HTMLElement>('.promotionHeading strong');
      const amount = panel.querySelector<HTMLElement>('.promotionHeading span');
      if (title && amount && visible(title) && visible(amount)) {
        const a = title.getBoundingClientRect();
        const b = amount.getBoundingClientRect();
        const overlapX =
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2;
        const overlapY =
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        if (overlapX && overlapY) issues.push('title overlaps amount');
      }

      const input = panel.querySelector<HTMLElement>('.promotionSubmit input');
      const button = panel.querySelector<HTMLElement>('.promotionSubmit button');
      if (input && button && visible(input) && visible(button)) {
        const a = input.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const overlapX =
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2;
        const overlapY =
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        if (overlapX && overlapY) issues.push('input overlaps verify button');
      }
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow: ' + viewportOverflow);
    }

    const direction = panel ? getComputedStyle(panel).direction : null;
    const amountDirection = panel?.querySelector<HTMLElement>(
      '.promotionHeading span',
    );
    const inputDirection = panel?.querySelector<HTMLElement>(
      '.promotionSubmit input',
    );

    return {
      issues,
      direction,
      amountDirection: amountDirection
        ? getComputedStyle(amountDirection).direction
        : null,
      inputDirection: inputDirection
        ? getComputedStyle(inputDirection).direction
        : null,
      inputBottom: inputDirection
        ? inputDirection.getBoundingClientRect().bottom
        : null,
      buttonTop: panel
        ?.querySelector<HTMLElement>('.promotionSubmit button')
        ?.getBoundingClientRect().top ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion manual mobile layout / ' + locale, async ({ page }) => {
    await openReceipt(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: false,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: OPEN_PROMOTION,
      },
      320,
      568,
    );

    const report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion automatic connected layout / ' + locale, async ({ page }) => {
    await openReceipt(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: true,
        xConnected: true,
        xUrlLessEnabled: true,
        promotion: OPEN_PROMOTION,
      },
      393,
      852,
    );
    const report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    await expect(page.locator('.promotionConnectState')).toBeVisible();
  });

  test('X promotion automatic connect-required layout / ' + locale, async ({ page }) => {
    await openReceipt(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: true,
        xConnected: false,
        xUrlLessEnabled: true,
        promotion: OPEN_PROMOTION,
      },
      393,
      852,
    );
    const report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    await expect(page.locator('.promotionConnect')).toBeVisible();
  });

  test('X promotion localized submit error / ' + locale, async ({ page }) => {
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

    await openReceipt(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: false,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: OPEN_PROMOTION,
      },
      320,
      568,
    );

    await page.locator('.promotionSubmit input').fill(
      'https://x.com/test/status/1234567890123456789',
    );
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toHaveText(rewardXPromotionSubmitError(locale, 409));
    await expect(error).not.toContainText('This English internal error must never render.');

    const report = await layoutReport(page);
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
  });

  test('X generic share layout / ' + locale, async ({ page }) => {
    await openReceipt(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: false,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: null,
      },
      320,
      568,
    );
    await expect(page.locator('.genericShare')).toBeVisible();
    const receipt = page.locator('.notificationReceiptView');
    const report = await receipt.evaluate((node) => {
      const root = node as HTMLElement;
      const button = root.querySelector<HTMLElement>('.genericShare');
      const viewportOverflow =
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth;
      return {
        clipped: button ? button.scrollWidth > button.clientWidth + 2 : true,
        viewportOverflow,
      };
    });
    expect(report).toEqual({ clipped: false, viewportOverflow: 0 });
  });
}
