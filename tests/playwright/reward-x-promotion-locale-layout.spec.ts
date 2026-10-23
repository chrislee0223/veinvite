import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

type PromotionMock = {
  newOffersEnabled: boolean;
  promotionPending: boolean;
  xConnectAvailable: boolean;
  xConnected: boolean;
  xUrlLessEnabled: boolean;
  promotion: {
    inviteCode: string;
    state: 'OPEN' | 'SUBMISSION_GRACE';
    amountWei: string;
    amountB3tr: string;
    openedAt: string;
    postDeadlineAt: string;
    submissionGraceSeconds: number;
    shareToken: string;
    submittedAt: null;
    verifyAfter: null;
    paidAt: null;
  };
};

const MANUAL_OPEN: PromotionMock = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-23T00:00:00.000Z',
    postDeadlineAt: '2099-10-24T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
};

const AUTO_CONNECTED: PromotionMock = {
  ...MANUAL_OPEN,
  xConnected: true,
  xUrlLessEnabled: true,
};

const AUTO_UNCONNECTED: PromotionMock = {
  ...MANUAL_OPEN,
  xConnected: false,
  xUrlLessEnabled: true,
};

const HIGH_RISK_LOCALES = [
  'ar',
  'arz',
  'ur',
  'hi',
  'bn',
  'mr',
  'te',
  'de',
  'el',
] as const satisfies readonly SupportedLocale[];

const LOCALE_SHARDS = [0, 1, 2, 3].map((shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

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

async function openPromotionPanel(
  page: Page,
  locale: SupportedLocale,
  state: PromotionMock,
) {
  let currentState = state;

  await page.route(
    /\/api\/rewards\/x-promotion\?inviteCode=/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState),
      });
    },
  );

  const setState = (next: PromotionMock) => {
    currentState = next;
  };

  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );

  await expect(
    page.locator('[data-qa-notification-ready="true"]'),
  ).toBeAttached({ timeout: 10_000 });

  const history = page.locator('.notificationHistoryPanel');
  await expect(history).toBeVisible();

  const row = page.locator('button.notificationHistoryRow').first();
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('.notificationReceiptView')).toBeVisible();

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();
  await waitForFonts(page);

  return { panel, setState };
}

async function layoutReport(page: Page) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (left: DOMRect | null, right: DOMRect | null) =>
      Boolean(
        left &&
        right &&
        Math.min(left.right, right.right) - Math.max(left.left, right.left) > 2 &&
        Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 2,
      );

    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

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
      issues.push('panel escapes receipt');
    }

    const selectors = [
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
    ];

    for (const selector of selectors) {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) {
        if (!element.textContent?.trim() && element.tagName !== 'INPUT') continue;
        if (element.getClientRects().length === 0) continue;
        const bounds = element.getBoundingClientRect();
        if (element.scrollWidth > element.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped ' +
              element.scrollWidth +
              '>' +
              element.clientWidth,
          );
        }
        if (
          bounds.left < rootBox.left - 2 ||
          bounds.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside panel');
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
      issues.push('viewport horizontal overflow ' + viewportOverflow);
    }

    const text = root.textContent ?? '';
    if (/\bundefined\b|\[missing translation\]|\{\{[^}]+\}\}/i.test(text)) {
      issues.push('unresolved translation');
    }

    const input = rect('.promotionSubmit input');
    const submit = rect('.promotionSubmit button');

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
      inputBottom: input?.bottom ?? null,
      submitTop: submit?.top ?? null,
    };
  });
}

for (const [shardIndex, locales] of LOCALE_SHARDS.entries()) {
  test('X promotion manual layout shard ' + (shardIndex + 1), async ({ page }) => {
    test.setTimeout(120_000);

    for (const locale of locales) {
      await page.setViewportSize({ width: 320, height: 740 });
      await openPromotionPanel(page, locale, MANUAL_OPEN);

      for (const width of [320, 393]) {
        await page.setViewportSize({ width, height: width === 320 ? 740 : 852 });
        await waitForFonts(page);
        const report = await layoutReport(page);

        expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, width, report }),
        ).toEqual([]);

        // The narrow mobile layout deliberately stacks the URL and action.
        expect(report.inputBottom).not.toBeNull();
        expect(report.submitTop).not.toBeNull();
        expect((report.submitTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(
          true,
        );
      }

      await page.unroute(/\/api\/rewards\/x-promotion\?inviteCode=/);
    }
  });
}

test('X automatic flow keeps connect and connected states readable', async ({ page }) => {
  test.setTimeout(90_000);

  for (const locale of HIGH_RISK_LOCALES) {
    await page.setViewportSize({ width: 320, height: 740 });
    await openPromotionPanel(page, locale, AUTO_UNCONNECTED);

    await expect(page.locator('.promotionConnect')).toBeVisible();
    await expect(page.locator('.promotionShare')).toHaveCount(0);

    let report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.issues, JSON.stringify({ locale, mode: 'connect', report })).toEqual([]);

    await page.unroute(/\/api\/rewards\/x-promotion\?inviteCode=/);

    await openPromotionPanel(page, locale, AUTO_CONNECTED);
    await expect(page.locator('.promotionConnectState')).toBeVisible();
    await expect(page.locator('.promotionShare')).toBeVisible();

    report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.amountDirection).toBe('ltr');
    expect(report.shareAmountDirection).toBe('ltr');
    expect(report.issues, JSON.stringify({ locale, mode: 'connected', report })).toEqual([]);

    await page.unroute(/\/api\/rewards\/x-promotion\?inviteCode=/);
  }
});

test('X submit errors stay localized and inside the mobile receipt', async ({ page }) => {
  test.setTimeout(90_000);

  for (const locale of HIGH_RISK_LOCALES) {
    await page.route(
      '**/api/rewards/x-promotion/submit',
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This English internal API error must never render.',
          }),
        });
      },
    );

    await page.setViewportSize({ width: 320, height: 740 });
    await openPromotionPanel(page, locale, MANUAL_OPEN);

    const input = page.locator('.promotionSubmit input');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      rewardXPromotionSubmitError(locale, 409),
    );
    await expect(error).not.toContainText('English internal API error');

    const report = await layoutReport(page);
    expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
    expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);

    await page.unroute('**/api/rewards/x-promotion/submit');
    await page.unroute(/\/api\/rewards\/x-promotion\?inviteCode=/);
  }
});
