import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createTestContext, SCHEMA, signup, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

describe("signup", () => {
  it("creates an account and returns a session token, never the password hash", async () => {
    const res = await request(ctx.app).post("/auth/signup").send({ email: "Ada@Example.com", username: "ada", password: "lovelace-1843" });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.user).toMatchObject({ email: "ada@example.com", username: "ada", courseLimit: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|password/i);

    const [row] = await ctx.ds.query(`SELECT password_hash FROM "${SCHEMA}".users`);
    expect(row.password_hash).toMatch(/^scrypt\$/);
    const [s] = await ctx.ds.query(`SELECT token_hash FROM "${SCHEMA}".sessions`);
    expect(s.token_hash).not.toBe(res.body.token); // only the hash is stored
  });

  it("requires a unique email and username, case-insensitively", async () => {
    await signup(ctx, { email: "sam@example.com", username: "Sam" });
    const dupEmail = await request(ctx.app).post("/auth/signup").send({ email: "SAM@example.com", username: "other", password: "password123" });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe("email_taken");
    const dupUser = await request(ctx.app).post("/auth/signup").send({ email: "new@example.com", username: "sam", password: "password123" });
    expect(dupUser.status).toBe(409);
    expect(dupUser.body.error.code).toBe("username_taken");
  });

  it("enforces uniqueness in the database even under concurrent signups", async () => {
    const body = { email: "race@example.com", username: "racer", password: "password123" };
    const results = await Promise.all(Array.from({ length: 5 }, () => request(ctx.app).post("/auth/signup").send(body)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    const [{ count }] = await ctx.ds.query(`SELECT count(*)::int AS count FROM "${SCHEMA}".users`);
    expect(count).toBe(1);
  });

  it.each([
    [{ email: "not-an-email", username: "valid", password: "password123" }, /email/i],
    [{ email: "a@b.co", username: "ab", password: "password123" }, /at least 3/],
    [{ email: "a@b.co", username: "has space", password: "password123" }, /letters, numbers/],
    [{ email: "a@b.co", username: "valid", password: "short" }, /at least 8/],
    [{ username: "valid", password: "password123" }, /email/],
  ])("validates input %#", async (body, msg) => {
    const res = await request(ctx.app).post("/auth/signup").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(msg);
  });
});

describe("login", () => {
  it("works with email or username, case-insensitively", async () => {
    const { password } = await signup(ctx, { email: "grace@example.com", username: "Grace" });
    for (const identifier of ["grace@example.com", "GRACE@EXAMPLE.COM", "grace", "GrAcE"]) {
      const res = await request(ctx.app).post("/auth/login").send({ identifier, password });
      expect(res.status, identifier).toBe(200);
      expect(res.body.user.username).toBe("Grace");
    }
  });

  it("gives the same error for a wrong password and an unknown user", async () => {
    await signup(ctx, { username: "linus" });
    const wrong = await request(ctx.app).post("/auth/login").send({ identifier: "linus", password: "nope-nope" });
    const unknown = await request(ctx.app).post("/auth/login").send({ identifier: "nobody", password: "nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe("sessions", () => {
  it("protects private routes", async () => {
    expect((await request(ctx.app).get("/me")).status).toBe(401);
    expect((await request(ctx.app).get("/courses")).status).toBe(401);
    expect((await request(ctx.app).get("/me").set(auth("garbage"))).status).toBe(401);
  });

  it("returns the user and usage on /me", async () => {
    const { token } = await signup(ctx, { username: "me-user" });
    const res = await request(ctx.app).get("/me").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { username: "me-user" }, usage: { courses: 0, courseLimit: 2, bytes: 0 } });
  });

  it("revokes the token on logout without affecting other devices", async () => {
    const { token, password, user } = await signup(ctx);
    const other = (await request(ctx.app).post("/auth/login").send({ identifier: user.email, password })).body.token;
    expect((await request(ctx.app).post("/auth/logout").set(auth(token))).status).toBe(204);
    expect((await request(ctx.app).get("/me").set(auth(token))).status).toBe(401);
    expect((await request(ctx.app).get("/me").set(auth(other))).status).toBe(200);
  });

  it("rejects expired sessions", async () => {
    const { token } = await signup(ctx);
    await ctx.ds.query(`UPDATE "${SCHEMA}".sessions SET expires_at = now() - interval '1 minute'`);
    const res = await request(ctx.app).get("/me").set(auth(token));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/);
  });

  it("slides the expiry of active sessions", async () => {
    const { token } = await signup(ctx);
    await ctx.ds.query(`UPDATE "${SCHEMA}".sessions SET last_used_at = now() - interval '2 hours', expires_at = now() + interval '1 day'`);
    await request(ctx.app).get("/me").set(auth(token));
    const [s] = await ctx.ds.query(`SELECT expires_at FROM "${SCHEMA}".sessions`);
    expect(new Date(s.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });

  it("deleting a user removes their sessions (cascade)", async () => {
    const { token, user } = await signup(ctx);
    await ctx.ds.query(`DELETE FROM "${SCHEMA}".users WHERE id = $1`, [user.id]);
    expect((await request(ctx.app).get("/me").set(auth(token))).status).toBe(401);
  });
});

describe("http basics", () => {
  it("answers health checks and unknown routes", async () => {
    expect((await request(ctx.app).get("/health")).body).toEqual({ ok: true });
    expect((await request(ctx.app).get("/nope")).status).toBe(404);
  });

  it("rejects malformed JSON cleanly", async () => {
    const res = await request(ctx.app).post("/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_json");
  });

  it("only allows configured CORS origins", async () => {
    const ok = await request(ctx.app).options("/courses").set("Origin", "http://localhost:3000").set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const bad = await request(ctx.app).options("/courses").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "GET");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
