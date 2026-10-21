import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_RESET_ATTEMPTS } from "../src/services/auth";
import { auth, createTestContext, SCHEMA, signup, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const forgot = (identifier: string) => request(ctx.app).post("/auth/password/forgot").send({ identifier });
const reset = (identifier: string, code: string, password = "brand new password") =>
  request(ctx.app).post("/auth/password/reset").send({ identifier, code, password });
const login = (identifier: string, password: string) => request(ctx.app).post("/auth/login").send({ identifier, password });
const lastCode = () => ctx.mail.sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
/** Lets a test request another code without waiting out the cooldown. */
const ageResets = (ms: number) => ctx.ds.query(`UPDATE "${SCHEMA}".password_resets SET created_at = created_at - make_interval(secs => $1)`, [ms / 1000]);
const otherCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe("forgot password", () => {
  it("emails a 6-digit code to the account's address, by email or username", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    const res = await forgot("ADA@example.com");
    expect(res.status).toBe(202);
    expect(ctx.mail.sent).toHaveLength(1);
    expect(ctx.mail.sent[0].to).toBe("ada@example.com");
    expect(ctx.mail.sent[0].subject).toMatch(/^\d{6} is your CourseBox reset code$/);
    expect(ctx.mail.sent[0].html).toContain(lastCode());

    await ageResets(120_000);
    expect((await forgot("ada")).status).toBe(202);
    expect(ctx.mail.sent).toHaveLength(2);
  });

  it("answers the same for unknown accounts and sends nothing", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    const known = await forgot("ada@example.com");
    const unknown = await forgot("nobody@example.com");
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(ctx.mail.sent).toHaveLength(1);
  });

  it("stores only a hash of the code", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    const [row] = await ctx.ds.query(`SELECT code_hash FROM "${SCHEMA}".password_resets`);
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.code_hash).not.toContain(lastCode());
  });

  it("waits a minute between codes and caps codes per hour", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    await forgot("ada"); // within the cooldown: silently ignored
    expect(ctx.mail.sent).toHaveLength(1);
    for (let i = 0; i < 10; i++) {
      await ageResets(61_000);
      await forgot("ada");
    }
    expect(ctx.mail.sent).toHaveLength(5);
  });
});

describe("reset password", () => {
  it("sets the new password, signs out every old session and signs this one in", async () => {
    const { token: oldToken } = await signup(ctx, { email: "ada@example.com", username: "ada", password: "old password 1" });
    await forgot("ada@example.com");
    const res = await reset("ada@example.com", lastCode()!, "new password 2");
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("ada");

    expect((await request(ctx.app).get("/me").set(auth(oldToken))).status).toBe(401);
    expect((await request(ctx.app).get("/me").set(auth(res.body.token))).status).toBe(200);
    expect((await login("ada", "old password 1")).status).toBe(401);
    expect((await login("ada", "new password 2")).status).toBe(200);
    expect(ctx.mail.sent.at(-1)!.subject).toBe("Your CourseBox password was changed");
  });

  it("works only once", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    const code = lastCode()!;
    expect((await reset("ada", code)).status).toBe(200);
    const again = await reset("ada", code, "another password");
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_code");
  });

  it("accepts a code only once even when two requests race", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    const code = lastCode()!;
    const results = await Promise.all([reset("ada", code, "password one!"), reset("ada", code, "password two!")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("locks the code after too many wrong guesses, even for the right code", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    const code = lastCode()!;
    for (let i = 1; i <= MAX_RESET_ATTEMPTS; i++) {
      const res = await reset("ada", otherCode(code));
      expect(res.status).toBe(400);
      if (i < MAX_RESET_ATTEMPTS) expect(res.body.error.message).toContain(`${MAX_RESET_ATTEMPTS - i} ${MAX_RESET_ATTEMPTS - i === 1 ? "try" : "tries"} left`);
      else expect(res.body.error.message).toMatch(/too many/i);
    }
    expect((await reset("ada", code)).status).toBe(400);
  });

  it("rejects expired codes", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    await ctx.ds.query(`UPDATE "${SCHEMA}".password_resets SET expires_at = now() - interval '1 second'`);
    expect((await reset("ada", lastCode()!)).status).toBe(400);
  });

  it("only the newest code works", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await forgot("ada");
    const first = lastCode()!;
    await ageResets(61_000);
    await forgot("ada");
    const second = lastCode()!;
    if (first !== second) expect((await reset("ada", first)).status).toBe(400);
    expect((await reset("ada", second)).status).toBe(200);
  });

  it("doesn't let a code for one account reset another", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    await signup(ctx, { email: "bob@example.com", username: "bob" });
    await forgot("ada");
    await ageResets(61_000);
    await forgot("bob");
    const bobCode = lastCode()!;
    await ctx.ds.query(`UPDATE "${SCHEMA}".password_resets SET created_at = now()`);
    const res = await reset("ada", bobCode);
    expect(res.status).toBe(400);
  });

  it("validates the code format and new password", async () => {
    await signup(ctx, { email: "ada@example.com", username: "ada" });
    expect((await reset("ada", "12345")).body.error.message).toMatch(/6 digits/);
    expect((await reset("ada", "123456", "short")).body.error.message).toMatch(/at least 8/);
    expect((await reset("nobody", "123456")).body.error.code).toBe("invalid_code");
  });
});

describe("change password", () => {
  it("needs the current password, keeps this session and signs out the others", async () => {
    const { token } = await signup(ctx, { email: "ada@example.com", username: "ada", password: "old password 1" });
    const other = (await login("ada", "old password 1")).body.token;

    const wrong = await request(ctx.app).post("/auth/password/change").set(auth(token)).send({ currentPassword: "nope", newPassword: "new password 2" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("wrong_password");

    const ok = await request(ctx.app).post("/auth/password/change").set(auth(token)).send({ currentPassword: "old password 1", newPassword: "new password 2" });
    expect(ok.status).toBe(204);
    expect((await request(ctx.app).get("/me").set(auth(token))).status).toBe(200);
    expect((await request(ctx.app).get("/me").set(auth(other))).status).toBe(401);
    expect((await login("ada", "new password 2")).status).toBe(200);
    expect(ctx.mail.sent.at(-1)!.subject).toBe("Your CourseBox password was changed");
  });

  it("requires sign-in and a different new password", async () => {
    expect((await request(ctx.app).post("/auth/password/change").send({ currentPassword: "a", newPassword: "bbbbbbbb" })).status).toBe(401);
    const { token } = await signup(ctx, { password: "same password" });
    const same = await request(ctx.app).post("/auth/password/change").set(auth(token)).send({ currentPassword: "same password", newPassword: "same password" });
    expect(same.status).toBe(400);
    expect(same.body.error.message).toMatch(/different/);
  });

  it("cancels any pending reset code", async () => {
    const { token } = await signup(ctx, { email: "ada@example.com", username: "ada", password: "old password 1" });
    await forgot("ada");
    const code = lastCode()!;
    await request(ctx.app).post("/auth/password/change").set(auth(token)).send({ currentPassword: "old password 1", newPassword: "new password 2" });
    expect((await reset("ada", code)).status).toBe(400);
  });
});
