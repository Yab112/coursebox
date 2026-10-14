import type { DataSource } from "typeorm";
import { z } from "zod";
import { Course, Progress } from "../entities";
import { badRequest } from "../errors";
import type { CourseService } from "./courses";

const lessonPath = z.string().min(1).max(1024);
const isoDate = z.string().datetime({ offset: true });

export const progressSync = z.object({
  items: z
    .array(
      z.object({
        path: lessonPath,
        /** Set when the learner toggled completion; `changedAt` decides between devices (last write wins). */
        completed: z.boolean().optional(),
        changedAt: isoDate.optional(),
        lastPage: z.number().int().positive().max(100_000).optional(),
        position: z.number().min(0).max(1e6).optional(),
        /** Study time since the last sync; added up on the server. */
        secondsDelta: z.number().int().min(0).max(3600).optional(),
        lastOpenedAt: isoDate.optional(),
      }),
    )
    .max(500)
    .default([]),
  lastLessonPath: lessonPath.optional(),
  /** The learner's local calendar day (YYYY-MM-DD) for study-time stats. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ProgressSync = z.infer<typeof progressSync>;

export type ProgressDto = {
  path: string;
  completed: boolean;
  completedAt: string | null;
  changedAt: string | null;
  lastPage: number | null;
  position: number | null;
  seconds: number;
  lastOpenedAt: string | null;
};

const toDto = (p: Progress): ProgressDto => ({
  path: p.path,
  completed: !!p.completedAt,
  completedAt: p.completedAt?.toISOString() ?? null,
  changedAt: p.completedChangedAt?.toISOString() ?? null,
  lastPage: p.lastPage,
  position: p.positionSeconds,
  seconds: p.secondsSpent,
  lastOpenedAt: p.lastOpenedAt?.toISOString() ?? null,
});

export class ProgressService {
  constructor(
    private readonly ds: DataSource,
    private readonly courses: CourseService,
    private readonly schema: string,
  ) {}

  async get(userId: string, courseId: string) {
    const course = await this.courses.getOwned(userId, courseId);
    const rows = await this.ds.getRepository(Progress).find({ where: { courseId } });
    return { lastLessonPath: course.lastLessonPath, items: rows.map(toDto) };
  }

  /** Merges progress from a device. Idempotent apart from secondsDelta, which is additive by design. */
  async sync(userId: string, courseId: string, input: ProgressSync) {
    await this.courses.getOwned(userId, courseId);
    const s = this.schema;
    const day = input.day ?? new Date().toISOString().slice(0, 10);
    if (Math.abs(Date.parse(day) - Date.now()) > 2 * 86400_000) throw badRequest("day is too far from today");

    await this.ds.transaction(async (m) => {
      let studied = 0;
      for (const it of input.items) {
        const changedAt = it.completed !== undefined ? (it.changedAt ?? new Date().toISOString()) : null;
        await m.query(
          `INSERT INTO "${s}".progress
             (course_id, path, user_id, completed_at, completed_changed_at, last_page, position_seconds, seconds_spent, last_opened_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (course_id, path) DO UPDATE SET
             completed_at = CASE
               WHEN EXCLUDED.completed_changed_at IS NOT NULL
                AND (progress.completed_changed_at IS NULL OR EXCLUDED.completed_changed_at >= progress.completed_changed_at)
               THEN EXCLUDED.completed_at ELSE progress.completed_at END,
             completed_changed_at = GREATEST(progress.completed_changed_at, EXCLUDED.completed_changed_at),
             last_page = COALESCE(EXCLUDED.last_page, progress.last_page),
             position_seconds = COALESCE(EXCLUDED.position_seconds, progress.position_seconds),
             seconds_spent = progress.seconds_spent + EXCLUDED.seconds_spent,
             last_opened_at = GREATEST(progress.last_opened_at, EXCLUDED.last_opened_at),
             updated_at = now()`,
          [
            courseId,
            it.path,
            userId,
            it.completed ? changedAt : null,
            changedAt,
            it.lastPage ?? null,
            it.position ?? null,
            it.secondsDelta ?? 0,
            it.lastOpenedAt ?? null,
          ],
        );
        studied += it.secondsDelta ?? 0;
      }
      if (studied > 0)
        await m.query(
          `INSERT INTO "${s}".study_days (user_id, course_id, day, seconds) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, course_id, day) DO UPDATE SET seconds = study_days.seconds + EXCLUDED.seconds`,
          [userId, courseId, day, studied],
        );
      if (input.lastLessonPath)
        await m.getRepository(Course).update({ id: courseId }, { lastLessonPath: input.lastLessonPath, lastOpenedAt: new Date() });
    });
    return this.get(userId, courseId);
  }
}
