import type { MigrationInterface, QueryRunner } from "typeorm";

/** One-time codes for "forgot password". RLS on with no policies, like every other table. */
export class PasswordResets1760600000000 implements MigrationInterface {
  name = "PasswordResets1760600000000";

  async up(q: QueryRunner): Promise<void> {
    const s = (q.connection.options as { schema?: string }).schema ?? "coursebox";
    await q.query(`
      CREATE TABLE "${s}".password_resets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES "${s}".users(id) ON DELETE CASCADE,
        code_hash char(64) NOT NULL,
        attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      )`);
    await q.query(`CREATE INDEX password_resets_user_created_idx ON "${s}".password_resets (user_id, created_at DESC)`);
    await q.query(`ALTER TABLE "${s}".password_resets ENABLE ROW LEVEL SECURITY`);
  }

  async down(q: QueryRunner): Promise<void> {
    const s = (q.connection.options as { schema?: string }).schema ?? "coursebox";
    await q.query(`DROP TABLE IF EXISTS "${s}".password_resets`);
  }
}
