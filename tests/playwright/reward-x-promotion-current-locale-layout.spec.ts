import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

const MANUAL_OPEN = {
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
} as const;

const AUTO_CONNECTED = {
  ...MANUAL_OPEN,
  xConnected: true,
  xUrlLessEnabled: true,
} as const;

const AUTO_DISCONNECTED = {
  ...MANUAL_OPEN,
  xConnected: false,
  xUrlLessEnabled: true,
} as const;

const HIGH_RISK_LOCALES = [
  'ar',
  'arz',
  'ur',
  'de',
  'fr',
  'ro',
  'te',
  'sw',
  'el',
  'bn',
] as const satisfies readonly SupportedLocale[];

function shard<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push([...items.slice(index, index + size)]);
  }
  return result;
}

async function openReceiptPromotion(
  page: Page,
  locale: SupportedLocale,
  width: number,
  responseBody: unknown,
) {
  await page.unroute('**/api/rewards/x-promotion?*').catch(() => {});
  await page.route(
    '**/api/rewards/x-promotion?*',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
    },
  );

  await page.setViewportSize({ width, height: 852 });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );

  const receiptAction = page.locator('.notificationReceiptAction').first();
  await expect(receiptAction).toBeVisible({ timeout: 10_000 });
  await receiptAction.click();

  await expect(page.locator('.notificationReceiptView')).toBeVisible();
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

async function inspectPromotionPanel(
  panel: Locator,
) {
  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const visible = (selector: string) =>
      [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        const style = getComputedStyle(el);
        return (
          el.getClientRects().length > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      });

    const rect = (selector: string) =>
      visible(selector)[0]?.getBoundingClientRect() ?? null;

    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

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

    for (const selector of [
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
    ]) {
      for (const el of visible(selector)) {
        const value = el.textContent?.trim() ?? '';
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped ' +
              (value ? value.slice(0, 40) : ''),
          );
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
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

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: rect('.promotionHeading span')
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionHeading span')!,
          ).direction
        : null,
      shareAmountDirection: rect('.promotionShare b')
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionShare b')!,
          ).direction
        : null,
      inputDirection: rect('.promotionSubmit input')
        ? getComputedStyle(
            root.querySelector<HTMLElement>('.promotionSubmit input')!,
          ).direction
        : null,
      inputBottom: rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop: rect('.promotionSubmit button')?.top ?? null,
    };
  });
}

const manualShards = shard(SUPPORTED_LOCALES, 8);
manualShards.forEach((locales, shardIndex) => {
  test(
    'X promotion manual fallback all locales shard ' + (shardIndex + 1),
    async ({ page }) => {
      for (const locale of locales) {
        for (const width of [320, 393]) {
          const panel = await openReceiptPromotion(
            page,
            locale,
            width,
            MANUAL_OPEN,
          );
          const report = await inspectPromotionPanel(panel);

          expect(
            report.direction,
            JSON.stringify({ locale, width, report }),
          ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
          expect(report.amountDirection).toBe('ltr');
          expect(report.shareAmountDirection).toBe('ltr');
          expect(report.inputDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, width, report }),
          ).toEqual([]);

          // Under 430px the URL field and translated verify button stack.
          expect(report.inputBottom).not.toBeNull();
          expect(report.buttonTop).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
            JSON.stringify({ locale, width, report }),
          ).toBe(true);
        }
      }
    },
  );
});

for (const locale of HIGH_RISK_LOCALES) {
  test(
    'X promotion automatic verification layout / ' + locale,
    async ({ page }) => {
      for (const state of [AUTO_CONNECTED, AUTO_DISCONNECTED]) {
        for (const width of [320, 393, 1280]) {
          const panel = await openReceiptPromotion(
            page,
            locale,
            width,
            state,
          );
          const report = await inspectPromotionPanel(panel);
          expect(report.direction).toBe(
            isRtlLocale(locale) ? 'rtl' : 'ltr',
          );
          expect(report.amountDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, width, report }),
          ).toEqual([]);
        }
      }
    },
  );
}

for (const locale of ['ar', 'ur', 'de', 'te'] as const) {
  test(
    'X promotion localized manual error layout / ' + locale,
    async ({ page }) => {
      await page.route(
        '**/api/rewards/x-promotion/submit',
        async (route) => {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Internal English error must never render.',
            }),
          });
        },
      );

      const panel = await openReceiptPromotion(
        page,
        locale,
        320,
        MANUAL_OPEN,
      );
      const input = panel.locator('.promotionSubmit input');
      const button = panel.locator('.promotionSubmit button');

      await input.fill(
        'https://x.com/example/status/1234567890123456789',
      );
      await button.click();

      const error = panel.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(locale, 409),
      );
      await expect(error).not.toContainText('Internal English error');

      const report = await inspectPromotionPanel(panel);
      expect(
        report.issues,
        JSON.stringify({ locale, report }),
      ).toEqual([]);
    },
  );
}
