import { expect, test } from "@playwright/test";
import { importCourse } from "./helpers";

test("empty library invites a drop, then shows the imported course card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My learning" })).toBeVisible();
  await expect(page.getByText("Add a course")).toBeVisible();

  await importCourse(page, "ocw-18657.zip");
  await expect(page.getByRole("heading", { name: "Mathematics of Machine Learning" })).toBeVisible();

  await page.getByRole("link", { name: "Library" }).click();
  const card = page.locator("a", { hasText: "Mathematics of Machine Learning" });
  await expect(card).toBeVisible();
  await expect(page.getByText("0/6 lessons")).toBeVisible();
  await expect(page.getByText("Prof. Philippe Rigollet")).toBeVisible();
});

test("a course can be removed from the library", async ({ page }) => {
  await importCourse(page, "ocw-18657.zip");
  await page.goto("/");
  const card = page.locator(".group", { hasText: "Mathematics of Machine Learning" }).first();
  await card.hover();
  await card.getByRole("button", { name: "Course options" }).click();
  await page.getByRole("button", { name: "Remove course" }).click();
  await page.getByRole("button", { name: "Click again to delete" }).click();
  await expect(page.getByText("Mathematics of Machine Learning")).toHaveCount(0);
});
