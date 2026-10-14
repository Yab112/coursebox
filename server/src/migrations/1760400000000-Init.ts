import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial schema. Everything lives in its own schema (default "coursebox"), with RLS enabled and no
 * policies, so Supabase's auto-generated REST API (anon/authenticated roles) can never read it.
 * Only the API, connecting as the table owner, has access.
 */
export class Init1760400000000 implements MigrationInterface {
  name = "Init1760400000000";

  async up(q: QueryRunner): Promise<void> {
    const s = schemaOf(q);
    await q.query(`CREATE SCHEMA IF NOT EXISTS "${s}"`);

    await q.query(`
      CREATE TABLE "${s}".users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(254) NOT NULL,
        username varchar(32) NOT NULL,
        password_hash text NOT NULL,
        course_limit smallint NOT NULL DEFAULT 2 CHECK (course_limit >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz,
        CONSTRAINT users_email_format CHECK (email ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'),
        CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_.-]{3,32}$')
      )`);
    await q.query(`CREATE UNIQUE INDEX users_email_lower_uq ON "${s}".users (lower(email))`);
    await q.query(`CREATE UNIQUE INDEX users_username_lower_uq ON "${s}".users (lower(username))`);

    await q.query(`
      CREATE TABLE "${s}".sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES "${s}".users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        user_agent varchar(256),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      )`);
    await q.query(`CREATE INDEX sessions_user_idx ON "${s}".sessions (user_id)`);
    await q.query(`CREATE INDEX sessions_expires_idx ON "${s}".sessions (expires_at)`);

    await q.query(`CREATE TYPE "${s}".course_status AS ENUM ('uploading', 'ready', 'deleting')`);
    await q.query(`
      CREATE TABLE "${s}".courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES "${s}".users(id) ON DELETE CASCADE,
        title varchar(300) NOT NULL,
        source_key varchar(300),
        analyzer varchar(64) NOT NULL,
        archive_name varchar(300),
        manifest jsonb NOT NULL,
        manifest_version int NOT NULL DEFAULT 1,
        status "${s}".course_status NOT NULL DEFAULT 'uploading',
        file_count int NOT NULL DEFAULT 0 CHECK (file_count >= 0),
        total_bytes bigint NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
        last_lesson_path text,
        last_opened_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        ready_at timestamptz,
        CONSTRAINT courses_manifest_object CHECK (jsonb_typeof(manifest) = 'object')
      )`);
    await q.query(`CREATE INDEX courses_user_status_idx ON "${s}".courses (user_id, status)`);
    await q.query(`CREATE INDEX courses_source_idx ON "${s}".courses (user_id, source_key)`);

    await q.query(`
      CREATE TABLE "${s}".course_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL REFERENCES "${s}".courses(id) ON DELETE CASCADE,
        path varchar(1024) NOT NULL,
        storage_key varchar(512) NOT NULL UNIQUE,
        size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
        mime varchar(128) NOT NULL,
        uploaded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT course_files_course_path_uq UNIQUE (course_id, path)
      )`);

    await q.query(`
      CREATE TABLE "${s}".progress (
        course_id uuid NOT NULL REFERENCES "${s}".courses(id) ON DELETE CASCADE,
        path varchar(1024) NOT NULL,
        user_id uuid NOT NULL REFERENCES "${s}".users(id) ON DELETE CASCADE,
        completed_at timestamptz,
        completed_changed_at timestamptz,
        last_page int CHECK (last_page > 0),
        position_seconds double precision CHECK (position_seconds >= 0),
        seconds_spent int NOT NULL DEFAULT 0 CHECK (seconds_spent >= 0),
        last_opened_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (course_id, path)
      )`);
    await q.query(`CREATE INDEX progress_user_idx ON "${s}".progress (user_id)`);

    await q.query(`
      CREATE TABLE "${s}".study_days (
        user_id uuid NOT NULL REFERENCES "${s}".users(id) ON DELETE CASCADE,
        course_id uuid NOT NULL REFERENCES "${s}".courses(id) ON DELETE CASCADE,
        day date NOT NULL,
        seconds int NOT NULL DEFAULT 0 CHECK (seconds >= 0),
        PRIMARY KEY (user_id, course_id, day)
      )`);

    for (const t of ["users", "sessions", "courses", "course_files", "progress", "study_days"])
      await q.query(`ALTER TABLE "${s}"."${t}" ENABLE ROW LEVEL SECURITY`);

    // On Supabase, make sure the API roles can't even see the schema.
    await q.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE 'REVOKE ALL ON SCHEMA "${s}" FROM anon, authenticated';
          EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA "${s}" FROM anon, authenticated';
        END IF;
      END $$`);
  }

  async down(q: QueryRunner): Promise<void> {
    const s = schemaOf(q);
    for (const t of ["study_days", "progress", "course_files", "courses", "sessions", "users"])
      await q.query(`DROP TABLE IF EXISTS "${s}"."${t}"`);
    await q.query(`DROP TYPE IF EXISTS "${s}".course_status`);
  }
}

function schemaOf(q: QueryRunner): string {
  return (q.connection.options as { schema?: string }).schema ?? "coursebox";
}
