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
    inviteCode: 'QA-X-PROMOTION',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-20T00:00:00.000Z',
    postDeadlineAt: '2099-01-01T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

type RouteControl = {
  getStatus: number;
  getBody: unknown;
  submitStatus: number;
  submitBody: unknown;
};

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

const ERROR_SAMPLE_LOCALES: SupportedLocale[] = [
  'ar',
  'ur',
  'te',
  'de',
];

const LOCALE_SHARDS = Array.from(
  { length: 4 },
  (_, shard) =>
    SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

async function installPromotionRoutes(
  page: Page,
  control: RouteControl,
) {
  await page.route(
    '**/api/rewards/x-promotion*',
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname.endsWith('/submit')) {
        await route.fulfill({
          status: control.submitStatus,
          contentType: 'application/json',
          body: JSON.stringify(control.submitBody),
        });
        return;
      }

      if (url.pathname.endsWith('/x-promotion')) {
        await route.fulfill({
          status: control.getStatus,
          contentType: 'application/json',
          body: JSON.stringify(control.getBody),
        });
        return;
      }

      await route.fallback();
    },
  );
}

async function visitQa(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );

  const history = page.locator('.notificationHistoryPanel');
  await expect(history).toBeVisible();

  const receiptRow = page
    .locator('.notificationHistoryRow')
    .filter({ has: page.locator('.notificationReceiptAction') })
    .first();
  await expect(receiptRow).toBeVisible();
  await receiptRow.click();

  await expect(
    page.locator('.notificationReceiptView'),
  ).toBeVisible();

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
  await expect(panel).toBeVisible();
  await expect(page.locator('.promotionShare')).toBeVisible();
  await expect(page.locator('.promotionSubmit input')).toBeVisible();
  await expect(page.locator('.promotionSubmit button')).toBeVisible();

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const card = root.closest<HTMLElement>('.notificationReceiptView');
    const rootBox = root.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect() ?? null;
    const issues: string[] = [];

    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) -
          Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) -
          Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }

    if (
      cardBox &&
      (rootBox.left < cardBox.left - 2 ||
        rootBox.right > cardBox.right + 2)
    ) {
      issues.push('panel escapes reward receipt');
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

        const box = el.getBoundingClientRect();
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
          box.left < rootBox.left - 2 ||
          box.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside panel');
        }
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
      inputBottom:
        rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop:
        rect('.promotionSubmit button')?.top ?? null,
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

for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
] as const) {
  for (let shard = 0; shard < LOCALE_SHARDS.length; shard += 1) {
    test(
      'X promotion all locales / ' +
        viewport.width +
        'px / shard ' +
        (shard + 1),
      async ({ page }) => {
        test.setTimeout(150_000);
        const control: RouteControl = {
          getStatus: 200,
          getBody: OPEN_PROMOTION,
          submitStatus: 200,
          submitBody: { ok: true },
        };
        await installPromotionRoutes(page, control);

        for (const locale of LOCALE_SHARDS[shard]) {
          control.getStatus = 200;
          control.getBody = OPEN_PROMOTION;
          await visitQa(
            page,
            locale,
            viewport.width,
            viewport.height,
          );
          const report = await inspectOpenPanel(page, locale);

          // Mobile widths deliberately stack the translated verify action
          // under the URL field rather than squeezing both into one row.
          expect(report.inputBottom).not.toBeNull();
          expect(report.buttonTop).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >=
              (report.inputBottom ?? 0) - 1,
          ).toBe(true);
        }
      },
    );
  }
}

test('X promotion high-risk locales fit the constrained desktop card', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const control: RouteControl = {
    getStatus: 200,
    getBody: OPEN_PROMOTION,
    submitStatus: 200,
    submitBody: { ok: true },
  };
  await installPromotionRoutes(page, control);

  for (const locale of HIGH_RISK_LOCALES) {
    control.getStatus = 200;
    control.getBody = OPEN_PROMOTION;
    await visitQa(page, locale, 1280, 900);
    await inspectOpenPanel(page, locale);
  }
});

test('X promotion standalone states wrap safely in risky locales', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const control: RouteControl = {
    getStatus: 200,
    getBody: OPEN_PROMOTION,
    submitStatus: 200,
    submitBody: { ok: true },
  };
  await installPromotionRoutes(page, control);

  const samples = ['ar', 'ur', 'te', 'de'] as SupportedLocale[];

  for (const locale of samples) {
    for (const state of [
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
        selector: '.promotionPreparing',
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: true,
          promotion: null,
        },
      },
      {
        selector: '.promotionStatus',
        status: 503,
        body: {
          error: 'Internal English error must not affect layout.',
        },
      },
    ] as const) {
      control.getStatus = state.status;
      control.getBody = state.body;
      await visitQa(page, locale, 320, 568);

      const surface = page.locator(state.selector);
      await expect(surface).toBeVisible();

      const report = await surface.evaluate((node) => {
        const el = node as HTMLElement;
        const card = el.closest<HTMLElement>('.notificationReceiptView');
        const box = el.getBoundingClientRect();
        const cardBox = card?.getBoundingClientRect() ?? null;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside: Boolean(
            cardBox &&
            (box.left < cardBox.left - 2 ||
              box.right > cardBox.right + 2),
          ),
          direction: getComputedStyle(el).direction,
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });

      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(
        report,
        JSON.stringify({ locale, state: state.selector, report }),
      ).toEqual({
        clipped: false,
        outside: false,
        direction: isRtlLocale(locale) ? 'rtl' : 'ltr',
        viewportOverflow: 0,
      });
    }
  }
});

for (const locale of ERROR_SAMPLE_LOCALES) {
  test(
    'X promotion submit error is localized / ' + locale,
    async ({ page }) => {
      const control: RouteControl = {
        getStatus: 200,
        getBody: OPEN_PROMOTION,
        submitStatus: 409,
        submitBody: {
          error: 'This raw English server error must never render.',
        },
      };
      await installPromotionRoutes(page, control);
      await visitQa(page, locale, 320, 568);
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
        'This raw English server error must never render.',
      );

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

      expect(report).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    },
  );
}
