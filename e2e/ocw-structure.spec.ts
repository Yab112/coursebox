import { expect, test } from "@playwright/test";
import { importCourse, openLesson, sidebar } from "./helpers";

test("6.0001: nested in-class question pages become grouped, interactive lessons", async ({ page }) => {
  await importCourse(page, "ocw-60001.zip");
  await expect(sidebar(page).getByText("In-Class Questions and Video Solutions")).toBeVisible();
  await openLesson(page, "In-class questions for Lecture 1");
  const firstOption = page.locator(".multiple-choice-div input").first();
  await firstOption.check();
  const icon = page.locator(".multiple-choice-div label:has(input:checked) .correctness-icon");
  await expect(icon).toBeVisible();
});

test("18.06SC: units and sessions follow the course's own order", async ({ page }) => {
  await importCourse(page, "ocw-1806sc.zip");
  const nav = sidebar(page);
  await expect(nav.getByText("Unit I: Ax = b and the Four Subspaces")).toBeVisible();
  const titles = await nav.locator("button[aria-expanded] p.font-semibold").allInnerTexts();
  expect(titles).toEqual(["Introduction", "The Geometry of Linear Equations", "Column Space and Nullspace", "Exam 1"]);

  await openLesson(page, "Session overview");
  await expect(page.getByText("Session Activities")).toBeVisible();
  await expect(nav.locator("[data-lesson]").filter({ hasText: "Lecture summary" }).first()).toBeVisible();
});
