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

const STANDALONE_RISK_LOCALES = [
  'ur',
  'ar',
  'te',
  'de',
] as const;

async function waitForNotificationHarness(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });
}

async function openRewardReceipt(page: Page) {
  const row = page.locator('.notificationHistoryRow').first();
  const receipt = page.locator('.notificationReceiptView');

  await expect(row).toBeVisible({ timeout: 10_000 });

  // The SSR row can be visible before React hydration attaches the click
  // handler. Retry the real interaction briefly instead of modifying the
  // Production/QA component contract just for this browser audit.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await row.click();
    if (await receipt.isVisible()) return receipt;
    await page.waitForTimeout(150);
  }

  await expect(receipt).toBeVisible({ timeout: 10_000 });
  return receipt;
}

async function openPromotionPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
  promotionResponse: unknown = OPEN_PROMOTION,
) {
  await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(promotionResponse),
      });
    },
  );

  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await waitForNotificationHarness(page);

  await openRewardReceipt(page);

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
      '.promotionConnect',
      '.promotionConnectState',
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
      inputTop: input?.top ?? null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
      buttonBottom: button?.bottom ?? null,
    };
  });
}

const LOCALE_SHARDS = Array.from(
  { length: 4 },
  () => [] as SupportedLocale[],
);
SUPPORTED_LOCALES.forEach((locale, index) => {
  LOCALE_SHARDS[index % LOCALE_SHARDS.length].push(locale);
});

for (const [shardIndex, locales] of LOCALE_SHARDS.entries()) {
  test(
    'X promotion locale layout shard ' + (shardIndex + 1) + ' / 320px',
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const locale of locales) {
        const report = await openPromotionPanel(
          page,
          locale,
          320,
          568,
        );

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, viewport: 320, report }),
        ).toEqual([]);

        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
        ).toBe(true);
      }
    },
  );
}

const HIGH_RISK_SHARDS = [
  HIGH_RISK_LOCALES.filter((_, index) => index % 2 === 0),
  HIGH_RISK_LOCALES.filter((_, index) => index % 2 === 1),
];

for (const [shardIndex, locales] of HIGH_RISK_SHARDS.entries()) {
  test(
    'X promotion high-risk responsive shard ' + (shardIndex + 1),
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const locale of locales) {
        const mobile = await openPromotionPanel(
          page,
          locale,
          393,
          852,
        );
        expect(mobile.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(mobile.amountDirection).toBe('ltr');
        expect(mobile.shareAmountDirection).toBe('ltr');
        expect(mobile.inputDirection).toBe('ltr');
        expect(
          mobile.issues,
          JSON.stringify({ locale, viewport: 393, report: mobile }),
        ).toEqual([]);

        await page.setViewportSize({ width: 1280, height: 900 });
        const panel = page.locator('.promotionPanel');
        await panel.scrollIntoViewIfNeeded();
        const desktopOverflow = await panel.evaluate((node) => {
          const root = node as HTMLElement;
          const box = root.getBoundingClientRect();
          const receipt =
            root.closest<HTMLElement>('.notificationReceiptView');
          const receiptBox = receipt?.getBoundingClientRect() ?? null;
          return {
            internal: root.scrollWidth - root.clientWidth,
            escapesReceipt: Boolean(
              receiptBox &&
              (box.left < receiptBox.left - 2 ||
                box.right > receiptBox.right + 2),
            ),
          };
        });
        expect(desktopOverflow.internal).toBeLessThanOrEqual(2);
        expect(desktopOverflow.escapesReceipt).toBe(false);
      }
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
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await waitForNotificationHarness(page);

  await openRewardReceipt(page);

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

for (const locale of STANDALONE_RISK_LOCALES) {
  test(
    'X promotion state matrix / ' + locale,
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const scenario of [
        {
          selector: '.genericShare' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: false,
            promotion: null,
          },
        },
        {
          selector: '.promotionStatus' as const,
          status: 503,
          body: { error: 'QA unavailable' },
        },
        {
          selector: '.promotionPreparing' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: true,
            promotion: null,
          },
        },
      ]) {
        const report = await openStandalonePromotionState({
          page,
          locale,
          selector: scenario.selector,
          status: scenario.status,
          body: scenario.body,
        });
        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(
          report.issues,
          JSON.stringify({ locale, scenario: scenario.selector, report }),
        ).toEqual([]);
      }

      await page.unroute('**/api/rewards/x-promotion/submit');
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

      await openPromotionPanel(page, locale, 320, 568);

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



const AUTO_LAYOUT_LOCALES = ['ar', 'ur', 'de', 'te'] as const;

for (const locale of AUTO_LAYOUT_LOCALES) {
  test(
    'X automatic promotion connect states / ' + locale,
    async ({ page }) => {
      test.setTimeout(120_000);

      for (const connected of [false, true]) {
        const report = await openPromotionPanel(
          page,
          locale,
          320,
          568,
          {
            ...OPEN_PROMOTION,
            xConnectAvailable: true,
            xConnected: connected,
            xUrlLessEnabled: true,
          },
        );

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.inputDirection).toBeNull();
        if (connected) {
          expect(report.shareAmountDirection).toBe('ltr');
        } else {
          expect(report.shareAmountDirection).toBeNull();
        }
        expect(
          report.issues,
          JSON.stringify({ locale, connected, report }),
        ).toEqual([]);

        if (connected) {
          await expect(page.locator('.promotionConnectState')).toBeVisible();
          await expect(page.locator('.promotionSubmit')).toHaveCount(0);
        } else {
          await expect(page.locator('.promotionConnect')).toBeVisible();
          await expect(page.locator('.promotionSubmit')).toHaveCount(0);
        }
      }
    },
  );
}
