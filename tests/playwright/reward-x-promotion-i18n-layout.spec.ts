import { expect, test, type Page } from '@playwright/test';
import {
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const RISKY_LOCALES = [
  'ar',
  'ur',
  'de',
  'el',
  'te',
  'bn',
  'ro',
  'ko',
] as const satisfies readonly SupportedLocale[];

const OPEN_PROMOTION = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: false,
  xConnected: false,
  xUrlLessEnabled: false,
  promotion: {
    inviteCode: 'QA-NOTI-22',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-26T00:00:00.000Z',
    postDeadlineAt: '2026-10-27T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
} as const;

async function openPanel(
  page: Page,
  locale: SupportedLocale,
  width: number,
  height: number,
) {
  await page.route(
    /\/api\/rewards\/x-promotion(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OPEN_PROMOTION),
      });
    },
  );

  await page.setViewportSize({ width, height });
  await page.goto(
    '/qa/notification-state?state=NOTI-REWARD-PAID&locale=' + locale,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );

  const receiptAction = page.locator('.notificationReceiptAction').first();
  await expect(receiptAction).toBeVisible({ timeout: 10_000 });
  await receiptAction.click();

  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await panel.scrollIntoViewIfNeeded();

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    ]);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });

  return panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rootBox = root.getBoundingClientRect();

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push(
        'panel horizontal overflow ' +
          root.scrollWidth +
          '>' +
          root.clientWidth,
      );
    }

    for (const selector of [
      '.promotionHeading strong',
      '.promotionHeading span',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
      '.promotionSubmit input',
      '.promotionSubmit button',
      '.promotionConnect',
      '.promotionConnectState',
      '.promotionError',
    ]) {
      for (const el of root.querySelectorAll<HTMLElement>(selector)) {
        if (!el.textContent?.trim() && el.tagName !== 'INPUT') continue;
        if (el.getClientRects().length === 0) continue;
        const box = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push(selector + ' clipped horizontally');
        }
        if (box.left < rootBox.left - 2 || box.right > rootBox.right + 2) {
          issues.push(selector + ' escapes panel');
        }
      }
    }

    const title = root
      .querySelector<HTMLElement>('.promotionHeading strong')
      ?.getBoundingClientRect();
    const amount = root
      .querySelector<HTMLElement>('.promotionHeading span')
      ?.getBoundingClientRect();
    if (
      title &&
      amount &&
      Math.min(title.right, amount.right) - Math.max(title.left, amount.left) > 2 &&
      Math.min(title.bottom, amount.bottom) - Math.max(title.top, amount.top) > 2
    ) {
      issues.push('title overlaps amount');
    }

    const input = root
      .querySelector<HTMLElement>('.promotionSubmit input')
      ?.getBoundingClientRect();
    const verify = root
      .querySelector<HTMLElement>('.promotionSubmit button')
      ?.getBoundingClientRect();
    if (
      input &&
      verify &&
      Math.min(input.right, verify.right) - Math.max(input.left, verify.left) > 2 &&
      Math.min(input.bottom, verify.bottom) - Math.max(input.top, verify.top) > 2
    ) {
      issues.push('input overlaps verify button');
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
      amountDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionHeading span')!,
      ).direction,
      inputDirection: getComputedStyle(
        root.querySelector<HTMLElement>('.promotionSubmit input')!,
      ).direction,
      inputBottom: input?.bottom ?? null,
      verifyTop: verify?.top ?? null,
    };
  });
}

for (const locale of RISKY_LOCALES) {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 393, height: 852 },
  ] as const) {
    test(
      'X promotion locale layout / ' + locale + ' / ' + viewport.width,
      async ({ page }) => {
        const report = await openPanel(
          page,
          locale,
          viewport.width,
          viewport.height,
        );

        expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
        expect(report.amountDirection).toBe('ltr');
        expect(report.inputDirection).toBe('ltr');
        expect(
          report.issues,
          JSON.stringify({ locale, viewport, report }),
        ).toEqual([]);

        // Both tested mobile widths are intentionally below the 430px
        // stacking breakpoint.
        expect(report.inputBottom).not.toBeNull();
        expect(report.verifyTop).not.toBeNull();
        expect((report.verifyTop ?? 0) >= (report.inputBottom ?? 0) - 1).toBe(true);
      },
    );
  }
}
