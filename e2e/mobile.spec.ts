import { expect, test } from "./test";
import { importCourse } from "./helpers";

test("mobile: sidebar is a drawer and dark mode toggles", async ({ page }) => {
  await importCourse(page, "ocw-18657.zip");
  const drawer = page.locator("aside").first();
  await expect(drawer).not.toBeInViewport();
  await page.getByRole("button", { name: "Open course menu" }).click();
  await expect(drawer).toBeInViewport();
  await drawer.locator("[data-lesson]").filter({ hasText: "L1 · Introduction" }).locator("button").nth(1).click();
  await expect(page.getByRole("heading", { name: "L1 · Introduction" })).toBeVisible();
  await expect(drawer).not.toBeInViewport();

  const before = await page.locator("html").getAttribute("class");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).not.toBe(before);
});
