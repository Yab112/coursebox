import { test as base, expect, type Browser, type Page } from "@playwright/test";

export const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
export const API = `http://localhost:${API_PORT}`;

/** Points the app at the e2e API (see server/scripts/e2e-api.sh). */
export async function pointAtTestApi(page: Page) {
  await page.addInitScript((api) => localStorage.setItem("coursebox.apiUrl", api), API);
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await pointAtTestApi(page);
    await provide(page);
  },
});

/** A second, independent browser profile (another device). */
export async function newDevice(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await pointAtTestApi(page);
  return { ctx, page };
}

export { expect };
