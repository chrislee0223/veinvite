import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const PROMOTION = {
  inviteCode: 'QA-NOTI-22',
  state: 'OPEN',
  amountWei: '10000000000000000000',
  amountB3tr: '10',
  openedAt: '2026-10-22T00:00:00.000Z',
  postDeadlineAt: '2099-10-23T00:00:00.000Z',
  submissionGraceSeconds: 900,
  shareToken: '123e4567-e89b-42d3-a456-426614174000',
  submittedAt: null,
  verifyAfter: null,
  paidAt: null,
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

type PromotionApiState = {
  newOffersEnabled: boolean;
  promotionPending: boolean;
  xConnectAvailable: boolean;
  xConnected: boolean;
  xUrlLessEnabled: boolean;
  promotion: typeof PROMOTION | null;
};

function manualState(): PromotionApiState {
  return {
    newOffersEnabled: true,
    promotionPending: false,
    xConnectAvailable: true,
    xConnected: false,
    xUrlLessEnabled: false,
    promotion: PROMOTION,
  };
}

function automaticState(connected: boolean): PromotionApiState {
  return {
    newOffersEnabled: true,
    promotionPending: false,
    xConnectAvailable: true,
    xConnected: connected,
    xUrlLessEnabled: true,
    promotion: PROMOTION,
  };
}

async function installState(
  page: Page,
  state: PromotionApiState,
) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state),
      });
    },
  );
}

async function openPanel(
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

async function inspectPanel(page: Page) {
  return page.locator('.promotionPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const box = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;

    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel-overflow:' + root.scrollWidth + '>' + root.clientWidth,
      );
    }

    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('panel-outside-receipt');
    }

    for (const selector of [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionConnect',
      '.promotionSubmit button',
      '.promotionError',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() || el.getClientRects().length === 0) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              '-clipped:' +
              (el.textContent ?? '').slice(0, 50),
          );
        }
        if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
          issues.push(selector + '-outside-panel');
        }
      }
    }

    if (
      overlaps(
        box('.promotionHeading strong'),
        box('.promotionHeading span'),
      )
    ) {
      issues.push('heading-overlaps-amount');
    }

    if (
      overlaps(
        box('.promotionSubmit input'),
        box('.promotionSubmit button'),
      )
    ) {
      issues.push('input-overlaps-button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport-overflow:' + viewportOverflow);
    }

    const direction = getComputedStyle(root).direction;
    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    const shareAmount = root.querySelector<HTMLElement>('.promotionShare b');
    const input = root.querySelector<HTMLElement>('.promotionSubmit input');
    const connect = root.querySelector<HTMLElement>('.promotionConnect');

    return {
      issues,
      direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
      shareAmountDirection: shareAmount
        ? getComputedStyle(shareAmount).direction
        : null,
      inputDirection: input ? getComputedStyle(input).direction : null,
      connectDirection: connect ? getComputedStyle(connect).direction : null,
      inputBox: input?.getBoundingClientRect().toJSON() ?? null,
      buttonBox:
        root
          .querySelector<HTMLElement>('.promotionSubmit button')
          ?.getBoundingClientRect()
          .toJSON() ?? null,
    };
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
] as const) {
  test(
    'manual X promotion layout / all locales / ' + viewport.width + 'px',
    async ({ page }) => {
      await installState(page, manualState());

      for (const locale of SUPPORTED_LOCALES) {
        await openPanel(
          page,
          locale,
          viewport.width,
          viewport.height,
        );
        const report = await inspectPanel(page);

        expect(
          report.direction,
          JSON.stringify({ locale, viewport, report }),
        ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, viewport, report }),
        ).toEqual([]);

        expect(report.inputBox).not.toBeNull();
        expect(report.buttonBox).not.toBeNull();
        expect(
          (report.buttonBox?.top ?? 0) >=
            (report.inputBox?.bottom ?? 0) - 1,
          JSON.stringify({ locale, viewport, report }),
        ).toBe(true);
      }
    },
  );
}

test('automatic X connection layout / high-risk locales', async ({ page }) => {
  for (const locale of HIGH_RISK_LOCALES) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installState(page, automaticState(false));
    await openPanel(page, locale, 320, 568);

    const connect = page.locator('.promotionConnect');
    await expect(connect).toBeVisible();
    const disconnected = await inspectPanel(page);
    expect(disconnected.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(disconnected.connectDirection).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(
      disconnected.issues,
      JSON.stringify({ locale, disconnected }),
    ).toEqual([]);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installState(page, automaticState(true));
    await openPanel(page, locale, 320, 568);

    await expect(page.locator('.promotionConnectState')).toBeVisible();
    await expect(page.locator('.promotionShare')).toBeVisible();
    const connected = await inspectPanel(page);
    expect(connected.direction).toBe(
      isRtlLocale(locale) ? 'rtl' : 'ltr',
    );
    expect(connected.shareAmountDirection).toBe('ltr');
    expect(
      connected.issues,
      JSON.stringify({ locale, connected }),
    ).toEqual([]);
  }
});

test('localized submit errors never expose raw English API errors', async ({ page }) => {
  await installState(page, manualState());
  await page.route(
    '**/api/rewards/x-promotion/submit',
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal English error that must not render.',
        }),
      });
    },
  );

  for (const locale of HIGH_RISK_LOCALES) {
    await openPanel(page, locale, 320, 568);
    await page
      .locator('.promotionSubmit input')
      .fill('https://x.com/test/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      rewardXPromotionSubmitError(locale, 409),
    );
    await expect(error).not.toContainText(
      'Internal English error that must not render.',
    );

    const report = await inspectPanel(page);
    expect(
      report.issues,
      JSON.stringify({ locale, report }),
    ).toEqual([]);
  }
});
