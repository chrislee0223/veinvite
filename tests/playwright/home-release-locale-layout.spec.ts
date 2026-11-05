import { expect, test, type Page } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';
import { MANUAL_RELEASE_COPY } from '../../src/lib/i18n/manualReleaseCopy';

// Render the real production HomeClient release confirmation through QA state
// instead of a visually similar standalone mock.
async function checkReleaseLayout(page: Page, locale: SupportedLocale): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const copy = MANUAL_RELEASE_COPY[locale];
  await expect(dialog.getByRole('heading', { name: copy.title })).toBeVisible();
  await expect(dialog.locator('#cancel-dialog-description')).toHaveText(copy.description);
  await expect(dialog.locator('.cancelConfirm')).toHaveText(copy.confirm);
  await expect(dialog.locator('.primaryAction')).toBeVisible();

  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    ]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const result = await dialog.evaluate((node) => {
    const panel = node as HTMLElement;
    const panelRect = panel.getBoundingClientRect();
    const problems: string[] = [];
    const label = (element: HTMLElement) => element.className || element.tagName;
    const textTargets = Array.from(
      panel.querySelectorAll<HTMLElement>('h2, p, .primaryAction, .cancelConfirm'),
    );
    const bounds = textTargets.map((element) => ({
      name: label(element),
      rect: element.getBoundingClientRect(),
    }));
    if (panelRect.left < -1 || panelRect.right > innerWidth + 1) {
      problems.push('dialog extends beyond viewport horizontally');
    }
    if (panelRect.top < -1 || panelRect.bottom > innerHeight + 1) {
      problems.push('dialog extends beyond viewport vertically');
    }
    if (panel.scrollWidth > panel.clientWidth + 2) {
      problems.push('dialog content overflows horizontally');
    }
    for (const element of textTargets) {
      const rect = element.getBoundingClientRect();
      if (rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1) {
        problems.push(label(element) + ' extends beyond dialog');
      }
      const style = getComputedStyle(element);
      const clippedX = element.scrollWidth > element.clientWidth + 2 &&
        ['hidden', 'clip'].includes(style.overflowX);
      const clippedY = element.scrollHeight > element.clientHeight + 2 &&
        ['hidden', 'clip'].includes(style.overflowY);
      if (clippedX || clippedY) problems.push(label(element) + ' clips translated text');
    }
    for (let i = 1; i < bounds.length; i += 1) {
      const previous = bounds[i - 1]!.rect;
      const next = bounds[i]!.rect;
      if (next.top < previous.bottom - 2) {
        problems.push(bounds[i - 1]!.name + ' overlaps ' + bounds[i]!.name);
      }
    }
    const cancel = panel.querySelector<HTMLElement>('.cancelConfirm');
    if (cancel && cancel.getBoundingClientRect().height < 44) {
      problems.push('secondary action touch target below 44px');
    }
    const backdrop = panel.closest<HTMLElement>('.modalBackdrop');
    const x = document.querySelector<HTMLElement>('.friendSlot.releasable .slotReleaseButton');
    const slot = x?.closest<HTMLElement>('.friendSlot.releasable');
    if (!x || !slot) {
      problems.push('live X button is absent from underlying invited slot');
    } else {
      const xr = x.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      if (rtl ? xr.left < sr.left - 1 || xr.left > sr.left + 21 :
        xr.right > sr.right + 1 || xr.right < sr.right - 21) {
        problems.push('X button is not at the locale inline end');
      }
    }
    const viewportOverflow =
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth;
    if (viewportOverflow > 1) problems.push('page overflows horizontally: ' + viewportOverflow);
    if (!backdrop) problems.push('dialog missing overlay');
    return { problems, direction: getComputedStyle(panel).direction };
  });
  expect(result.direction).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
  expect(result.problems, JSON.stringify({ locale, result })).toEqual([]);

  // Even if a short phone forces internal scrolling, both actions remain usable.
  await dialog.locator('.cancelConfirm').scrollIntoViewIfNeeded();
  await expect(dialog.locator('.cancelConfirm')).toBeVisible();
}

for (const locale of SUPPORTED_LOCALES) {
  test('all 29 locales: real X release modal stays legible and usable / ' + locale,
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto('/qa/state?state=HOME-RELEASE-CONFIRM&locale=' + encodeURIComponent(locale), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      for (const viewport of [
        { width: 320, height: 740 },
        { width: 393, height: 852 },
        { width: 480, height: 840 },
      ]) {
        await page.setViewportSize(viewport);
        await checkReleaseLayout(page, locale);
      }

      if (['ar','arz','ur','hi','bn','mr','te','de','nl','ko','vi'].includes(locale)) {
        await page.setViewportSize({ width: 320, height: 568 });
        await checkReleaseLayout(page, locale);
      }

      await dialog.locator('.primaryAction').click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('.friendSlot.releasable .slotReleaseButton')).toBeVisible();
    });
}
