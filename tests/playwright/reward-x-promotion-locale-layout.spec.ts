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
    openedAt: '2026-10-19T00:00:00.000Z',
    postDeadlineAt: '2026-10-20T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
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

const ERROR_LOCALES: SupportedLocale[] = [
  'ko',
  'de',
  'ar',
  'ur',
];

const LOCALE_SHARDS = Array.from({ length: 4 }, (_, shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

async function installPromotionRoute(
  page: Page,
  status = 200,
  body: unknown = OPEN_PROMOTION,
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

async function gotoPanel(
  page: Page,
  locale: SupportedLocale,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' + locale,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );

  await expect(
    page.locator('[data-qa-notification-ready="true"]'),
  ).toBeVisible({ timeout: 10_000 });

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

async function inspectOpenPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();

    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

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
      '.promotionSubmit input',
      '.promotionSubmit button',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();

        if (
          el.textContent?.trim() &&
          el.scrollWidth > el.clientWidth + 2
        ) {
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

    if (
      overlaps(
        box('.promotionHeading strong'),
        box('.promotionHeading span'),
      )
    ) {
      issues.push('title overlaps amount');
    }

    if (
      overlaps(
        box('.promotionSubmit input'),
        box('.promotionSubmit button'),
      )
    ) {
      issues.push('URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow ' + viewportOverflow);
    }

    const amount = root.querySelector<HTMLElement>(
      '.promotionHeading span',
    );
    const shareAmount = root.querySelector<HTMLElement>(
      '.promotionShare b',
    );
    const input = root.querySelector<HTMLElement>(
      '.promotionSubmit input',
    );
    const button = root.querySelector<HTMLElement>(
      '.promotionSubmit button',
    );

    const inputBox = input?.getBoundingClientRect() ?? null;
    const buttonBox = button?.getBoundingClientRect() ?? null;

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount
        ? getComputedStyle(amount).direction
        : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: input
        ? getComputedStyle(input).direction
        : null,
      stacked:
        Boolean(inputBox && buttonBox) &&
        (buttonBox?.top ?? 0) >= (inputBox?.bottom ?? 0) - 1,
    };
  }).then((report) => ({
    locale,
    ...report,
  }));
}

for (let shard = 0; shard < LOCALE_SHARDS.length; shard += 1) {
  test(
    'X promotion all locales at 320px / shard ' + (shard + 1),
    async ({ page }) => {
      await installPromotionRoute(page);

      for (const locale of LOCALE_SHARDS[shard]) {
        await gotoPanel(page, locale, {
          width: 320,
          height: 568,
        });

        const report = await inspectOpenPanel(page, locale);

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(report.stacked).toBe(true);
        expect(
          report.issues,
          JSON.stringify(report),
        ).toEqual([]);
      }
    },
  );
}

for (let shard = 0; shard < 2; shard += 1) {
  test(
    'X promotion high-risk locales at 393px / shard ' + (shard + 1),
    async ({ page }) => {
      await installPromotionRoute(page);

      const locales = HIGH_RISK_LOCALES.filter(
        (_, index) => index % 2 === shard,
      );

      for (const locale of locales) {
        await gotoPanel(page, locale, {
          width: 393,
          height: 852,
        });

        const report = await inspectOpenPanel(page, locale);

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(report.stacked).toBe(true);
        expect(
          report.issues,
          JSON.stringify(report),
        ).toEqual([]);
      }
    },
  );
}

test('X promotion generic share, retry and preparing states stay mobile-safe', async ({ page }) => {
  const locales: SupportedLocale[] = ['ar', 'ur', 'de', 'te'];

  for (const locale of locales) {
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
        selector: '.promotionStatus',
        status: 503,
        body: { error: 'internal English error' },
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
    ] as const) {
      await page.unroute(
        /\/api\/rewards\/x-promotion(?:\?.*)?$/,
      ).catch(() => {});
      await installPromotionRoute(
        page,
        scenario.status,
        scenario.body,
      );

      await page.setViewportSize({
        width: 320,
        height: 568,
      });
      await page.goto(
        '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' +
          locale,
        {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        },
      );

      const surface = page.locator(scenario.selector);
      await expect(surface).toBeVisible({ timeout: 10_000 });

      const report = await surface.evaluate((node) => {
        const el = node as HTMLElement;
        const rect = el.getBoundingClientRect();
        const viewportOverflow =
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth;

        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside:
            rect.left < -2 ||
            rect.right > window.innerWidth + 2,
          viewportOverflow,
          direction: getComputedStyle(el).direction,
        };
      });

      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(
        report,
        JSON.stringify({ locale, scenario, report }),
      ).toMatchObject({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    }
  }
});

test('X promotion submit failures show localized text instead of raw API errors', async ({ page }) => {
  await installPromotionRoute(page);

  await page.route(
    '**/api/rewards/x-promotion/submit',
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'This English internal error must not render.',
        }),
      });
    },
  );

  for (const locale of ERROR_LOCALES) {
    await gotoPanel(page, locale, {
      width: 320,
      height: 568,
    });

    await page
      .locator('.promotionSubmit input')
      .fill('https://x.com/example/status/1234567890123456789');
    await page
      .locator('.promotionSubmit button')
      .click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      rewardXPromotionSubmitError(locale, 409),
    );
    await expect(error).not.toContainText(
      'This English internal error must not render.',
    );

    const report = await error.evaluate((node) => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
        outside:
          rect.left < -2 ||
          rect.right > window.innerWidth + 2,
        viewportOverflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      };
    });

    expect(
      report,
      JSON.stringify({ locale, report }),
    ).toEqual({
      clipped: false,
      outside: false,
      viewportOverflow: 0,
    });
  }
});
