import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HealthService } from "../src/services/health";
import type { Storage } from "../src/storage/Storage";
import { createTestContext, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

describe("GET /status", () => {
  it("reports each component live, without auth", async () => {
    const res = await request(ctx.app).get("/status");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const byId = Object.fromEntries(res.body.components.map((c: { id: string }) => [c.id, c]));
    expect(Object.keys(byId)).toEqual(["api", "database", "storage", "email"]);
    expect(byId.database).toMatchObject({ status: "operational" });
    expect(byId.database.detail).toMatch(/^Postgres \d+.* migrations applied \(latest: PasswordResets\)$/);
    expect(byId.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(byId.storage).toMatchObject({ status: "operational", detail: "Local disk · reachable" });
    // The test config uses the log mailer: shown as degraded, which makes the whole report degraded.
    expect(byId.email.status).toBe("degraded");
    expect(res.body.status).toBe("degraded");
    expect(res.body.service).toMatchObject({ node: process.version });
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
  });

  it("caches checks briefly so polling doesn't hit the database every time", async () => {
    const a = await request(ctx.app).get("/status");
    const b = await request(ctx.app).get("/status");
    expect(b.body.checkedAt).toBe(a.body.checkedAt);
  });

  it("never exposes connection strings or secrets", async () => {
    const res = await request(ctx.app).get("/status");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(ctx.config.DATABASE_URL);
    expect(body).not.toContain(ctx.config.SIGNING_SECRET);
    expect(body).not.toMatch(/postgres:\/\//);
  });
});

describe("HealthService", () => {
  it("reports an outage when storage fails, and keeps a rolling history", async () => {
    const broken = { list: () => Promise.reject(new Error("AccessDenied: secret-bucket")) } as unknown as Storage;
    const health = new HealthService(ctx.ds, broken, { ...ctx.config, STORAGE_DRIVER: "s3", AWS_REGION: "eu-west-1", MAIL_DRIVER: "resend" }, {});
    const r = await health.check();
    const storage = r.components.find((c) => c.id === "storage")!;
    expect(storage).toMatchObject({ status: "outage", detail: "Amazon S3 (eu-west-1) · not responding" });
    expect(JSON.stringify(r)).not.toContain("secret-bucket");
    expect(r.status).toBe("outage");
    expect(r.components.find((c) => c.id === "email")!.status).toBe("operational");
    await health.check();
    expect(r.history).toHaveLength(1);
    expect((await health.check()).history).toHaveLength(3);
  });

  it("reports the database as down when it can't be queried", async () => {
    const ds = { query: () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5:5432")), migrations: [] } as unknown as TestCtx["ds"];
    const r = await new HealthService(ds, ctx.storage, ctx.config, {}).check();
    expect(r.components.find((c) => c.id === "database")).toMatchObject({ status: "outage", detail: "Can't reach Postgres" });
    expect(JSON.stringify(r)).not.toContain("10.0.0.5");
  });
});
