import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const OPEN = {
  newOffersEnabled: true,
  promotionPending: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-19T00:00:00.000Z',
    postDeadlineAt: '2099-10-20T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
};

const HIGH_RISK = [
  'ar',
  'arz',
  'ur',
  'hi',
  'bn',
  'mr',
  'te',
  'de',
  'el',
  'ro',
  'sw',
] as const satisfies readonly SupportedLocale[];

async function routeOpenPromotion(page: Page) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OPEN),
      });
    },
  );
}

async function inspect(page: Page, locale: SupportedLocale) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();
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

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
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

    for (const el of root.querySelectorAll<HTMLElement>(
      '.promotionHeading strong,.promotionHeading span,.promotionPanel p,.promotionShare,.promotionShare span,.promotionShare b,.promotionSubmit input,.promotionSubmit button',
    )) {
      if (!el.getClientRects().length) continue;
      const box = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push('clipped: ' + el.className + ' ' + (el.textContent ?? '').slice(0, 42));
      }
      if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
        issues.push('outside panel: ' + el.className);
      }
    }

    if (
      overlaps(
        rect('.promotionHeading strong'),
        rect('.promotionHeading span'),
      )
    ) {
      issues.push('title overlaps amount');
    }

    if (
      overlaps(
        rect('.promotionSubmit input'),
        rect('.promotionSubmit button'),
      )
    ) {
      issues.push('input overlaps verify button');
    }

    const docWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    if (docWidth > window.innerWidth + 1) {
      issues.push('viewport horizontal overflow');
    }

    const titleAmount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const input = root.querySelector<HTMLInputElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      titleAmountDirection: titleAmount
        ? getComputedStyle(titleAmount).direction
        : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: input ? getComputedStyle(input).direction : null,
      inputBottom: rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop: rect('.promotionSubmit button')?.top ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion mobile layout / ' + locale, async ({ page }) => {
    await routeOpenPromotion(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(
      '/qa/notification-state?state=NOTI-X-PROMOTION-OPEN&locale=' + locale,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );

    let report = await inspect(page, locale);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.titleAmountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, width: 320, report })).toEqual([]);
    expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);

    await page.setViewportSize({ width: 393, height: 852 });
    report = await inspect(page, locale);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.titleAmountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, width: 393, report })).toEqual([]);
    expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);
  });
}

for (const locale of HIGH_RISK) {
  test('X promotion constrained desktop / ' + locale, async ({ page }) => {
    await routeOpenPromotion(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      '/qa/notification-state?state=NOTI-X-PROMOTION-OPEN&locale=' + locale,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );
    const report = await inspect(page, locale);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
  });
}

for (const locale of HIGH_RISK) {
  test('X promotion errors stay localized / ' + locale, async ({ page }) => {
    await routeOpenPromotion(page);
    await page.route(
      '**/api/rewards/x-promotion/submit',
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Internal English message that must never be shown.',
          }),
        });
      },
    );
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(
      '/qa/notification-state?state=NOTI-X-PROMOTION-OPEN&locale=' + locale,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );
    const input = page.locator('.promotionSubmit input');
    await expect(input).toBeVisible();
    await input.fill('https://x.com/example/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();
    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(
      'Internal English message that must never be shown.',
    );
    const overflow = await error.evaluate((el) => ({
      horizontal: (el as HTMLElement).scrollWidth >
        (el as HTMLElement).clientWidth + 2,
      viewport:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) > window.innerWidth + 1,
    }));
    expect(overflow).toEqual({ horizontal: false, viewport: false });
  });
}
