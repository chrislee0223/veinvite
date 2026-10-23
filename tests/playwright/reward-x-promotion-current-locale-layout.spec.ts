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
  'te',
  'de',
  'el',
  'ro',
  'bn',
  'ko',
] as const satisfies readonly SupportedLocale[];

const LOCALE_SHARDS = [
  SUPPORTED_LOCALES.slice(0, 8),
  SUPPORTED_LOCALES.slice(8, 15),
  SUPPORTED_LOCALES.slice(15, 22),
  SUPPORTED_LOCALES.slice(22),
] as const;

function promotion(state = 'OPEN') {
  return {
    inviteCode: 'QA-NOTI-22',
    state,
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-23T00:00:00.000Z',
    postDeadlineAt: '2099-10-24T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: state === 'PAID' ? '2026-10-23T01:00:00.000Z' : null,
  };
}

const AUTO_CONNECTED = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: true,
  xUrlLessEnabled: true,
  promotion: promotion('OPEN'),
};

async function installPromotionMock(
  page: Page,
  getState: () => { status: number; body: unknown },
) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      const state = getState();
      await route.fulfill({
        status: state.status,
        contentType: 'application/json',
        body: JSON.stringify(state.body),
      });
    },
  );
}

async function openQa(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-PANEL&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await expect(page.locator('.notificationReceiptView')).toBeVisible();
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
}

async function auditPromotionPanel(
  page: Page,
  locale: SupportedLocale,
) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const receipt = root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    const issues: string[] = [];

    const visible = (el: HTMLElement) =>
      Boolean(el.textContent?.trim()) && el.getClientRects().length > 0;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('promotion panel horizontal overflow');
    }

    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('promotion panel escapes receipt');
    }

    for (const el of root.querySelectorAll<HTMLElement>(
      'strong,span,p,button,input,b',
    )) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push(
          'clipped: ' +
            el.className +
            ' / ' +
            (el.textContent ?? '').slice(0, 56),
        );
      }
      if (rect.left < rootBox.left - 2 || rect.right > rootBox.right + 2) {
        issues.push('outside panel: ' + el.className);
      }
    }

    const explorer = receipt?.querySelector<HTMLElement>(
      '.notificationExplorerLink',
    );
    if (explorer && explorer.scrollWidth > explorer.clientWidth + 2) {
      issues.push('explorer link clipped');
    }

    const title = root.querySelector<HTMLElement>('.promotionHeading strong');
    const amount = root.querySelector<HTMLElement>('.promotionHeading span');
    if (title && amount) {
      const a = title.getBoundingClientRect();
      const b = amount.getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) {
        issues.push('title overlaps amount');
      }
    }

    const documentOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (documentOverflow > 1) {
      issues.push('viewport horizontal overflow: ' + documentOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount ? getComputedStyle(amount).direction : null,
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
    };
  });

  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.amountDirection).toBe('ltr');
  if (report.shareAmountDirection !== null) {
    expect(report.shareAmountDirection).toBe('ltr');
  }
  if (report.inputDirection !== null) {
    expect(report.inputDirection).toBe('ltr');
  }
  expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
}

async function auditStandalone(
  page: Page,
  selector: string,
  locale: SupportedLocale,
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();

  const report = await surface.evaluate((node) => {
    const el = node as HTMLElement;
    const box = el.getBoundingClientRect();
    const receipt = el.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    return {
      direction: getComputedStyle(el).direction,
      clipped: el.scrollWidth > el.clientWidth + 2,
      outside: Boolean(
        receiptBox &&
          (box.left < receiptBox.left - 2 ||
            box.right > receiptBox.right + 2),
      ),
      viewportOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth,
    };
  });

  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.clipped).toBe(false);
  expect(report.outside).toBe(false);
  expect(report.viewportOverflow).toBe(0);
}

for (const width of [320, 393] as const) {
  for (let shardIndex = 0; shardIndex < LOCALE_SHARDS.length; shardIndex += 1) {
    test(
      'automatic X promotion layout / ' +
        width +
        'px / shard ' +
        (shardIndex + 1),
      async ({ page }) => {
        let current = { status: 200, body: AUTO_CONNECTED as unknown };
        await installPromotionMock(page, () => current);

        for (const locale of LOCALE_SHARDS[shardIndex]) {
          current = { status: 200, body: AUTO_CONNECTED };
          await openQa(page, locale, width, 780);
          await auditPromotionPanel(page, locale);
          await expect(page.locator('.promotionConnectState')).toBeVisible();
        }
      },
    );
  }
}

for (const locale of HIGH_RISK_LOCALES) {
  test('X promotion state matrix / ' + locale, async ({ page }) => {
    let current: { status: number; body: unknown } = {
      status: 200,
      body: AUTO_CONNECTED,
    };

    await installPromotionMock(page, () => current);

    current = {
      status: 200,
      body: {
        ...AUTO_CONNECTED,
        xConnected: false,
      },
    };
    await openQa(page, locale, 320, 740);
    await auditPromotionPanel(page, locale);
    await expect(page.locator('.promotionConnect')).toBeVisible();

    current = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: false,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: promotion('OPEN'),
      },
    };
    await openQa(page, locale, 320, 740);
    await auditPromotionPanel(page, locale);
    const input = page.locator('.promotionSubmit input');
    const verify = page.locator('.promotionSubmit button');
    await expect(input).toBeVisible();
    await expect(verify).toBeVisible();
    const inputBox = await input.boundingBox();
    const verifyBox = await verify.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(verifyBox).not.toBeNull();
    expect((verifyBox?.y ?? 0) >= (inputBox?.y ?? 0) + (inputBox?.height ?? 0) - 1)
      .toBe(true);

    current = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: true,
        xConnectAvailable: true,
        xConnected: true,
        xUrlLessEnabled: true,
        promotion: null,
      },
    };
    await openQa(page, locale, 320, 740);
    await auditStandalone(page, '.promotionPreparing', locale);

    current = {
      status: 503,
      body: { error: 'English internal state error' },
    };
    await openQa(page, locale, 320, 740);
    await auditStandalone(page, '.promotionStatus', locale);

    current = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: true,
        xConnected: true,
        xUrlLessEnabled: true,
        promotion: null,
      },
    };
    await openQa(page, locale, 320, 740);
    await auditStandalone(page, '.genericShare', locale);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  test('localized legacy submit error / ' + locale, async ({ page }) => {
    let current: { status: number; body: unknown } = {
      status: 200,
      body: {
        newOffersEnabled: true,
        promotionPending: false,
        xConnectAvailable: false,
        xConnected: false,
        xUrlLessEnabled: false,
        promotion: promotion('OPEN'),
      },
    };

    await installPromotionMock(page, () => current);
    await page.route(
      '**/api/rewards/x-promotion/submit',
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This English server error must never render.',
          }),
        });
      },
    );

    await openQa(page, locale, 320, 740);
    const input = page.locator('.promotionSubmit input');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(
      rewardXPromotionSubmitError(locale, 409),
    );
    await expect(error).not.toContainText(
      'This English server error must never render.',
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
      };
    });
    expect(report).toEqual({ clipped: false, outside: false });
  });
}
