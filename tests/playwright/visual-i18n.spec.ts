import { expect, test, type Page, type TestInfo } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const MOBILE_VIEWPORT = { width: 393, height: 852 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

const HIGH_RISK_LOCALES = [
  'ar',
  'arz',
  'ur',
  'bn',
  'mr',
  'te',
  'zh-tw',
  'ko',
  'cs',
  'de',
  'vi',
] as const satisfies readonly SupportedLocale[];

const CRITICAL_STATE_IDS = [
  'LEGAL-REQUIRED',
  'SESSION-WALLET-MISMATCH',
  'HOME-SLOTS-FULL',
  'REWARD-AWAITING-CLAIM',
  'NOTI-HISTORY-OPEN',
  'SETTINGS-LANGUAGE-OPEN',
  'LEADERBOARD-LIST',
] as const;

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
}

async function settleVisualPage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function collectLayoutProblems(page: Page) {
  return page.evaluate(() => {
    const horizontalOverflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      ) - window.innerWidth;

    const clippedText = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button,a,label,h1,h2,h3,p,small,[role="button"]',
      ),
    ).flatMap((element) => {
      const text = element.innerText?.trim() ?? '';
      if (!text) return [];

      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight * 4
      ) {
        return [];
      }

      const style = getComputedStyle(element);
      const clipsX =
        element.scrollWidth > element.clientWidth + 2 &&
        (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
        style.textOverflow !== 'ellipsis';

      const lineClamp =
        style.getPropertyValue('-webkit-line-clamp').trim();
      const clipsY =
        element.scrollHeight > element.clientHeight + 2 &&
        (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
        (!lineClamp || lineClamp === 'none' || lineClamp === '0');

      if (!clipsX && !clipsY) return [];

      return [{
        tag: element.tagName.toLowerCase(),
        className: element.className?.toString().slice(0, 140) ?? '',
        text: text.slice(0, 180),
        clipsX,
        clipsY,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }];
    });

    const bodyText = document.body?.innerText ?? '';
    const unresolvedCopy = [
      /\bundefined\b/i,
      /\[missing translation\]/i,
      /\{\{[^}]+\}\}/,
    ].flatMap((pattern) => {
      const match = bodyText.match(pattern);
      return match ? [match[0]] : [];
    });

    return {
      horizontalOverflow,
      clippedText,
      unresolvedCopy,
    };
  });
}

async function captureAndAssert(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await settleVisualPage(page);
  const problems = await collectLayoutProblems(page);

  await page.screenshot({
    path: testInfo.outputPath(`${safeName(name)}.png`),
    fullPage: true,
  });

  expect(
    problems.horizontalOverflow,
    `horizontal viewport overflow: ${JSON.stringify(problems)}`,
  ).toBeLessThanOrEqual(1);
  expect(
    problems.clippedText,
    `clipped visible text: ${JSON.stringify(problems.clippedText)}`,
  ).toEqual([]);
  expect(
    problems.unresolvedCopy,
    `unresolved translation tokens: ${JSON.stringify(problems.unresolvedCopy)}`,
  ).toEqual([]);
}

for (const locale of SUPPORTED_LOCALES) {
  test(`all-locale landing layout: ${locale}`, async ({ page }, testInfo) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(
      `/qa/render?scenario=invite-landing-ko-mobile&locale=${encodeURIComponent(locale)}`,
    );
    await captureAndAssert(page, testInfo, `landing-${locale}-mobile`);

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.reload();
    await captureAndAssert(page, testInfo, `landing-${locale}-desktop`);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  for (const stateId of CRITICAL_STATE_IDS) {
    test(`critical translated state: ${locale} / ${stateId}`, async ({ page }, testInfo) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto(
        `/qa/state?state=${encodeURIComponent(stateId)}&locale=${encodeURIComponent(locale)}`,
      );
      await captureAndAssert(
        page,
        testInfo,
        `${stateId}-${locale}-mobile`,
      );
    });
  }
}
