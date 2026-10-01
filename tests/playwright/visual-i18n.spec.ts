import { expect, test, type Page, type TestInfo } from '@playwright/test';

import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '../../src/lib/i18n/locales';

const NARROW_MOBILE_VIEWPORT = { width: 320, height: 740 };
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const WIDE_MOBILE_VIEWPORT = { width: 480, height: 840 };
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
  'NOTI-SECURITY-REVIEW',
  'NOTI-POST-PAYOUT-REVIEW',
  'NOTI-POST-PAYOUT-CLEARED',
  'NOTI-SECURITY-RESTRICTED',
  'NOTI-REFERRAL-INVALIDATED',
  'NOTI-REFERRAL-RESTORED',
  'SETTINGS-LANGUAGE-OPEN',
  'LEADERBOARD-LIST',
  'NETWORK-I18N-MY',
  'NETWORK-I18N-GROUPS',
  'NETWORK-I18N-PUBLIC',
] as const;

async function settleVisualPage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 1_200)),
      ]);
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
  _testInfo: TestInfo,
  _name: string,
): Promise<void> {
  await settleVisualPage(page);
  const problems = await collectLayoutProblems(page);


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
      {
        waitUntil: 'domcontentloaded',
        // The first parallel landing requests can trigger the QA route's
        // cold compilation on CI. Keep layout assertions strict, but give
        // initial navigation enough time to finish compiling.
        timeout: 30_000,
      },
    );
    await captureAndAssert(page, testInfo, `landing-${locale}-mobile`);

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await captureAndAssert(page, testInfo, `landing-${locale}-desktop`);
  });
}

for (const locale of HIGH_RISK_LOCALES) {
  for (const stateId of CRITICAL_STATE_IDS) {
    test(`critical translated state: ${locale} / ${stateId}`, async ({ page }, testInfo) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto(
        `/qa/state?state=${encodeURIComponent(stateId)}&locale=${encodeURIComponent(locale)}`,
        { waitUntil: 'domcontentloaded', timeout: 12_000 },
      );
      await captureAndAssert(
        page,
        testInfo,
        `${stateId}-${locale}-mobile`,
      );
    });
  }
}




async function assertPublicInviteSlotsVisible(page: Page): Promise<void> {
  const slotNodes = page.locator('.publicSlotNode');
  await expect(slotNodes).toHaveCount(2);

  const slotMetrics = await slotNodes.evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity || '1'),
        position: style.position,
      };
    }),
  );

  for (const metric of slotMetrics) {
    expect(metric.width).toBeGreaterThanOrEqual(51);
    expect(metric.height).toBeGreaterThanOrEqual(51);
    expect(metric.display).not.toBe('none');
    expect(metric.visibility).toBe('visible');
    expect(metric.opacity).toBeGreaterThan(0);
    expect(metric.position).toBe('absolute');
  }

  const states = await slotNodes.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-slot-state')),
  );
  expect(states).toEqual(['AVAILABLE', 'IN_PROGRESS']);

  const edgeMetrics = await page
    .locator('[data-public-slot-edges="true"] path')
    .evaluateAll((paths) =>
      paths.map((path) => {
        const style = getComputedStyle(path);
        return {
          stroke: style.stroke,
          strokeWidth: Number.parseFloat(style.strokeWidth || '0'),
          opacity: Number(style.opacity || '1'),
        };
      }),
    );

  expect(edgeMetrics.length).toBeGreaterThanOrEqual(2);
  for (const edge of edgeMetrics) {
    expect(edge.stroke).not.toBe('none');
    expect(edge.strokeWidth).toBeGreaterThan(0);
    expect(edge.opacity).toBeGreaterThan(0);
  }
}

test('public Network invite slots are visibly rendered on mobile and desktop', async ({ page }) => {
  for (const viewport of [MOBILE_VIEWPORT, DESKTOP_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await page.goto(
      '/qa/state?state=NETWORK-I18N-PUBLIC&locale=ko',
      { waitUntil: 'domcontentloaded', timeout: 12_000 },
    );
    await settleVisualPage(page);
    await assertPublicInviteSlotsVisible(page);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(
    '/qa/state?state=NETWORK-I18N-PUBLIC&locale=ko',
    { waitUntil: 'domcontentloaded', timeout: 12_000 },
  );
  await settleVisualPage(page);

  const availableCircleAnimation = await page
    .locator('.publicSlotNode[data-slot-state="AVAILABLE"] .publicSlotCircle')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(availableCircleAnimation).toBe('none');

  const pulseAnimation = await page
    .locator('.publicSlotEdgePulse')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(pulseAnimation).toBe('none');
});

for (const locale of ['ko', 'de', 'fr', 'ar', 'ur', 'bn', 'mr', 'te'] as const satisfies readonly SupportedLocale[]) {
  for (const stateId of [
    'NOTI-HISTORY-OPEN',
    'NOTI-POST-PAYOUT-REVIEW',
    'NOTI-POST-PAYOUT-CLEARED',
    'NOTI-REFERRAL-INVALIDATED',
    'NOTI-REFERRAL-RESTORED',
  ] as const) {
    test(`narrow-mobile notification layout: ${locale} / ${stateId}`, async ({ page }, testInfo) => {
      await page.setViewportSize(NARROW_MOBILE_VIEWPORT);
      await page.goto(
        `/qa/state?state=${encodeURIComponent(stateId)}&locale=${encodeURIComponent(locale)}`,
        { waitUntil: 'domcontentloaded', timeout: 12_000 },
      );
      await captureAndAssert(
        page,
        testInfo,
        `${stateId}-${locale}-narrow-mobile`,
      );
    });
  }
}

for (const locale of SUPPORTED_LOCALES) {
  test(`all-locale Network group layout: ${locale}`, async ({ page }, testInfo) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(
      `/qa/state?state=NETWORK-I18N-GROUPS&locale=${encodeURIComponent(locale)}`,
      { waitUntil: 'domcontentloaded', timeout: 12_000 },
    );
    await captureAndAssert(
      page,
      testInfo,
      `NETWORK-I18N-GROUPS-${locale}-mobile`,
    );
  });
}

for (const locale of ['de', 'ur', 'ar', 'cs'] as const satisfies readonly SupportedLocale[]) {
  test(`wide-mobile notification header: ${locale}`, async ({ page }, testInfo) => {
    await page.setViewportSize(WIDE_MOBILE_VIEWPORT);
    await page.goto(
      `/qa/state?state=NOTI-HISTORY-OPEN&locale=${encodeURIComponent(locale)}`,
      { waitUntil: 'domcontentloaded', timeout: 12_000 },
    );
    await captureAndAssert(
      page,
      testInfo,
      `NOTI-HISTORY-OPEN-${locale}-wide-mobile`,
    );
  });
}
