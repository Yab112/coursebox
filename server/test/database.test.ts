import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, SCHEMA, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const insertUser = (email: string, username: string) =>
  ctx.ds.query(`INSERT INTO "${SCHEMA}".users (email, username, password_hash) VALUES ($1, $2, 'x') RETURNING id`, [email, username]);

describe("schema guarantees (enforced by Postgres, not just the API)", () => {
  it("has row level security on every table", async () => {
    const rows = await ctx.ds.query(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> 'migrations' ORDER BY 1`,
      [SCHEMA],
    );
    expect(rows.map((r: { relname: string }) => r.relname)).toEqual(["course_files", "courses", "password_resets", "progress", "sessions", "study_days", "users"]);
    expect(rows.every((r: { relrowsecurity: boolean }) => r.relrowsecurity)).toBe(true);
  });

  it("keeps emails and usernames unique ignoring case", async () => {
    await insertUser("a@x.io", "alpha");
    await expect(insertUser("A@X.IO", "beta")).rejects.toThrow(/users_email_lower_uq/);
    await expect(insertUser("b@x.io", "ALPHA")).rejects.toThrow(/users_username_lower_uq/);
  });

  it("checks formats and non-negative counters", async () => {
    await expect(insertUser("no-at-sign", "gamma")).rejects.toThrow(/users_email_format/);
    await expect(insertUser("g@x.io", "a b")).rejects.toThrow(/users_username_format/);
    const [{ id }] = await insertUser("c@x.io", "charlie");
    await expect(
      ctx.ds.query(`INSERT INTO "${SCHEMA}".courses (user_id, title, analyzer, manifest, total_bytes) VALUES ($1, 't', 'a', '{}', -1)`, [id]),
    ).rejects.toThrow(/check/);
    await expect(
      ctx.ds.query(`INSERT INTO "${SCHEMA}".courses (user_id, title, analyzer, manifest) VALUES ($1, 't', 'a', '[]')`, [id]),
    ).rejects.toThrow(/courses_manifest_object/);
  });

  it("cascades user deletion to everything they own", async () => {
    const [{ id }] = await insertUser("d@x.io", "delta");
    const [{ id: courseId }] = await ctx.ds.query(
      `INSERT INTO "${SCHEMA}".courses (user_id, title, analyzer, manifest) VALUES ($1, 't', 'a', '{}') RETURNING id`,
      [id],
    );
    await ctx.ds.query(`INSERT INTO "${SCHEMA}".course_files (course_id, path, storage_key, size_bytes, mime) VALUES ($1, 'a', 'k1', 1, 'x')`, [courseId]);
    await ctx.ds.query(`INSERT INTO "${SCHEMA}".progress (course_id, path, user_id) VALUES ($1, 'a', $2)`, [courseId, id]);
    await ctx.ds.query(`DELETE FROM "${SCHEMA}".users WHERE id = $1`, [id]);
    for (const t of ["courses", "course_files", "progress"]) {
      const [{ n }] = await ctx.ds.query(`SELECT count(*)::int AS n FROM "${SCHEMA}".${t}`);
      expect(n, t).toBe(0);
    }
  });

  it("migrations can be reverted and re-applied", async () => {
    const tables = async () =>
      (await ctx.ds.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'users'`, [SCHEMA]))[0].n;
    const clientRef = async () =>
      (await ctx.ds.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'courses' AND column_name = 'client_ref'`, [SCHEMA]))[0].n;
    const resets = async () =>
      (await ctx.ds.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'password_resets'`, [SCHEMA]))[0].n;
    await ctx.ds.undoLastMigration({ transaction: "each" });
    expect([await tables(), await clientRef(), await resets()]).toEqual([1, 1, 0]);
    await ctx.ds.undoLastMigration({ transaction: "each" });
    expect([await tables(), await clientRef()]).toEqual([1, 0]);
    await ctx.ds.undoLastMigration({ transaction: "each" });
    expect(await tables()).toBe(0);
    await ctx.ds.runMigrations({ transaction: "each" });
    expect([await tables(), await clientRef(), await resets()]).toEqual([1, 1, 1]);
  });
});
