import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import type { Course } from "./Course";

/** One file of a course. `storageKey` never contains user-controlled text. */
@Entity({ name: "course_files" })
@Unique("course_files_course_path_uq", ["courseId", "path"])
export class CourseFile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "course_id", type: "uuid" })
  courseId!: string;

  @ManyToOne("Course", (c: Course) => c.files, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course?: Course;

  @Column({ type: "varchar", length: 1024 })
  path!: string;

  @Column({ name: "storage_key", type: "varchar", length: 512, unique: true })
  storageKey!: string;

  @Column({ name: "size_bytes", type: "bigint" })
  sizeBytes!: string;

  @Column({ type: "varchar", length: 128 })
  mime!: string;

  @Column({ name: "uploaded_at", type: "timestamptz", nullable: true })
  uploadedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
