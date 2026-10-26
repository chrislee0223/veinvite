import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

type PromotionResponse = {
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
    openedAt: string;
    postDeadlineAt: string;
    submissionGraceSeconds: number;
    shareToken: string;
    submittedAt: string | null;
    verifyAfter: string | null;
    paidAt: string | null;
  } | null;
};

const BASE_PROMOTION = {
  inviteCode: 'QA-NOTI-22',
  state: 'OPEN' as const,
  amountWei: '10000000000000000000',
  amountB3tr: '10',
  openedAt: '2026-10-25T00:00:00.000Z',
  postDeadlineAt: '2099-10-26T00:00:00.000Z',
  submissionGraceSeconds: 900,
  shareToken: '123e4567-e89b-42d3-a456-426614174000',
  submittedAt: null,
  verifyAfter: null,
  paidAt: null,
};

const MANUAL_OPEN: PromotionResponse = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: false,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: BASE_PROMOTION,
};

const AUTO_DISCONNECTED: PromotionResponse = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: false,
  xUrlLessEnabled: true,
  promotion: BASE_PROMOTION,
};

const AUTO_CONNECTED: PromotionResponse = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: true,
  xUrlLessEnabled: true,
  promotion: BASE_PROMOTION,
};

const AUTO_GRACE: PromotionResponse = {
  ...AUTO_CONNECTED,
  promotion: {
    ...BASE_PROMOTION,
    state: 'SUBMISSION_GRACE',
  },
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

const SHARDS = [
  SUPPORTED_LOCALES.slice(0, 8),
  SUPPORTED_LOCALES.slice(8, 15),
  SUPPORTED_LOCALES.slice(15, 22),
  SUPPORTED_LOCALES.slice(22),
] as const;

async function installPromotionRoute(
  page: Page,
  initial: PromotionResponse,
) {
  let current = initial;
  let getStatus = 200;

  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: getStatus,
        contentType: 'application/json',
        body: JSON.stringify(
          getStatus === 200
            ? current
            : { error: 'Internal English GET error' },
        ),
      });
    },
  );

  return {
    setResponse(next: PromotionResponse) {
      current = next;
      getStatus = 200;
    },
    setGetError() {
      getStatus = 503;
    },
  };
}

async function openPanel(
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

  const receipt = page.locator('[data-qa-x-promotion-panel]');
  await expect(receipt).toBeVisible({ timeout: 10_000 });

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

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

  return panel;
}

async function auditPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');
  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt =
      root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

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

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow ' +
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
      issues.push('panel escapes receipt width');
    }

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped ' +
              el.scrollWidth +
              '>' +
              el.clientWidth +
              ' ' +
              (el.textContent ?? '').slice(0, 60),
          );
        }
        if (
          rect.left < rootBox.left - 2 ||
          rect.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    const heading = root.querySelector<HTMLElement>(
      '.promotionHeading strong',
    )?.getBoundingClientRect();
    const amount = root.querySelector<HTMLElement>(
      '.promotionHeading span',
    )?.getBoundingClientRect();
    if (
      heading &&
      amount &&
      Math.min(heading.right, amount.right) -
        Math.max(heading.left, amount.left) > 2 &&
      Math.min(heading.bottom, amount.bottom) -
        Math.max(heading.top, amount.top) > 2
    ) {
      issues.push('heading overlaps amount');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow ' + viewportOverflow);
    }

    const input = root.querySelector<HTMLElement>(
      '.promotionSubmit input',
    );
    const button = root.querySelector<HTMLElement>(
      '.promotionSubmit button',
    );

    return {
      locale,
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: getComputedStyle(
        root.querySelector<HTMLElement>(
          '.promotionHeading span',
        )!,
      ).direction,
      shareAmountDirection: root.querySelector<HTMLElement>(
        '.promotionShare b',
      )
        ? getComputedStyle(
            root.querySelector<HTMLElement>(
              '.promotionShare b',
            )!,
          ).direction
        : null,
      inputDirection: input
        ? getComputedStyle(input).direction
        : null,
      inputBottom: input?.getBoundingClientRect().bottom ?? null,
      buttonTop: button?.getBoundingClientRect().top ?? null,
    };
  });
}

for (const [index, locales] of SHARDS.entries()) {
  test(
    'X promotion manual locale layout shard ' + (index + 1),
    async ({ page }) => {
      await installPromotionRoute(page, MANUAL_OPEN);

      for (const locale of locales) {
        for (const viewport of [
          { width: 320, height: 568 },
          { width: 393, height: 852 },
        ]) {
          await openPanel(
            page,
            locale,
            viewport.width,
            viewport.height,
          );
          const report = await auditPanel(page, locale);

          expect(report.direction).toBe(
            isRtlLocale(locale) ? 'rtl' : 'ltr',
          );
          expect(report.amountDirection).toBe('ltr');
          expect(report.inputDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, viewport, report }),
          ).toEqual([]);

          expect(report.inputBottom).not.toBeNull();
          expect(report.buttonTop).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >=
              (report.inputBottom ?? 0) - 1,
          ).toBe(true);
        }
      }
    },
  );
}

test(
  'X promotion auto-connect locale layout',
  async ({ page }) => {
    const route = await installPromotionRoute(
      page,
      AUTO_DISCONNECTED,
    );

    for (const locale of HIGH_RISK_LOCALES) {
      await openPanel(page, locale, 320, 568);
      let report = await auditPanel(page, locale);
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(report.amountDirection).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({ locale, state: 'connect', report }),
      ).toEqual([]);
      await expect(page.locator('.promotionConnect')).toBeVisible();

      route.setResponse(AUTO_CONNECTED);
      await openPanel(page, locale, 320, 568);
      report = await auditPanel(page, locale);
      expect(
        report.issues,
        JSON.stringify({ locale, state: 'connected', report }),
      ).toEqual([]);
      expect(report.shareAmountDirection).toBe('ltr');
      await expect(
        page.locator('.promotionConnectState'),
      ).toBeVisible();

      route.setResponse(AUTO_GRACE);
      await openPanel(page, locale, 320, 568);
      report = await auditPanel(page, locale);
      expect(
        report.issues,
        JSON.stringify({ locale, state: 'grace', report }),
      ).toEqual([]);

      route.setResponse(AUTO_DISCONNECTED);
    }
  },
);

test(
  'X promotion standalone states wrap in high-risk locales',
  async ({ page }) => {
    const route = await installPromotionRoute(page, MANUAL_OPEN);

    for (const locale of HIGH_RISK_LOCALES) {
      route.setResponse({
        ...MANUAL_OPEN,
        promotion: null,
      });
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(
        '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' +
          locale,
        { waitUntil: 'domcontentloaded' },
      );
      const generic = page.locator('.genericShare');
      await expect(generic).toBeVisible({ timeout: 10_000 });
      expect(
        await generic.evaluate(
          (el) =>
            (el as HTMLElement).scrollWidth <=
            (el as HTMLElement).clientWidth + 2,
        ),
      ).toBe(true);

      route.setResponse({
        ...MANUAL_OPEN,
        promotion: null,
        promotionPending: true,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const preparing = page.locator('.promotionPreparing');
      await expect(preparing).toBeVisible({ timeout: 10_000 });
      expect(
        await preparing.evaluate(
          (el) =>
            (el as HTMLElement).scrollWidth <=
            (el as HTMLElement).clientWidth + 2,
        ),
      ).toBe(true);

      route.setGetError();
      await page.reload({ waitUntil: 'domcontentloaded' });
      const status = page.locator('.promotionStatus');
      await expect(status).toBeVisible({ timeout: 10_000 });
      expect(
        await status.evaluate(
          (el) =>
            (el as HTMLElement).scrollWidth <=
            (el as HTMLElement).clientWidth + 2,
        ),
      ).toBe(true);

      route.setResponse(MANUAL_OPEN);
    }
  },
);

test(
  'X promotion submit errors stay localized and wrapped',
  async ({ page }) => {
    await installPromotionRoute(page, MANUAL_OPEN);
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

    for (const locale of HIGH_RISK_LOCALES) {
      await openPanel(page, locale, 320, 568);
      const input = page.locator('.promotionSubmit input');
      await input.fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await page.locator('.promotionSubmit button').click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const result = await error.evaluate((node) => {
        const el = node as HTMLElement;
        const panel =
          el.closest<HTMLElement>('.promotionPanel');
        const box = el.getBoundingClientRect();
        const panelBox = panel?.getBoundingClientRect() ?? null;
        return {
          clipped:
            el.scrollWidth > el.clientWidth + 2,
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
