import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const NARROW = { width: 320, height: 740 };
const MOBILE = { width: 393, height: 852 };
const DESKTOP = { width: 1280, height: 900 };

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

const QA_INVITE_CODE = 'QA-NOTI-22';

function promotionResponse({
  state = 'OPEN',
  auto = false,
  connected = false,
}: {
  state?: 'OPEN' | 'SUBMISSION_GRACE';
  auto?: boolean;
  connected?: boolean;
}) {
  return {
    newOffersEnabled: true,
    promotionPending: false,
    xConnectAvailable: true,
    xConnected: connected,
    xUrlLessEnabled: auto,
    promotion: {
      inviteCode: QA_INVITE_CODE,
      state,
      amountWei: '10000000000000000000',
      amountB3tr: '10',
      openedAt: '2026-10-18T00:00:00.000Z',
      postDeadlineAt: '2099-10-18T00:00:00.000Z',
      submissionGraceSeconds: 900,
      shareToken: '123e4567-e89b-42d3-a456-426614174000',
      submittedAt: null,
      verifyAfter: null,
      paidAt: null,
    },
  };
}

async function routePromotionState(
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

async function openReceipt(
  page: Page,
  locale: SupportedLocale,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const receiptAction = page.locator('.notificationReceiptAction').first();
  await expect(receiptAction).toBeVisible({ timeout: 10_000 });
  await receiptAction.click();

  const receipt = page.locator('.notificationReceiptView');
  await expect(receipt).toBeVisible({ timeout: 10_000 });

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

  return receipt;
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
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'promotion panel horizontal overflow: ' +
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
      '.promotionConnect',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionError',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              el.scrollWidth +
              '>' +
              el.clientWidth,
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
      issues.push('viewport horizontal overflow: ' + viewportOverflow);
    }

    const text = root.textContent ?? '';
    if (/\bundefined\b|\[missing translation\]|\{\{[^}]+\}\}/i.test(text)) {
      issues.push('unresolved translation');
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionHeading span')!,
        ).direction,
      shareAmountDirection:
        root.querySelector<HTMLElement>('.promotionShare b')
          ? getComputedStyle(
              root.querySelector<HTMLElement>('.promotionShare b')!,
            ).direction
          : null,
      inputDirection:
        root.querySelector<HTMLElement>('.promotionSubmit input')
          ? getComputedStyle(
              root.querySelector<HTMLElement>('.promotionSubmit input')!,
            ).direction
          : null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });

  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.amountDirection).toBe('ltr');
  if (report.shareAmountDirection) {
    expect(report.shareAmountDirection).toBe('ltr');
  }
  if (report.inputDirection) {
    expect(report.inputDirection).toBe('ltr');
  }
  expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);

  return report;
}

const LOCALE_SHARDS = Array.from({ length: 4 }, (_, shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

for (const [shardIndex, locales] of LOCALE_SHARDS.entries()) {
  test(
    'X promotion all locales narrow shard ' + (shardIndex + 1),
    async ({ page }) => {
      for (const locale of locales) {
        await routePromotionState(
          page,
          promotionResponse({}),
        );
        await openReceipt(page, locale, NARROW);
        const report = await auditPromotionPanel(page, locale);
        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
          JSON.stringify({ locale, report }),
        ).toBe(true);
        await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
      }
    },
  );

  test(
    'X promotion all locales mobile shard ' + (shardIndex + 1),
    async ({ page }) => {
      for (const locale of locales) {
        await routePromotionState(
          page,
          promotionResponse({}),
        );
        await openReceipt(page, locale, MOBILE);
        const report = await auditPromotionPanel(page, locale);
        expect(report.inputBottom).not.toBeNull();
        expect(report.buttonTop).not.toBeNull();
        expect(
          (report.buttonTop ?? 0) >= (report.inputBottom ?? 0) - 1,
          JSON.stringify({ locale, report }),
        ).toBe(true);
        await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
      }
    },
  );
}

test('X promotion high-risk automatic flow states', async ({ page }) => {
  for (const locale of HIGH_RISK_LOCALES) {
    for (const state of [
      { auto: true, connected: false, promotionState: 'OPEN' as const },
      { auto: true, connected: true, promotionState: 'OPEN' as const },
      { auto: true, connected: true, promotionState: 'SUBMISSION_GRACE' as const },
    ]) {
      await routePromotionState(
        page,
        promotionResponse({
          auto: state.auto,
          connected: state.connected,
          state: state.promotionState,
        }),
      );
      await openReceipt(page, locale, NARROW);
      await auditPromotionPanel(page, locale);
      await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
    }
  }
});

test('X promotion high-risk constrained desktop receipt', async ({ page }) => {
  for (const locale of HIGH_RISK_LOCALES) {
    await routePromotionState(
      page,
      promotionResponse({}),
    );
    await openReceipt(page, locale, DESKTOP);
    await auditPromotionPanel(page, locale);
    await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
  }
});

test('X promotion errors stay localized and contained', async ({ page }) => {
  for (const locale of HIGH_RISK_LOCALES) {
    await routePromotionState(
      page,
      promotionResponse({}),
    );
    await page.route(
      /\/api\/rewards\/x-promotion\/submit$/,
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

    await openReceipt(page, locale, NARROW);
    const input = page.locator('.promotionSubmit input');
    const button = page.locator('.promotionSubmit button');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await button.click();

    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(
      'INTERNAL ENGLISH ERROR MUST NOT RENDER',
    );

    const errorReport = await error.evaluate((node) => {
      const el = node as HTMLElement;
      const panel = el.closest<HTMLElement>('.promotionPanel');
      const box = el.getBoundingClientRect();
      const panelBox = panel?.getBoundingClientRect() ?? null;
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
        outside: Boolean(
          panelBox &&
          (box.left < panelBox.left - 2 || box.right > panelBox.right + 2),
        ),
      };
    });
    expect(errorReport, JSON.stringify({ locale, errorReport })).toEqual({
      clipped: false,
      outside: false,
    });

    await page.unroute(/\/api\/rewards\/x-promotion\/submit$/);
    await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
  }
});


async function auditStandaloneSurface(
  page: Page,
  locale: SupportedLocale,
  selector: '.genericShare' | '.promotionPreparing' | '.promotionStatus',
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();

  const report = await surface.evaluate((node) => {
    const el = node as HTMLElement;
    const receipt = el.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;
    const box = el.getBoundingClientRect();
    const issues: string[] = [];

    if (el.scrollWidth > el.clientWidth + 2) {
      issues.push(
        'standalone surface clipped: ' +
          el.scrollWidth +
          '>' +
          el.clientWidth,
      );
    }

    if (
      receiptBox &&
      (box.left < receiptBox.left - 2 ||
        box.right > receiptBox.right + 2)
    ) {
      issues.push('standalone surface outside receipt');
    }

    for (const child of el.querySelectorAll<HTMLElement>('span,button')) {
      if (!child.textContent?.trim() || child.getClientRects().length === 0) {
        continue;
      }
      const childBox = child.getBoundingClientRect();
      if (child.scrollWidth > child.clientWidth + 2) {
        issues.push(
          'standalone child clipped: ' +
            (child.textContent ?? '').slice(0, 48),
        );
      }
      if (
        childBox.left < box.left - 2 ||
        childBox.right > box.right + 2
      ) {
        issues.push('standalone child outside surface');
      }
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(el).direction,
    };
  });

  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.issues, JSON.stringify({ locale, selector, report })).toEqual([]);
}

test('X promotion standalone states fit risky locales', async ({ page }) => {
  for (const locale of HIGH_RISK_LOCALES) {
    await routePromotionState(page, {
      newOffersEnabled: true,
      promotionPending: false,
      promotion: null,
    });
    await openReceipt(page, locale, NARROW);
    await auditStandaloneSurface(page, locale, '.genericShare');
    await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);

    await routePromotionState(page, {
      newOffersEnabled: true,
      promotionPending: true,
      promotion: null,
    });
    await openReceipt(page, locale, NARROW);
    await auditStandaloneSurface(page, locale, '.promotionPreparing');
    await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);

    await routePromotionState(
      page,
      { error: 'INTERNAL ENGLISH ERROR MUST NOT RENDER' },
      503,
    );
    await openReceipt(page, locale, NARROW);
    await auditStandaloneSurface(page, locale, '.promotionStatus');
    await expect(page.locator('.promotionStatus')).not.toContainText(
      'INTERNAL ENGLISH ERROR MUST NOT RENDER',
    );
    await page.unroute(/\/api\/rewards\/x-promotion(?:\?.*)?$/);
  }
});
