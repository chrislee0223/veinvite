import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

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

const HIGH_RISK_LOCALES = new Set<SupportedLocale>([
  'ar',
  'ur',
  'arz',
  'de',
  'el',
  'te',
  'sw',
  'ro',
]);

// Standalone branches use the same wrapping primitives for every locale.
// Exercise one RTL script, one long Latin locale and one complex Indic script
// in the browser while the static contract checks all 29 localized strings.
const STANDALONE_BROWSER_LOCALES = [
  'ar',
  'de',
  'te',
] as const satisfies readonly SupportedLocale[];

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

async function waitForNotificationHydration(page: Page) {
  const marker = page.locator('[data-qa-notification-hydrated]');
  await expect(marker).toHaveCount(1, { timeout: 30_000 });
  await expect(marker).toHaveAttribute(
    'data-qa-notification-hydrated',
    'true',
    { timeout: 30_000 },
  );
}

async function readPromotionPanelReport(page: Page) {
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
        'promotion panel horizontally overflows: ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }

    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('promotion panel escapes receipt width');
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit button',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() || el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              el.scrollWidth +
              '>' +
              el.clientWidth +
              ' ' +
              (el.textContent ?? '').slice(0, 48),
          );
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + ' outside promotion panel');
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

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionHeading span')!,
        ).direction,
      shareAmountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionShare b')!,
        ).direction,
      inputDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionSubmit input')!,
        ).direction,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

function expectPromotionReport(
  locale: SupportedLocale,
  report: Awaited<ReturnType<typeof readPromotionPanelReport>>,
  mobile: boolean,
) {
  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.amountDirection).toBe('ltr');
  expect(report.shareAmountDirection).toBe('ltr');
  expect(report.inputDirection).toBe('ltr');
  expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);

  if (mobile) {
    expect(report.inputBottom).not.toBeNull();
    expect(report.buttonTop).not.toBeNull();
    expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);
  }
}

async function openPromotionPanel(page: Page, locale: SupportedLocale) {
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

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await waitForNotificationHydration(page);

  const row = page.locator('.notificationHistoryRow').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 15_000,
  });
  return readPromotionPanelReport(page);
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion responsive locale layout / ' + locale, async ({ page }) => {
    const narrow = await openPromotionPanel(page, locale);
    expectPromotionReport(locale, narrow, true);

    // Reuse the exact same rendered component at the second mobile width
    // instead of paying for a second page load per locale.
    await page.setViewportSize({ width: 393, height: 852 });
    const mobile = await readPromotionPanelReport(page);
    expectPromotionReport(locale, mobile, true);

    if (HIGH_RISK_LOCALES.has(locale)) {
      await page.setViewportSize({ width: 1280, height: 900 });
      const constrainedDesktop = await readPromotionPanelReport(page);
      expectPromotionReport(locale, constrainedDesktop, false);
    }

    if (STANDALONE_BROWSER_LOCALES.includes(locale as typeof STANDALONE_BROWSER_LOCALES[number])) {
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

      await page.setViewportSize({ width: 320, height: 568 });
      const input = page.locator('.promotionSubmit input');
      const button = page.locator('.promotionSubmit button');
      await input.fill('https://x.com/test/status/1234567890123456789');
      await button.click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const errorReport = await error.evaluate((node) => {
        const el = node as HTMLElement;
        const root = el.closest<HTMLElement>('.promotionPanel');
        const box = el.getBoundingClientRect();
        const rootBox = root?.getBoundingClientRect() ?? null;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside: Boolean(
            rootBox &&
            (box.left < rootBox.left - 2 ||
              box.right > rootBox.right + 2),
          ),
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });
      expect(errorReport, JSON.stringify({ locale, errorReport })).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    }
  });
}

async function verifyStandaloneStates(
  page: Page,
  locale: SupportedLocale,
) {
  let response: {
    status: number;
    body: Record<string, unknown>;
  } = {
    status: 200,
    body: {
      newOffersEnabled: true,
      promotionPending: false,
      promotion: null,
    },
  };

  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    },
  );

  const cases = [
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
      body: { error: 'QA unavailable' },
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
  ] as const;

  for (const item of cases) {
    response = {
      status: item.status,
      body: item.body,
    };

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(
      '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );

    await waitForNotificationHydration(page);

    const row = page.locator('.notificationHistoryRow').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('.notificationReceiptView')).toBeVisible({
      timeout: 15_000,
    });

    const surface = page.locator(item.selector);
    await expect(surface).toBeVisible({ timeout: 10_000 });
    await surface.scrollIntoViewIfNeeded();
    await settleLayout(page);

    const report = await surface.evaluate((node) => {
      const root = node as HTMLElement;
      const issues: string[] = [];
      const rootBox = root.getBoundingClientRect();
      const receipt = root.closest<HTMLElement>('.notificationReceiptView');
      const receiptBox = receipt?.getBoundingClientRect() ?? null;

      if (root.scrollWidth > root.clientWidth + 2) {
        issues.push('standalone state horizontally overflows');
      }

      if (
        receiptBox &&
        (rootBox.left < receiptBox.left - 2 ||
          rootBox.right > receiptBox.right + 2)
      ) {
        issues.push('standalone state escapes receipt width');
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
        issues.push('viewport overflows horizontally: ' + viewportOverflow);
      }

      return {
        issues,
        direction: getComputedStyle(root).direction,
      };
    });

    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.issues, JSON.stringify({ locale, item, report })).toEqual([]);
  }
}

for (const locale of STANDALONE_BROWSER_LOCALES) {
  test('X promotion standalone states / ' + locale, async ({ page }) => {
    await verifyStandaloneStates(page, locale);
  });
}
