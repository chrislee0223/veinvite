import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

// The first cold Next dev route compilation may overlap 4 parallel shards.
test.describe.configure({ timeout: 90_000 });

const SHARE_TOKEN = '123e4567-e89b-42d3-a456-426614174000';

const MANUAL_OPEN = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: false,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-X-PROMO-LAYOUT',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-26T00:00:00.000Z',
    postDeadlineAt: '2099-10-27T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: SHARE_TOKEN,
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const AUTO_CONNECT = {
  ...MANUAL_OPEN,
  xConnectAvailable: true,
  xConnected: false,
  xUrlLessEnabled: true,
} as const;

const HIGH_RISK_LOCALES: SupportedLocale[] = [
  'ar',
  'ur',
  'arz',
  'de',
  'el',
  'te',
  'sw',
  'ro',
];

const LOCALE_SHARDS: SupportedLocale[][] = Array.from(
  { length: 4 },
  (_, shard) =>
    SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

async function routePromotion(
  page: Page,
  body: unknown,
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
}

async function openPanel(
  page: Page,
  locale: SupportedLocale,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  const response = await page.goto(
    '/qa/x-promotion-layout?locale=' + encodeURIComponent(locale),
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  expect(response?.status(), 'QA layout route should load').toBe(200);
  await expect(page.locator('[data-qa-x-promotion-layout]')).toBeVisible({
    timeout: 20_000,
  });

  // Next dev may compile a cold QA route while other browser shards execute.
  // Wait for the actual mocked API result rather than a fixed sleep.
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
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

async function layoutReport(
  page: Page,
) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const visible = (selector: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector))
        .filter((el) => el.getClientRects().length > 0);

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow ' +
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
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ]) {
      for (const el of visible(selector)) {
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
        if (
          rect.left < rootBox.left - 2 ||
          rect.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    const title = root
      .querySelector<HTMLElement>('.promotionHeading strong')
      ?.getBoundingClientRect();
    const amount = root
      .querySelector<HTMLElement>('.promotionHeading span')
      ?.getBoundingClientRect();
    if (
      title &&
      amount &&
      Math.min(title.right, amount.right) -
        Math.max(title.left, amount.left) > 2 &&
      Math.min(title.bottom, amount.bottom) -
        Math.max(title.top, amount.top) > 2
    ) {
      issues.push('title overlaps amount');
    }

    const input = root
      .querySelector<HTMLElement>('.promotionSubmit input')
      ?.getBoundingClientRect() ?? null;
    const button = root
      .querySelector<HTMLElement>('.promotionSubmit button')
      ?.getBoundingClientRect() ?? null;

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionHeading span')!,
          ).direction
        : null,
      inputDirection: input
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionSubmit input')!,
          ).direction
        : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
]) {
  LOCALE_SHARDS.forEach((locales, shard) => {
    test(
      'X promotion all locales / ' +
        viewport.width +
        'px / shard ' +
        (shard + 1),
      async ({ page }) => {
        await routePromotion(page, MANUAL_OPEN);

        for (const locale of locales) {
          await openPanel(page, locale, viewport);
          const report = await layoutReport(page);

          expect(
            report.direction,
            JSON.stringify({ locale, viewport, report }),
          ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
          expect(report.amountDirection).toBe('ltr');
          expect(report.inputDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, viewport, report }),
          ).toEqual([]);

          if (viewport.width <= 430) {
            expect(report.inputBottom).not.toBeNull();
            expect(report.buttonTop).not.toBeNull();
            expect(
              (report.buttonTop ?? 0) >=
                (report.inputBottom ?? 0) - 1,
              JSON.stringify({ locale, viewport, report }),
            ).toBe(true);
          }
        }
      },
    );
  });
}

test('X promotion auto-connect high-risk locales stay contained', async ({ page }) => {
  await routePromotion(page, AUTO_CONNECT);

  for (const locale of HIGH_RISK_LOCALES) {
    await openPanel(page, locale, { width: 320, height: 568 });
    const report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(
      report.issues,
      JSON.stringify({ locale, report }),
    ).toEqual([]);
    await expect(page.locator('.promotionConnect')).toBeVisible();
  }
});

test('X promotion localized submit errors never expose raw API English', async ({ page }) => {
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

  for (const locale of HIGH_RISK_LOCALES) {
    await openPanel(page, locale, { width: 320, height: 568 });
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

    const report = await layoutReport(page);
    expect(
      report.issues,
      JSON.stringify({ locale, report }),
    ).toEqual([]);
  }
});
