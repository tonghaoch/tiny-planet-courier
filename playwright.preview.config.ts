import { defineConfig } from '@playwright/test';
import config from './playwright.config';

const baseURL = 'http://127.0.0.1:4173/tiny-planet-courier/';

export default defineConfig({
  ...config,
  testDir: './tests/production',
  use: { ...config.use, baseURL },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
