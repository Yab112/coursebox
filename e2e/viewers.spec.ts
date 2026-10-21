import { importCourse, openLesson } from "./helpers";
import { expect, test } from "./test";

/** Every kind of text file opens in a viewer made for it, chosen from its name or its content. */
test.describe("smart file viewers", () => {
  test.beforeEach(async ({ page }) => {
    await importCourse(page, "data-science-lab.zip");
  });

  test("notebooks render cells, math, sanitized HTML outputs and tracebacks", async ({ page }) => {
    await openLesson(page, "Lab");
    await expect(page.getByText("Jupyter notebook")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lab 1" })).toBeVisible();
    await expect(page.locator(".katex-display")).toHaveCount(1);
    await expect(page.getByText("In [1]:")).toBeVisible();
    await expect(page.getByText("hello notebook", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Addis Ababa" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.getByText("ZeroDivisionError: division by zero")).toBeVisible();
    await page.getByRole("button", { name: "Hide code" }).click();
    await expect(page.getByText("In [1]:")).toHaveCount(0);
  });

  test("CSV is a sortable table, JSON a tree, subtitles a transcript", async ({ page }) => {
    await openLesson(page, "Scores");
    await expect(page.getByText("3 rows · 2 columns")).toBeVisible();
    await page.getByRole("button", { name: "score", exact: true }).click();
    await expect(page.locator("tbody tr").first()).toContainText("bob");

    await openLesson(page, "Config");
    await expect(page.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText('"model"')).toBeVisible();

    await openLesson(page, "Lecture");
    await expect(page.getByText("Welcome to the lab.")).toBeVisible();
    await expect(page.getByText("1:05")).toBeVisible();
    await page.getByLabel("Search transcript").fill("plot");
    await expect(page.getByText("Welcome to the lab.")).toHaveCount(0);
  });

  test("files without a known extension are detected from their name or content", async ({ page }) => {
    await openLesson(page, "Makefile");
    await expect(page.getByText("Makefile", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("can't be previewed")).toHaveCount(0);

    await openLesson(page, "Train");
    await expect(page.locator("main, [role=main], body").getByText("Python", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("print('training')")).toBeVisible();
  });
});

test.describe("edit and run code", () => {
  test.beforeEach(async ({ page }) => {
    await importCourse(page, "data-science-lab.zip");
  });

  test("a Python file runs in the browser and reads files next to it; edits are saved as your copy", async ({ page }) => {
    await openLesson(page, "Mean");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("mean 85.83333333333333")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Edit a copy" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nprint('mine')");
    await expect(page.getByText("Saved on this device")).toBeVisible();
    await page.keyboard.press("Shift+Enter");
    await expect(page.locator("pre", { hasText: "mine" })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await page.reload();
    await openLesson(page, "Mean");
    await expect(page.getByText("print('mine')")).toBeVisible();
    await page.getByRole("button", { name: "Original" }).click();
    await expect(page.getByText("print('mine')")).toHaveCount(0);
  });

  test("notebook cells run in one session, like Jupyter", async ({ page }) => {
    await openLesson(page, "Lab");
    await page.getByRole("button", { name: "Run all" }).click();
    // Cell 2 uses `df`, which the notebook never defines: Run all stops there with a clean traceback.
    // (The first run includes loading Python, hence the longer wait.)
    await expect(page.getByText("NameError: name 'df' is not defined")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("pre", { hasText: "hello notebook" })).toBeVisible();
    await expect(page.getByText("In [2]:")).toBeVisible();
  });
});
