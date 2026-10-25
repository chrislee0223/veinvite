import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  REWARD_X_PROMOTION_UI_FALLBACK_COPY,
} from '../../src/lib/i18n/rewardXPromotionUiFallbackCopy';

const HIGH_RISK = [
  'ar', 'arz', 'ur', 'de', 'fr', 'ro', 'el', 'te', 'sw',
] as const satisfies readonly SupportedLocale[];

const BASE_PROMOTION = {
  inviteCode: 'QA-NOTI-22',
  state: 'OPEN',
  amountWei: '10000000000000000000',
  amountB3tr: '10',
  openedAt: '2026-10-25T00:00:00.000Z',
  postDeadlineAt: '2099-10-26T00:00:00.000Z',
  submissionGraceSeconds: 900,
  shareToken: '123e4567-e89b-42d3-a456-426614174000',
  submittedAt: null,
  verifyAfter: null,
  paidAt: null,
} as const;

type Mode = 'manual' | 'auto-disconnected' | 'auto-connected';

async function installPromotionMock(
  page: Page,
  mode: Mode,
  submitStatus = 200,
) {
  await page.route('**/api/rewards/x-promotion**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/submit')) {
      await route.fulfill({
        status: submitStatus,
        contentType: 'application/json',
        body: JSON.stringify(
          submitStatus >= 400
            ? { error: 'English internal error must never render.' }
            : { verification: { state: 'VERIFYING' } },
        ),
      });
      return;
    }

    if (url.pathname !== '/api/rewards/x-promotion') {
      await route.continue();
      return;
    }

    const auto = mode !== 'manual';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: auto,
        xConnected: mode === 'auto-connected',
        xUrlLessEnabled: auto,
        promotion: BASE_PROMOTION,
      }),
    });
  });
}

async function openPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  mode: Mode = 'manual',
  submitStatus = 200,
) {
  await installPromotionMock(page, mode, submitStatus);
  await page.setViewportSize({ width, height: 852 });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.locator('[data-qa-notification-ready="true"]'),
  ).toBeVisible({ timeout: 10_000 });

  const row = page
    .locator('button.notificationHistoryRow')
    .filter({ has: page.locator('.notificationReceiptAction') })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();

  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 10_000,
  });

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

async function inspectPanel(page: Page) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();

    const visible = (selector: string) =>
      [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          el.getClientRects().length > 0
        );
      });

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
      for (const el of visible(selector)) {
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector + ' clipped: ' + (el.textContent ?? '').slice(0, 50),
          );
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    const title = root.querySelector<HTMLElement>('.promotionHeading strong');
    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    if (title && amount) {
      const a = title.getBoundingClientRect();
      const b = amount.getBoundingClientRect();
      const overlapX =
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2;
      const overlapY =
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      if (overlapX && overlapY) issues.push('title overlaps amount');
    }

    const input = root.querySelector<HTMLElement>('.promotionSubmit input');
    const button = root.querySelector<HTMLElement>('.promotionSubmit button');
    if (input && button) {
      const a = input.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
        issues.push('input overlaps verify button');
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
    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('promotion panel horizontal overflow');
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      inputDirection: input ? getComputedStyle(input).direction : null,
      inputBottom: input?.getBoundingClientRect().bottom ?? null,
      buttonTop: button?.getBoundingClientRect().top ?? null,
    };
  });
}

for (const width of [320, 393] as const) {
  test('X promotion manual layout: all locales at ' + width + 'px', async ({ page }) => {
    for (const locale of SUPPORTED_LOCALES) {
      await openPanel(page, locale, width, 'manual');
      const report = await inspectPanel(page);

      expect(report.direction, locale).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.amountDirection, locale).toBe('ltr');
      expect(report.inputDirection, locale).toBe('ltr');
      expect(report.issues, JSON.stringify({ locale, width, report })).toEqual([]);

      if (width <= 430) {
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
          locale + ' verify action should stack below URL input',
        ).toBe(true);
      }
    }
  });
}

test('X promotion automatic states fit high-risk locales', async ({ page }) => {
  for (const locale of HIGH_RISK) {
    for (const mode of ['auto-disconnected', 'auto-connected'] as const) {
      await openPanel(page, locale, 320, mode);
      const report = await inspectPanel(page);
      expect(report.direction, locale + ' ' + mode).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(
        report.issues,
        JSON.stringify({ locale, mode, report }),
      ).toEqual([]);
    }
  }
});

test('X promotion submit failures stay localized and fit narrow layouts', async ({ page }) => {
  for (const locale of HIGH_RISK) {
    await openPanel(page, locale, 320, 'manual', 409);

    const input = page.locator('.promotionSubmit input');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      REWARD_X_PROMOTION_UI_FALLBACK_COPY[locale].submitError,
    );
    await expect(error).not.toContainText('English internal error');

    const report = await inspectPanel(page);
    expect(
      report.issues,
      JSON.stringify({ locale, report }),
    ).toEqual([]);
  }
});
