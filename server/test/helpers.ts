import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { DataSource } from "typeorm";
import { loadConfig, type Config } from "../src/config";
import { createDataSource } from "../src/data-source";
import { createApp, createServices, type Services } from "../src/http/app";
import { LogMailer } from "../src/mail/Mailer";
import { LocalStorage } from "../src/storage/LocalStorage";

export const SCHEMA = "coursebox_test";

export type TestCtx = {
  ds: DataSource;
  app: ReturnType<typeof createApp>;
  services: Services;
  storage: LocalStorage;
  config: Config;
  storageDir: string;
  /** Every email the API "sent". */
  mail: LogMailer;
  close: () => Promise<void>;
  reset: () => Promise<void>;
};

export async function createTestContext(overrides: Partial<Record<string, string>> = {}): Promise<TestCtx> {
  const storageDir = mkdtempSync(path.join(tmpdir(), "coursebox-storage-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    DATABASE_SCHEMA: SCHEMA,
    STORAGE_DRIVER: "local",
    LOCAL_STORAGE_DIR: storageDir,
    PUBLIC_API_URL: "http://api.test",
    SIGNING_SECRET: "test-signing-secret-123456",
    ...overrides,
  });
  const ds = await createDataSource(config).initialize();
  const storage = new LocalStorage(storageDir, config.PUBLIC_API_URL, config.SIGNING_SECRET);
  await storage.ensureRoot();
  const mail = new LogMailer(true);
  const services = createServices(ds, storage, config, mail);
  const app = createApp(ds, services, config);
  return {
    ds,
    app,
    services,
    storage,
    config,
    storageDir,
    mail,
    reset: () => {
      mail.sent.length = 0;
      return ds.query(`TRUNCATE "${SCHEMA}".users, "${SCHEMA}".sessions, "${SCHEMA}".courses, "${SCHEMA}".course_files, "${SCHEMA}".progress, "${SCHEMA}".study_days, "${SCHEMA}".password_resets CASCADE`);
    },
    close: async () => {
      await ds.destroy();
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

let n = 0;
export async function signup(ctx: TestCtx, overrides: Partial<{ email: string; username: string; password: string }> = {}) {
  n++;
  const body = { email: `user${n}@example.com`, username: `user${n}`, password: "correct horse battery", ...overrides };
  const res = await request(ctx.app).post("/auth/signup").send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user, password: body.password };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export function sampleManifest(title = "Mathematics of Machine Learning", lessons = ["notes/L1.pdf", "notes/L2.pdf"]) {
  return {
    id: "local",
    title,
    instructor: "Prof. Philippe Rigollet",
    source: "MIT OpenCourseWare",
    coverPath: "cover.jpg",
    sections: [{ id: "s1", title: "Lecture Notes", order: 0, lessons: lessons.map((p, i) => ({ id: `l${i}`, title: p, order: i, type: "pdf", path: p })) }],
  };
}

export const files = (spec: Record<string, string>) =>
  Object.entries(spec).map(([p, content]) => ({ path: p, size: Buffer.byteLength(content), mime: p.endsWith(".pdf") ? "application/pdf" : "text/plain", content }));

export function courseBody(fs: ReturnType<typeof files>, extra: Record<string, unknown> = {}) {
  return {
    title: "Mathematics of Machine Learning",
    sourceKey: "ocw:18.657-fall-2015",
    analyzer: "mit-ocw",
    archiveName: "18.657-fall-2015",
    manifestVersion: 2,
    manifest: sampleManifest(),
    files: fs.map(({ path, size, mime }) => ({ path, size, mime })),
    ...extra,
  };
}

/** Performs the browser's part: PUT each file to its presigned URL. */
export async function uploadAll(ctx: TestCtx, token: string, courseId: string, fs: ReturnType<typeof files>, only?: string[]) {
  const want = only ?? fs.map((f) => f.path);
  if (!want.length) return;
  const res = await request(ctx.app).post(`/courses/${courseId}/uploads`).set(auth(token)).send({ paths: want });
  if (res.status !== 200) throw new Error(`uploads failed: ${res.status} ${JSON.stringify(res.body)}`);
  for (const u of res.body.uploads as { path: string; url: string; headers: Record<string, string> }[]) {
    const f = fs.find((x) => x.path === u.path)!;
    const put = await request(ctx.app).put(relative(u.url)).set(u.headers).send(Buffer.from(f.content));
    if (put.status !== 200) throw new Error(`PUT ${u.path} failed: ${put.status} ${JSON.stringify(put.body)}`);
  }
}

/** Presigned URLs are absolute (http://api.test/storage/...); supertest wants the path. */
export const relative = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

export async function createReadyCourse(ctx: TestCtx, token: string, spec: Record<string, string> = { "notes/L1.pdf": "%PDF one", "notes/L2.pdf": "%PDF two", "cover.jpg": "jpg" }) {
  const fs = files(spec);
  const created = await request(ctx.app).post("/courses").set(auth(token)).send(courseBody(fs));
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.course.id as string;
  await uploadAll(ctx, token, id, fs);
  const done = await request(ctx.app).post(`/courses/${id}/complete`).set(auth(token));
  if (done.status !== 200) throw new Error(`complete failed: ${JSON.stringify(done.body)}`);
  return { id, fs };
}
