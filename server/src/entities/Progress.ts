import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import type { Course } from "./Course";

/** Per-lesson progress. Keyed by the lesson's file path, so re-analysis keeps it. */
@Entity({ name: "progress" })
@Index("progress_user_idx", ["userId"])
export class Progress {
  @PrimaryColumn({ name: "course_id", type: "uuid" })
  courseId!: string;

  @PrimaryColumn({ type: "varchar", length: 1024 })
  path!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne("Course", { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course?: Course;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  /** When `completed` last changed: last-writer-wins across devices. */
  @Column({ name: "completed_changed_at", type: "timestamptz", nullable: true })
  completedChangedAt!: Date | null;

  @Column({ name: "last_page", type: "int", nullable: true })
  lastPage!: number | null;

  @Column({ name: "position_seconds", type: "double precision", nullable: true })
  positionSeconds!: number | null;

  @Column({ name: "seconds_spent", type: "int" })
  secondsSpent!: number;

  @Column({ name: "last_opened_at", type: "timestamptz", nullable: true })
  lastOpenedAt!: Date | null;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
