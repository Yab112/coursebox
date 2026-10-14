import { expect, test } from "@playwright/test";
import { importCourse, openLesson, sidebar } from "./helpers";

test.describe("generic folder course", () => {
  test.beforeEach(async ({ page }) => {
    await importCourse(page, "python-crash-course.zip");
  });

  test("README becomes title, description and overview", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Python Crash Course" }).first()).toBeVisible();
    await expect(page.getByText("Learn Python from zero").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you get" })).toBeVisible();
    await expect(sidebar(page).getByText("Getting Started")).toBeVisible();
    await expect(sidebar(page).getByText("Basics", { exact: true })).toBeVisible();
  });

  test("video plays with its subtitles and bundled slides", async ({ page }) => {
    await openLesson(page, /^Welcome/);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    const info = await video.evaluate(async (el: HTMLVideoElement) => {
      if (el.readyState < 1) await new Promise((r) => el.addEventListener("loadedmetadata", r, { once: true }));
      await new Promise((r) => setTimeout(r, 300));
      return { duration: el.duration, tracks: el.textTracks.length };
    });
    expect(info.duration).toBeGreaterThan(3);
    expect(info.tracks).toBe(1);

    await page.getByRole("tab", { name: "Welcome" }).click();
    await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();
  });

  test("Udemy-style 1.1 resources attach to lecture 1", async ({ page }) => {
    await openLesson(page, /^Variables/);
    await expect(page.getByRole("tab", { name: "Variables Cheatsheet" })).toBeVisible();
  });

  test("markdown, code and nested zip lessons are viewable", async ({ page }) => {
    await openLesson(page, /^Setup Notes/);
    await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();

    await openLesson(page, /^Hello/);
    await expect(page.getByText('print("hello world")')).toBeVisible();

    await openLesson(page, /^Exercise Bundle/);
    await expect(page.getByText("exercise.py")).toBeVisible();
    await page.getByRole("button", { name: /^exercise\.py/ }).click();
    await expect(page.getByText("def add(a, b):")).toBeVisible();
  });
});
