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
    inviteCode: 'ABCDEFG',
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

const STANDALONE_RISK_LOCALES: SupportedLocale[] = [
  'ur',
  'ar',
  'te',
  'de',
];

const ERROR_RISK_LOCALES: SupportedLocale[] = [
  'ko',
  'de',
  'ar',
  'ur',
  'te',
];

const PROMOTION_ROUTE = '**/api/rewards/x-promotion*';

async function mockPromotionGet(
  page: Page,
  status: number,
  body: unknown,
) {
  await page.unroute(PROMOTION_ROUTE).catch(() => {});
  await page.route(
    PROMOTION_ROUTE,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (
        request.method() === 'GET' &&
        url.pathname === '/api/rewards/x-promotion'
      ) {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }

      await route.continue();
    },
  );
}

async function openQaPage(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/reward-x-promotion?locale=' +
      encodeURIComponent(locale),
    {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    },
  );

  const hydrated = page.locator(
    '[data-qa-x-promotion-hydrated]',
  );
  await expect(hydrated).toHaveAttribute(
    'data-qa-x-promotion-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.notificationReceiptView'),
  ).toBeVisible({ timeout: 10_000 });

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

async function openPromotionPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await mockPromotionGet(
    page,
    200,
    OPEN_PROMOTION,
  );
  await openQaPage(
    page,
    locale,
    width,
    height,
  );

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const box = (selector: string) =>
      root.querySelector<HTMLElement>(
        selector,
      )?.getBoundingClientRect() ?? null;
    const overlaps = (
      a: DOMRect | null,
      b: DOMRect | null,
    ) =>
      Boolean(
        a &&
          b &&
          Math.min(a.right, b.right) -
            Math.max(a.left, b.left) >
            2 &&
          Math.min(a.bottom, b.bottom) -
            Math.max(a.top, b.top) >
            2,
      );

    const rootBox = root.getBoundingClientRect();
    const receipt =
      root.closest<HTMLElement>(
        '.notificationReceiptView',
      );
    const receiptBox =
      receipt?.getBoundingClientRect() ?? null;

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
      issues.push(
        'promotion panel escapes receipt width',
      );
    }

    const selectors = [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionPanel p',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit input',
      '.promotionSubmit button',
    ];

    for (const selector of selectors) {
      for (const el of root.querySelectorAll<HTMLElement>(
        selector,
      )) {
        if (
          el.getClientRects().length === 0
        ) {
          continue;
        }

        const rect =
          el.getBoundingClientRect();

        if (
          el.scrollWidth >
          el.clientWidth + 2
        ) {
          issues.push(
            selector +
              ' clipped horizontally: ' +
              el.scrollWidth +
              '>' +
              el.clientWidth +
              ' ' +
              (el.textContent ?? '')
                .trim()
                .slice(0, 48),
          );
        }

        if (
          rect.left < rootBox.left - 2 ||
          rect.right > rootBox.right + 2
        ) {
          issues.push(
            selector +
              ' outside promotion panel',
          );
        }
      }
    }

    if (
      overlaps(
        box('.promotionHeading strong'),
        box('.promotionHeading span'),
      )
    ) {
      issues.push(
        'promotion title overlaps amount',
      );
    }

    const input = box(
      '.promotionSubmit input',
    );
    const button = box(
      '.promotionSubmit button',
    );

    if (overlaps(input, button)) {
      issues.push(
        'post URL input overlaps verify button',
      );
    }

    const viewportOverflow =
      Math.max(
        document.documentElement
          .scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    if (viewportOverflow > 1) {
      issues.push(
        'viewport overflows horizontally: ' +
          viewportOverflow,
      );
    }

    return {
      issues,
      direction:
        getComputedStyle(root).direction,
      amountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>(
            '.promotionHeading span',
          )!,
        ).direction,
      shareAmountDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>(
            '.promotionShare b',
          )!,
        ).direction,
      inputDirection:
        getComputedStyle(
          root.querySelector<HTMLElement>(
            '.promotionSubmit input',
          )!,
        ).direction,
      inputTop: input?.top ?? null,
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
      buttonBottom:
        button?.bottom ?? null,
    };
  });
}

async function inspectStandalone(
  page: Page,
  locale: SupportedLocale,
  selector:
    | '.genericShare'
    | '.promotionStatus'
    | '.promotionPreparing',
  status: number,
  body: unknown,
) {
  await mockPromotionGet(
    page,
    status,
    body,
  );
  await openQaPage(
    page,
    locale,
    320,
    568,
  );

  const surface =
    page.locator(selector);
  await expect(surface).toBeVisible({
    timeout: 10_000,
  });
  await surface.scrollIntoViewIfNeeded();

  return surface.evaluate((node) => {
    const el = node as HTMLElement;
    const issues: string[] = [];
    const box =
      el.getBoundingClientRect();
    const receipt =
      el.closest<HTMLElement>(
        '.notificationReceiptView',
      );
    const receiptBox =
      receipt?.getBoundingClientRect() ??
      null;

    if (
      el.scrollWidth >
      el.clientWidth + 2
    ) {
      issues.push(
        'standalone surface overflows',
      );
    }

    if (
      receiptBox &&
      (box.left < receiptBox.left - 2 ||
        box.right > receiptBox.right + 2)
    ) {
      issues.push(
        'standalone surface escapes receipt',
      );
    }

    for (const child of el.querySelectorAll<HTMLElement>(
      'span,button',
    )) {
      if (
        child.getClientRects().length ===
        0
      ) {
        continue;
      }
      const rect =
        child.getBoundingClientRect();
      if (
        child.scrollWidth >
        child.clientWidth + 2
      ) {
        issues.push(
          'standalone child clipped: ' +
            (child.textContent ?? '')
              .trim()
              .slice(0, 48),
        );
      }
      if (
        rect.left < box.left - 2 ||
        rect.right > box.right + 2
      ) {
        issues.push(
          'standalone child outside surface',
        );
      }
    }

    const viewportOverflow =
      Math.max(
        document.documentElement
          .scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth;

    if (viewportOverflow > 1) {
      issues.push(
        'viewport overflows horizontally: ' +
          viewportOverflow,
      );
    }

    return {
      issues,
      direction:
        getComputedStyle(el).direction,
    };
  });
}

const shards = Array.from(
  { length: 4 },
  (_, shard) =>
    SUPPORTED_LOCALES.filter(
      (_, index) => index % 4 === shard,
    ),
);

for (
  let shardIndex = 0;
  shardIndex < shards.length;
  shardIndex += 1
) {
  test(
    'X promotion all-locale mobile shard ' +
      (shardIndex + 1),
    async ({ page }) => {
      test.setTimeout(180_000);

      for (const locale of shards[shardIndex]) {
        for (const viewport of [
          { width: 320, height: 568 },
          { width: 393, height: 852 },
        ]) {
          const report =
            await openPromotionPanel(
              page,
              locale,
              viewport.width,
              viewport.height,
            );

          expect(
            report.direction,
            JSON.stringify({
              locale,
              viewport,
              report,
            }),
          ).toBe(
            isRtlLocale(locale)
              ? 'rtl'
              : 'ltr',
          );
          expect(
            report.amountDirection,
          ).toBe('ltr');
          expect(
            report.shareAmountDirection,
          ).toBe('ltr');
          expect(
            report.inputDirection,
          ).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({
              locale,
              viewport,
              report,
            }),
          ).toEqual([]);

          expect(
            report.inputBottom,
          ).not.toBeNull();
          expect(
            report.buttonTop,
          ).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >=
              (report.inputBottom ?? 0) -
                1,
          ).toBe(true);
        }
      }
    },
  );
}

test(
  'X promotion high-risk constrained desktop layout',
  async ({ page }) => {
    test.setTimeout(120_000);

    for (const locale of HIGH_RISK_LOCALES) {
      const report =
        await openPromotionPanel(
          page,
          locale,
          1280,
          900,
        );

      expect(
        report.direction,
        JSON.stringify({
          locale,
          report,
        }),
      ).toBe(
        isRtlLocale(locale)
          ? 'rtl'
          : 'ltr',
      );
      expect(
        report.amountDirection,
      ).toBe('ltr');
      expect(
        report.shareAmountDirection,
      ).toBe('ltr');
      expect(
        report.inputDirection,
      ).toBe('ltr');
      expect(
        report.issues,
        JSON.stringify({
          locale,
          report,
        }),
      ).toEqual([]);
    }
  },
);

test(
  'X promotion standalone states stay inside narrow receipt',
  async ({ page }) => {
    test.setTimeout(180_000);

    for (const locale of STANDALONE_RISK_LOCALES) {
      const states = [
        {
          selector:
            '.genericShare' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: false,
            promotion: null,
          },
        },
        {
          selector:
            '.promotionPreparing' as const,
          status: 200,
          body: {
            newOffersEnabled: true,
            promotionPending: true,
            promotion: null,
          },
        },
        {
          selector:
            '.promotionStatus' as const,
          status: 503,
          body: {
            error:
              'QA unavailable',
          },
        },
      ];

      for (const state of states) {
        const report =
          await inspectStandalone(
            page,
            locale,
            state.selector,
            state.status,
            state.body,
          );

        expect(
          report.direction,
          JSON.stringify({
            locale,
            state:
              state.selector,
            report,
          }),
        ).toBe(
          isRtlLocale(locale)
            ? 'rtl'
            : 'ltr',
        );
        expect(
          report.issues,
          JSON.stringify({
            locale,
            state:
              state.selector,
            report,
          }),
        ).toEqual([]);
      }
    }
  },
);

test(
  'X promotion submit errors stay localized and wrapped',
  async ({ page }) => {
    test.setTimeout(120_000);

    for (const locale of ERROR_RISK_LOCALES) {
      await mockPromotionGet(
        page,
        200,
        OPEN_PROMOTION,
      );

      await page.route(
        '**/api/rewards/x-promotion/submit',
        async (route) => {
          await route.fulfill({
            status: 409,
            contentType:
              'application/json',
            body: JSON.stringify({
              error:
                'This English internal error must never render.',
            }),
          });
        },
      );

      await openQaPage(
        page,
        locale,
        320,
        568,
      );

      const panel =
        page.locator('.promotionPanel');
      await expect(panel).toBeVisible();

      const input =
        page.locator(
          '.promotionSubmit input',
        );
      const button =
        page.locator(
          '.promotionSubmit button',
        );

      await input.fill(
        'https://x.com/test/status/1234567890123456789',
      );
      await button.click();

      const error =
        page.locator('.promotionError');
      await expect(error).toBeVisible();
      await expect(error).toHaveText(
        rewardXPromotionSubmitError(
          locale,
          409,
        ),
      );
      await expect(error).not.toContainText(
        'This English internal error must never render.',
      );

      const report =
        await error.evaluate(
          (node) => {
            const el =
              node as HTMLElement;
            const root =
              el.closest<HTMLElement>(
                '.promotionPanel',
              );
            const rect =
              el.getBoundingClientRect();
            const rootRect =
              root?.getBoundingClientRect() ??
              null;

            return {
              clipped:
                el.scrollWidth >
                el.clientWidth + 2,
              outside: Boolean(
                rootRect &&
                  (rect.left <
                    rootRect.left -
                      2 ||
                    rect.right >
                      rootRect.right +
                        2),
              ),
              viewportOverflow:
                Math.max(
                  document
                    .documentElement
                    .scrollWidth,
                  document.body
                    .scrollWidth,
                ) -
                window.innerWidth,
            };
          },
        );

      expect(
        report,
        JSON.stringify({
          locale,
          report,
        }),
      ).toEqual({
        clipped: false,
        outside: false,
        viewportOverflow: 0,
      });

      await page.unroute(
        '**/api/rewards/x-promotion/submit',
      );
    }
  },
);
