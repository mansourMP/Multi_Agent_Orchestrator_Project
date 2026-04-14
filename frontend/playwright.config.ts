import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'sh ./scripts/start-e2e-backend.sh',
      url: 'http://127.0.0.1:8001/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        "EMPYRALIS_API_URL='http://127.0.0.1:8001' ORION_API_URL='http://127.0.0.1:8001' NEXT_PUBLIC_ORION_API_URL='http://127.0.0.1:8001' NEXT_PUBLIC_API_URL='http://127.0.0.1:8001' npm run dev:e2e",
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
