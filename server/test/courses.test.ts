import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, courseBody, createReadyCourse, createTestContext, files, relative, SCHEMA, signup, uploadAll, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext({ MAX_COURSE_BYTES: "1000", MAX_FILES_PER_COURSE: "20" });
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const storedObjects = (userId: string) => {
  const dir = path.join(ctx.storageDir, "users", userId, "courses");
  return existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0;
};

describe("course upload lifecycle", () => {
  it("creates, uploads through presigned URLs, verifies and becomes ready", async () => {
    const { token } = await signup(ctx);
    const fs = files({ "notes/L1.pdf": "%PDF one", "notes/L2.pdf": "%PDF two" });
    const created = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(fs));
    expect(created.status).toBe(201);
    expect(created.body.course).toMatchObject({ status: "uploading", fileCount: 2, totalBytes: 16, lessonCount: 2 });
    expect(created.body.needUpload).toEqual(["notes/L1.pdf", "notes/L2.pdf"]);
    const id = created.body.course.id;

    // Not everything uploaded yet: completion is refused with the missing list.
    await uploadAll(ctx, token, id, fs, ["notes/L1.pdf"]);
    const early = await request(ctx.app).post(`/courses/${id}/complete`).set(auth(token));
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({ code: "upload_incomplete", details: { missing: ["notes/L2.pdf"], missingCount: 1 } });

    await uploadAll(ctx, token, id, fs, ["notes/L2.pdf"]);
    const done = await request(ctx.app).post(`/courses/${id}/complete`).set(auth(token));
    expect(done.status).toBe(200);
    expect(done.body.course.status).toBe("ready");

    const got = await request(ctx.app).get(`/courses/${id}`).set(auth(token));
    expect(got.body.manifest.title).toBe("Mathematics of Machine Learning");
    expect(got.body.files).toEqual([
      { path: "notes/L1.pdf", size: 8, mime: "application/pdf", uploaded: true },
      { path: "notes/L2.pdf", size: 8, mime: "application/pdf", uploaded: true },
    ]);
    expect(JSON.stringify(got.body)).not.toContain("users/"); // storage keys stay private
  });

  it("serves files through short-lived download URLs", async () => {
    const { token } = await signup(ctx);
    const { id } = await createReadyCourse(ctx, token);
    const res = await request(ctx.app).post(`/courses/${id}/file-urls`).set(auth(token)).send({ paths: ["notes/L2.pdf", "missing.pdf"] });
    expect(Object.keys(res.body.urls)).toEqual(["notes/L2.pdf"]);
    const file = await request(ctx.app).get(relative(res.body.urls["notes/L2.pdf"])).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect((file.body as Buffer).toString()).toBe("%PDF two");

    // Range requests work (video seeking).
    const range = await request(ctx.app).get(relative(res.body.urls["notes/L2.pdf"])).set("Range", "bytes=0-3");
    expect(range.status).toBe(206);
  });

  it("rejects uploads that don't match the signed size or type, and tampered URLs", async () => {
    const { token } = await signup(ctx);
    const fs = files({ "a.pdf": "12345" });
    const id = (await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(fs))).body.course.id;
    const [u] = (await request(ctx.app).post(`/courses/${id}/uploads`).set(auth(token)).send({ paths: ["a.pdf"] })).body.uploads;
    expect((await request(ctx.app).put(relative(u.url)).set(u.headers).send(Buffer.from("123456789"))).status).toBe(403);
    expect((await request(ctx.app).put(relative(u.url)).set("Content-Type", "text/html").send(Buffer.from("12345"))).status).toBe(403);
    expect((await request(ctx.app).put(relative(u.url).replace("sig=", "sig=00")).set(u.headers).send(Buffer.from("12345"))).status).toBe(403);
    expect((await request(ctx.app).put(relative(u.url)).set(u.headers).send(Buffer.from("12345"))).status).toBe(200);
  });
});

describe("limits", () => {
  it("allows 2 courses per account; deleting one frees the slot and its storage", async () => {
    const { token, user } = await signup(ctx);
    const a = await createReadyCourse(ctx, token);
    await createReadyCourse(ctx, token);
    expect(storedObjects(user.id)).toBeGreaterThan(0);

    const third = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(files({ "x.pdf": "x" })));
    expect(third.status).toBe(409);
    expect(third.body.error).toMatchObject({ code: "course_limit", details: { limit: 2 } });
    expect(third.body.error.message).toMatch(/Delete one/);

    expect((await request(ctx.app).delete(`/courses/${a.id}`).set(auth(token))).status).toBe(204);
    expect(existsSync(path.join(ctx.storageDir, "users", user.id, "courses", a.id))).toBe(false);
    const [{ n }] = await ctx.ds.query(`SELECT count(*)::int AS n FROM "${SCHEMA}".course_files WHERE course_id = $1`, [a.id]);
    expect(n).toBe(0);

    const retry = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(files({ "x.pdf": "x" })));
    expect(retry.status).toBe(201);
    const me = await request(ctx.app).get("/me").set(auth(token));
    expect(me.body.usage).toMatchObject({ courses: 2, courseLimit: 2 });
  });

  it("makes creation idempotent with a client reference (no duplicates after a lost response)", async () => {
    const { token } = await signup(ctx);
    const fs = files({ "a.pdf": "1", "b.pdf": "2" });
    const body = courseBody(fs, { clientRef: "local-abc123" });
    const first = await request(ctx.app).post("/courses").set(auth(token)).send(body);
    await uploadAll(ctx, token, first.body.course.id, fs, ["a.pdf"]);
    const retry = await request(ctx.app).post("/courses").set(auth(token)).send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.course.id).toBe(first.body.course.id);
    expect(retry.body.needUpload).toEqual(["b.pdf"]); // a.pdf is already there
    const me = await request(ctx.app).get("/me").set(auth(token));
    expect(me.body.usage.courses).toBe(1);
    // Another user may use the same client ref.
    const other = await signup(ctx);
    expect((await request(ctx.app).post("/courses").set(auth(other.token)).send(body)).body.course.id).not.toBe(first.body.course.id);
  });

  it("never duplicates a course when the same create races with itself", async () => {
    const { token } = await signup(ctx);
    const body = courseBody(files({ "a.pdf": "1" }), { clientRef: "racing-ref" });
    const results = await Promise.all(Array.from({ length: 4 }, () => request(ctx.app).post("/courses").set(auth(token)).send(body)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.course.id)).size).toBe(1);
    const [{ n }] = await ctx.ds.query(`SELECT count(*)::int AS n FROM "${SCHEMA}".courses`);
    expect(n).toBe(1);
  });

  it("holds the limit under concurrent creates", async () => {
    const { token } = await signup(ctx);
    const body = courseBody(files({ "x.pdf": "x" }));
    const results = await Promise.all(Array.from({ length: 5 }, () => request(ctx.app).post("/courses").set(auth(token)).send(body)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it("respects a per-user limit override", async () => {
    const { token, user } = await signup(ctx);
    await ctx.ds.query(`UPDATE "${SCHEMA}".users SET course_limit = 3 WHERE id = $1`, [user.id]);
    for (let i = 0; i < 3; i++) expect((await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(files({ "x.pdf": "x" })))).status).toBe(201);
    expect((await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(files({ "x.pdf": "x" })))).status).toBe(409);
  });

  it("caps course size, file count and rejects unsafe or duplicate paths", async () => {
    const { token } = await signup(ctx);
    const big = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody([{ path: "big.mp4", size: 5000, mime: "video/mp4", content: "" }]));
    expect(big.status).toBe(413);
    const many = files(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`f${i}.txt`, "x"])));
    expect((await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(many))).status).toBe(413);
    const evil = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody([{ path: "../../etc/passwd", size: 1, mime: "text/plain", content: "" }]));
    expect(evil.status).toBe(400);
    const dup = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(files({ "a.pdf": "1" }).concat(files({ "a.pdf": "2" }))));
    expect(dup.status).toBe(400);
    expect((await request(ctx.app).post("/courses").set(auth(token)).send({ ...courseBody(files({ "a.pdf": "1" })), files: [] })).status).toBe(400);
  });
});

describe("isolation between accounts", () => {
  it("never exposes another user's course", async () => {
    const owner = await signup(ctx);
    const intruder = await signup(ctx);
    const { id } = await createReadyCourse(ctx, owner.token);
    const t = auth(intruder.token);
    expect((await request(ctx.app).get(`/courses/${id}`).set(t)).status).toBe(404);
    expect((await request(ctx.app).post(`/courses/${id}/file-urls`).set(t).send({ paths: ["notes/L1.pdf"] })).status).toBe(404);
    expect((await request(ctx.app).post(`/courses/${id}/uploads`).set(t).send({ paths: ["notes/L1.pdf"] })).status).toBe(404);
    expect((await request(ctx.app).post(`/courses/${id}/progress`).set(t).send({ items: [{ path: "x", completed: true }] })).status).toBe(404);
    expect((await request(ctx.app).delete(`/courses/${id}`).set(t)).status).toBe(404);
    expect((await request(ctx.app).get(`/courses`).set(t)).body.courses).toEqual([]);
    expect((await request(ctx.app).get(`/courses/${id}`).set(auth(owner.token))).status).toBe(200);
  });

  it("returns 404 for malformed ids instead of a database error", async () => {
    const { token } = await signup(ctx);
    expect((await request(ctx.app).get(`/courses/not-a-uuid`).set(auth(token))).status).toBe(404);
  });
});

describe("updating a course with a new version", () => {
  it("re-uploads only changed files and removes files that are gone", async () => {
    const { token, user } = await signup(ctx);
    const { id } = await createReadyCourse(ctx, token, { "keep.pdf": "same", "change.pdf": "old", "gone.pdf": "bye" });

    const v2 = files({ "keep.pdf": "same", "change.pdf": "newer!", "added.pdf": "hi" });
    const res = await request(ctx.app).put(`/courses/${id}/files`).set(auth(token)).send(courseBody(v2, { title: "MML v2" }));
    expect(res.status).toBe(200);
    expect(res.body.needUpload.sort()).toEqual(["added.pdf", "change.pdf"]);
    expect(res.body.course).toMatchObject({ status: "uploading", title: "MML v2", fileCount: 3 });

    await uploadAll(ctx, token, id, v2, res.body.needUpload);
    expect((await request(ctx.app).post(`/courses/${id}/complete`).set(auth(token))).status).toBe(200);
    const got = await request(ctx.app).get(`/courses/${id}`).set(auth(token));
    expect(got.body.files.map((f: { path: string }) => f.path)).toEqual(["added.pdf", "change.pdf", "keep.pdf"]);
    expect(storedObjects(user.id)).toBe(3); // the old "change" and "gone" objects were removed
  });

  it("goes straight back to ready when nothing changed", async () => {
    const { token } = await signup(ctx);
    const { id, fs } = await createReadyCourse(ctx, token);
    const res = await request(ctx.app).put(`/courses/${id}/files`).set(auth(token)).send(courseBody(fs));
    expect(res.body).toMatchObject({ needUpload: [], course: { status: "ready" } });
  });

  it("saves a re-analyzed manifest", async () => {
    const { token } = await signup(ctx);
    const { id } = await createReadyCourse(ctx, token);
    const manifest = { title: "Renamed", sections: [] };
    const res = await request(ctx.app).patch(`/courses/${id}`).set(auth(token)).send({ manifest, manifestVersion: 3, analyzer: "mit-ocw" });
    expect(res.status).toBe(200);
    expect((await request(ctx.app).get(`/courses/${id}`).set(auth(token))).body).toMatchObject({ manifest, manifestVersion: 3 });
  });
});

describe("cleanup", () => {
  it("purges abandoned uploads and courses stuck in deletion", async () => {
    const { token, user } = await signup(ctx);
    const fs = files({ "a.pdf": "1" });
    const stale = (await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(fs))).body.course.id;
    await uploadAll(ctx, token, stale, fs);
    const ready = await createReadyCourse(ctx, token);
    await ctx.ds.query(`UPDATE "${SCHEMA}".courses SET updated_at = now() - interval '2 days' WHERE id = $1`, [stale]);

    expect(await ctx.services.courses.cleanup()).toBe(1);
    const left = await ctx.ds.query(`SELECT id FROM "${SCHEMA}".courses`);
    expect(left.map((r: { id: string }) => r.id)).toEqual([ready.id]);
    expect(existsSync(path.join(ctx.storageDir, "users", user.id, "courses", stale))).toBe(false);
  });
});
