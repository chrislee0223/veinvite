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
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-20T00:00:00.000Z',
    postDeadlineAt: '2099-10-21T00:00:00.000Z',
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
] as const satisfies readonly SupportedLocale[];

const shard = <T,>(values: readonly T[], count: number): T[][] => {
  const result = Array.from({ length: count }, () => [] as T[]);
  values.forEach((value, index) => {
    result[index % count].push(value);
  });
  return result;
};

const LOCALE_SHARDS = shard(SUPPORTED_LOCALES, 4);
const HIGH_RISK_SHARDS = shard(HIGH_RISK_LOCALES, 2);

const promotionGetPattern =
  /\/api\/rewards\/x-promotion(?:\?.*)?$/;
const promotionSubmitPattern =
  /\/api\/rewards\/x-promotion\/submit$/;

async function installGetResponse(
  page: Page,
  status: number,
  body: unknown,
) {
  await page.unroute(promotionGetPattern).catch(() => {});
  await page.route(promotionGetPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function openDirectReceipt({
  page,
  locale,
  width,
  height,
  status = 200,
  body = OPEN_PROMOTION,
}: {
  page: Page;
  locale: SupportedLocale;
  width: number;
  height: number;
  status?: number;
  body?: unknown;
}) {
  await installGetResponse(page, status, body);
  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-X-PROMOTION-OPEN&locale=' +
      encodeURIComponent(locale),
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  await expect(
    page.locator('[data-qa-x-promotion-direct="true"]'),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.notificationReceiptView')).toBeVisible({
    timeout: 10_000,
  });

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
}

async function readPanelLayout(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt =
      root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    const rect = (selector: string) =>
      root
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
          b &&
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
      );

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'promotion panel horizontal overflow ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }
    if (
      receipt &&
      receipt.scrollWidth > receipt.clientWidth + 2
    ) {
      issues.push(
        'reward receipt horizontal overflow ' +
          receipt.scrollWidth +
          '>' +
          receipt.clientWidth,
      );
    }
    if (
      receiptBox &&
      (rootBox.left < receiptBox.left - 2 ||
        rootBox.right > receiptBox.right + 2)
    ) {
      issues.push('promotion panel escapes reward receipt');
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
      '.promotionError',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(
            selector +
              ' clipped ' +
              el.scrollWidth +
              '>' +
              el.clientWidth,
          );
        }
        if (
          box.left < rootBox.left - 2 ||
          box.right > rootBox.right + 2
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
      issues.push('title overlaps B3TR amount');
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
      issues.push('viewport horizontal overflow ' + viewportOverflow);
    }

    const input = rect('.promotionSubmit input');
    const button = rect('.promotionSubmit button');

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
      inputBottom: input?.bottom ?? null,
      buttonTop: button?.top ?? null,
    };
  });
}

for (const width of [320, 393] as const) {
  LOCALE_SHARDS.forEach((locales, shardIndex) => {
    test(
      'X promotion locale layout shard ' +
        (shardIndex + 1) +
        ' / ' +
        width +
        'px',
      async ({ page }) => {
        for (const locale of locales) {
          await openDirectReceipt({
            page,
            locale,
            width,
            height: width === 320 ? 568 : 852,
          });
          const report = await readPanelLayout(page);

          expect(report.direction).toBe(
            isRtlLocale(locale) ? 'rtl' : 'ltr',
          );
          expect(report.amountDirection).toBe('ltr');
          expect(report.shareAmountDirection).toBe('ltr');
          expect(report.inputDirection).toBe('ltr');
          expect(
            report.issues,
            JSON.stringify({ locale, width, report }),
          ).toEqual([]);

          expect(report.inputBottom).not.toBeNull();
          expect(report.buttonTop).not.toBeNull();
          expect(
            (report.buttonTop ?? 0) >=
              (report.inputBottom ?? 0) - 1,
          ).toBe(true);
        }
      },
    );
  });
}

HIGH_RISK_SHARDS.forEach((locales, shardIndex) => {
  test(
    'X promotion constrained desktop high-risk shard ' +
      (shardIndex + 1),
    async ({ page }) => {
      for (const locale of locales) {
        await openDirectReceipt({
          page,
          locale,
          width: 1280,
          height: 900,
        });
        const report = await readPanelLayout(page);

        expect(report.direction).toBe(
          isRtlLocale(locale) ? 'rtl' : 'ltr',
        );
        expect(report.amountDirection).toBe('ltr');
        expect(report.shareAmountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, report }),
        ).toEqual([]);
      }
    },
  );
});

async function readStandaloneLayout(
  page: Page,
  selector: string,
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible({ timeout: 10_000 });
  await surface.scrollIntoViewIfNeeded();

  return surface.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();
    const receipt =
      root.closest<HTMLElement>('.notificationReceiptView');
    const receiptBox = receipt?.getBoundingClientRect() ?? null;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'standalone horizontal overflow ' +
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
      issues.push('standalone state escapes receipt');
    }

    for (const el of root.querySelectorAll<HTMLElement>('span,button')) {
      if (!el.textContent?.trim() || el.getClientRects().length === 0) {
        continue;
      }
      const box = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2) {
        issues.push('standalone child clipped');
      }
      if (
        box.left < rootBox.left - 2 ||
        box.right > rootBox.right + 2
      ) {
        issues.push('standalone child outside state');
      }
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
    };
  });
}

HIGH_RISK_SHARDS.forEach((locales, shardIndex) => {
  test(
    'X promotion standalone state matrix shard ' +
      (shardIndex + 1),
    async ({ page }) => {
      for (const locale of locales) {
        for (const state of [
          {
            selector: '.genericShare',
            status: 200,
            body: {
              newOffersEnabled: true,
              promotionPending: false,
              promotion: null,
            },
          },
          {
            selector: '.promotionStatus',
            status: 503,
            body: { error: 'QA unavailable' },
          },
          {
            selector: '.promotionPreparing',
            status: 200,
            body: {
              newOffersEnabled: true,
              promotionPending: true,
              promotion: null,
            },
          },
        ] as const) {
          await openDirectReceipt({
            page,
            locale,
            width: 320,
            height: 568,
            status: state.status,
            body: state.body,
          });
          const report = await readStandaloneLayout(
            page,
            state.selector,
          );
          expect(report.direction).toBe(
            isRtlLocale(locale) ? 'rtl' : 'ltr',
          );
          expect(
            report.issues,
            JSON.stringify({ locale, state, report }),
          ).toEqual([]);
        }
      }
    },
  );
});

HIGH_RISK_SHARDS.forEach((locales, shardIndex) => {
  test(
    'X promotion localized submit errors shard ' +
      (shardIndex + 1),
    async ({ page }) => {
      await page.route(
        promotionSubmitPattern,
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

      for (const locale of locales) {
        await openDirectReceipt({
          page,
          locale,
          width: 320,
          height: 568,
        });

        const input = page.locator('.promotionSubmit input');
        const button = page.locator('.promotionSubmit button');
        await input.fill(
          'https://x.com/test/status/1234567890123456789',
        );
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
          const panel =
            el.closest<HTMLElement>('.promotionPanel');
          const box = el.getBoundingClientRect();
          const panelBox =
            panel?.getBoundingClientRect() ?? null;
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
    },
  );
});
