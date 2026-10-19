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
    inviteCode: 'QA-X-PROMO-I18N',
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

const HIGH_RISK: SupportedLocale[] = [
  'ar',
  'ur',
  'arz',
  'de',
  'el',
  'te',
  'sw',
  'ro',
];

type QaMode =
  | 'open'
  | 'generic'
  | 'preparing'
  | 'load-error';

type QaSurface =
  | 'promotion'
  | 'receipt';

async function installRoutes(
  page: Page,
  mode: QaMode,
) {
  await page
    .unroute(/\/api\/rewards\/x-promotion(?:\/submit)?(?:\?.*)?$/)
    .catch(() => undefined);

  await page.route(
    /\/api\/rewards\/x-promotion\/submit(?:\?.*)?$/,
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

  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      if (mode === 'load-error') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'QA unavailable' }),
        });
        return;
      }

      const body =
        mode === 'open'
          ? OPEN_PROMOTION
          : mode === 'preparing'
            ? {
                newOffersEnabled: true,
                promotionPending: true,
                promotion: null,
              }
            : {
                newOffersEnabled: true,
                promotionPending: false,
                promotion: null,
              };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );
}

async function gotoQa(
  page: Page,
  locale: SupportedLocale,
  viewport: { width: number; height: number },
  mode: QaMode,
  surface: QaSurface = 'promotion',
) {
  await installRoutes(page, mode);
  await page.setViewportSize(viewport);
  await page.goto(
    '/qa/x-promotion-i18n?locale=' +
      encodeURIComponent(locale) +
      (surface === 'receipt' ? '&mode=receipt' : ''),
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
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

async function inspectOpenPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const shell = root.closest<HTMLElement>('[data-qa-x-promotion-shell]');
    const shellBox = shell?.getBoundingClientRect() ?? null;
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

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('panel horizontal overflow');
    }

    if (
      shellBox &&
      (rootBox.left < shellBox.left - 2 ||
        rootBox.right > shellBox.right + 2)
    ) {
      issues.push('panel escapes QA shell');
    }

    for (const selector of [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit input',
      '.promotionSubmit button',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clipped');
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
      issues.push('input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow');
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionHeading span')!,
      ).direction,
      shareAmountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionShare b')!,
      ).direction,
      inputDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionSubmit input')!,
      ).direction,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

async function inspectStandalone(
  page: Page,
  selector: string,
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });

  return surface.evaluate((node) => {
    const el = node as HTMLElement;
    const box = el.getBoundingClientRect();
    const shell = el.closest<HTMLElement>('[data-qa-x-promotion-shell]');
    const shellBox = shell?.getBoundingClientRect() ?? null;
    return {
      clipped: el.scrollWidth > el.clientWidth + 2,
      outside: Boolean(
        shellBox &&
        (box.left < shellBox.left - 2 ||
          box.right > shellBox.right + 2),
      ),
      viewportOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth,
      direction: getComputedStyle(el).direction,
    };
  });
}



async function inspectReceipt(page: Page) {
  const receipt = page.locator('.notificationReceiptView');
  await expect(receipt).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.genericShare')).toBeVisible({
    timeout: 10_000,
  });

  return receipt.evaluate((node) => {
    const root = node as HTMLElement;
    const rootBox = root.getBoundingClientRect();
    const shell = root.closest<HTMLElement>(
      '[data-qa-x-promotion-shell]',
    );
    const shellBox = shell?.getBoundingClientRect() ?? null;
    const issues: string[] = [];

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('receipt horizontal overflow');
    }

    if (
      shellBox &&
      (rootBox.left < shellBox.left - 2 ||
        rootBox.right > shellBox.right + 2)
    ) {
      issues.push('receipt escapes QA shell');
    }

    for (const selector of [
      '.notificationReceiptHero p',
      '.notificationReceiptFacts dt',
      '.notificationReceiptFacts dd',
      '.notificationExplorerLink',
      '.notificationExplorerLink span',
      '.genericShare',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clipped');
        }
        if (
          box.left < rootBox.left - 2 ||
          box.right > rootBox.right + 2
        ) {
          issues.push(selector + ' outside receipt');
        }
      }
    }

    for (const row of root.querySelectorAll<HTMLElement>(
      '.notificationReceiptFacts > div',
    )) {
      const label = row.querySelector<HTMLElement>('dt');
      const value = row.querySelector<HTMLElement>('dd');
      if (!label || !value) continue;
      const a = label.getBoundingClientRect();
      const b = value.getBoundingClientRect();
      const horizontalOverlap =
        Math.min(a.right, b.right) -
        Math.max(a.left, b.left);
      const verticalOverlap =
        Math.min(a.bottom, b.bottom) -
        Math.max(a.top, b.top);
      if (horizontalOverlap > 2 && verticalOverlap > 2) {
        issues.push('receipt fact label overlaps value');
      }
    }

    const amount = root.querySelector<HTMLElement>(
      '.notificationReceiptAmount',
    );
    const factValues = [
      ...root.querySelectorAll<HTMLElement>(
        '.notificationReceiptFacts dd',
      ),
    ];

    const viewportOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow');
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection: amount
        ? getComputedStyle(amount).direction
        : null,
      factDirections: factValues.map(
        (value) => getComputedStyle(value).direction,
      ),
    };
  });
}

const SHARDS = Array.from({ length: 4 }, (_, shard) =>
  SUPPORTED_LOCALES.filter((_, index) => index % 4 === shard),
);

for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
] as const) {
  SHARDS.forEach((locales, shard) => {
    test(
      'X promotion locales shard ' +
        (shard + 1) +
        ' / ' +
        viewport.width +
        'px',
      async ({ page }) => {
        for (const locale of locales) {
          await gotoQa(page, locale, viewport, 'open');
          const report = await inspectOpenPanel(page);

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

          if (viewport.width <= 430) {
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
  });
}

test('X promotion high-risk standalone states', async ({ page }) => {
  for (const locale of HIGH_RISK) {
    for (const [mode, selector] of [
      ['generic', '.genericShare'],
      ['preparing', '.promotionPreparing'],
      ['load-error', '.promotionStatus'],
    ] as const) {
      await gotoQa(
        page,
        locale,
        { width: 320, height: 568 },
        mode,
      );
      const report = await inspectStandalone(page, selector);
      expect(report.direction).toBe(
        isRtlLocale(locale) ? 'rtl' : 'ltr',
      );
      expect(
        report,
        JSON.stringify({ locale, mode, report }),
      ).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
        direction: isRtlLocale(locale) ? 'rtl' : 'ltr',
      });
    }
  }
});

test('X promotion submit errors stay localized and inside mobile layout', async ({ page }) => {
  for (const locale of HIGH_RISK) {
    await gotoQa(
      page,
      locale,
      { width: 320, height: 568 },
      'open',
    );

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
      'This English internal error must never render.',
    );

    const report = await error.evaluate((node) => {
      const el = node as HTMLElement;
      const box = el.getBoundingClientRect();
      const panel = el.closest<HTMLElement>('.promotionPanel');
      const panelBox = panel?.getBoundingClientRect() ?? null;
      return {
        clipped: el.scrollWidth > el.clientWidth + 2,
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
      report,
      JSON.stringify({ locale, report }),
    ).toEqual({
      clipped: false,
      outside: false,
      viewportOverflow: 0,
    });
  }
});


for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
] as const) {
  SHARDS.forEach((locales, shard) => {
    test(
      'Reward receipt locales shard ' +
        (shard + 1) +
        ' / ' +
        viewport.width +
        'px',
      async ({ page }) => {
        for (const locale of locales) {
          await gotoQa(
            page,
            locale,
            viewport,
            'generic',
            'receipt',
          );
          const report = await inspectReceipt(page);

          expect(report.direction).toBe(
            isRtlLocale(locale) ? 'rtl' : 'ltr',
          );
          expect(report.amountDirection).toBe('ltr');
          expect(report.factDirections.length).toBe(3);
          expect(
            report.factDirections.every(
              (direction) => direction === 'ltr',
            ),
          ).toBe(true);
          expect(
            report.issues,
            JSON.stringify({ locale, viewport, report }),
          ).toEqual([]);
        }
      },
    );
  });
}
