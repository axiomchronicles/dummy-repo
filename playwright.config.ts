import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  // chat.spec needs the fake-stream model API (CHAT_WEB_URL, :5180 in run-services);
  // workflow.spec asserts the deterministic local planner (WORKFLOW_WEB_URL, :5190).
  projects: [
    {
      name: 'chat',
      testMatch: /chat\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL:
          process.env.CHAT_WEB_URL ??
          process.env.WEB_URL ??
          'http://localhost:5173',
      },
    },
    {
      name: 'workflow',
      testMatch: /workflow\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL:
          process.env.WORKFLOW_WEB_URL ??
          process.env.WEB_URL ??
          'http://localhost:5173',
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
