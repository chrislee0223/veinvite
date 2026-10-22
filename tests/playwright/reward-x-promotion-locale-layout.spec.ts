import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const MANUAL_OPEN = {
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
    openedAt: '2026-10-22T00:00:00.000Z',
    postDeadlineAt: '2099-10-23T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const HIGH_RISK_LOCALES = [
  'ar',
  'ur',
  'arz',
  'de',
  'el',
  'te',
  'sw',
  'ro',
] as const satisfies readonly SupportedLocale[];

const LOCALE_SHARDS = Array.from({ length: 4 }, (_, shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

async function routePromotion(
  page: Page,
  body: unknown,
  status = 200,
) {
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

async function gotoDirectXQa(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-LAYOUT&locale=' +
      locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await expect(
    page.getByTestId('qa-x-promotion-layout'),
  ).toBeVisible({ timeout: 10_000 });

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });
}

async function inspectOpenPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
          b &&
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'promotion panel overflows horizontally: ' +
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
      '.promotionConnect',
      '.promotionConnectState',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              (el.textContent ?? '').slice(0, 48),
          );
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + ' escapes promotion panel');
        }
      }
    }

    if (
      overlaps(
        box('.promotionHeading strong'),
        box('.promotionHeading span'),
      )
    ) {
      issues.push('promotion title overlaps amount');
    }

    const input = box('.promotionSubmit input');
    const button = box('.promotionSubmit button');
    if (overlaps(input, button)) {
      issues.push('post URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflows horizontally: ' + viewportOverflow);
    }

    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    if (receipt && receipt.scrollWidth > receipt.clientWidth + 2) {
      issues.push('reward receipt overflows horizontally');
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
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

for (let shard = 0; shard < LOCALE_SHARDS.length; shard += 1) {
  test(
    'X promotion all locales responsive shard ' + (shard + 1),
    async ({ page }) => {
      await routePromotion(page, MANUAL_OPEN);

      for (const locale of LOCALE_SHARDS[shard]) {
        for (const viewport of [
          { width: 320, height: 740 },
          { width: 393, height: 852 },
        ]) {
          await gotoDirectXQa(
            page,
            locale,
            viewport.width,
            viewport.height,
          );
          const report = await inspectOpenPanel(page);

          expect(
            report.direction,
            JSON.stringify({ locale, viewport, report }),
          ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
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
            JSON.stringify({ locale, viewport, report }),
          ).toBe(true);
        }
      }
    },
  );
}

async function inspectStandalone(
  page: Page,
  selector: string,
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  return surface.evaluate((node) => {
    const el = node as HTMLElement;
    const box = el.getBoundingClientRect();
    const wrapper = el.closest<HTMLElement>(
      '[data-testid="qa-x-promotion-layout"]',
    );
    const wrapperBox = wrapper?.getBoundingClientRect() ?? null;
    const issues: string[] = [];

    if (el.scrollWidth > el.clientWidth + 2) {
      issues.push(
        'surface clipped horizontally: ' +
          el.scrollWidth +
          '>' +
          el.clientWidth,
      );
    }
    if (
      wrapperBox &&
      (box.left < wrapperBox.left - 2 ||
        box.right > wrapperBox.right + 2)
    ) {
      issues.push('surface escapes QA receipt');
    }
    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflows horizontally: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(el).direction,
    };
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion high-risk state matrix / ' + locale,
    async ({ page }) => {
      await routePromotion(page, {
        ...MANUAL_OPEN,
        xConnectAvailable: true,
        xConnected: false,
        xUrlLessEnabled: true,
      });
      await gotoDirectXQa(page, locale, 320, 740);
      const connect = await inspectStandalone(page, '.promotionConnect');
      expect(connect.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(connect.issues).toEqual([]);

      await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
      await routePromotion(page, {
        newOffersEnabled: true,
        promotionPending: true,
        xConnectAvailable: true,
        xConnected: false,
        xUrlLessEnabled: true,
        promotion: null,
      });
      await gotoDirectXQa(page, locale, 320, 740);
      const preparing = await inspectStandalone(
        page,
        '.promotionPreparing',
      );
      expect(preparing.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(preparing.issues).toEqual([]);

      await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
      await routePromotion(page, {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: true,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: null,
      });
      await gotoDirectXQa(page, locale, 320, 740);
      const generic = await inspectStandalone(page, '.genericShare');
      expect(generic.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(generic.issues).toEqual([]);

      await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
      await routePromotion(page, { error: 'internal English error' }, 503);
      await gotoDirectXQa(page, locale, 320, 740);
      const retry = await inspectStandalone(page, '.promotionStatus');
      expect(retry.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(retry.issues).toEqual([]);
    },
  );
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion localized submit error / ' + locale,
    async ({ page }) => {
      await routePromotion(page, MANUAL_OPEN);
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

      await gotoDirectXQa(page, locale, 320, 740);
      const input = page.locator('.promotionSubmit input');
      const button = page.locator('.promotionSubmit button');
      await input.fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await button.click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const report = await inspectStandalone(page, '.promotionError');
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.issues).toEqual([]);
    },
  );
}
