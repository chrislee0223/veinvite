import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

test.describe.configure({
  mode: 'serial',
  timeout: 180_000,
});

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  promotion: {
    inviteCode: 'QA-X-PROMOTION',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2099-12-30T00:00:00.000Z',
    postDeadlineAt: '2099-12-31T00:00:00.000Z',
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

type ApiState = { status: number; body: unknown };

async function installRoutes(page: Page) {
  const state: {
    promotion: ApiState;
    submit: ApiState;
  } = {
    promotion: { status: 200, body: OPEN_PROMOTION },
    submit: {
      status: 409,
      body: { error: 'This English internal error must never render.' },
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

async function openHarness(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/qa/x-promotion?locale=en', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await expect(
    page.locator('[data-qa-x-promotion-ready="true"]'),
  ).toBeVisible({ timeout: 60_000 });

  await expect(
    page.locator('[data-qa-x-promotion-receipt]'),
  ).toBeVisible({ timeout: 60_000 });

  // The receipt is server-rendered immediately, but the promotion panel
  // performs its state fetch after React hydration. Wait for hydration
  // explicitly instead of racing the first client-side request on cold CI.
  await expect(
    page.locator('[data-qa-x-promotion-hydrated="true"]'),
  ).toBeVisible({ timeout: 60_000 });

  await expect(
    page.locator('.promotionPanel'),
  ).toBeVisible({ timeout: 30_000 });

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  });
}

async function selectLocale(
  page: Page,
  locale: SupportedLocale,
) {
  const picker = page.locator('[data-qa-x-promotion-locale]');
  await picker.selectOption(locale, { force: true });
  await expect(picker).toHaveValue(locale);
  await expect(
    page.locator(
      '[data-qa-x-promotion-active-locale="' + locale + '"]',
    ),
  ).toBeVisible();
}

async function remount(page: Page) {
  await page
    .locator('[data-qa-x-promotion-remount]')
    .click({ force: true });
  await page.evaluate(
    () => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
  );
}

async function measurePanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await panel.scrollIntoViewIfNeeded();

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const issues: string[] = [];
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

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
        if (!el.textContent?.trim() && selector !== '.promotionSubmit input') continue;
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clipped horizontally');
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + ' outside promotion panel');
        }
      }
    }

    const title = box('.promotionHeading strong');
    const amountBox = box('.promotionHeading span');
    if (
      title &&
      amountBox &&
      Math.min(title.right, amountBox.right) - Math.max(title.left, amountBox.left) > 2 &&
      Math.min(title.bottom, amountBox.bottom) - Math.max(title.top, amountBox.top) > 2
    ) {
      issues.push('promotion title overlaps amount');
    }

    const input = box('.promotionSubmit input');
    const button = box('.promotionSubmit button');
    if (
      input &&
      button &&
      Math.min(input.right, button.right) - Math.max(input.left, button.left) > 2 &&
      Math.min(input.bottom, button.bottom) - Math.max(input.top, button.top) > 2
    ) {
      issues.push('post URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      window.innerWidth;
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
      shareAmountDirection: shareAmount ? getComputedStyle(shareAmount).direction : null,
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
  await expect(surface).toBeVisible({ timeout: 15_000 });
  await surface.scrollIntoViewIfNeeded();

  return surface.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('standalone state horizontally overflows');
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
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport overflows horizontally: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
    };
  });
}

test('X promotion 320px layout across all 29 locales', async ({ page }) => {
  await installRoutes(page);
  await openHarness(page, 320, 568);

  for (const locale of SUPPORTED_LOCALES) {
    await selectLocale(page, locale);
    await expect(
      page.locator('.promotionPanel'),
    ).toHaveAttribute(
      'dir',
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );

    const report = await measurePanel(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.inputDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);

    expect(report.inputBottom).not.toBeNull();
    expect(report.buttonTop).not.toBeNull();
    expect(
      (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
    ).toBe(true);
  }
});

test('X promotion high-risk states stay localized and contained', async ({ page }) => {
  const api = await installRoutes(page);
  await openHarness(page, 393, 852);

  for (const locale of HIGH_RISK_LOCALES) {
    api.promotion = { status: 200, body: OPEN_PROMOTION };
    await selectLocale(page, locale);
    await remount(page);

    const open = await measurePanel(page);
    expect(open.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(open.issues, JSON.stringify({ locale, state: 'open', open })).toEqual([]);

    api.promotion = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: false,
        promotion: null,
      },
    };
    await remount(page);
    const generic = await measureStandalone(page, '.genericShare');
    expect(generic.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(generic.issues, JSON.stringify({ locale, state: 'generic', generic })).toEqual([]);

    api.promotion = { status: 503, body: { error: 'QA unavailable' } };
    await remount(page);
    const retry = await measureStandalone(page, '.promotionStatus');
    expect(retry.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(retry.issues, JSON.stringify({ locale, state: 'retry', retry })).toEqual([]);

    api.promotion = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: true,
        promotion: null,
      },
    };
    await remount(page);
    const preparing = await measureStandalone(page, '.promotionPreparing');
    expect(preparing.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(preparing.issues, JSON.stringify({ locale, state: 'preparing', preparing })).toEqual([]);

    api.promotion = { status: 200, body: OPEN_PROMOTION };
    await remount(page);
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

    const errorOverflow = await error.evaluate((node) => {
      const el = node as HTMLElement;
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
        viewportOverflow:
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          window.innerWidth,
      };
    });
    expect(errorOverflow, JSON.stringify({ locale, errorOverflow })).toEqual({
      clipped: false,
      viewportOverflow: 0,
    });
  }
});
