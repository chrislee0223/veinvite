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
    // Keep the QA offer open regardless of the calendar date so the
    // production deadline-boundary refresh timer cannot make layout tests flaky.
    postDeadlineAt: '2099-01-01T00:00:00.000Z',
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

async function openPromotionPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
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

  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-RECEIPT-DIRECT&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.getByTestId('qa-x-promotion-receipt-direct'),
  ).toBeVisible();

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
      inputTop: input?.top ?? null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
      buttonBottom: button?.bottom ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 393, height: 852 },
  ] as const) {
    test(
      'X promotion locale layout / ' +
        locale +
        ' / ' +
        viewport.width +
        'px',
      async ({ page }) => {
        const report = await openPromotionPanel(
          page,
          locale,
          viewport.width,
          viewport.height,
        );

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, viewport, report }),
        ).toEqual([]);

        // At these mobile widths the URL field and translated verify button
        // deliberately stack instead of fighting over one row.
        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect((report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(
          true,
        );
      },
    );
  }
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion constrained desktop receipt / ' + locale,
    async ({ page }) => {
      const report = await openPromotionPanel(
        page,
        locale,
        1280,
        900,
      );
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
    },
  );
}


async function openStandalonePromotionState({
  page,
  locale,
  selector,
  status,
  body,
}: {
  page: Page;
  locale: SupportedLocale;
  selector: '.genericShare' | '.promotionStatus' | '.promotionPreparing';
  status: number;
  body: unknown;
}) {
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

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-RECEIPT-DIRECT&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.getByTestId('qa-x-promotion-receipt-direct'),
  ).toBeVisible();

  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();

  return surface.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'standalone state horizontally overflows: ' +
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
      issues.push('standalone state escapes receipt width');
    }

    for (const el of root.querySelectorAll<HTMLElement>('span,button')) {
      if (!el.textContent?.trim() || el.getClientRects().length === 0) continue;
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push(
          'standalone child clipped: ' +
            (el.textContent ?? '').slice(0, 48),
        );
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
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X generic share mobile layout / ' + locale,
    async ({ page }) => {
      const report = await openStandalonePromotionState({
        page,
        locale,
        selector: '.genericShare',
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: false,
          promotion: null,
        },
      });
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    },
  );

  test(
    'X promotion retry mobile layout / ' + locale,
    async ({ page }) => {
      const report = await openStandalonePromotionState({
        page,
        locale,
        selector: '.promotionStatus',
        status: 503,
        body: { error: 'QA unavailable' },
      });
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    },
  );

  test(
    'X promotion preparing mobile layout / ' + locale,
    async ({ page }) => {
      const report = await openStandalonePromotionState({
        page,
        locale,
        selector: '.promotionPreparing',
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: true,
          promotion: null,
        },
      });
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
    },
  );
}


for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion localized submit error / ' + locale,
    async ({ page }) => {
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

      await openPromotionPanel(
        page,
        locale,
        320,
        568,
      );

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

      const report = await error.evaluate((node) => {
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

      expect(
        report,
        JSON.stringify({ locale, report }),
      ).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    },
  );
}
