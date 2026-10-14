import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { CourseFile } from "./CourseFile";
import type { User } from "./User";

export type CourseStatus = "uploading" | "ready" | "deleting";

@Entity({ name: "courses" })
export class Course {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne("User", (u: User) => u.courses, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "varchar", length: 300 })
  title!: string;

  /** Identity of the source course (e.g. "ocw:18.657-fall-2015"), used to offer updates. */
  @Column({ name: "source_key", type: "varchar", length: 300, nullable: true })
  sourceKey!: string | null;

  @Column({ type: "varchar", length: 64 })
  analyzer!: string;

  /** The client's own id for this course; makes creation idempotent. Unique per user. */
  @Column({ name: "client_ref", type: "varchar", length: 64, nullable: true })
  clientRef!: string | null;

  @Column({ name: "archive_name", type: "varchar", length: 300, nullable: true })
  archiveName!: string | null;

  /** The CourseManifest produced by the client-side analyzers. */
  @Column({ type: "jsonb" })
  manifest!: Record<string, unknown>;

  @Column({ name: "manifest_version", type: "int" })
  manifestVersion!: number;

  @Column({ type: "enum", enum: ["uploading", "ready", "deleting"], enumName: "course_status" })
  status!: CourseStatus;

  @Column({ name: "file_count", type: "int" })
  fileCount!: number;

  /** bigint comes back from pg as a string; we convert at the edges. */
  @Column({ name: "total_bytes", type: "bigint" })
  totalBytes!: string;

  @Column({ name: "last_lesson_path", type: "text", nullable: true })
  lastLessonPath!: string | null;

  @Column({ name: "last_opened_at", type: "timestamptz", nullable: true })
  lastOpenedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @Column({ name: "ready_at", type: "timestamptz", nullable: true })
  readyAt!: Date | null;

  @OneToMany("CourseFile", (f: CourseFile) => f.course)
  files?: CourseFile[];
}
