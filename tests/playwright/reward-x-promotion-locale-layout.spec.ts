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
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-20T00:00:00.000Z',
    postDeadlineAt: '2036-10-20T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const HIGH_RISK_LOCALES = [
  'ar',
  'arz',
  'ur',
  'bn',
  'de',
  'el',
  'te',
  'sw',
  'ro',
] as const satisfies readonly SupportedLocale[];

async function waitForFonts(page: Page) {
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
}

async function gotoPromotion(
  page: Page,
  locale: SupportedLocale,
  response: unknown = OPEN_PROMOTION,
  status = 200,
) {
  await page.route('**/api/rewards/x-promotion**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      request.method() === 'GET' &&
      url.pathname === '/api/rewards/x-promotion'
    ) {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-LAYOUT&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await waitForFonts(page);
}

async function inspectPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];

    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

    const rootBox = root.getBoundingClientRect();

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow: ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }

    for (const selector of [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ]) {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) {
        if (!element.textContent?.trim() && selector !== '.promotionSubmit input') {
          continue;
        }
        if (element.getClientRects().length === 0) continue;

        const box = element.getBoundingClientRect();
        if (element.scrollWidth > element.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              (element.textContent ?? '').slice(0, 48),
          );
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
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

    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const input = root.querySelector<HTMLElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: input ? getComputedStyle(input).direction : null,
      inputBox: rect('.promotionSubmit input'),
      buttonBox: rect('.promotionSubmit button'),
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion layout / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await gotoPromotion(page, locale);

    let report = await inspectPanel(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, width: 320, report })).toEqual([]);

    // Narrow phones deliberately stack URL input and translated action button.
    expect(report.inputBox).not.toBeNull();
    expect(report.buttonBox).not.toBeNull();
    expect((report.buttonBox?.top ?? 0) >= (report.inputBox?.bottom ?? 0) - 1).toBe(true);

    await page.setViewportSize({ width: 393, height: 852 });
    await waitForFonts(page);
    report = await inspectPanel(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.issues, JSON.stringify({ locale, width: 393, report })).toEqual([]);
    expect((report.buttonBox?.top ?? 0) >= (report.inputBox?.bottom ?? 0) - 1).toBe(true);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion constrained desktop / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoPromotion(page, locale);
    const report = await inspectPanel(page);

    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
  });

  test('X promotion localized submit error / ' + locale, async ({ page }) => {
    await page.route('**/api/rewards/x-promotion/submit', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'This English internal error must never render.',
        }),
      });
    });

    await page.setViewportSize({ width: 320, height: 740 });
    await gotoPromotion(page, locale);

    const input = page.locator('.promotionSubmit input');
    const button = page.locator('.promotionSubmit button');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await button.click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(rewardXPromotionSubmitError(locale, 409));
    await expect(error).not.toContainText(
      'This English internal error must never render.',
    );

    const report = await inspectPanel(page);
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion standalone states / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });

    await gotoPromotion(
      page,
      locale,
      {
        newOffersEnabled: true,
        promotionPending: true,
        promotion: null,
      },
      200,
    );
    const preparing = page.locator('.promotionPreparing');
    await expect(preparing).toBeVisible();
    let standalone = await preparing.evaluate((node) => {
      const el = node as HTMLElement;
      return {
        direction: getComputedStyle(el).direction,
        clipped: el.scrollWidth > el.clientWidth + 2,
        viewportOverflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      };
    });
    expect(standalone.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(standalone.clipped).toBe(false);
    expect(standalone.viewportOverflow).toBeLessThanOrEqual(1);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await gotoPromotion(
      page,
      locale,
      { error: 'QA unavailable' },
      503,
    );
    const status = page.locator('.promotionStatus');
    await expect(status).toBeVisible();
    standalone = await status.evaluate((node) => {
      const el = node as HTMLElement;
      return {
        direction: getComputedStyle(el).direction,
        clipped: el.scrollWidth > el.clientWidth + 2,
        viewportOverflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      };
    });
    expect(standalone.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(standalone.clipped).toBe(false);
    expect(standalone.viewportOverflow).toBeLessThanOrEqual(1);
  });
}
