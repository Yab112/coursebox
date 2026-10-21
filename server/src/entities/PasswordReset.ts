import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import type { User } from "./User";

/** A one-time password reset code. Only an HMAC of the code is stored. */
@Entity({ name: "password_resets" })
export class PasswordReset {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ name: "code_hash", type: "char", length: 64 })
  codeHash!: string;

  /** Wrong guesses so far; the code stops working after MAX_ATTEMPTS. */
  @Column({ type: "smallint", default: 0 })
  attempts!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  /** Set when the code is used, or replaced by a newer one. */
  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt!: Date | null;
}
