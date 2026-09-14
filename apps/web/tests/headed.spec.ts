import { test, expect } from "@playwright/test";

// Headed (real GUI) basics. Needs an X server — locally DISPLAY=:0 works,
// otherwise run via `bun run test:e2e:headed` (xvfb-run wrapper).
// NOTE: run with node (`bunx playwright test`), not `bunx --bun`.

test("app paints sidebar and editor visibly", async ({ page }) => {
  await page.goto("/");
  const tab = page.getByRole("tab", { name: "Crop" });
  await expect(tab).toBeVisible();
  const box = await tab.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Crop editor" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/headed-paint.png" });
});

test("sidebar tab navigates to Mobile", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Mobile" }).click();
  await expect(page).toHaveURL(/\/editor\/mobile$/);
  await expect(page).toHaveTitle("FFmpeg Editor");
});

test("sidebar tabs walk Cut then Admin", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Cut" }).click();
  await expect(page).toHaveURL(/\/editor\/cut$/);
  await page.getByRole("tab", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("browser back returns to the previous editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Cut" }).click();
  await expect(page).toHaveURL(/\/editor\/cut$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/editor\/crop|\/$/);
});

test("Choose video opens a file chooser", async ({ page }) => {
  await page.goto("/editor/crop");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose video" }).click(),
  ]);
  expect(chooser).toBeTruthy();
  await chooser.setFiles([]); // dismiss without picking
});
