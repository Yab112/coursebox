import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { MAIL_LOG } from "../playwright.config";
import { expect, newDevice, test } from "./test";

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The newest code the test API "emailed" to this address. */
async function codeFor(email: string) {
  let code: string | undefined;
  await expect
    .poll(() => {
      if (!existsSync(MAIL_LOG)) return undefined;
      const mails = readFileSync(MAIL_LOG, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
        .filter((m) => m.to === email && /reset code/.test(m.subject));
      code = mails.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code!;
}

async function signUp(page: Page) {
  const id = unique();
  const c = { email: `reset-${id}@example.com`, username: `reset_${id}`, password: "first-password" };
  await page.goto("/library");
  await page.getByRole("button", { name: "Create account" }).click();
  const dlg = page.getByRole("dialog", { name: "Create your account" });
  await dlg.getByLabel("Email").fill(c.email);
  await dlg.getByLabel("Username").fill(c.username);
  await dlg.getByLabel("Password", { exact: true }).fill(c.password);
  await dlg.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  return c;
}

test("forgot password: email a code, reset, and get signed in; old sessions end", async ({ page, browser }) => {
  const c = await signUp(page);

  // Another device is signed out by the reset.
  const other = await newDevice(browser);
  await other.page.goto("/library");
  await other.page.getByRole("button", { name: "Sign in" }).click();
  const signIn = other.page.getByRole("dialog", { name: "Sign in" });
  await signIn.getByLabel("Email or username").fill(c.username);
  await signIn.getByLabel("Password", { exact: true }).fill(c.password);
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(other.page.getByRole("button", { name: "Account menu" })).toBeVisible();

  const { page: fresh, ctx } = await newDevice(browser);
  await fresh.goto("/library");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await fresh.getByRole("button", { name: "Forgot password?" }).click();
  const forgot = fresh.getByRole("dialog", { name: "Reset your password" });
  await forgot.getByLabel("Email or username").fill(c.email);
  await forgot.getByRole("button", { name: "Email me a code" }).click();

  const reset = fresh.getByRole("dialog", { name: "Check your email" });
  await expect(reset.getByText(`If an account matches “${c.email}”`)).toBeVisible();
  await expect(reset.getByText(/Resend in \d+s/)).toBeVisible();

  const code = await codeFor(c.email);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  await reset.getByLabel("6-digit code").fill(wrong);
  await reset.getByLabel("New password", { exact: true }).fill("second-password");
  await reset.getByRole("button", { name: "Reset password and sign in" }).click();
  await expect(reset.getByRole("alert")).toContainText("4 tries left");

  await reset.getByLabel("6-digit code").fill(code);
  await reset.getByRole("button", { name: "Reset password and sign in" }).click();
  await expect(reset).toBeHidden();
  await expect(fresh.getByRole("button", { name: "Account menu" })).toBeVisible();

  // The old device's session was revoked: it falls back to signed out.
  await other.page.reload();
  await expect(other.page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await other.ctx.close();
  await ctx.close();
});

test("change password from the account menu", async ({ page }) => {
  const c = await signUp(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Change password" }).click();
  const dlg = page.getByRole("dialog", { name: "Change password" });

  await dlg.getByLabel("Current password").fill("not-it");
  await dlg.getByLabel("New password", { exact: true }).fill("second-password");
  await dlg.getByRole("button", { name: "Change password" }).click();
  await expect(dlg.getByRole("alert")).toContainText("current password isn't right");

  await dlg.getByLabel("Current password").fill(c.password);
  await dlg.getByLabel("New password", { exact: true }).fill("second-password");
  await dlg.getByRole("button", { name: "Change password" }).click();
  await expect(dlg.getByRole("status")).toContainText("Password changed");
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
});
