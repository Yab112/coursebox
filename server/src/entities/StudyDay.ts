import { Column, Entity, PrimaryColumn } from "typeorm";

/** Seconds studied per user, course and calendar day (for streaks / heatmaps). */
@Entity({ name: "study_days" })
export class StudyDay {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @PrimaryColumn({ name: "course_id", type: "uuid" })
  courseId!: string;

  @PrimaryColumn({ type: "date" })
  day!: string;

  @Column({ type: "int" })
  seconds!: number;
}
