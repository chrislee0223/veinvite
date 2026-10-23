import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import {
  rewardXPromotionSubmitError,
} from '../../src/lib/i18n/rewardXPromotionSubmitErrorCopy';

type QaMode = 'manual' | 'auto-disconnected' | 'auto-connected';

const HIGH_RISK = new Set<SupportedLocale>([
  'ar','arz','ur','de','fr','ro','el','hi','bn','mr','te','sw','zh-tw','ko',
]);

function responseFor(mode: QaMode) {
  return {
    newOffersEnabled: true,
    promotionPending: false,
    xConnectAvailable: true,
    xConnected: mode === 'auto-connected',
    xUrlLessEnabled: mode !== 'manual',
    promotion: {
      inviteCode: 'QA-X-PROMO-1',
      state: 'OPEN',
      amountWei: '10000000000000000000',
      amountB3tr: '10',
      openedAt: '2026-10-23T00:00:00.000Z',
      postDeadlineAt: '2099-10-23T00:00:00.000Z',
      submissionGraceSeconds: 900,
      shareToken: '123e4567-e89b-42d3-a456-426614174000',
      submittedAt: null,
      verifyAfter: null,
      paidAt: null,
    },
  };
}

async function waitForPanel(page: Page) {
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
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
  return panel;
}

async function inspectPanel(page: Page, locale: SupportedLocale) {
  const panel = await waitForPanel(page);
  const report = await panel.evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const rect = (selector: string) =>
      root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
      Boolean(
        a &&
        b &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      );

    const rootBox = root.getBoundingClientRect();
    const shell = root.closest<HTMLElement>('[data-qa-x-promotion-shell]');
    const shellBox = shell?.getBoundingClientRect() ?? null;

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('promotion panel horizontally overflows');
    }
    if (
      shellBox &&
      (rootBox.left < shellBox.left - 2 || rootBox.right > shellBox.right + 2)
    ) {
      issues.push('promotion panel escapes QA shell');
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
          issues.push(selector + ' clipped horizontally');
        }
        if (bounds.left < rootBox.left - 2 || bounds.right > rootBox.right + 2) {
          issues.push(selector + ' outside panel');
        }
      }
    }

    if (overlaps(rect('.promotionHeading strong'), rect('.promotionHeading span'))) {
      issues.push('title overlaps amount');
    }
    if (overlaps(rect('.promotionSubmit input'), rect('.promotionSubmit button'))) {
      issues.push('URL input overlaps verify button');
    }

    const viewportOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      - window.innerWidth;
    if (viewportOverflow > 1) {
      issues.push('viewport horizontal overflow: ' + viewportOverflow);
    }

    return {
      issues,
      direction: getComputedStyle(root).direction,
      amountDirection:
        root.querySelector<HTMLElement>('.promotionHeading span')
          ? getComputedStyle(root.querySelector<HTMLElement>('.promotionHeading span')!).direction
          : null,
      shareAmountDirection:
        root.querySelector<HTMLElement>('.promotionShare b')
          ? getComputedStyle(root.querySelector<HTMLElement>('.promotionShare b')!).direction
          : null,
      inputDirection:
        root.querySelector<HTMLElement>('.promotionSubmit input')
          ? getComputedStyle(root.querySelector<HTMLElement>('.promotionSubmit input')!).direction
          : null,
      inputBottom: rect('.promotionSubmit input')?.bottom ?? null,
      buttonTop: rect('.promotionSubmit button')?.top ?? null,
    };
  });

  expect(report.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(report.amountDirection).toBe('ltr');
  expect(report.issues, JSON.stringify({ locale, report })).toEqual([]);
  return report;
}

for (const locale of SUPPORTED_LOCALES) {
  test('X promotion multilingual layout / ' + locale, async ({ page }) => {
    let mode: QaMode = 'manual';

    await page.route(
      /\/api\/rewards\/x-promotion(?:\?.*)?$/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseFor(mode)),
        });
      },
    );

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

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/qa/x-promotion?locale=' + locale, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const manual = await inspectPanel(page, locale);
    expect(manual.inputDirection).toBe('ltr');
    expect(manual.inputBottom).not.toBeNull();
    expect(manual.buttonTop).not.toBeNull();
    expect((manual.buttonTop ?? 0) >= (manual.inputBottom ?? 0) - 1).toBe(true);

    const input = page.locator('.promotionSubmit input');
    await input.fill('https://x.com/test/status/1234567890123456789');
    await page.locator('.promotionSubmit button').click();
    const error = page.locator('.promotionError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText(rewardXPromotionSubmitError(locale, 409));
    await expect(error).not.toContainText('Internal English error');
    await inspectPanel(page, locale);

    mode = 'auto-disconnected';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.promotionConnect')).toBeVisible();
    await expect(page.locator('.promotionSubmit')).toHaveCount(0);
    await inspectPanel(page, locale);

    mode = 'auto-connected';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.promotionConnectState')).toBeVisible();
    const autoConnected = await inspectPanel(page, locale);
    if (autoConnected.shareAmountDirection !== null) {
      expect(autoConnected.shareAmountDirection).toBe('ltr');
    }

    if (HIGH_RISK.has(locale)) {
      await page.setViewportSize({ width: 393, height: 852 });
      await inspectPanel(page, locale);
    }
  });
}
