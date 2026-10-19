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
    openedAt: '2026-10-20T00:00:00.000Z',
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
  'arz',
  'ur',
  'hi',
  'bn',
  'mr',
  'te',
  'zh-tw',
  'ko',
  'de',
  'el',
] as const satisfies readonly SupportedLocale[];

async function waitForLayout(page: Page) {
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

async function openDirectPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' +
      locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.getByTestId('qa-x-promotion-receipt'),
  ).toBeVisible({ timeout: 10_000 });
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();
  await waitForLayout(page);
  return panel;
}

async function panelReport(page: Page) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
          b &&
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
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
        if (!el.textContent?.trim() && selector !== '.promotionSubmit input') {
          continue;
        }
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();

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
        if (
          box.left < rootBox.left - 2 ||
          box.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside promotion panel');
        }
      }
    }

    if (
      overlaps(
        rect('.promotionHeading strong'),
        rect('.promotionHeading span'),
      )
    ) {
      issues.push('promotion title overlaps amount');
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');
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
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion locale layout / ' + locale, async ({ page }) => {
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

    await openDirectPanel(page, locale, 320, 568);
    const narrow = await panelReport(page);
    expect(narrow.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(narrow.amountDirection).toBe('ltr');
    expect(narrow.shareAmountDirection).toBe('ltr');
    expect(narrow.inputDirection).toBe('ltr');
    expect(
      narrow.issues,
      JSON.stringify({ locale, viewport: 320, narrow }),
    ).toEqual([]);
    expect(narrow.inputBottom).not.toBeNull();
    expect(narrow.buttonTop).not.toBeNull();
    expect(
      (narrow.buttonTop ?? 0) >= (narrow.inputBottom ?? 0) - 1,
    ).toBe(true);

    await page.setViewportSize({ width: 393, height: 852 });
    await waitForLayout(page);
    const mobile = await panelReport(page);
    expect(
      mobile.issues,
      JSON.stringify({ locale, viewport: 393, mobile }),
    ).toEqual([]);
    expect(mobile.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(
      (mobile.buttonTop ?? 0) >= (mobile.inputBottom ?? 0) - 1,
    ).toBe(true);

    if (
      (HIGH_RISK_LOCALES as readonly SupportedLocale[]).includes(locale)
    ) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await waitForLayout(page);
      const desktop = await panelReport(page);
      expect(
        desktop.issues,
        JSON.stringify({ locale, viewport: 1280, desktop }),
      ).toEqual([]);
      expect(desktop.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
    }
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion alternate states / ' + locale,
    async ({ page }) => {
      let getStatus = 200;
      let getBody: unknown = OPEN_PROMOTION;

      await page.route(
        /\/api\/rewards\/x-promotion(?:\?.*)?$/,
        async (route) => {
          await route.fulfill({
            status: getStatus,
            contentType: 'application/json',
            body: JSON.stringify(getBody),
          });
        },
      );

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

      const visit = async (
        selector:
          | '.genericShare'
          | '.promotionPreparing'
          | '.promotionStatus',
      ) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.goto(
          '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' +
            locale,
          { waitUntil: 'domcontentloaded', timeout: 30_000 },
        );
        const surface = page.locator(selector);
        await expect(surface).toBeVisible({ timeout: 10_000 });
        await surface.scrollIntoViewIfNeeded();
        await waitForLayout(page);

        const report = await surface.evaluate((node) => {
          const el = node as HTMLElement;
          const box = el.getBoundingClientRect();
          const receipt = el.closest<HTMLElement>(
            '.notificationReceiptView',
          );
          const receiptBox =
            receipt?.getBoundingClientRect() ?? null;
          return {
            clipped: el.scrollWidth > el.clientWidth + 2,
            outside: Boolean(
              receiptBox &&
                (box.left < receiptBox.left - 2 ||
                  box.right > receiptBox.right + 2),
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
          JSON.stringify({ locale, selector, report }),
        ).toEqual({
          clipped: false,
          outside: false,
          direction: isRtlLocale(locale) ? 'rtl' : 'ltr',
          viewportOverflow: 0,
        });
      };

      getStatus = 200;
      getBody = {
        newOffersEnabled: true,
        promotionPending: false,
        promotion: null,
      };
      await visit('.genericShare');

      getBody = {
        newOffersEnabled: true,
        promotionPending: true,
        promotion: null,
      };
      await visit('.promotionPreparing');

      getStatus = 503;
      getBody = { error: 'QA unavailable' };
      await visit('.promotionStatus');

      getStatus = 200;
      getBody = OPEN_PROMOTION;
      await openDirectPanel(page, locale, 320, 568);

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
        JSON.stringify({ locale, errorReport }),
      ).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    },
  );
}
