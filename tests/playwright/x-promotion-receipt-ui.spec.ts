import { expect, test, type Page } from '@playwright/test';

type PromotionState = 'OPEN' | 'RETENTION' | 'EXPIRED';

const INVITE_CODE = 'Q7N7T22';
const SHARE_TOKEN = '123e4567-e89b-42d3-a456-426614174000';

async function mockPromotion(
  page: Page,
  state: PromotionState,
) {
  await page.route(
    `**/api/rewards/x-promotion?inviteCode=${INVITE_CODE}`,
    async (route) => {
      const now = Date.now();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          newOffersEnabled: true,
          promotion: {
            inviteCode: INVITE_CODE,
            state,
            amountWei: '10000000000000000000',
            amountB3tr: '10',
            openedAt: new Date(now - 60_000).toISOString(),
            postDeadlineAt: new Date(now + 23 * 60 * 60_000).toISOString(),
            submissionGraceSeconds: 900,
            shareToken: state === 'OPEN' ? SHARE_TOKEN : null,
            submittedAt:
              state === 'RETENTION'
                ? new Date(now - 30_000).toISOString()
                : null,
            verifyAfter:
              state === 'RETENTION'
                ? new Date(now + 24 * 60 * 60_000).toISOString()
                : null,
            paidAt: null,
          },
        }),
      });
    },
  );
}

async function openRewardReceipt(
  page: Page,
  locale: string,
  state: PromotionState,
) {
  await mockPromotion(page, state);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(
    `/qa/notification-state?state=NOTI-REWARD-PAID&locale=${locale}`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  );
  await page.locator('.notificationHistoryRow').click();
  await expect(page.locator('.notificationXPromotion')).toBeVisible();
}

async function expectPromotionFits(
  page: Page,
) {
  const report = await page.locator('.notificationHistoryPanel').evaluate((node) => {
    const root = node as HTMLElement;
    const issues: string[] = [];
    const panel = root.getBoundingClientRect();

    for (const element of root.querySelectorAll<HTMLElement>(
      '.notificationXPromotion,.notificationXPromotionHeading strong,.notificationXPromotionHeading span,.notificationXPromotionSubmit input,.notificationXPromotionSubmit button,.notificationXShare',
    )) {
      if (!element.getClientRects().length) continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.left < panel.left - 2 || bounds.right > panel.right + 2) {
        issues.push('promotion element outside panel: ' + element.className);
      }
      if (
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 2
      ) {
        issues.push('promotion element horizontally clipped: ' + element.className);
      }
    }

    if (root.scrollWidth > root.clientWidth + 2) {
      issues.push('notification panel horizontally overflows');
    }

    return issues;
  });

  expect(report).toEqual([]);
}

test('X promotion OPEN receipt fits Korean narrow mobile and exposes share + submit', async ({ page }) => {
  await openRewardReceipt(page, 'ko', 'OPEN');

  await expect(
    page.getByRole('button', { name: /X에 공유하고 \+10 B3TR 받기/u }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(/x\.com/u),
  ).toBeVisible();
  await expectPromotionFits(page);
});

test('X promotion OPEN receipt preserves RTL layout in Arabic', async ({ page }) => {
  await openRewardReceipt(page, 'ar', 'OPEN');

  await expect(page.locator('.notificationHistoryPanel')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.notificationXPromotionSubmit input')).toHaveAttribute('dir', 'ltr');
  await expectPromotionFits(page);
});

test('X promotion RETENTION receipt hides submission controls', async ({ page }) => {
  await openRewardReceipt(page, 'de', 'RETENTION');

  await expect(page.locator('.notificationXPromotionSubmit')).toHaveCount(0);
  await expect(page.locator('.notificationXPromotion .notificationXShare')).toHaveCount(0);
  await expectPromotionFits(page);
});

test('X promotion EXPIRED receipt does not imply an available bonus', async ({ page }) => {
  await openRewardReceipt(page, 'ko', 'EXPIRED');

  await expect(page.locator('.notificationXPromotionHeading span')).toHaveCount(0);
  await expect(page.locator('.notificationXPromotionSubmit')).toHaveCount(0);
  await expect(page.locator('.notificationXPromotion .notificationXShare')).toHaveCount(0);
  await expectPromotionFits(page);
});
