import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { OUT } from "./fixtures";

export const zip = (name: string) => path.join(OUT, name);

/** Drop a zip on the library page and wait for the course page. */
export async function importCourse(page: Page, file: string) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(zip(file));
  await page.waitForURL(/\/course\//, { timeout: 45_000 });
  await expect(page.locator("aside").first()).toBeVisible();
}

export const sidebar = (page: Page) => page.locator("aside").first();

export async function openLesson(page: Page, title: string | RegExp) {
  const s = sidebar(page);
  // expand every collapsed section so the lesson is clickable
  const collapsed = s.locator('button[aria-expanded="false"]');
  for (let n = await collapsed.count(); n > 0; n = await collapsed.count()) await collapsed.first().click();
  await s.locator("[data-lesson]").filter({ hasText: title }).first().locator("button").nth(1).click();
}

export async function completedCount(page: Page) {
  const t = await sidebar(page).getByText(/\d+ of \d+ lessons complete/).innerText();
  return t;
}
