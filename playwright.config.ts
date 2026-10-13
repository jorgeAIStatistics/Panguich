import { defineConfig, devices } from "@playwright/test";

const PORT = 3211;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Runs the production build against a throwaway demo database, recreated on every run.
    command: `rm -rf .data/e2e && npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      PANGUICH_DEMO_MODE: "1",
      PANGUICH_DATA_DIR: ".data/e2e",
      PANGUICH_SITE_URL: `http://localhost:${PORT}`,
      // The public form allows 5 saved requests per 10 minutes per address; tests need more.
      PANGUICH_CATERING_FORM_LIMIT: "100",
    },
  },
});
