import { expect, test, type Page } from '@playwright/test';

import { getLeaderboardMovementCopy } from '../../src/lib/i18n/leaderboardMovementCopy';
import {
  SUPPORTED_LOCALES,
  isRtlLocale,
} from '../../src/lib/i18n/locales';
import type {
  PublicCountryArrivalResponse,
  PublicLeaderboardResponse,
} from '../../src/lib/types';

const FIXTURE_PUBLIC: PublicLeaderboardResponse = {
  generatedAt: '2026-11-17T00:00:00.000Z',
  network: 'testnet',
  currentRoundId: 125,
  reportingStartRound: 110,
  comparison: {
    available: true,
    roundId: 124,
    endBlock: 20000000,
    publishedAt: '2026-11-16T00:00:00.000Z',
    rankingAlgorithmVersion: 'recognized_referrals_v3',
  },
  impact: { totalActivatedUsers: 19, newUsers: 18, returningUsers: 1 },
  leaders: [
    {
      rank: 1,
      walletAddress: '0x0000000000000000000000000000000000000b01',
      completedReferrals: 6,
      totalRewardWei: '720000000000000000000',
      isCurrentWallet: false,
      previousRank: 1,
      rankChange: 0,
      rankMovement: 'SAME',
    },
  ],
  currentUser: null,
};

const FIXTURE_COUNTRIES: PublicCountryArrivalResponse = {
  generatedAt: '2026-11-17T00:00:00.000Z',
  network: 'testnet',
  currentRoundId: 125,
  knownCompleted: 19,
  unknownCompleted: 2,
  leaders: [
    {
      rank: 1, countryCode: 'TR', completedReferrals: 11,
      newUsers: 11, returningUsers: 0, currentRoundCompleted: 0,
      previousRank: 1, rankChange: 0, rankMovement: 'SAME',
    },
    {
      rank: 2, countryCode: 'RO', completedReferrals: 3,
      newUsers: 3, returningUsers: 0, currentRoundCompleted: 2,
      previousRank: 4, rankChange: 2, rankMovement: 'UP',
    },
    {
      rank: 3, countryCode: 'NG', completedReferrals: 2,
      newUsers: 2, returningUsers: 0, currentRoundCompleted: 0,
      previousRank: 2, rankChange: -1, rankMovement: 'DOWN',
    },
    {
      rank: 4, countryCode: 'US', completedReferrals: 2,
      newUsers: 1, returningUsers: 1, currentRoundCompleted: 1,
      previousRank: null, rankChange: null, rankMovement: 'NEW',
    },
    {
      rank: 5, countryCode: 'DE', completedReferrals: 1,
      newUsers: 1, returningUsers: 0, currentRoundCompleted: 0,
      previousRank: 5, rankChange: 0, rankMovement: 'SAME',
    },
    {
      // An unknown-country aggregate must not acquire fake rank movement.
      rank: 6, countryCode: 'ZZ', completedReferrals: 2,
      newUsers: 2, returningUsers: 0, currentRoundCompleted: 0,
      previousRank: null, rankChange: null, rankMovement: 'UNAVAILABLE',
    },
  ],
};

// Intercept only read-only public leaderboard GETs. Never modify actual
// records, set wallets, connect to Production, or interact with payout APIs.
async function mockReadOnlyLeaderboard(page: Page) {
  const intercept = async (route: import('@playwright/test').Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data =
      pathname === '/api/leaderboard/country'
        ? FIXTURE_COUNTRIES
        : FIXTURE_PUBLIC;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
      headers: { 'cache-control': 'no-store' },
    });
  };

  await page.route('**/api/leaderboard', intercept);
  await page.route('**/api/leaderboard?*', intercept);
  await page.route('**/api/leaderboard/country', intercept);
  await page.route('**/api/leaderboard/country?*', intercept);
}

async function assertCountryGeometry(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.leaderboardHub');
    const panel = root?.querySelector<HTMLElement>('.countryPanel');
    const header = panel?.querySelector<HTMLElement>('.countryHeader');
    const row = panel?.querySelector<HTMLElement>('.countryRow');
    if (!root || !panel || !header || !row) {
      throw new Error('Actual country-ranking component was not mounted');
    }

    const rect = (element: Element) => element.getBoundingClientRect();
    const centers = (element: Element) => Array.from(element.children)
      .slice(2).map((node) => {
        const b = rect(node);
        return (b.left + b.right) / 2;
      });

    const arrows = [...panel.querySelectorAll<HTMLElement>('.countryRankMovement')];
    const clippedArrows = arrows.flatMap((arrow) => {
      const bounds = rect(arrow);
      const parentBounds = rect(arrow.parentElement!);
      return (
        arrow.scrollWidth > arrow.clientWidth + 1 ||
        bounds.left < parentBounds.left - 1 ||
        bounds.right > parentBounds.right + 1
      ) ? [arrow.textContent ?? ''] : [];
    });
    const p = rect(panel);
    return {
      viewportWidth: innerWidth,
      documentOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        innerWidth,
      panelInViewport: p.left >= -1 && p.right <= innerWidth + 1,
      rowInPanel: rect(row).left >= p.left - 1 && rect(row).right <= p.right + 1,
      headerCenters: centers(header),
      valueCenters: centers(row),
      clippedArrows,
    };
  });

  expect(result.panelInViewport, JSON.stringify(result)).toBe(true);
  expect(result.rowInPanel, JSON.stringify(result)).toBe(true);
  expect(result.documentOverflow, JSON.stringify(result)).toBeLessThanOrEqual(1);
  expect(result.clippedArrows, JSON.stringify(result)).toEqual([]);
  expect(result.headerCenters).toHaveLength(3);
  for (let col = 0; col < 3; col += 1) {
    expect(
      Math.abs(result.headerCenters[col] - result.valueCenters[col]),
      JSON.stringify({ col, result }),
    ).toBeLessThanOrEqual(1.5);
  }
}

test.describe.configure({ mode: 'parallel' });

for (const locale of SUPPORTED_LOCALES) {
  test(`country rank movement real UI: ${locale}, mobile and desktop`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await mockReadOnlyLeaderboard(page);
    await page.setViewportSize({ width: 320, height: 852 });
    await page.goto(
      `/qa/country-rank-movement?locale=${encodeURIComponent(locale)}`,
      { waitUntil: 'domcontentloaded' },
    );

    const tab = page.locator('.leaderboardHub .rankingTabs button[role="tab"]').nth(1);
    // Hydration of the shared wallet-heavy leaderboard can exceed the global
    // 5-second expect timeout on a cold, parallel CI worker. Waiting for the
    // real tab is not a test skip: all display and geometry assertions follow.
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await tab.click();

    const rows = page.locator('.leaderboardHub .countryRow');
    await expect(rows).toHaveCount(6);
    const copy = getLeaderboardMovementCopy(locale);

    await expect(rows.nth(1).locator('.countryRankMovement.up')).toHaveText('▲2');
    await expect(rows.nth(2).locator('.countryRankMovement.down')).toHaveText('▼1');
    await expect(rows.nth(3).locator('.countryRankMovement.new')).toHaveText(copy.newEntry);
    await expect(rows.nth(0).locator('.countryRankMovement')).toHaveCount(0);
    await expect(rows.nth(4).locator('.countryRankMovement')).toHaveCount(0);
    await expect(rows.nth(5).locator('.countryRankMovement')).toHaveCount(0);

    await expect(rows.nth(1).locator('.countryRank')).toHaveAttribute('title', copy.up(2));
    await expect(rows.nth(2).locator('.countryRank')).toHaveAttribute('title', copy.down(1));
    await expect(rows.nth(3).locator('.countryRank')).toHaveAttribute('title', copy.newEntryAria);
    await expect(rows.nth(4).locator('.countryRank')).toHaveAttribute('title', copy.same);

    const badgeDirection = await rows.nth(3).locator('.countryRankMovement.new')
      .evaluate((node) => getComputedStyle(node).direction);
    expect(badgeDirection).toBe(isRtlLocale(locale) ? 'rtl' : 'ltr');

    await assertCountryGeometry(page);
    if (['ko', 'ar', 'ur'].includes(locale)) {
      await testInfo.attach(`country-rank-${locale}-320.png`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    }

    for (const width of locale === 'ko' || isRtlLocale(locale)
      ? [393, 1280]
      : [1280]) {
      await page.setViewportSize({ width, height: 900 });
      await assertCountryGeometry(page);
    }
  });
}


for (const width of [320, 393]) {
  test(`mobile inner country-tab transition does not scroll the outer page: ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await mockReadOnlyLeaderboard(page);
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/qa/country-rank-movement?locale=ko', {
      waitUntil: 'domcontentloaded',
    });

    const tabs = page.locator('.leaderboardHub .rankingTabs button[role="tab"]');
    const inviter = tabs.nth(0);
    const country = tabs.nth(1);
    await expect(country).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator('.leaderboardHub .inviterInside .rankScroll')).toBeVisible();

    // Make the outer document scrollable even on short QA pages. Mobile
    // users often enter this tab after scrolling the full leaderboard page.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.dataset.testOnly = 'outer-scroll-space';
      spacer.style.height = '900px';
      document.body.appendChild(spacer);
    });
    await country.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const scrollable = Math.max(
        0,
        (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
      );
      window.scrollTo(0, Math.min(80, scrollable));
    });
    await country.scrollIntoViewIfNeeded();

    const original = await page.evaluate(() => ({
      y: window.scrollY,
      height: document.querySelector('.leaderboardHub .unifiedRankingCard')!
        .getBoundingClientRect().height,
    }));

    await country.click();
    await expect(page.locator('.leaderboardHub .countryRow')).toHaveCount(6);
    await page.waitForTimeout(220);
    const during = await page.evaluate(() => ({
      y: window.scrollY,
      height: document.querySelector('.leaderboardHub .unifiedRankingCard')!
        .getBoundingClientRect().height,
      countryBottomGap: (() => {
        const panel = document.querySelector<HTMLElement>('.leaderboardHub .countryPanel')!;
        const scroll = panel.querySelector<HTMLElement>('.countryScroll')!;
        return panel.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom;
      })(),
      inlineMinHeight: document.querySelector<HTMLElement>('.leaderboardHub .countryPanel')!
        .style.minHeight,
    }));
    expect(Math.abs(during.y - original.y), JSON.stringify({ original, during }))
      .toBeLessThanOrEqual(2);
    // Country content naturally ends at the bottom of the country scroll:
    // unlike the previous height lock, no 100px+ empty area is allowed.
    expect(during.inlineMinHeight).toBe('');
    expect(during.countryBottomGap, JSON.stringify({ original, during }))
      .toBeLessThanOrEqual(14);
    expect(during.height).toBeLessThanOrEqual(original.height + 2);

    await inviter.click();
    await expect(page.locator('.leaderboardHub .inviterInside .rankScroll')).toBeVisible();
    await page.waitForTimeout(220);
    const after = await page.evaluate(() => ({
      y: window.scrollY,
      height: document.querySelector('.leaderboardHub .unifiedRankingCard')!
        .getBoundingClientRect().height,
    }));
    expect(Math.abs(after.y - original.y), JSON.stringify({ original, after }))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(after.height - original.height))
      .toBeLessThanOrEqual(2);
  });
}
