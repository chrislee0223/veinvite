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

async function routePromotion(
  page: Page,
  body: unknown,
  status = 200,
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

async function openRewardPromotionPanel(
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
}

async function auditPromotionPanel(page: Page) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const rect = (selector: string) =>
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

    if (receipt) {
      if (receipt.scrollWidth > receipt.clientWidth + 2) {
        issues.push(
          'reward receipt horizontally overflows: ' +
            receipt.scrollWidth +
            '>' +
            receipt.clientWidth,
        );
      }

      const receiptSelectors = [
        '.notificationReceiptHero p',
        '.notificationReceiptFacts dt',
        '.notificationReceiptFacts dd',
        '.notificationExplorerLink',
        '.notificationExplorerLink > span:first-child',
      ];
      for (const selector of receiptSelectors) {
        for (const el of receipt.querySelectorAll<HTMLElement>(selector)) {
          const value = el.textContent?.trim() ?? '';
          if (!value || el.getClientRects().length === 0) continue;
          const bounds = el.getBoundingClientRect();
          if (el.clientWidth && el.scrollWidth > el.clientWidth + 2) {
            issues.push(
              selector +
                ' clipped horizontally: ' +
                value.slice(0, 48),
            );
          }
          if (
            receiptBox &&
            (bounds.left < receiptBox.left - 2 ||
              bounds.right > receiptBox.right + 2)
          ) {
            issues.push(selector + ' outside reward receipt');
          }
        }
      }
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionSubmit button',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        const value = el.textContent?.trim() ?? '';
        if (!value || el.getClientRects().length === 0) continue;
        const bounds = el.getBoundingClientRect();

        if (el.clientWidth && el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              value.slice(0, 48),
          );
        }
        if (bounds.left < rootBox.left - 2 || bounds.right > rootBox.right + 2) {
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

    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const inputElement = root.querySelector<HTMLElement>('.promotionSubmit input');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: inputElement
        ? getComputedStyle(inputElement).direction
        : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test(
    'X promotion all locales mobile layout / ' + locale,
    async ({ page }) => {
      await routePromotion(page, OPEN_PROMOTION);
      await openRewardPromotionPanel(page, locale, 320, 568);

      for (const viewport of [
        { width: 320, height: 568 },
        { width: 393, height: 852 },
      ] as const) {
        await page.setViewportSize(viewport);
        await page.locator('.promotionPanel').scrollIntoViewIfNeeded();
        const report = await auditPromotionPanel(page);

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

        // Mobile widths deliberately stack URL input + localized verify button.
        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
        ).toBe(true);
      }
    },
  );
}

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion constrained desktop receipt / ' + locale,
    async ({ page }) => {
      await routePromotion(page, OPEN_PROMOTION);
      await openRewardPromotionPanel(page, locale, 1280, 900);
      const report = await auditPromotionPanel(page);

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

  test(
    'X promotion localized submit error / ' + locale,
    async ({ page }) => {
      await routePromotion(page, OPEN_PROMOTION);
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

      await openRewardPromotionPanel(page, locale, 320, 568);

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

      expect(report.clipped).toBe(false);
      expect(report.outside).toBe(false);
      expect(report.viewportOverflow).toBe(0);
    },
  );
}
