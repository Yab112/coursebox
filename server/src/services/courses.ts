import { randomUUID } from "node:crypto";
import { In, LessThan, Not, type DataSource, type EntityManager } from "typeorm";
import { z } from "zod";
import type { Config } from "../config";
import { Course, CourseFile, Progress, User } from "../entities";
import { badRequest, conflict, notFound, tooLarge } from "../errors";
import { courseKeyPrefix, fileKey, type Storage } from "../storage/Storage";

/** Relative course path: no absolute paths, no "..", no control characters. */
export const safePath = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !p.startsWith("/") && !p.split("/").some((s) => s === ".." || s === "") && !/[\u0000-\u001f\\]/.test(p), {
    message: "invalid path",
  });

const fileInput = z.object({
  path: safePath,
  size: z.number().int().min(0),
  mime: z.string().max(128).default("application/octet-stream"),
});

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

export const courseInput = z.object({
  title: z.string().trim().min(1).max(300),
  sourceKey: z.string().max(300).nullish(),
  analyzer: z.string().min(1).max(64),
  archiveName: z.string().max(300).nullish(),
  /** Client-side id of the course; retrying a create with the same ref returns the same course. */
  clientRef: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).nullish(),
  manifestVersion: z.number().int().min(1).default(1),
  manifest: z
    .record(z.string(), z.unknown())
    .refine((m) => Buffer.byteLength(JSON.stringify(m)) <= MAX_MANIFEST_BYTES, { message: "manifest is too large" }),
  files: z.array(fileInput).min(1),
});
export type CourseInput = z.infer<typeof courseInput>;

export const manifestPatch = courseInput.pick({ title: true, analyzer: true, manifestVersion: true, manifest: true }).partial();

const ACTIVE: Course["status"][] = ["uploading", "ready"];

export type CourseSummary = {
  id: string;
  title: string;
  status: Course["status"];
  sourceKey: string | null;
  analyzer: string;
  fileCount: number;
  totalBytes: number;
  lessonCount: number;
  completedCount: number;
  coverPath: string | null;
  instructor: string | null;
  source: string | null;
  courseNumber: string | null;
  lastLessonPath: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function lessonCount(manifest: Record<string, unknown>) {
  const sections = (manifest.sections as { lessons?: unknown[] }[] | undefined) ?? [];
  return sections.reduce((n, s) => n + (s.lessons?.length ?? 0), 0);
}

export function toSummary(c: Course, completedCount = 0): CourseSummary {
  const m = c.manifest ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    sourceKey: c.sourceKey,
    analyzer: c.analyzer,
    fileCount: c.fileCount,
    totalBytes: Number(c.totalBytes),
    lessonCount: lessonCount(m),
    completedCount,
    coverPath: str(m.coverPath),
    instructor: str(m.instructor),
    source: str(m.source),
    courseNumber: str(m.courseNumber),
    lastLessonPath: c.lastLessonPath,
    lastOpenedAt: c.lastOpenedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

type Limits = Pick<Config, "MAX_COURSE_BYTES" | "MAX_FILE_BYTES" | "MAX_FILES_PER_COURSE" | "STALE_UPLOAD_HOURS">;

export class CourseService {
  constructor(
    private readonly ds: DataSource,
    private readonly storage: Storage,
    private readonly limits: Limits,
  ) {}

  private validateFiles(files: CourseInput["files"]) {
    if (files.length > this.limits.MAX_FILES_PER_COURSE)
      throw tooLarge(`A course can have at most ${this.limits.MAX_FILES_PER_COURSE} files`);
    const seen = new Set<string>();
    let total = 0;
    for (const f of files) {
      if (seen.has(f.path)) throw badRequest(`duplicate path: ${f.path}`);
      seen.add(f.path);
      if (f.size > this.limits.MAX_FILE_BYTES) throw tooLarge(`${f.path} is larger than the per-file limit`);
      total += f.size;
    }
    if (total > this.limits.MAX_COURSE_BYTES)
      throw tooLarge(`This course is ${(total / 1024 ** 3).toFixed(2)} GB; the limit is ${(this.limits.MAX_COURSE_BYTES / 1024 ** 3).toFixed(2)} GB`);
    return total;
  }

  async usage(userId: string) {
    const user = await this.ds.getRepository(User).findOneByOrFail({ id: userId });
    const raw = await this.ds
      .getRepository(Course)
      .createQueryBuilder("c")
      .select("count(*)", "count")
      .addSelect("coalesce(sum(c.total_bytes), 0)", "bytes")
      .where("c.user_id = :userId AND c.status IN (:...active)", { userId, active: ACTIVE })
      .getRawOne<{ count: string; bytes: string }>();
    return { courses: Number(raw?.count ?? 0), courseLimit: user.courseLimit, bytes: Number(raw?.bytes ?? 0) };
  }

  async list(userId: string): Promise<CourseSummary[]> {
    const courses = await this.ds.getRepository(Course).find({
      where: { userId, status: In(ACTIVE) },
      order: { createdAt: "ASC" },
    });
    if (!courses.length) return [];
    const done = await this.ds
      .getRepository(Progress)
      .createQueryBuilder("p")
      .select("p.course_id", "courseId")
      .addSelect("count(*)", "n")
      .where("p.course_id IN (:...ids) AND p.completed_at IS NOT NULL", { ids: courses.map((c) => c.id) })
      .groupBy("p.course_id")
      .getRawMany<{ courseId: string; n: string }>();
    const byId = new Map(done.map((d) => [d.courseId, Number(d.n)]));
    return courses.map((c) => toSummary(c, byId.get(c.id) ?? 0));
  }

  async getOwned(userId: string, courseId: string, manager: EntityManager = this.ds.manager) {
    if (!z.string().uuid().safeParse(courseId).success) throw notFound("Course not found");
    const c = await manager.getRepository(Course).findOneBy({ id: courseId, userId, status: Not("deleting") });
    if (!c) throw notFound("Course not found");
    return c;
  }

  async get(userId: string, courseId: string) {
    const c = await this.getOwned(userId, courseId);
    const files = await this.ds.getRepository(CourseFile).find({ where: { courseId }, order: { path: "ASC" } });
    return {
      ...toSummary(c),
      manifest: c.manifest,
      manifestVersion: c.manifestVersion,
      archiveName: c.archiveName,
      files: files.map((f) => ({ path: f.path, size: Number(f.sizeBytes), mime: f.mime, uploaded: !!f.uploadedAt })),
    };
  }

  /** Creates a course (status "uploading"); the client then uploads every file. */
  async create(userId: string, input: CourseInput) {
    const total = this.validateFiles(input.files);
    const existingByRef = async () =>
      input.clientRef
        ? this.ds.getRepository(Course).findOneBy({ userId, clientRef: input.clientRef, status: Not("deleting") })
        : null;
    const existing = await existingByRef();
    if (existing) return this.revise(userId, existing.id, input);
    try {
      return await this.createNew(userId, input, total);
    } catch (e) {
      // A concurrent create with the same client ref won the race: continue with that course.
      const err = e as { code?: string; constraint?: string; driverError?: { constraint?: string } };
      if (err.code === "23505" && (err.constraint ?? err.driverError?.constraint) === "courses_user_client_ref_uq") {
        const winner = await existingByRef();
        if (winner) return this.revise(userId, winner.id, input);
      }
      throw e;
    }
  }

  private createNew(userId: string, input: CourseInput, total: number) {
    return this.ds.transaction(async (m) => {
      // Lock the user row so two parallel creates can't both squeeze under the limit.
      const user = await m
        .getRepository(User)
        .createQueryBuilder("u")
        .setLock("pessimistic_write")
        .where("u.id = :userId", { userId })
        .getOneOrFail();
      const active = await m.getRepository(Course).countBy({ userId, status: In(ACTIVE) });
      if (active >= user.courseLimit)
        throw conflict(
          "course_limit",
          `Your account can hold ${user.courseLimit} courses. Delete one you've finished to add another.`,
          { limit: user.courseLimit },
        );

      const course = m.getRepository(Course).create({
        id: randomUUID(),
        userId,
        title: input.title,
        sourceKey: input.sourceKey ?? null,
        analyzer: input.analyzer,
        archiveName: input.archiveName ?? null,
        clientRef: input.clientRef ?? null,
        manifest: input.manifest,
        manifestVersion: input.manifestVersion,
        status: "uploading",
        fileCount: input.files.length,
        totalBytes: String(total),
      });
      await m.getRepository(Course).save(course);
      await this.insertFiles(m, userId, course.id, input.files);
      return { course: toSummary(course), needUpload: input.files.map((f) => f.path) };
    });
  }

  private async insertFiles(m: EntityManager, userId: string, courseId: string, files: CourseInput["files"]) {
    const rows = files.map((f) => {
      const id = randomUUID();
      return { id, courseId, path: f.path, storageKey: fileKey(userId, courseId, id), sizeBytes: String(f.size), mime: f.mime };
    });
    for (let i = 0; i < rows.length; i += 500) await m.getRepository(CourseFile).insert(rows.slice(i, i + 500));
  }

  /**
   * Replaces the file set of an existing course (new version of the same zip).
   * Files with the same path and size are kept, so only changed files are uploaded again.
   */
  async revise(userId: string, courseId: string, input: CourseInput) {
    const total = this.validateFiles(input.files);
    const { result, staleKeys } = await this.ds.transaction(async (m) => {
      const course = await m
        .getRepository(Course)
        .createQueryBuilder("c")
        .setLock("pessimistic_write")
        .where("c.id = :courseId AND c.user_id = :userId AND c.status <> 'deleting'", { courseId, userId })
        .getOne();
      if (!course) throw notFound("Course not found");

      const existing = await m.getRepository(CourseFile).findBy({ courseId });
      const byPath = new Map(existing.map((f) => [f.path, f]));
      const incoming = new Map(input.files.map((f) => [f.path, f]));

      const staleKeys: string[] = [];
      const removeIds: string[] = [];
      for (const f of existing) {
        const next = incoming.get(f.path);
        if (!next || Number(f.sizeBytes) !== next.size || f.mime !== next.mime) {
          removeIds.push(f.id);
          staleKeys.push(f.storageKey);
        }
      }
      if (removeIds.length) await m.getRepository(CourseFile).delete({ id: In(removeIds) });

      const toAdd = input.files.filter((f) => {
        const old = byPath.get(f.path);
        return !old || removeIds.includes(old.id);
      });
      await this.insertFiles(m, userId, courseId, toAdd);
      // Kept files that were never confirmed: skip the ones already sitting in storage with the right size.
      const unconfirmed = existing.filter((f) => !f.uploadedAt && !removeIds.includes(f.id));
      const stored = unconfirmed.length ? await this.storage.list(courseKeyPrefix(userId, courseId)) : new Map<string, number>();
      const needUpload = [
        ...toAdd.map((f) => f.path),
        ...unconfirmed.filter((f) => stored.get(f.storageKey) !== Number(f.sizeBytes)).map((f) => f.path),
      ];

      Object.assign(course, {
        title: input.title,
        sourceKey: input.sourceKey ?? course.sourceKey,
        analyzer: input.analyzer,
        archiveName: input.archiveName ?? course.archiveName,
        manifest: input.manifest,
        manifestVersion: input.manifestVersion,
        fileCount: input.files.length,
        totalBytes: String(total),
        status: needUpload.length ? "uploading" : "ready",
        readyAt: needUpload.length ? null : new Date(),
      });
      await m.getRepository(Course).save(course);
      return { result: { course: toSummary(course), needUpload }, staleKeys };
    });
    // Outside the transaction: storage isn't transactional; leftovers are swept by complete()/cleanup.
    await this.storage.deleteKeys(staleKeys).catch(() => undefined);
    return result;
  }

  async patchManifest(userId: string, courseId: string, patch: z.infer<typeof manifestPatch>) {
    const c = await this.getOwned(userId, courseId);
    Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    await this.ds.getRepository(Course).save(c);
    return toSummary(c);
  }

  async uploadUrls(userId: string, courseId: string, paths: string[]) {
    if (paths.length > 500) throw badRequest("Request at most 500 upload URLs at a time");
    await this.getOwned(userId, courseId);
    const files = await this.ds.getRepository(CourseFile).findBy({ courseId, path: In(paths) });
    if (files.length !== new Set(paths).size) {
      const known = new Set(files.map((f) => f.path));
      throw badRequest("Unknown file paths", { unknown: paths.filter((p) => !known.has(p)).slice(0, 20) });
    }
    return Promise.all(
      files.map(async (f) => ({
        path: f.path,
        ...(await this.storage.presignUpload(f.storageKey, { contentType: f.mime, size: Number(f.sizeBytes) })),
      })),
    );
  }

  /** Verifies every file is in storage with the right size, then marks the course ready. */
  async complete(userId: string, courseId: string) {
    const course = await this.getOwned(userId, courseId);
    const files = await this.ds.getRepository(CourseFile).findBy({ courseId });
    const stored = await this.storage.list(courseKeyPrefix(userId, courseId));
    const missing = files.filter((f) => stored.get(f.storageKey) !== Number(f.sizeBytes)).map((f) => f.path);
    if (missing.length)
      throw conflict("upload_incomplete", `${missing.length} files are missing or incomplete`, { missing: missing.slice(0, 50), missingCount: missing.length });

    // Objects that no file row points at any more (replaced versions, aborted uploads).
    const keys = new Set(files.map((f) => f.storageKey));
    const orphans = [...stored.keys()].filter((k) => !keys.has(k));
    if (orphans.length) await this.storage.deleteKeys(orphans);

    const now = new Date();
    await this.ds
      .getRepository(CourseFile)
      .createQueryBuilder()
      .update()
      .set({ uploadedAt: now })
      .where("course_id = :courseId AND uploaded_at IS NULL", { courseId })
      .execute();
    course.status = "ready";
    course.readyAt = now;
    await this.ds.getRepository(Course).save(course);
    return toSummary(course);
  }

  async downloadUrls(userId: string, courseId: string, paths: string[]) {
    if (paths.length > 200) throw badRequest("Request at most 200 file URLs at a time");
    await this.getOwned(userId, courseId);
    const files = await this.ds.getRepository(CourseFile).findBy({ courseId, path: In(paths) });
    const out: Record<string, string> = {};
    for (const f of files) {
      if (!f.uploadedAt) continue;
      out[f.path] = await this.storage.presignDownload(f.storageKey, { contentType: f.mime });
    }
    return out;
  }

  /** Frees the slot immediately, then removes stored files; retried by cleanup() if storage fails. */
  async delete(userId: string, courseId: string) {
    const c = await this.getOwned(userId, courseId);
    await this.ds.getRepository(Course).update(c.id, { status: "deleting" });
    await this.purge(c);
  }

  private async purge(c: Pick<Course, "id" | "userId">) {
    await this.storage.deletePrefix(courseKeyPrefix(c.userId, c.id));
    await this.ds.getRepository(Course).delete({ id: c.id });
  }

  /** Removes courses stuck in "deleting" and uploads abandoned for STALE_UPLOAD_HOURS. */
  async cleanup() {
    const cutoff = new Date(Date.now() - this.limits.STALE_UPLOAD_HOURS * 3600_000);
    const repo = this.ds.getRepository(Course);
    const victims = [
      ...(await repo.find({ where: { status: "deleting" }, select: { id: true, userId: true } })),
      ...(await repo.find({ where: { status: "uploading", updatedAt: LessThan(cutoff) }, select: { id: true, userId: true } })),
    ];
    let purged = 0;
    for (const v of victims) {
      try {
        await repo.update(v.id, { status: "deleting" });
        await this.purge(v);
        purged++;
      } catch {
        // keep it in "deleting"; next run retries
      }
    }
    return purged;
  }
}
