import { expect, test, type Page } from '@playwright/test';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

// Real production promotion component + isolated QA data: no wallet, API
// mutations, social provider calls, or live payment dependencies.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const LONG_COPY_VISUALS = new Set(['ko', 'de', 'ar', 'ur', 'te', 'el', 'nl', 'ro']);
const BASE_OFFER = {
  newOffersEnabled: true,
  promotionPending: false,
  xConnectAvailable: true,
  xUrlLessEnabled: true,
  promotion: {
    inviteCode: 'QA-I18N-NATURAL-WRAP',
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

async function renderPromotion(page: Page, locale: SupportedLocale) {
  const response = await page.goto(
    '/qa/x-promotion-layout?locale=' + encodeURIComponent(locale),
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  expect(response?.status()).toBe(200);
  const panel = page.locator('.promotionPanel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1_200)),
    ]);
    await new Promise<void>((resolve) => requestAnimationFrame(
      () => requestAnimationFrame(() => resolve()),
    ));
  });
  return panel;
}

for (const width of [320, 393, 480, 1280]) {
  for (const connected of [false, true]) {
    for (const shard of [0, 1, 2, 3]) {
      test(
        '29-locale real X offer wrap / ' + width + 'px / connected=' +
          connected + ' / shard=' + shard,
        async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.route(
            /\/api\/rewards\/x-promotion\?inviteCode=/,
            async (route) => {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ...BASE_OFFER, xConnected: connected }),
              });
            },
          );

          const locales = SUPPORTED_LOCALES.filter((_, idx) => idx % 4 === shard);
          for (const locale of locales) {
            const panel = await renderPromotion(page, locale);
            const report = await panel.evaluate((root) => {
              const frame = root.getBoundingClientRect();
              const issues: string[] = [];
              const p = root.querySelector<HTMLElement>(':scope > p');
              if (!p || !p.textContent?.trim()) {
                issues.push('main offer guidance is absent');
              }
              const docWidth = Math.max(
                document.documentElement.scrollWidth,
                document.body.scrollWidth,
              );
              if (docWidth > innerWidth + 1) {
                issues.push('horizontal viewport overflow ' + docWidth + ' > ' + innerWidth);
              }
              if (root.scrollWidth > root.clientWidth + 2) {
                issues.push('promotion panel has horizontal overflow');
              }

              const selectors = [
                ':scope > p',
                '.promotionHeading strong',
                '.promotionConnect',
                '.promotionConnectState',
                '.promotionShare',
              ];
              for (const selector of selectors) {
                for (const el of root.querySelectorAll<HTMLElement>(selector)) {
                  if (!el.getClientRects().length) continue;
                  const box = el.getBoundingClientRect();
                  if (box.left < frame.left - 2 || box.right > frame.right + 2) {
                    issues.push(selector + ' extends outside card');
                  }
                  if (el.scrollWidth > el.clientWidth + 2) {
                    issues.push(selector + ' contains horizontally clipped text');
                  }
                  const style = getComputedStyle(el);
                  if (
                    ['clip', 'hidden'].includes(style.overflowY) &&
                    el.scrollHeight > el.clientHeight + 2
                  ) {
                    issues.push(selector + ' vertically clips text');
                  }
                }
              }

              // Detect a particularly unnatural widow: a tiny standalone
              // final word on a 2+ line message. Use real browser glyph
              // geometry; string length alone cannot tell where lines wrap.
              if (p?.firstChild?.nodeType === Node.TEXT_NODE) {
                const node = p.firstChild;
                const value = node.textContent ?? '';
                const words = [...value.matchAll(/\S+/gu)];
                if (words.length >= 6) {
                  const lines = new Map<number, Array<{ label: string; width: number }>>();
                  for (const match of words) {
                    const range = document.createRange();
                    range.setStart(node, match.index!);
                    range.setEnd(node, match.index! + match[0].length);
                    const rects = [...range.getClientRects()];
                    if (rects.length !== 1) continue;
                    const box = rects[0];
                    const top = Math.round(box.top * 2) / 2;
                    const row = lines.get(top) ?? [];
                    row.push({ label: match[0], width: box.width });
                    lines.set(top, row);
                  }
                  const sorted = [...lines].sort((a, b) => a[0] - b[0]);
                  const last = sorted.at(-1)?.[1] ?? [];
                  if (sorted.length >= 2 && last.length === 1) {
                    const item = last[0];
                    const shortWord = [...item.label.replace(/[.,;:!?。،۔]/gu, '')].length <= 3;
                    if (shortWord && item.width < p.clientWidth * 0.16) {
                      issues.push('tiny orphan word on last line: ' + item.label);
                    }
                  }
                }
              }
              return {
                issues,
                pText: p?.textContent?.trim().slice(0, 220),
                direction: getComputedStyle(root).direction,
                width: Math.round(frame.width),
              };
            });

            expect(
              report.direction,
              JSON.stringify({ locale, connected, width, report }),
            ).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');
            expect(
              report.issues,
              JSON.stringify({ locale, connected, width, report }),
            ).toEqual([]);

            if (width === 320 && connected && LONG_COPY_VISUALS.has(locale)) {
              await testInfo.attach('wrap-' + locale + '-' + width + '.png', {
                body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
                contentType: 'image/png',
              });
            }
          }
        },
      );
    }
  }
}
