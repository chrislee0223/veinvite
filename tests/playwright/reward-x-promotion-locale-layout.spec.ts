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
    inviteCode: 'qa-reward-invite-code',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-17T00:00:00.000Z',
    postDeadlineAt: '2026-10-18T00:00:00.000Z',
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
] as const;

const STATE_RISK_LOCALES = [
  'ur',
  'ar',
  'te',
  'de',
] as const;

async function routePromotion(
  page: Page,
  status: number,
  body: unknown,
) {
  await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
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

async function openQa(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/x-promotion?locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.locator('[data-qa-x-promotion-ready="true"]'),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 10_000,
  });
}

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
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
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel overflow ' + root.scrollWidth + '>' + root.clientWidth,
      );
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
      '.promotionSubmit input',
      '.promotionSubmit button',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped ' +
              el.scrollWidth +
              '>' +
              el.clientWidth,
          );
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
      issues.push('input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflow ' + viewportOverflow);
    }

    const input = box('.promotionSubmit input');
    const button = box('.promotionSubmit button');

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

async function inspectStandalone(
  page: Page,
  selector: '.genericShare' | '.promotionStatus' | '.promotionPreparing',
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();
  await settleLayout(page);

  return surface.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('standalone horizontal overflow');
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('standalone escapes receipt');
    }

    for (const el of root.querySelectorAll<HTMLElement>('span,button')) {
      if (!el.textContent?.trim() || el.getClientRects().length === 0) continue;
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push('standalone child clipped');
      }
      if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
        issues.push('standalone child outside surface');
      }
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflow ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
    };
  });
}

const LOCALE_SHARDS = Array.from(
  { length: 4 },
  () => [] as SupportedLocale[],
);
SUPPORTED_LOCALES.forEach((locale, index) => {
  LOCALE_SHARDS[index % LOCALE_SHARDS.length].push(locale);
});

for (const [index, locales] of LOCALE_SHARDS.entries()) {
  test(
    'X promotion all-locale mobile shard ' + (index + 1),
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const locale of locales) {
        await routePromotion(page, 200, OPEN_PROMOTION);
        await openQa(page, locale, 320, 568);
        const report = await inspectPanel(page);

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
        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
        ).toBe(true);
      }
    },
  );
}

for (const [index, locales] of [
  HIGH_RISK_LOCALES.filter((_, i) => i % 2 === 0),
  HIGH_RISK_LOCALES.filter((_, i) => i % 2 === 1),
].entries()) {
  test(
    'X promotion high-risk responsive shard ' + (index + 1),
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const locale of locales) {
        await routePromotion(page, 200, OPEN_PROMOTION);
        await openQa(page, locale, 393, 852);
        const mobile = await inspectPanel(page);
        expect(mobile.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(mobile.issues, JSON.stringify({ locale, mobile })).toEqual([]);

        await page.setViewportSize({ width: 1280, height: 900 });
        const desktop = await inspectPanel(page);
        expect(desktop.issues, JSON.stringify({ locale, desktop })).toEqual([]);
      }
    },
  );
}

for (const locale of STATE_RISK_LOCALES) {
  test(
    'X promotion standalone states / ' + locale,
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const scenario of [
        {
          selector: '.genericShare' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: false,
            promotion: null,
          },
        },
        {
          selector: '.promotionStatus' as const,
          status: 503,
          body: { error: 'QA unavailable' },
        },
        {
          selector: '.promotionPreparing' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: true,
            promotion: null,
          },
        },
      ]) {
        await routePromotion(page, scenario.status, scenario.body);
        await openQa(page, locale, 320, 568);
        const report = await inspectStandalone(page, scenario.selector);
        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(
          report.issues,
          JSON.stringify({ locale, scenario, report }),
        ).toEqual([]);
      }

      await page.unroute('**/api/rewards/x-promotion/submit');
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
      await routePromotion(page, 200, OPEN_PROMOTION);
      await openQa(page, locale, 320, 568);

      await page
        .locator('.promotionSubmit input')
        .fill('https://x.com/test/status/1234567890123456789');
      await page.locator('.promotionSubmit button').click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const box = await error.evaluate((node) => {
        const el = node as HTMLElement;
        const panel = el.closest<HTMLElement>('.promotionPanel');
        const rect = el.getBoundingClientRect();
        const panelRect = panel?.getBoundingClientRect() ?? null;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside: Boolean(
            panelRect &&
            (rect.left < panelRect.left - 2 ||
              rect.right > panelRect.right + 2),
          ),
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });
      expect(box.clipped).toBe(false);
      expect(box.outside).toBe(false);
      expect(box.viewportOverflow).toBeLessThanOrEqual(1);
    },
  );
}
