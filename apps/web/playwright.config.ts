import { defineConfig } from "@playwright/test";

// ponytail: no webServer block — suites run against the already-running
// `bun run dev` on :3050. Add one if CI needs a self-contained run.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    baseURL: "http://localhost:3050",
  },
  projects: [
    {
      name: "headless",
      testMatch: /headless\.spec\.ts/,
      use: { headless: true },
    },
    {
      name: "headed",
      testMatch: /headed\.spec\.ts/,
      use: { headless: false, viewport: { width: 1440, height: 900 } },
    },
  ],
});
