import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const NARROW = { width: 320, height: 740 };
const MOBILE = { width: 393, height: 852 };

const HIGH_RISK_LOCALES = [
  'ar',
  'ur',
  'arz',
  'de',
  'te',
  'el',
] as const satisfies readonly SupportedLocale[];

type Scenario =
  | 'open'
  | 'connected'
  | 'generic'
  | 'preparing'
  | 'load-error';

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xConnected: false,
  promotion: {
    inviteCode: 'qa-reward-invite-code',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-21T00:00:00.000Z',
    postDeadlineAt: '2099-10-22T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

function responseFor(scenario: Scenario) {
  if (scenario === 'connected') {
    return { ...OPEN_PROMOTION, xConnected: true };
  }
  if (scenario === 'generic') {
    return {
      newOffersEnabled: true,
      promotionPending: false,
      xConnectAvailable: true,
      xConnected: false,
      promotion: null,
    };
  }
  if (scenario === 'preparing') {
    return {
      newOffersEnabled: true,
      promotionPending: true,
      xConnectAvailable: true,
      xConnected: false,
      promotion: null,
    };
  }
  return OPEN_PROMOTION;
}

async function installPromotionRoutes(
  page: Page,
  scenarioRef: { current: Scenario },
) {
  await page.route('**/api/rewards/x-promotion**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/submit')) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'This English internal error must never render.',
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/x-connect/start')) {
      await route.abort();
      return;
    }

    if (scenarioRef.current === 'load-error') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'QA unavailable' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseFor(scenarioRef.current)),
    });
  });
}

async function openReceipt(
  page: Page,
  locale: SupportedLocale,
) {
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const row = page.locator('.notificationHistoryRow').first();
  await expect(row).toBeVisible();
  await row.click();

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
}

async function promotionLayoutReport(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
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
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const bounds = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              el.scrollWidth +
              '>' +
              el.clientWidth,
          );
        }
        if (
          bounds.left < rootBox.left - 2 ||
          bounds.right > rootBox.right + 2
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

    if (
      overlaps(
        rect('.promotionSubmit input'),
        rect('.promotionSubmit button'),
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
      issues.push('viewport overflows horizontally: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionHeading span')!,
        ).direction,
      shareAmountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionShare b')!,
        ).direction,
      inputDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>('.promotionSubmit input')!,
        ).direction,
      inputBottom:
        rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop:
        rect('.promotionSubmit button')?.top ?? null,
    };
  });
}

async function standaloneLayoutReport(
  page: Page,
  selector: '.genericShare' | '.promotionPreparing' | '.promotionStatus',
) {
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
      issues.push('standalone surface overflows horizontally');
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('standalone surface escapes receipt width');
    }

    for (const el of root.querySelectorAll<HTMLElement>('span,button')) {
      if (!el.textContent?.trim() || el.getClientRects().length === 0) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push('standalone child clipped: ' + el.textContent.slice(0, 40));
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

for (const locale of SUPPORTED_LOCALES) {
  test(
    'X promotion layout / ' + locale + ' / 320→393px',
    async ({ page }) => {
      const scenario = { current: 'open' as Scenario };
      await installPromotionRoutes(page, scenario);
      await page.setViewportSize(NARROW);
      await openReceipt(page, locale);

      for (const viewport of [NARROW, MOBILE]) {
        await page.setViewportSize(viewport);
        const report = await promotionLayoutReport(page);

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
    'X promotion high-risk states / ' + locale,
    async ({ page }) => {
      const scenario = { current: 'connected' as Scenario };
      await installPromotionRoutes(page, scenario);
      await page.setViewportSize(NARROW);
      await openReceipt(page, locale);

      const connected = await promotionLayoutReport(page);
      expect(connected.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(
        connected.issues,
        JSON.stringify({ locale, scenario: 'connected', connected }),
      ).toEqual([]);

      scenario.current = 'open';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openReceipt(page, locale);

      const input = page.locator('.promotionSubmit input');
      await input.fill('https://x.com/test/status/1234567890123456789');
      await page.locator('.promotionSubmit button').click();

      const error = page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );
      const errorReport = await promotionLayoutReport(page);
      expect(
        errorReport.issues,
        JSON.stringify({ locale, scenario: 'submit-error', errorReport }),
      ).toEqual([]);

      for (const state of [
        ['generic', '.genericShare'],
        ['preparing', '.promotionPreparing'],
        ['load-error', '.promotionStatus'],
      ] as const) {
        scenario.current = state[0];
        await page.reload({ waitUntil: 'domcontentloaded' });
        await openReceipt(page, locale);
        const report = await standaloneLayoutReport(page, state[1]);
        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(
          report.issues,
          JSON.stringify({ locale, scenario: state[0], report }),
        ).toEqual([]);
      }
    },
  );
}
