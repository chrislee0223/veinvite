import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
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
  },
  outputDir: 'test-results',
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/qa/render',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VEINVITE_QA_STUDIO: 'true',
    },
  },
});
