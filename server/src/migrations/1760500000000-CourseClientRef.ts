import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent course creation: the client sends its local course id as `client_ref`, so a create
 * retried after a lost response (page reload mid-request) returns the same course instead of a duplicate.
 */
export class CourseClientRef1760500000000 implements MigrationInterface {
  name = "CourseClientRef1760500000000";

  async up(q: QueryRunner): Promise<void> {
    const s = (q.connection.options as { schema?: string }).schema ?? "coursebox";
    await q.query(`ALTER TABLE "${s}".courses ADD COLUMN client_ref varchar(64)`);
    await q.query(`CREATE UNIQUE INDEX courses_user_client_ref_uq ON "${s}".courses (user_id, client_ref) WHERE client_ref IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    const s = (q.connection.options as { schema?: string }).schema ?? "coursebox";
    await q.query(`DROP INDEX IF EXISTS "${s}".courses_user_client_ref_uq`);
    await q.query(`ALTER TABLE "${s}".courses DROP COLUMN IF EXISTS client_ref`);
  }
}
