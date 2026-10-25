import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { rewardXPromotionSubmitError } from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const HIGH_RISK_LOCALES = [
  'ar',
  'ur',
  'de',
  'el',
  'te',
  'sw',
  'ro',
  'zh-tw',
] as const satisfies readonly SupportedLocale[];

type PromotionFixture = {
  newOffersEnabled: boolean;
  promotionPending: boolean;
  xConnectAvailable: boolean;
  xConnected: boolean;
  xUrlLessEnabled: boolean;
  promotion: {
    inviteCode: string;
    state:
      | 'OPEN'
      | 'SUBMISSION_GRACE'
      | 'VERIFYING'
      | 'RETENTION'
      | 'REVIEW_REQUIRED'
      | 'PAYOUT_PENDING'
      | 'PAID'
      | 'EXPIRED'
      | 'RELEASED';
    amountWei: string;
    amountB3tr: string;
    openedAt: string | null;
    postDeadlineAt: string;
    submissionGraceSeconds: number;
    shareToken: string | null;
    submittedAt: string | null;
    verifyAfter: string | null;
    paidAt: string | null;
  } | null;
};

const OPEN_MANUAL: PromotionFixture = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: false,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-25T00:00:00.000Z',
    postDeadlineAt: '2099-01-01T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
};

function autoFixture(connected: boolean): PromotionFixture {
  return {
    ...OPEN_MANUAL,
    xConnectAvailable: true,
    xConnected: connected,
    xUrlLessEnabled: true,
  };
}

async function installPromotionRoute(
  page: Page,
  getFixture: () => PromotionFixture,
) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getFixture()),
      });
    },
  );
}

async function openReceipt(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const row = page.locator('.notificationHistoryRow').first();
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 10_000,
  });

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

async function auditPromotionPanel(page: Page, locale: SupportedLocale) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'promotion panel horizontal overflow ' +
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
      issues.push('promotion panel escapes reward receipt');
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionConnect',
      '.promotionConnectState',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              (el.textContent ?? '').slice(0, 50),
          );
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + ' escapes promotion panel');
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

    if (
      overlaps(
        box('.promotionSubmit input'),
        box('.promotionSubmit button'),
      )
    ) {
      issues.push('post URL input overlaps verify button');
    }

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
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionHeading span')!,
        ).direction,
      shareAmountDirection: root.querySelector<HTMLElement>('.promotionShare b')
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionShare b')!,
          ).direction
        : null,
      inputDirection: root.querySelector<HTMLElement>('.promotionSubmit input')
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionSubmit input')!,
          ).direction
        : null,
      inputBottom:
        box('.promotionSubmit input')?.bottom ?? null,
      buttonTop:
        box('.promotionSubmit button')?.top ?? null,
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

  return report;
}

for (const locale of SUPPORTED_LOCALES) {
  test(
    'X promotion 320px layout / ' + locale,
    async ({ page }) => {
      let fixture = OPEN_MANUAL;
      await installPromotionRoute(page, () => fixture);
      await openReceipt(page, locale, 320, 740);

      const report = await auditPromotionPanel(page, locale);

      expect(report.inputBottom).not.toBeNull();
      expect(report.buttonTop).not.toBeNull();
      expect(
        (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
      ).toBe(true);
    },
  );
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X automatic verification 393px layout / ' + locale,
    async ({ page }) => {
      let fixture = autoFixture(false);
      await installPromotionRoute(page, () => fixture);
      await openReceipt(page, locale, 393, 852);

      await expect(page.locator('.promotionConnect')).toBeVisible();
      await auditPromotionPanel(page, locale);

      fixture = autoFixture(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const row = page.locator('.notificationHistoryRow').first();
      await expect(row).toBeVisible();
      await row.click();
      await expect(page.locator('.promotionConnectState')).toBeVisible();
      await auditPromotionPanel(page, locale);
    },
  );

  test(
    'X localized submit error 320px / ' + locale,
    async ({ page }) => {
      let fixture = OPEN_MANUAL;
      await installPromotionRoute(page, () => fixture);
      await page.route(
        '**/api/rewards/x-promotion/submit',
        async (route) => {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INTERNAL ENGLISH ERROR MUST NOT RENDER',
            }),
          });
        },
      );

      await openReceipt(page, locale, 320, 740);
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
        'INTERNAL ENGLISH ERROR MUST NOT RENDER',
      );
      await auditPromotionPanel(page, locale);
    },
  );
}

test(
  'X generic share 320px high-risk labels',
  async ({ page }) => {
    let fixture: PromotionFixture = {
      newOffersEnabled: true,
      promotionPending: false,
      xConnectAvailable: false,
      xConnected: false,
      xUrlLessEnabled: false,
      promotion: null,
    };
    await installPromotionRoute(page, () => fixture);

    for (const locale of HIGH_RISK_LOCALES) {
      await openReceipt(page, locale, 320, 740);
      const button = page.locator('.genericShare');
      await expect(button).toBeVisible();
      const result = await button.evaluate((node) => {
        const el = node as HTMLElement;
        const rect = el.getBoundingClientRect();
        const receipt = el.closest<HTMLElement>('.notificationReceiptView');
        const receiptRect = receipt?.getBoundingClientRect() ?? null;
        return {
          clipped: el.scrollWidth > el.clientWidth + 2,
          outside: Boolean(
            receiptRect &&
            (rect.left < receiptRect.left - 2 ||
              rect.right > receiptRect.right + 2),
          ),
          viewportOverflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth,
            ) - window.innerWidth,
        };
      });
      expect(
        result,
        JSON.stringify({ locale, result }),
      ).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });
    }
  },
);
