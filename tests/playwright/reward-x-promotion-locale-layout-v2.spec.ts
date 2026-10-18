import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const OPEN_RESPONSE = {
  newOffersEnabled: true,
  promotionPending: false,
  promotion: {
    inviteCode: 'QA-X-PROMOTION',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-18T00:00:00.000Z',
    postDeadlineAt: '2026-10-19T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

const SHARDS = [
  SUPPORTED_LOCALES.slice(0, 8),
  SUPPORTED_LOCALES.slice(8, 15),
  SUPPORTED_LOCALES.slice(15, 22),
  SUPPORTED_LOCALES.slice(22),
];

const HIGH_RISK: SupportedLocale[] = [
  'ar',
  'ur',
  'arz',
  'de',
  'ro',
  'te',
  'sw',
  'el',
];

async function installPromotionRoutes(
  page: Page,
  getResponse: () => {
    status: number;
    body: unknown;
  },
) {
  await page.route(
    /\/api\/rewards\/x-promotion\?inviteCode=/,
    async (route) => {
      const response = getResponse();
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    },
  );
}

async function openLocale(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height = 720,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/x-promotion-i18n?locale=' + encodeURIComponent(locale),
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

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
}

async function inspectOpenPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

    const issues: string[] = [];

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel overflow ' + root.scrollWidth + '>' + root.clientWidth,
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
      const elements = root.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
          issues.push(selector + ' outside panel');
        }
        if (
          !selector.includes('input') &&
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
      }
    }

    const heading = rect('.promotionHeading strong');
    const amount = rect('.promotionHeading span');
    if (overlaps(heading, amount)) {
      issues.push('heading overlaps amount');
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');
    if (overlaps(input, button)) {
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

  expect(
    report.direction,
    JSON.stringify({ locale, report }),
  ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.amountDirection).toBe('ltr');
  expect(report.shareAmountDirection).toBe('ltr');
  expect(report.inputDirection).toBe('ltr');
  expect(
    report.issues,
    JSON.stringify({ locale, report }),
  ).toEqual([]);

  return report;
}

for (const [index, locales] of SHARDS.entries()) {
  test(
    'X promotion 320px locale shard ' + (index + 1),
    async ({ page }) => {
      await installPromotionRoutes(page, () => ({
        status: 200,
        body: OPEN_RESPONSE,
      }));

      for (const locale of locales) {
        await openLocale(page, locale, 320, 680);
        const report = await inspectOpenPanel(page, locale);

        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
          JSON.stringify({ locale, report }),
        ).toBe(true);
      }
    },
  );
}

test('X promotion constrained desktop high-risk locales', async ({ page }) => {
  await installPromotionRoutes(page, () => ({
    status: 200,
    body: OPEN_RESPONSE,
  }));

  for (const locale of HIGH_RISK) {
    await openLocale(page, locale, 800, 760);
    await inspectOpenPanel(page, locale);
  }
});

test('X promotion standalone states stay inside 320px viewport', async ({
  page,
}) => {
  let current = {
    status: 200,
    body: {
      newOffersEnabled: true,
      promotionPending: false,
      promotion: null,
    } as unknown,
  };

  await installPromotionRoutes(page, () => current);

  for (const locale of ['ur', 'ar', 'te', 'de'] as SupportedLocale[]) {
    for (const state of ['generic', 'preparing', 'error'] as const) {
      current =
        state === 'generic'
          ? {
              status: 200,
              body: {
                newOffersEnabled: true,
                promotionPending: false,
                promotion: null,
              },
            }
          : state === 'preparing'
            ? {
                status: 200,
                body: {
                  newOffersEnabled: true,
                  promotionPending: true,
                  promotion: null,
                },
              }
            : {
                status: 503,
                body: { error: 'QA internal error' },
              };

      await openLocale(page, locale, 320, 640);

      const selector =
        state === 'generic'
          ? '.genericShare'
          : state === 'preparing'
            ? '.promotionPreparing'
            : '.promotionStatus';
      const surface = page.locator(selector);
      await expect(surface).toBeVisible({ timeout: 10_000 });

      const report = await surface.evaluate((node) => {
        const el = node as HTMLElement;
        const box = el.getBoundingClientRect();
        const viewportOverflow =
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside:
            box.left < -1 ||
            box.right > window.innerWidth + 1,
          viewportOverflow,
          direction: getComputedStyle(el).direction,
        };
      });

      expect(
        report.direction,
        JSON.stringify({ locale, state, report }),
      ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
      expect(
        report.clipped,
        JSON.stringify({ locale, state, report }),
      ).toBe(false);
      expect(
        report.outside,
        JSON.stringify({ locale, state, report }),
      ).toBe(false);
      expect(
        report.viewportOverflow,
        JSON.stringify({ locale, state, report }),
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('X promotion submit errors remain localized and wrapped', async ({
  page,
}) => {
  await installPromotionRoutes(page, () => ({
    status: 200,
    body: OPEN_RESPONSE,
  }));

  await page.route(
    '**/api/rewards/x-promotion/submit',
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'RAW ENGLISH INTERNAL ERROR MUST NOT RENDER',
        }),
      });
    },
  );

  for (const locale of ['ko', 'ar', 'de', 'te'] as SupportedLocale[]) {
    await openLocale(page, locale, 320, 680);
    await inspectOpenPanel(page, locale);

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
      'RAW ENGLISH INTERNAL ERROR MUST NOT RENDER',
    );

    const report = await error.evaluate((node) => {
      const el = node as HTMLElement;
      const box = el.getBoundingClientRect();
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
        outside:
          box.left < -1 ||
          box.right > window.innerWidth + 1,
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
