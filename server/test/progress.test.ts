import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, createReadyCourse, createTestContext, SCHEMA, signup, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const today = () => new Date().toISOString().slice(0, 10);

async function setup() {
  const { token } = await signup(ctx);
  const { id } = await createReadyCourse(ctx, token);
  const sync = (body: object) => request(ctx.app).post(`/courses/${id}/progress`).set(auth(token)).send({ day: today(), ...body });
  return { token, id, sync };
}

describe("progress sync", () => {
  it("stores completion, page, position and adds up study time", async () => {
    const { sync } = await setup();
    await sync({ items: [{ path: "notes/L1.pdf", completed: true, lastPage: 3, secondsDelta: 30 }], lastLessonPath: "notes/L1.pdf" });
    const res = await sync({ items: [{ path: "notes/L1.pdf", lastPage: 7, secondsDelta: 45, position: 12.5 }] });
    expect(res.status).toBe(200);
    expect(res.body.lastLessonPath).toBe("notes/L1.pdf");
    expect(res.body.items).toEqual([
      expect.objectContaining({ path: "notes/L1.pdf", completed: true, lastPage: 7, position: 12.5, seconds: 75 }),
    ]);
  });

  it("resolves completion conflicts between devices by the latest change", async () => {
    const { sync } = await setup();
    const t1 = "2026-10-14T10:00:00.000Z";
    const t2 = "2026-10-14T11:00:00.000Z";
    await sync({ items: [{ path: "notes/L1.pdf", completed: true, changedAt: t2 }] });
    // An older "uncomplete" from an offline device must not win.
    let res = await sync({ items: [{ path: "notes/L1.pdf", completed: false, changedAt: t1 }] });
    expect(res.body.items[0].completed).toBe(true);
    // A newer one does.
    res = await sync({ items: [{ path: "notes/L1.pdf", completed: false, changedAt: "2026-10-14T12:00:00.000Z" }] });
    expect(res.body.items[0].completed).toBe(false);
  });

  it("feeds completed counts to the library and daily study totals", async () => {
    const { token, id, sync } = await setup();
    await sync({ items: [{ path: "notes/L1.pdf", completed: true, secondsDelta: 60 }, { path: "notes/L2.pdf", secondsDelta: 20 }] });
    const list = await request(ctx.app).get("/courses").set(auth(token));
    expect(list.body.courses[0]).toMatchObject({ id, completedCount: 1, lessonCount: 2, lastLessonPath: null });
    const [day] = await ctx.ds.query(`SELECT seconds FROM "${SCHEMA}".study_days WHERE course_id = $1`, [id]);
    expect(day.seconds).toBe(80);
  });

  it("validates input", async () => {
    const { sync } = await setup();
    expect((await sync({ items: [{ path: "x", secondsDelta: 99999 }] })).status).toBe(400);
    expect((await sync({ items: [{ path: "x", lastPage: 0 }] })).status).toBe(400);
    expect((await sync({ day: "1999-01-01", items: [] })).status).toBe(400);
    expect((await sync({ items: Array.from({ length: 501 }, (_, i) => ({ path: `p${i}` })) })).status).toBe(400);
  });

  it("is removed together with its course", async () => {
    const { token, id, sync } = await setup();
    await sync({ items: [{ path: "notes/L1.pdf", completed: true, secondsDelta: 5 }] });
    await request(ctx.app).delete(`/courses/${id}`).set(auth(token));
    const [{ p }] = await ctx.ds.query(`SELECT count(*)::int AS p FROM "${SCHEMA}".progress`);
    const [{ d }] = await ctx.ds.query(`SELECT count(*)::int AS d FROM "${SCHEMA}".study_days`);
    expect([p, d]).toEqual([0, 0]);
  });
});
