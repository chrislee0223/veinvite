import { expect, test } from '@playwright/test';

// Exercise the real VeChainKit + DAppKit client provider on the standard
// anonymous Home route. The visual QA studio bypasses this provider, so its
// tests alone cannot catch a patched transitive Zod runtime incompatibility.
//
// Never select a wallet, request signatures, perform on-chain transactions,
// submit a reward claim, or enable the live payout/X verifier in this test.
test('wallet SDK initializes and opens the VeWorld selector without signing', async ({ page }) => {
  // This heavy real-provider smoke runs in a dedicated, single-worker GitHub
  // job. Parallelizing it with 639 layout cases competes for the Next dev
  // compiler and produces false page-navigation timeouts.
  test.skip(
    process.env.VEINVITE_WALLET_RUNTIME_QA !== 'true',
    'Wallet provider smoke runs in the dedicated isolated QA job.',
  );
  test.setTimeout(180_000);

  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  const response = await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  expect(response?.ok(), 'anonymous home route must be loadable').toBe(true);

  // ProviderReadySignal only mounts under the real VeChainKitProvider.
  await expect.poll(
    () => page.evaluate(() => document.documentElement.dataset.veinviteProviderReady),
    { timeout: 45_000, message: 'real VeChainKitProvider did not become ready' },
  ).toBe('true');

  // The safe anonymous route exposes the connect UI without any wallet proof.
  const connect = page.locator('.missionCard button.primaryAction').first();
  await expect(connect).toBeVisible({ timeout: 30_000 });
  await expect(connect).toBeEnabled();
  await connect.click();

  // Do not choose a wallet or run certificate signing. Showing the SDK
  // selection UI is the boundary of this test.
  await expect(
    page.getByText(/veworld/i).first(),
    'VeWorld wallet choice must mount without transitive Zod crashes',
  ).toBeVisible({ timeout: 20_000 });

  const sdkErrors = runtimeErrors.filter((message) =>
    /zod|schema|validator|cannot convert object to primitive|vechain.?kit|walletconnect|privy|reown/i.test(message),
  );
  expect(sdkErrors, 'real SDK initialization or modal must not throw').toEqual([]);

  // Closing the selector should not issue a reward or sign a certificate.
  await page.keyboard.press('Escape');
});
