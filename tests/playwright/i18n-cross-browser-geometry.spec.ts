import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

// Tests real production UI with a mocked read-only offer in each browser
// engine. This deliberately does not touch Production, wallets, X, or payouts.
test.describe.configure({ mode: 'parallel', timeout: 120_000 });

const OFFER = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xUrlLessEnabled: true,
  promotion: {
    inviteCode: 'QA-CROSS-BROWSER-I18N',
    state: 'OPEN',
    amountWei: '10000000000000000000',
    amountB3tr: '10',
    openedAt: '2026-10-26T00:00:00.000Z',
    postDeadlineAt: '2099-10-27T00:00:00.000Z',
    submissionGraceSeconds: 900,
    shareToken: '123e4567-e89b-42d3-a456-426614174000',
    submittedAt: null,
    verifyAfter: null,
    paidAt: null,
  },
};

async function settled(page: Page) {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>(resolve => setTimeout(resolve, 1500)),
    ]);
    await new Promise<void>(resolve => requestAnimationFrame(
      () => requestAnimationFrame(() => resolve()),
    ));
  });
}

async function geometry(page: Page) {
  return page.locator('.promotionPanel').evaluate((root) => {
    const panel = root as HTMLElement;
    const panelBox = panel.getBoundingClientRect();
    const issues: string[] = [];
    const check = [
      '.promotionHeading strong',
      '.promotionHeading span',
      ':scope > p',
      '.promotionConnect',
      '.promotionConnectState',
      '.promotionShare',
      '.promotionShare span',
      '.promotionShare b',
    ];
    for (const selector of check) {
      for (const element of panel.querySelectorAll<HTMLElement>(selector)) {
        if (!element.getClientRects().length) continue;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (element.scrollWidth > element.clientWidth + 3) {
          issues.push(selector + ' horizontal text overflow');
        }
        if (
          ['hidden', 'clip'].includes(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 3
        ) {
          issues.push(selector + ' text clipped vertically');
        }
        if (box.left < panelBox.left - 3 || box.right > panelBox.right + 3) {
          issues.push(selector + ' outside panel horizontally');
        }
      }
    }

    const mainCopy = panel.querySelector<HTMLElement>(':scope > p');
    if (!mainCopy?.textContent?.trim()) issues.push('missing localized offer copy');
    const amount = panel.querySelector<HTMLElement>('.promotionHeading span');
    const title = panel.querySelector<HTMLElement>('.promotionHeading strong');
    if (amount && title) {
      const a = amount.getBoundingClientRect();
      const b = title.getBoundingClientRect();
      if (a.right > b.left + 3 && b.right > a.left + 3 &&
          a.bottom > b.top + 3 && b.bottom > a.top + 3) {
        issues.push('reward amount overlaps localized title');
      }
      if (getComputedStyle(amount).direction !== 'ltr') {
        issues.push('reward amount lost LTR isolation');
      }
    }
    if (panel.scrollWidth > panel.clientWidth + 3) {
      issues.push('panel content overflows horizontally');
    }
    const viewportWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
    );
    if (viewportWidth > innerWidth + 2) issues.push('viewport overflow');

    return {
      issues,
      direction: getComputedStyle(panel).direction,
      content: mainCopy?.textContent?.trim().slice(0, 170),
    };
  });
}

for (const locale of SUPPORTED_LOCALES) {
  test('cross-engine localized bonus geometry / ' + locale, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(/\/api\/rewards\/x-promotion\?inviteCode=/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...OFFER, xConnected: true }),
      });
    });

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(
        '/qa/x-promotion-layout?locale=' + encodeURIComponent(locale),
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      expect(response?.status()).toBe(200);
      const panel = page.locator('.promotionPanel');
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await settled(page);

      // Approximate increased default text size without relying on a single
      // OS setting. Test ordinary and 150%-larger rem-based UI text.
      for (const fontSize of [16, 24]) {
        await page.evaluate(size => {
          document.documentElement.style.fontSize = size + 'px';
        }, fontSize);
        await settled(page);
        const result = await geometry(page);
        expect(
          result.direction,
          JSON.stringify({ locale, width, fontSize, result }),
        ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
        expect(
          result.issues,
          JSON.stringify({ locale, width, fontSize, result }),
        ).toEqual([]);

        if (width === 320 && fontSize === 24) {
          await testInfo.attach(
            'cross-engine-' + locale + '-' + testInfo.project.name + '.png',
            {
              body: await page.screenshot({ animations: 'disabled' }),
              contentType: 'image/png',
            },
          );
        }
      }
    }
  });
}
