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
    openedAt: '2026-10-21T00:00:00.000Z',
    postDeadlineAt: '2099-10-21T00:00:00.000Z',
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

const stateUrl = (locale: SupportedLocale) =>
  '/qa/notification-state?state=NOTI-X-PROMOTION-OPEN&locale=' + locale;

async function waitForQaHydration(page: Page) {
  await expect(
    page.locator(
      '[data-testid="qa-notification-stage"][data-hydrated="true"]',
    ),
  ).toBeVisible({ timeout: 30_000 });
}

async function waitForStableLayout(page: Page) {
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

async function readOpenLayout(page: Page) {
  await waitForQaHydration(page);

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.scrollIntoViewIfNeeded();
  await waitForStableLayout(page);

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const receipt = root.closest<HTMLElement>('[data-testid="qa-x-promotion-receipt"]');
    const rootBox = root.getBoundingClientRect();
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
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

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('promotion panel overflows horizontally');
    }
    if (receipt && receipt.scrollWidth > receipt.clientWidth + 2) {
      issues.push('reward receipt wrapper overflows horizontally');
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('promotion panel escapes receipt');
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit input',
      '.promotionSubmit button',
    ];
    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && selector !== '.promotionSubmit input') continue;
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (
          selector !== '.promotionSubmit input' &&
          el.scrollWidth > el.clientWidth + 2
        ) {
          issues.push(selector + ' clipped horizontally');
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    if (overlaps(rect('.promotionHeading strong'), rect('.promotionHeading span'))) {
      issues.push('title overlaps amount');
    }
    if (overlaps(rect('.promotionSubmit input'), rect('.promotionSubmit button'))) {
      issues.push('URL input overlaps verify button');
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');
    const viewportOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflows horizontally: ' + viewportOverflow);
    }

    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const inputElement = root.querySelector<HTMLElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: inputElement
        ? getComputedStyle(inputElement).direction
        : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion layout / ' + locale, async ({ page }) => {
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

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(stateUrl(locale), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    for (const width of [320, 393] as const) {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
      const report = await readOpenLayout(page);

      expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(report.amountDirection).toBe('ltr');
      expect(report.shareAmountDirection).toBe('ltr');
      expect(report.inputDirection).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({ locale, width, report }),
      ).toEqual([]);

      expect(report.inputBottom).not.toBeNull();
      expect(report.buttonTop).not.toBeNull();
      expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(
        true,
      );
    }
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion constrained desktop receipt / ' + locale, async ({ page }) => {
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

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(stateUrl(locale), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const report = await readOpenLayout(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(
      report.issues,
      JSON.stringify({ locale, viewport: 'desktop-receipt', report }),
    ).toEqual([]);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion standalone states / ' + locale, async ({ page }) => {
    let scenario: 'generic' | 'preparing' | 'error' = 'generic';

    await page.route(
      /\/api\/rewards\/x-promotion(?:\?.*)?$/,
      async (route) => {
        if (scenario === 'error') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Internal English error that must not be rendered.',
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            newOffersEnabled: true,
            promotionPending: scenario === 'preparing',
            promotion: null,
          }),
        });
      },
    );

    await page.setViewportSize({ width: 320, height: 740 });

    for (const current of [
      { mode: 'generic', selector: '.genericShare' },
      { mode: 'preparing', selector: '.promotionPreparing' },
      { mode: 'error', selector: '.promotionStatus' },
    ] as const) {
      scenario = current.mode;
      await page.goto(stateUrl(locale), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const surface = page.locator(current.selector);
      await expect(surface).toBeVisible({ timeout: 10_000 });
      await surface.scrollIntoViewIfNeeded();
      await waitForStableLayout(page);

      const report = await surface.evaluate((node) => {
        const el = node as HTMLElement;
        const wrapper = el.closest<HTMLElement>('[data-testid="qa-x-promotion-receipt"]');
        const box = el.getBoundingClientRect();
        const wrapperBox = wrapper?.getBoundingClientRect() ?? null;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside: Boolean(
            wrapperBox &&
              (box.left < wrapperBox.left - 2 ||
                box.right > wrapperBox.right + 2),
          ),
          direction: getComputedStyle(el).direction,
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });

      expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(report.clipped).toBe(false);
      expect(report.outside).toBe(false);
      expect(report.viewportOverflow).toBeLessThanOrEqual(1);
    }
  });

  test('X promotion localized submit error / ' + locale, async ({ page }) => {
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
      /\/api\/rewards\/x-promotion\/submit$/,
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This English server error must never be shown.',
          }),
        });
      },
    );

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(stateUrl(locale), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await waitForQaHydration(page);
    const input = page.locator('.promotionSubmit input');
    const button = page.locator('.promotionSubmit button');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill('https://x.com/qa/status/1234567890123456789');
    await button.click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      rewardXPromotionSubmitError(locale, 409),
    );
    await expect(error).not.toContainText('This English server error');

    const report = await error.evaluate((node) => {
      const el = node as HTMLElement;
      const panel = el.closest<HTMLElement>('.promotionPanel');
      const box = el.getBoundingClientRect();
      const panelBox = panel?.getBoundingClientRect() ?? null;
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
        outside: Boolean(
          panelBox &&
            (box.left < panelBox.left - 2 ||
              box.right > panelBox.right + 2),
        ),
        viewportOverflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      };
    });

    expect(report.clipped).toBe(false);
    expect(report.outside).toBe(false);
    expect(report.viewportOverflow).toBeLessThanOrEqual(1);
  });
}
