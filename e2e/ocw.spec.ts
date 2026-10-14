import { expect, test } from "@playwright/test";
import { completedCount, importCourse, openLesson, sidebar, zip } from "./helpers";

test.describe("MIT OCW course (18.657)", () => {
  test.beforeEach(async ({ page }) => {
    await importCourse(page, "ocw-18657.zip");
  });

  test("course home shows metadata, sections and OCW pages as tabs", async ({ page }) => {
    await expect(page.getByText("Prof. Philippe Rigollet").first()).toBeVisible();
    await expect(page.getByText("Graduate").first()).toBeVisible();
    await expect(sidebar(page).getByText("Lecture Notes", { exact: true })).toBeVisible();
    await expect(sidebar(page).getByText("L2 · Binary Classification")).toBeVisible();

    await page.getByRole("button", { name: "Syllabus", exact: true }).click();
    await expect(page.getByText("Course Meeting Times")).toBeVisible();

    // links inside OCW pages open the matching lesson
    await page.getByRole("button", { name: "Lecture Notes", exact: true }).first().click();
    await page.getByRole("link", { name: /Binary Classification/ }).click();
    await expect(page.getByRole("heading", { name: "L2 · Binary Classification" })).toBeVisible();
  });

  test("All files tab accounts for every file", async ({ page }) => {
    await page.getByRole("button", { name: "All files" }).click();
    await expect(page.getByText(/files in this course/)).toBeVisible();
    await expect(page.getByText(/Lecture Notes › L1 · Introduction/)).toBeVisible();
    await expect(page.getByText(/Assignment 1 › solution/)).toBeVisible();
  });

  test("PDF lessons render, keyboard moves between lessons, progress persists", async ({ page }) => {
    await page.getByRole("button", { name: /Start course/ }).click();
    await expect(page.getByRole("heading", { name: /Full Lecture Notes/ })).toBeVisible();
    await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();

    await page.keyboard.press("j");
    await expect(page.getByRole("heading", { name: "L1 · Introduction" })).toBeVisible();
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
    expect(await completedCount(page)).toBe("1 of 6 lessons complete");

    await page.reload();
    await expect(sidebar(page).getByText("1 of 6 lessons complete")).toBeVisible();
    await page.keyboard.press("k");
    await expect(page.getByRole("heading", { name: /Full Lecture Notes/ })).toBeVisible();
  });

  test("solutions stay locked until revealed", async ({ page }) => {
    await openLesson(page, /^Assignment 1/);
    await expect(page.getByRole("tab", { name: "Problem" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Solution" }).click();
    await expect(page.getByText("Try the problems first")).toBeVisible();
    await page.getByRole("button", { name: "Reveal solution" }).click();
    await expect(page.getByRole("tab", { name: "Solution" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();

    // once revealed, it opens directly
    await page.getByRole("tab", { name: "Problem" }).click();
    await page.getByRole("tab", { name: "Solution" }).click();
    await expect(page.getByText("Try the problems first")).toHaveCount(0);
  });

  test("re-importing offers an update that keeps progress, and re-analysis keeps it too", async ({ page }) => {
    await openLesson(page, "L1 · Introduction");
    await page.getByRole("button", { name: "Mark complete", exact: true }).click();
    await expect(sidebar(page).getByText("1 of 6 lessons complete")).toBeVisible();

    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(zip("ocw-18657.zip"));
    await expect(page.getByText("You already have this course")).toBeVisible();
    await page.getByRole("button", { name: "Update existing" }).click();
    await page.waitForURL(/\/course\//);
    await expect(sidebar(page).getByText("1 of 6 lessons complete")).toBeVisible();

    await page.getByRole("button", { name: "Course overview" }).click();
    await page.getByRole("button", { name: /Re-analyze structure/ }).click();
    await expect(page.getByText(/Found 6 lessons in 2 sections. Progress kept./)).toBeVisible();
    await expect(sidebar(page).getByText("1 of 6 lessons complete")).toBeVisible();
  });
});
