import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,  // les tests partagent la même API
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Émulation Crosscall T5 (Android, 10 pouces)
    ...devices["Pixel 7"],
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "America/Guadeloupe",
  },

  projects: [
    {
      name: "chromium-tablet",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 800, height: 1280 },
      },
    },
  ],
});
