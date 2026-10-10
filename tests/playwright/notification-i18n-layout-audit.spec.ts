import { expect, test } from '@playwright/test';
import { SUPPORTED_LOCALES } from '../../src/lib/i18n/locales';

// Diagnostic-only coverage, no production data, all normal QA fixtures.
const tests = [
  { state: 'NOTI-REFERRAL-INVALIDATED', width: 320, height: 568 },
  { state: 'NOTI-REFERRAL-RESTORED', width: 320, height: 568 },
  { state: 'NOTI-REWARD-PAID-POPUP', width: 320, height: 568 },
  { state: 'NOTI-HISTORY-OPEN', width: 393, height: 852 },
  { state: 'NOTI-REFERRAL-RESTORED', width: 393, height: 852 },
  { state: 'NOTI-HISTORY-OPEN', width: 480, height: 840 },
] as const;

for (const locale of SUPPORTED_LOCALES) {
  for (const scenario of tests) {
    test('notification layout audit / ' + locale + ' / ' + scenario.state + ' / ' + scenario.width, async ({ page }) => {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.goto('/qa/notification-state?state=' + scenario.state + '&locale=' + locale, {
        waitUntil: 'domcontentloaded', timeout: 30_000,
      });
      const selector = scenario.state === 'NOTI-REWARD-PAID-POPUP'
        ? '.transientSnackbar.reward'
        : '.notificationHistoryPanel';
      const surface = page.locator(selector);
      await expect(surface).toBeVisible();
      await page.evaluate(async () => {
        await Promise.race([
          document.fonts.ready,
          new Promise(resolve => setTimeout(resolve, 1500)),
        ]);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const result = await page.evaluate((selector) => {
        const root = document.querySelector<HTMLElement>(selector);
        if (!root) return { missing: true, issues: [] };
        const frame = root.getBoundingClientRect();
        const issues: string[] = [];
        if (frame.left < -2 || frame.right > innerWidth + 2 ||
            frame.top < -2 || frame.bottom > innerHeight + 2) {
          issues.push('surface outside viewport: ' + JSON.stringify({
            left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom
          }));
        }
        const target = selector.includes('transient')
          ? '.feedbackText,.rewardFeedbackBody strong,.rewardFeedbackAmount,.rewardShareButton,.rewardConfirmButton'
          : '.notificationHistoryTitle,.notificationHistoryBody,.notificationHistoryTime,.notificationHistoryMarkAll,.notificationHistoryHeading h3,.notificationHistoryMeta b,.notificationReceiptAction';
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(target))) {
          if (!el.textContent?.trim() || el.getClientRects().length === 0) continue;
          const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) continue;
          if (el.scrollWidth > el.clientWidth + 3) {
            issues.push('text exceeds its box: ' + el.className + ' ' + (el.textContent || '').slice(0, 65) +
              ' ' + el.scrollWidth + '>' + el.clientWidth + ' overflow=' + cs.overflowX);
          }
          if (el.scrollHeight > el.clientHeight + 3 &&
              ['hidden','clip'].includes(cs.overflowY)) {
            issues.push('vertically clipped text: ' + el.className);
          }
          if (rect.left < frame.left - 3 || rect.right > frame.right + 3) {
            issues.push('text outside surface: ' + el.className +
              ' [' + rect.left.toFixed(1) + ',' + rect.right.toFixed(1) + ']');
          }
        }
        const header = root.querySelector('.notificationHistoryHeader');
        if (header) {
          const close = header.querySelector<HTMLElement>('.notificationHistoryClose');
          const mark = header.querySelector<HTMLElement>('.notificationHistoryMarkAll');
          if (close && mark) {
            const a=close.getBoundingClientRect(),b=mark.getBoundingClientRect();
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
              issues.push('mark-all button overlaps close');
            }
          }
        }
        const scroll = root.querySelector<HTMLElement>('.notificationHistoryScroll');
        if (scroll && scroll.scrollHeight > scroll.clientHeight + 3 &&
            getComputedStyle(scroll).overflowY !== 'auto') {
          issues.push('scrolling disabled on long history');
        }
        return { missing: false, issues };
      }, selector);
      expect(result.missing).toBe(false);
      expect(result.issues, locale + ' ' + scenario.state + ' ' + scenario.width + 'px').toEqual([]);
    });
  }
}

for (const locale of ['ar', 'ur', 'de', 'el', 'ko', 'vi', 'te', 'fr'] as const) {
  test('notification desktop audit / ' + locale, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/qa/notification-state?state=NOTI-REFERRAL-RESTORED&locale=' + locale);
    await expect(page.locator('.notificationHistoryPanel')).toBeVisible();
    const bounds = await page.locator('.notificationHistoryPanel').boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.x ?? -1) >= 0).toBeTruthy();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0) <= 1282).toBeTruthy();
  });
}
