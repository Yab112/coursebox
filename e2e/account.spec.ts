import type { Page } from "@playwright/test";
import { importCourse, openLesson, sidebar, zip } from "./helpers";
import { expect, newDevice, test } from "./test";

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function credentials() {
  const id = unique();
  return { email: `learner-${id}@example.com`, username: `learner_${id}`, password: "a-strong-password" };
}

async function fillSignup(page: Page, c: ReturnType<typeof credentials>) {
  const dlg = page.getByRole("dialog", { name: "Create your account" });
  await dlg.getByLabel("Email").fill(c.email);
  await dlg.getByLabel("Username").fill(c.username);
  await dlg.getByLabel("Password").fill(c.password);
  await dlg.getByRole("button", { name: "Create account" }).click();
  await expect(dlg).toBeHidden();
}

async function signUpFromHeader(page: Page) {
  const c = credentials();
  await page.goto("/library");
  await page.getByRole("button", { name: "Create account" }).click();
  await fillSignup(page, c);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  return c;
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/library");
  await page.getByRole("button", { name: "Sign in" }).click();
  const dlg = page.getByRole("dialog", { name: "Sign in" });
  await dlg.getByLabel("Email or username").fill(identifier);
  await dlg.getByLabel("Password").fill(password);
  await dlg.getByRole("button", { name: "Sign in" }).click();
  await expect(dlg).toBeHidden();
}

const card = (page: Page, title: string) => page.locator(".group", { hasText: title }).first();

async function expectSaved(page: Page, title: string) {
  await page.goto("/library");
  await expect(card(page, title).getByText("Saved to your account")).toBeVisible({ timeout: 30_000 });
}

test("reading needs no account; the prompt offers one and saves the course", async ({ page }) => {
  await importCourse(page, "ocw-18657.zip", { keepPrompt: true });
  const prompt = page.getByRole("dialog", { name: "Keep this course?" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("no account needed");
  await prompt.getByRole("button", { name: "Create free account" }).click();
  const c = credentials();
  await fillSignup(page, c);

  await expectSaved(page, "Mathematics of Machine Learning");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();

  // Still signed in and saved after a reload.
  await page.reload();
  await expect(card(page, "Mathematics of Machine Learning").getByText("Saved to your account")).toBeVisible();
});

test("the prompt is shown once per course and the course stays readable without an account", async ({ page }) => {
  await importCourse(page, "ocw-18657.zip", { keepPrompt: true });
  await page.getByRole("dialog", { name: "Keep this course?" }).getByRole("button", { name: "Not now" }).click();
  await openLesson(page, "L1 · Introduction");
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.getByRole("dialog", { name: "Keep this course?" })).toHaveCount(0);
  await expect(page.getByText("This device only")).toHaveCount(0); // card text lives on the library page
});

test("an account follows the learner to another device, with progress", async ({ page, browser }) => {
  const c = await signUpFromHeader(page);
  await importCourse(page, "ocw-18657.zip");
  await openLesson(page, "L1 · Introduction");
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toBeVisible();
  await expectSaved(page, "Mathematics of Machine Learning");
  // Wait until this device has pushed its pending progress.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("coursebox.syncQueue")), { timeout: 20_000 }).toBeNull();

  const other = await newDevice(browser);
  try {
    await signIn(other.page, c.username, c.password);
    const remoteCard = card(other.page, "Mathematics of Machine Learning");
    await expect(remoteCard).toBeVisible({ timeout: 20_000 });
    await remoteCard.locator("a").first().click();
    await expect(sidebar(other.page).getByText("1 of 6 lessons complete")).toBeVisible({ timeout: 20_000 });
    await openLesson(other.page, "L2 · Binary Classification");
    // The PDF wasn't on this device: it's fetched from the account on demand.
    await expect(other.page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await other.ctx.close();
  }
});

test("an account holds 2 courses; deleting a finished one frees the slot", async ({ page }) => {
  await signUpFromHeader(page);
  await importCourse(page, "ocw-18657.zip");
  await expectSaved(page, "Mathematics of Machine Learning");
  await importCourse(page, "python-crash-course.zip");
  await expectSaved(page, "Python Crash Course");

  await importCourse(page, "ocw-60001.zip");
  await page.goto("/library");
  const third = card(page, "Introduction to Computer Science");
  await expect(third.getByText(/Not saved: Your account can hold 2 courses/)).toBeVisible({ timeout: 20_000 });

  const first = card(page, "Mathematics of Machine Learning");
  await first.hover();
  await first.getByRole("button", { name: "Course options" }).click();
  await page.getByRole("button", { name: /Delete course/ }).click();
  await page.getByRole("button", { name: /Click again to delete/ }).click();
  await expect(card(page, "Mathematics of Machine Learning")).toHaveCount(0);

  await third.getByRole("button", { name: "Retry" }).click();
  await expect(third.getByText("Saved to your account")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText("2 of 2")).toBeVisible();
});

test("sign-up and sign-in explain what went wrong", async ({ page }) => {
  const c = await signUpFromHeader(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();
  const dlg = page.getByRole("dialog", { name: "Create your account" });
  await dlg.getByLabel("Email").fill(c.email.toUpperCase());
  await dlg.getByLabel("Username").fill(`other_${unique()}`);
  await dlg.getByLabel("Password").fill("another-password");
  await dlg.getByRole("button", { name: "Create account" }).click();
  await expect(dlg.getByRole("alert")).toHaveText("An account with this email already exists");
  await dlg.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Sign in" }).click();
  const login = page.getByRole("dialog", { name: "Sign in" });
  await login.getByLabel("Email or username").fill(c.email);
  await login.getByLabel("Password").fill("wrong-password");
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(login.getByRole("alert")).toHaveText("Wrong email/username or password");
  await login.getByLabel("Password").fill(c.password);
  await login.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
});

test("signing out removes account courses from the device and keeps local ones", async ({ page }) => {
  await importCourse(page, "python-crash-course.zip"); // local only, imported before signing up
  await signUpFromHeader(page);
  await importCourse(page, "ocw-18657.zip");
  await expectSaved(page, "Mathematics of Machine Learning");
  await expect(card(page, "Python Crash Course").getByText("This device only")).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(card(page, "Mathematics of Machine Learning")).toHaveCount(0);
  await expect(card(page, "Python Crash Course")).toBeVisible();

  // The file input still works for the signed-out visitor.
  await page.locator('input[type="file"]').setInputFiles(zip("ocw-1806sc.zip"));
  await page.waitForURL(/\/course\//);
});
