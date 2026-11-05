import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: 'local-workspace.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/workspace',
  reporter: 'list',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [1440, 768, 360].map((width) => ({
    name: `workspace-${width}`,
    use: { browserName: 'chromium', viewport: { width, height: 900 } },
  })),
  webServer: {
    command:
      'node apps/web/node_modules/vite/bin/vite.js preview apps/web --config apps/web/vite.workspace.config.ts --host 127.0.0.1 --port 4310 --strictPort',
    url: 'http://127.0.0.1:4310',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
