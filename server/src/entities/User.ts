import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { Course } from "./Course";
import type { Session } from "./Session";

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Unique case-insensitively (functional index lower(email)). */
  @Column({ type: "varchar", length: 254 })
  email!: string;

  /** Unique case-insensitively (functional index lower(username)). */
  @Column({ type: "varchar", length: 32 })
  username!: string;

  @Column({ name: "password_hash", type: "text", select: false })
  passwordHash!: string;

  @Column({ name: "course_limit", type: "smallint" })
  courseLimit!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  @OneToMany("Course", (c: Course) => c.user)
  courses?: Course[];

  @OneToMany("Session", (s: Session) => s.user)
  sessions?: Session[];
}
