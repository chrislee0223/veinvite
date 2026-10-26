import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  globalSetup: './tests/playwright/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results',
  webServer: {
    // CI exercises the same precompiled Next server model as a deployment.
    // Local QA keeps the fast, existing interactive development server.
    command:
      process.env.VEINVITE_PLAYWRIGHT_PREBUILT === 'true'
        ? 'npm run start -- --hostname 127.0.0.1 --port 3100'
        : 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/qa/render',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VEINVITE_QA_STUDIO: 'true',
    },
  },
});
