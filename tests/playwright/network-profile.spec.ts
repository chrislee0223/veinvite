import { expect, test, type Page } from '@playwright/test';

const ROOT = '0x1111111111111111111111111111111111111111';
const CHILD = '0x2222222222222222222222222222222222222222';

function networkPayload(focus: string | null) {
  if (focus?.toLowerCase() === CHILD.toLowerCase()) {
    return {
      rootWallet: ROOT,
      focusWallet: CHILD,
      focusDepth: 1,
      invitedBy: ROOT,
      breadcrumb: [ROOT, CHILD],
      summary: {
        network: 7,
        direct: 2,
        qualified: 5,
        thisRound: null,
        depth: 1,
      },
      round: {
        id: 114,
        startAt: '2026-09-14T00:00:00.000Z',
        endAt: '2026-09-21T00:00:00.000Z',
      },
      children: [],
      searchResults: [],
      depthLimitReached: false,
    };
  }

  return {
    rootWallet: ROOT,
    focusWallet: ROOT,
    focusDepth: 0,
    invitedBy: null,
    breadcrumb: [ROOT],
    summary: {
      network: 50,
      direct: 4,
      qualified: 39,
      thisRound: 11,
      depth: 0,
    },
    round: {
      id: 114,
      startAt: '2026-09-14T00:00:00.000Z',
      endAt: '2026-09-21T00:00:00.000Z',
    },
    children: [
      {
        wallet: CHILD,
        status: 'REWARDED',
        joinedAt: '2026-09-01T00:00:00.000Z',
        network: 7,
        direct: 2,
        qualified: 5,
        thisRound: null,
        depth: 1,
      },
    ],
    searchResults: [],
    depthLimitReached: false,
  };
}

async function mockNetwork(page: Page) {
  await page.route('**/api/network/slots**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slots: [
          {
            slot: 1,
            state: 'AVAILABLE',
            inviteeWallet: null,
            completedSteps: 0,
            totalSteps: 5,
          },
          {
            slot: 2,
            state: 'AVAILABLE',
            inviteeWallet: null,
            completedSteps: 0,
            totalSteps: 5,
          },
        ],
      }),
    });
  });

  await page.route(/\/api\/network\?/, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(networkPayload(url.searchParams.get('focus'))),
    });
  });
}

test('production Network node profile is compact and keeps child metrics isolated', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mockNetwork(page);

  await page.goto('/ui-test/network-profile?locale=ko', {
    waitUntil: 'domcontentloaded',
  });

  const child = page.locator('button.childNode').first();
  await expect(child).toBeVisible({ timeout: 10_000 });
  await child.click();

  const card = page.locator('.profileCard');
  await expect(card).toBeVisible();

  const statValues = await card.locator('.profileStats > div > strong').allTextContents();
  expect(statValues).toEqual(['7', '2', '5', '–']);

  const statLabels = await card.locator('.profileStats > div > span').allTextContents();
  expect(statLabels).toEqual([
    '네트워크 규모',
    '직접 초대',
    '미션 완료',
    '이번 라운드',
  ]);

  await expect(card.locator('.profileStatus')).toHaveText('보상 완료');
  await expect(card.locator('.profilePath')).toContainText('나');
  await expect(card.locator('.profileAddress > span')).toHaveText(CHILD);
  await expect(card.locator('.profileAddress > a')).toHaveAttribute(
    'href',
    `https://explore.vechain.org/address/${CHILD}`,
  );

  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeLessThan(300);
  expect(bounds!.left).toBeGreaterThanOrEqual(6);
  expect(bounds!.right).toBeUndefined;

  const selected = page.locator('button.childNode.selected');
  await expect(selected).toHaveCount(1);

  const stage = page.locator('.networkStage');
  const stageBounds = await stage.boundingBox();
  expect(stageBounds).not.toBeNull();
  await stage.click({
    position: {
      x: 6,
      y: Math.max(6, stageBounds!.height - 8),
    },
  });
  await expect(card).toBeHidden();
});

test('focus profile keeps its own round metric and branch state', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mockNetwork(page);

  await page.goto('/ui-test/network-profile?locale=ko', {
    waitUntil: 'domcontentloaded',
  });

  const focus = page.locator('button.focusNode');
  await expect(focus).toBeVisible({ timeout: 10_000 });
  await focus.click();

  const card = page.locator('.profileCard');
  await expect(card).toBeVisible();

  const statValues = await card.locator('.profileStats > div > strong').allTextContents();
  expect(statValues).toEqual(['50', '4', '39', '+11']);
  await expect(card.locator('.profileStatus')).toHaveText('브랜치');
  await expect(card.locator('.profileStatus')).toHaveClass(/status-branch/);
});
