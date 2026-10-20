import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

test.describe.configure({
  mode: 'serial',
  // The first QA browser visit may still need to compile/load the client
  // chunk even after the server route is warmed. Keep this scoped to the
  // X-promotion audit instead of weakening the global Playwright timeout.
  timeout: 90_000,
});

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  promotion: {
    inviteCode: 'QA-X-PROMOTION',
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
] as const satisfies readonly SupportedLocale[];

type PromotionApiState = {
  status: number;
  body: unknown;
};

async function installPromotionRoutes(page: Page) {
  const state: {
    promotion: PromotionApiState;
    submit: PromotionApiState;
  } = {
    promotion: {
      status: 200,
      body: OPEN_PROMOTION,
    },
    submit: {
      status: 409,
      body: {
        error: 'This English internal error must never render.',
      },
    },
  };

  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: state.promotion.status,
        contentType: 'application/json',
        body: JSON.stringify(state.promotion.body),
      });
    },
  );

  await page.route(
    '**/api/rewards/x-promotion/submit',
    async (route) => {
      await route.fulfill({
        status: state.submit.status,
        contentType: 'application/json',
        body: JSON.stringify(state.submit.body),
      });
    },
  );

  return state;
}

async function openHarness(
  page: Page,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/x-promotion?locale=en',
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.locator('[data-qa-x-promotion-receipt]'),
  ).toBeVisible({ timeout: 30_000 });

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

async function selectHarnessLocale(
  page: Page,
  locale: SupportedLocale,
) {
  const picker = page.locator(
    '[data-qa-x-promotion-locale]',
  );
  await picker.selectOption(locale, { force: true });
  await expect(picker).toHaveValue(locale);
  await expect(
    page.locator('[data-qa-x-promotion-receipt]'),
  ).toHaveAttribute(
    'data-qa-x-promotion-active-locale',
    locale,
  );

  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });
}

async function remountPromotion(page: Page) {
  await page
    .locator('[data-qa-x-promotion-remount]')
    .click({ force: true });

  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });
}

async function measurePromotionPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await panel.scrollIntoViewIfNeeded();

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
      '.promotionSubmit input',
      '.promotionSubmit button',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && selector !== '.promotionSubmit input') {
          continue;
        }
        if (el.getClientRects().length === 0) continue;

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

    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const urlInput = root.querySelector<HTMLElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: urlInput ? getComputedStyle(urlInput).direction : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

async function measureStandalone(
  page: Page,
  selector: '.genericShare' | '.promotionStatus' | '.promotionPreparing',
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 60_000 });
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

// Exhaustive language coverage still checks every supported locale at the
// narrowest phone width. The QA page is opened once and switches locale
// client-side, avoiding ~29 cold navigations inside the 12-minute CI budget.
test('X promotion 320px layout across all locales', async ({ page }) => {
  test.setTimeout(180_000);
  await installPromotionRoutes(page);
  await openHarness(page, 320, 568);

  for (const locale of SUPPORTED_LOCALES) {
    await selectHarnessLocale(page, locale);
    const report = await measurePromotionPanel(page);

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
      (report.buttonTop ?? 0) >=
        (report.inputBottom ?? 0) - 1,
    ).toBe(true);
  }
});

// RTL, long-Latin and complex-script locales get deeper state coverage, but
// still reuse the same mounted QA page. Static contracts cover all 29
// localized error strings while these representative browser cases verify
// real wrapping, bidi isolation and state-specific surfaces.
test('X promotion high-risk state matrix', async ({ page }) => {
  test.setTimeout(180_000);
  const api = await installPromotionRoutes(page);
  await openHarness(page, 1280, 900);

  for (const locale of HIGH_RISK_LOCALES) {
    api.promotion = { status: 200, body: OPEN_PROMOTION };
    await page.setViewportSize({ width: 1280, height: 900 });
    await selectHarnessLocale(page, locale);

    const desktop = await measurePromotionPanel(page);
    expect(desktop.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(desktop.amountDirection).toBe('ltr');
    expect(desktop.shareAmountDirection).toBe('ltr');
    expect(desktop.inputDirection).toBe('ltr');
    expect(
      desktop.issues,
      JSON.stringify({ locale, state: 'desktop-open', desktop }),
    ).toEqual([]);

    await page.setViewportSize({ width: 320, height: 568 });

    api.promotion = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: false,
        promotion: null,
      },
    };
    await remountPromotion(page);
    const generic = await measureStandalone(page, '.genericShare');
    expect(generic.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(
      generic.issues,
      JSON.stringify({ locale, state: 'generic-share', generic }),
    ).toEqual([]);

    api.promotion = {
      status: 503,
      body: { error: 'QA unavailable' },
    };
    await remountPromotion(page);
    const retry = await measureStandalone(page, '.promotionStatus');
    expect(retry.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(
      retry.issues,
      JSON.stringify({ locale, state: 'retry', retry }),
    ).toEqual([]);

    api.promotion = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: true,
        promotion: null,
      },
    };
    await remountPromotion(page);
    const preparing = await measureStandalone(
      page,
      '.promotionPreparing',
    );
    expect(preparing.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(
      preparing.issues,
      JSON.stringify({ locale, state: 'preparing', preparing }),
    ).toEqual([]);

    api.promotion = { status: 200, body: OPEN_PROMOTION };
    api.submit = {
      status: 409,
      body: {
        error: 'This English internal error must never render.',
      },
    };
    await remountPromotion(page);
    await measurePromotionPanel(page);

    const input = page.locator('.promotionSubmit input');
    const button = page.locator('.promotionSubmit button');
    await input.fill(
      'https://x.com/test/status/1234567890123456789',
    );
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

    expect(
      errorReport,
      JSON.stringify({ locale, state: 'submit-error', errorReport }),
    ).toEqual({
      clipped: false,
      outside: false,
      viewportOverflow: 0,
    });
  }
});

