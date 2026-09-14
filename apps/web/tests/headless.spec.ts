import { test, expect } from "@playwright/test";

// Headless basics against the live dev server (http://localhost:3050).
// NOTE: run with node (`bunx playwright test`), not `bunx --bun` — the
// Playwright runner does not build specs under the bun runtime.

test("home renders the crop editor", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("FFmpeg Editor");
  await expect(
    page.getByRole("heading", { name: "Crop editor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose video" }),
  ).toBeVisible();
});

test("sidebar tablist lists every editor", async ({ page }) => {
  await page.goto("/");
  const tablist = page.getByRole("tablist", { name: "Editor mode" });
  await expect(tablist).toBeVisible();
  for (const name of ["Crop", "Mobile", "Subtitles", "Bulk", "Cut", "Admin"]) {
    await expect(tablist.getByRole("tab", { name })).toBeVisible();
  }
  await expect(tablist.getByRole("tab", { name: "Crop" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("crop dropzone advertises formats and limits", async ({ page }) => {
  await page.goto("/editor/crop");
  await expect(
    page.getByText("Drop an MP4, WebM, MOV or MKV video here"),
  ).toBeVisible();
  await expect(
    page.getByText("or choose a file · up to 10 GB · Matroska supported"),
  ).toBeVisible();
});

test("capability cards describe the workflow", async ({ page }) => {
  await page.goto("/editor/crop");
  await expect(page.getByRole("heading", { name: "Trim" })).toBeVisible();
  await expect(
    page.getByText("timeline · 0.1s precision · loop"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Crop", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("custom · 1:1 · 16:9 · 21:9")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
  await expect(page.getByText("mp4 · webm · mov · crf 0–60")).toBeVisible();
});

test("every route loads with zero page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
  for (const route of [
    "/",
    "/editor/crop",
    "/editor/mobile",
    "/editor/mobile/subtitles",
    "/editor/mobile/bulk",
    "/editor/cut",
    "/admin",
  ]) {
    const resp = await page.goto(route);
    expect(resp?.status(), route).toBe(200);
    await expect(page).toHaveTitle("FFmpeg Editor");
  }
  expect(errors).toEqual([]);
});
