import { expect, test, type Page } from '@playwright/test';

type PromotionState =
  | 'OPEN'
  | 'RETENTION'
  | 'EXPIRED';

const INVITE_CODE = 'Q7N7T22';
const SHARE_TOKEN =
  '123e4567-e89b-42d3-a456-426614174000';

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
          offerStatus:
            state === 'EXPIRED'
              ? 'CLOSED'
              : 'AVAILABLE',
          pendingPromotionAmountWei: null,
          pendingPromotionAmountB3tr: null,
          promotion: {
            inviteCode: INVITE_CODE,
            state,
            amountWei:
              '10000000000000000000',
            amountB3tr: '10',
            openedAt:
              new Date(
                now - 60_000,
              ).toISOString(),
            postDeadlineAt:
              new Date(
                now + 23 * 60 * 60_000,
              ).toISOString(),
            submissionGraceSeconds: 900,
            shareToken:
              state === 'OPEN'
                ? SHARE_TOKEN
                : null,
            submittedAt:
              state === 'RETENTION'
                ? new Date(
                    now - 30_000,
                  ).toISOString()
                : null,
            verifyAfter:
              state === 'RETENTION'
                ? new Date(
                    now + 24 * 60 * 60_000,
                  ).toISOString()
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
  await page.setViewportSize({
    width: 320,
    height: 740,
  });
  await page.goto(
    `/qa/notification-state?state=NOTI-REWARD-PAID&locale=${locale}`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    },
  );
  await page
    .locator('.notificationHistoryRow')
    .click();
}

test('OPEN promotion fits Korean narrow mobile and exposes the qualified share flow', async ({ page }) => {
  await openRewardReceipt(
    page,
    'ko',
    'OPEN',
  );

  await expect(
    page.getByRole('button', {
      name: /X에 공유하고 \+10 B3TR 받기/u,
    }),
  ).toBeVisible();
  await expect(
    page.locator('.postSubmitRow input'),
  ).toHaveAttribute('dir', 'ltr');
  await expect(
    page.locator('.postSubmitRow'),
  ).toBeVisible();

  const overflow =
    await page
      .locator('.notificationHistoryPanel')
      .evaluate((node) => {
        const root = node as HTMLElement;
        return (
          root.scrollWidth >
          root.clientWidth + 2
        );
      });
  expect(overflow).toBe(false);
});

test('OPEN promotion preserves RTL panel while URL input remains LTR', async ({ page }) => {
  await openRewardReceipt(
    page,
    'ar',
    'OPEN',
  );

  await expect(
    page.locator(
      '.notificationHistoryPanel',
    ),
  ).toHaveAttribute('dir', 'rtl');
  await expect(
    page.locator('.postSubmitRow input'),
  ).toHaveAttribute('dir', 'ltr');
});

test('RETENTION hides share and Post submission controls', async ({ page }) => {
  await openRewardReceipt(
    page,
    'de',
    'RETENTION',
  );

  await expect(
    page.locator('.promotionStatus'),
  ).toBeVisible();
  await expect(
    page.locator(
      '.notificationXShare.promotion',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('.postSubmitRow'),
  ).toHaveCount(0);
});

test('EXPIRED falls back to ordinary sharing without implying a bonus', async ({ page }) => {
  await openRewardReceipt(
    page,
    'ko',
    'EXPIRED',
  );

  await expect(
    page.locator('.promotionAction'),
  ).toHaveCount(0);
  await expect(
    page.locator('.promotionStatus'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'X에 공유',
    }),
  ).toBeVisible();
});
