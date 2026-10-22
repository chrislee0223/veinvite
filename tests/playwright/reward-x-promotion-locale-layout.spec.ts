import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

type GetState = {
  status: number;
  body: Record<string, unknown>;
};

const MANUAL_OPEN: GetState = {
  status: 200,
  body: {
    newOffersEnabled: true,
    promotionPending: false,
    xConnectAvailable: false,
    xConnected: false,
    xUrlLessEnabled: false,
    promotion: {
      inviteCode: 'QA-X-PROMOTION-22',
      state: 'OPEN',
      amountWei: '10000000000000000000',
      amountB3tr: '10',
      openedAt: '2026-10-22T00:00:00.000Z',
      postDeadlineAt: '2099-01-01T00:00:00.000Z',
      submissionGraceSeconds: 900,
      shareToken: '123e4567-e89b-42d3-a456-426614174000',
      submittedAt: null,
      verifyAfter: null,
      paidAt: null,
    },
  },
};

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

function qaUrl(locale: SupportedLocale) {
  return (
    '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' +
    locale
  );
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });
}

async function installPromotionApi(
  page: Page,
  getState: { current: GetState },
) {
  await page.route(
    '**/api/rewards/x-promotion**',
    async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname.endsWith('/submit')) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error:
              'This internal English API error must never appear in the UI.',
          }),
        });
        return;
      }

      await route.fulfill({
        status: getState.current.status,
        contentType: 'application/json',
        body: JSON.stringify(getState.current.body),
      });
    },
  );
}

async function openQaState(
  page: Page,
  locale: SupportedLocale,
  width: number,
) {
  await page.setViewportSize({
    width,
    height: width <= 320 ? 740 : 852,
  });
  await page.goto(qaUrl(locale), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await waitForFonts(page);
}

async function verifyPromotionPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const issues: string[] = [];

    const rect = (selector: string) =>
      root
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect() ?? null;

    const overlaps = (
      left: DOMRect | null,
      right: DOMRect | null,
    ) =>
      Boolean(
        left &&
          right &&
          Math.min(left.right, right.right) -
            Math.max(left.left, right.left) >
            2 &&
          Math.min(left.bottom, right.bottom) -
            Math.max(left.top, right.top) >
            2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel overflow ' +
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
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (
          el.getClientRects().length === 0 ||
          (!el.textContent?.trim() &&
            el.tagName.toLowerCase() !== 'input')
        ) {
          continue;
        }

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
          issues.push(selector + ' escapes panel');
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
      issues.push(
        'viewport horizontal overflow ' + viewportOverflow,
      );
    }

    const amount =
      root.querySelector<HTMLElement>(
        '.promotionHeading span',
      );
    const shareAmount =
      root.querySelector<HTMLElement>(
        '.promotionShare b',
      );
    const input =
      root.querySelector<HTMLElement>(
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

  expect(report.direction).toBe(
    isRtlLocale(locale) ? 'rtl' : 'ltr',
  );
  expect(report.amountDirection).toBe('ltr');
  if (report.shareAmountDirection !== null) {
    expect(report.shareAmountDirection).toBe('ltr');
  }
  if (report.inputDirection !== null) {
    expect(report.inputDirection).toBe('ltr');
  }
  expect(
    report.issues,
    JSON.stringify({ locale, report }),
  ).toEqual([]);

  if (
    page.viewportSize()!.width <= 430 &&
    report.inputBottom !== null &&
    report.buttonTop !== null
  ) {
    expect(report.buttonTop).toBeGreaterThanOrEqual(
      report.inputBottom - 1,
    );
  }
}

async function verifyStandaloneSurface(
  page: Page,
  selector: string,
  locale: SupportedLocale,
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();

  const report = await surface.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    return {
      clipped:
        root.scrollWidth > root.clientWidth + 2,
      outside:
        rootBox.left < -2 ||
        rootBox.right > window.innerWidth + 2,
      viewportOverflow,
      direction: getComputedStyle(root).direction,
    };
  });

  expect(report.direction).toBe(
    isRtlLocale(locale) ? 'rtl' : 'ltr',
  );
  expect(
    report,
    JSON.stringify({ locale, selector, report }),
  ).toMatchObject({
    clipped: false,
    outside: false,
    viewportOverflow: 0,
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test(
    'X promotion all locales / ' + locale,
    async ({ page }) => {
      const getState = {
        current: structuredClone(MANUAL_OPEN),
      };
      await installPromotionApi(page, getState);

      await openQaState(page, locale, 320);
      await verifyPromotionPanel(page, locale);

      await page.setViewportSize({
        width: 393,
        height: 852,
      });
      await waitForFonts(page);
      await verifyPromotionPanel(page, locale);
    },
  );
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion high-risk states / ' + locale,
    async ({ page }) => {
      const getState = {
        current: structuredClone(MANUAL_OPEN),
      };
      await installPromotionApi(page, getState);

      getState.current = {
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: false,
          promotion: null,
        },
      };
      await openQaState(page, locale, 320);
      await verifyStandaloneSurface(
        page,
        '.genericShare',
        locale,
      );

      getState.current = {
        status: 200,
        body: {
          newOffersEnabled: true,
          promotionPending: true,
          promotion: null,
        },
      };
      await page.goto(qaUrl(locale), {
        waitUntil: 'domcontentloaded',
      });
      await waitForFonts(page);
      await verifyStandaloneSurface(
        page,
        '.promotionPreparing',
        locale,
      );

      getState.current = {
        status: 503,
        body: {
          error:
            'This internal English load error must not render.',
        },
      };
      await page.goto(qaUrl(locale), {
        waitUntil: 'domcontentloaded',
      });
      await waitForFonts(page);
      await verifyStandaloneSurface(
        page,
        '.promotionStatus',
        locale,
      );

      getState.current = {
        status: 200,
        body: {
          ...MANUAL_OPEN.body,
          xConnectAvailable: true,
          xConnected: false,
          xUrlLessEnabled: true,
        },
      };
      await page.goto(qaUrl(locale), {
        waitUntil: 'domcontentloaded',
      });
      await waitForFonts(page);
      await verifyPromotionPanel(page, locale);
      await expect(
        page.locator('.promotionConnect'),
      ).toBeVisible();

      getState.current = structuredClone(MANUAL_OPEN);
      await page.goto(qaUrl(locale), {
        waitUntil: 'domcontentloaded',
      });
      await waitForFonts(page);
      await verifyPromotionPanel(page, locale);

      const input = page.locator(
        '.promotionSubmit input',
      );
      await input.fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await page
        .locator('.promotionSubmit button')
        .click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This internal English API error',
      );
      await verifyPromotionPanel(page, locale);
    },
  );
}
